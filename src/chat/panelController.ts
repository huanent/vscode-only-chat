import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import {
	createSummary,
	createTabTitle,
	getConversationSummary,
	normalizeGeneratedSummary,
	type StoredConversation,
} from '../conversation';
import { getWebviewHtml } from '../webview';
import { storageKeys, webviewFocusContextKey } from './constants';
import type { OnlyChatDocument } from './document';
import type { OnlyChatManager } from './manager';
import type { WebviewMessage } from './messages';
import type { ModelService } from './modelService';

export class OnlyChatPanelController implements vscode.Disposable {
	private readonly disposables: vscode.Disposable[] = [];
	private currentConversationId: string = randomUUID();
	private cancellation: vscode.CancellationTokenSource | undefined;
	private readonly summaryCancellations = new Map<string, vscode.CancellationTokenSource>();

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly manager: OnlyChatManager,
		private readonly modelService: ModelService,
		private readonly panel: vscode.WebviewPanel,
		readonly document: OnlyChatDocument,
	) {
		panel.webview.options = {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
		};
		this.updateTitle();
		panel.iconPath = new vscode.ThemeIcon('comment-discussion');
		panel.webview.html = getWebviewHtml(panel.webview, context.extensionUri);
		this.disposables.push(
			panel.onDidDispose(() => this.dispose()),
			panel.onDidChangeViewState(event => {
				if (event.webviewPanel.active) {
					this.manager.setCurrent(this);
				} else {
					void this.setWebviewFocus(false);
				}
			}),
			panel.webview.onDidReceiveMessage(message => this.handleMessage(message)),
			modelService.onDidChange(version => void this.loadModels(version)),
		);
	}

	dispose(): void {
		void this.setWebviewFocus(false);
		this.cancel();
		this.summaryCancellations.forEach(cancellation => {
			cancellation.cancel();
			cancellation.dispose();
		});
		this.summaryCancellations.clear();
		this.manager.remove(this);
		this.disposables.splice(0).forEach(disposable => disposable.dispose());
	}

	reveal(): void {
		this.panel.reveal(vscode.ViewColumn.Active);
	}

	async newConversation(): Promise<void> {
		this.cancel();
		this.currentConversationId = randomUUID();
		await this.manager.persist(this.currentConversationId);
		await this.renderConversations();
	}

	private async handleMessage(message: WebviewMessage): Promise<void> {
		try {
			switch (message.type) {
				case 'ready':
					await Promise.all([this.loadModels(), this.renderConversations()]);
					return;
				case 'focusChanged':
					await this.setWebviewFocus(message.focused);
					return;
				case 'send':
					await this.send(message.text, message.modelId, message.editMessageIndex);
					return;
				case 'selectModel':
					await this.context.globalState.update(storageKeys.selectedModel, message.modelId);
					return;
				case 'newConversation':
					await this.newConversation();
					return;
				case 'selectConversation':
					await this.selectConversation(message.conversationId);
					return;
				case 'deleteConversation':
					await this.deleteConversation(message.conversationId);
					return;
				case 'cancel':
					this.cancel();
					return;
			}
		} catch (error) {
			await this.panel.webview.postMessage({
				type: 'error',
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private setWebviewFocus(focused: boolean): Thenable<unknown> {
		return vscode.commands.executeCommand('setContext', webviewFocusContextKey, focused && this.panel.active);
	}

	private getConversationItems() {
		return [...this.document.conversations]
			.sort((left, right) => right.updatedAt - left.updatedAt)
			.map(conversation => ({
				id: conversation.id,
				summary: getConversationSummary(conversation),
				updatedAt: conversation.updatedAt,
			}));
	}

	private async refreshConversationHistory(): Promise<void> {
		const conversations = this.getConversationItems();
		await Promise.all(this.manager.getEditors()
			.filter(editor => editor !== this)
			.map(editor => editor.panel.webview.postMessage({ type: 'conversationHistory', conversations })));
	}

	private async renderConversations(): Promise<void> {
		const current = this.getCurrentConversation();
		this.updateTitle(current);
		await this.panel.webview.postMessage({
			type: 'conversations',
			currentConversationId: current?.id ?? this.currentConversationId,
			messages: current?.messages ?? [],
			conversations: this.getConversationItems(),
		});
	}

	private updateTitle(conversation = this.getCurrentConversation()): void {
		this.panel.title = conversation ? createTabTitle(getConversationSummary(conversation)) : 'New conversation';
	}

	private getCurrentConversation(): StoredConversation | undefined {
		return this.document.conversations.find(conversation => conversation.id === this.currentConversationId);
	}

	private async selectConversation(conversationId: string): Promise<void> {
		if (!this.document.conversations.some(conversation => conversation.id === conversationId)) {
			return;
		}
		this.cancel();
		this.currentConversationId = conversationId;
		await this.context.globalState.update(storageKeys.currentConversation, conversationId);
		await this.renderConversations();
	}

	private async deleteConversation(conversationId: string): Promise<void> {
		const conversation = this.document.conversations.find(candidate => candidate.id === conversationId);
		if (!conversation) {
			return;
		}
		const answer = await vscode.window.showWarningMessage(
			`Delete conversation "${conversation.summary}"?`,
			{ modal: true },
			'Delete',
		);
		if (answer !== 'Delete') {
			return;
		}
		this.cancelSummary(conversationId);
		this.document.conversations.splice(
			0,
			this.document.conversations.length,
			...this.document.conversations.filter(candidate => candidate.id !== conversationId),
		);
		for (const editor of this.manager.getEditors()) {
			if (editor.currentConversationId === conversationId) {
				editor.cancel();
				editor.currentConversationId = [...this.document.conversations]
					.sort((left, right) => right.updatedAt - left.updatedAt)[0]?.id ?? randomUUID();
			}
		}
		await this.manager.persist(this.currentConversationId);
		await Promise.all(this.manager.getEditors().map(editor => editor.renderConversations()));
	}

	private async loadModels(version = this.modelService.currentVersion): Promise<void> {
		try {
			const models = await this.modelService.getModels();
			if (version !== this.modelService.currentVersion) {
				return;
			}
			const modelItems = await this.modelService.getModelItems(models);
			if (version !== this.modelService.currentVersion) {
				return;
			}
			await this.panel.webview.postMessage({
				type: 'models',
				selectedModelId: this.context.globalState.get<string>(storageKeys.selectedModel)
					?? this.context.globalState.get<string>(storageKeys.legacySelectedModel),
				models: modelItems,
			});
		} catch (error) {
			await this.panel.webview.postMessage({
				type: 'modelsError',
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private async send(text: string, modelId: string, editMessageIndex?: number): Promise<void> {
		const userText = text.trim();
		if (!userText) {
			return;
		}
		if (this.cancellation) {
			await this.panel.webview.postMessage({
				type: 'error',
				message: 'The previous request is still stopping. Please try again shortly.',
			});
			return;
		}

		const conversationId = this.currentConversationId;
		const conversation = this.getCurrentConversation();
		if (editMessageIndex !== undefined
			&& (!conversation || !Number.isInteger(editMessageIndex) || conversation.messages[editMessageIndex]?.role !== 'user')) {
			await this.panel.webview.postMessage({
				type: 'error',
				message: 'The message being edited is no longer available.',
			});
			return;
		}

		const cancellation = new vscode.CancellationTokenSource();
		this.cancellation = cancellation;
		if (conversation && editMessageIndex !== undefined) {
			conversation.messages.splice(editMessageIndex);
			conversation.updatedAt = Date.now();
			if (editMessageIndex === 0) {
				conversation.summary = createSummary(userText);
				this.panel.title = createTabTitle(userText);
			}
			await this.manager.persist(this.currentConversationId);
			await this.refreshConversationHistory();
		}
		if (!conversation) {
			this.panel.title = createTabTitle(userText);
		}

		const prompt = (vscode.workspace.getConfiguration('onlyChat').get<string>('prompt')
			?? vscode.workspace.getConfiguration('temporaryChat').get<string>('prompt', '')).trim();
		const requestMessages = [
			...(prompt ? [vscode.LanguageModelChatMessage.User(prompt, 'instructions')] : []),
			...(conversation?.messages ?? []).map(message => message.role === 'user'
				? vscode.LanguageModelChatMessage.User(message.content)
				: vscode.LanguageModelChatMessage.Assistant(message.content)),
			vscode.LanguageModelChatMessage.User(userText),
		];
		let answer = '';
		let modelName = '';

		try {
			const models = await this.modelService.getModels();
			const model = models.find(candidate => candidate.id === modelId) ?? models[0];
			if (!model) {
				throw new Error('No language model is available. Configure or sign in to a model provider in VS Code.');
			}
			const summaryPromise = !conversation || editMessageIndex === 0
				? this.generateSummary(model, userText, conversationId)
				: undefined;
			modelName = model.name;
			await this.panel.webview.postMessage({ type: 'started', model: modelName });
			const response = await model.sendRequest(requestMessages, {}, cancellation.token);
			for await (const chunk of response.text) {
				answer += chunk;
				await this.panel.webview.postMessage({ type: 'chunk', text: chunk });
			}

			const updatedConversation = conversation ?? createStoredConversation(conversationId, userText);
			updatedConversation.messages.push(
				{ role: 'user', content: userText },
				{ role: 'assistant', content: answer, model: modelName },
			);
			updatedConversation.updatedAt = Date.now();
			if (!conversation) {
				this.document.conversations.push(updatedConversation);
			}
			await this.manager.persist(this.currentConversationId);
			await this.panel.webview.postMessage({ type: 'completed' });
			await Promise.all([this.renderConversations(), this.refreshConversationHistory()]);
			if (summaryPromise) {
				void summaryPromise.then(summary => this.applyGeneratedSummary(conversationId, summary));
			}
		} catch (error) {
			this.cancelSummary(conversationId);
			if (error instanceof vscode.CancellationError || cancellation.token.isCancellationRequested) {
				const updatedConversation = conversation ?? createStoredConversation(conversationId, userText);
				updatedConversation.messages.push({ role: 'user', content: userText });
				if (answer) {
					updatedConversation.messages.push({ role: 'assistant', content: answer, model: modelName });
				}
				updatedConversation.updatedAt = Date.now();
				if (!conversation) {
					this.document.conversations.push(updatedConversation);
				}
				await this.manager.persist(this.currentConversationId);
				await this.panel.webview.postMessage({ type: 'cancelled' });
				await Promise.all([this.renderConversations(), this.refreshConversationHistory()]);
			} else {
				await this.panel.webview.postMessage({
					type: 'error',
					message: error instanceof Error ? error.message : String(error),
				});
			}
		} finally {
			cancellation.dispose();
			if (this.cancellation === cancellation) {
				this.cancellation = undefined;
			}
		}
	}

	private cancel(): void {
		this.cancellation?.cancel();
	}

	private async generateSummary(
		model: vscode.LanguageModelChat,
		userText: string,
		conversationId: string,
	): Promise<string> {
		const cancellation = new vscode.CancellationTokenSource();
		this.summaryCancellations.set(conversationId, cancellation);
		let summary = '';
		try {
			const response = await model.sendRequest([
				vscode.LanguageModelChatMessage.User(
					`Create a concise conversation title that captures the user's intent. `
					+ `Use the same language as the user, no more than 12 words, and output only the title without quotes or punctuation wrappers.\n\nUser input:\n${userText}`,
				),
			], {}, cancellation.token);
			for await (const chunk of response.text) {
				summary = normalizeGeneratedSummary(summary + chunk);
				if (summary) {
					await this.postSummary(conversationId, summary);
				}
			}
			return summary || createSummary(userText);
		} catch {
			return createSummary(userText);
		} finally {
			if (this.summaryCancellations.get(conversationId) === cancellation) {
				this.summaryCancellations.delete(conversationId);
			}
			cancellation.dispose();
		}
	}

	private async postSummary(conversationId: string, summary: string): Promise<void> {
		await Promise.all(this.manager.getEditors().map(editor => {
			if (editor.currentConversationId === conversationId) {
				editor.panel.title = createTabTitle(summary);
			}
			return editor.panel.webview.postMessage({ type: 'summaryChunk', conversationId, summary });
		}));
	}

	private async applyGeneratedSummary(conversationId: string, summary: string): Promise<void> {
		const conversation = this.document.conversations.find(candidate => candidate.id === conversationId);
		if (!conversation) {
			return;
		}
		conversation.summary = summary;
		await this.manager.persist(this.currentConversationId);
		await Promise.all(this.manager.getEditors().map(editor => editor.renderConversations()));
	}

	private cancelSummary(conversationId: string): void {
		this.summaryCancellations.get(conversationId)?.cancel();
	}
}

function createStoredConversation(id: string, userText: string): StoredConversation {
	return {
		id,
		summary: createSummary(userText),
		updatedAt: Date.now(),
		messages: [],
	};
}