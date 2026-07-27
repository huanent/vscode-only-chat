import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import {
	createConversation,
	createSummary,
	createTabTitle,
	getConversationSummary,
	getConversationTitle,
	normalizeGeneratedSummary,
	StoredConversation,
	StoredMessage,
} from './conversation';
import { deduplicateModels, getLanguageModelProviderNames } from './languageModels';
import { getWebviewHtml } from './webview';

type WebviewMessage =
	| { type: 'ready' }
	| { type: 'send'; text: string; modelId: string }
	| { type: 'selectModel'; modelId: string }
	| { type: 'newConversation' }
	| { type: 'selectConversation'; conversationId: string }
	| { type: 'deleteConversation'; conversationId: string }
	| { type: 'cancel' }
	| { type: 'openSettings' };

const commandId = 'temporaryChat.open';
const newConversationCommandId = 'temporaryChat.newConversation';
const editorViewType = 'temporaryChat.editor';
const editorUri = vscode.Uri.from({ scheme: 'temporary-chat', path: '/ ' });
const selectedModelStorageKey = 'temporaryChat.selectedModelId';
const conversationStorageKey = 'temporaryChat.conversation';
const conversationsStorageKey = 'temporaryChat.conversations';
const currentConversationStorageKey = 'temporaryChat.currentConversationId';

export function registerTemporaryChat(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand(commandId, () => TemporaryChatPanel.show(context)),
		vscode.commands.registerCommand(newConversationCommandId, () => TemporaryChatPanel.startNewConversation(context)),
		vscode.window.registerCustomEditorProvider(editorViewType, new TemporaryChatEditorProvider(context), {
			webviewOptions: { retainContextWhenHidden: true },
			supportsMultipleEditorsPerDocument: true,
		}),
	);
}

class TemporaryChatDocument implements vscode.CustomDocument {
	readonly conversations: StoredConversation[];

	constructor(readonly uri: vscode.Uri, context: vscode.ExtensionContext) {
		this.conversations = context.globalState.get<StoredConversation[]>(conversationsStorageKey, []);
		if (this.conversations.length === 0) {
			const legacyMessages = context.globalState.get<StoredMessage[]>(conversationStorageKey, []);
			if (legacyMessages.length > 0) {
				this.conversations.push(createConversation(legacyMessages));
			}
		}
	}

	dispose() { }
}

class TemporaryChatEditorProvider implements vscode.CustomReadonlyEditorProvider<TemporaryChatDocument> {
	constructor(private readonly context: vscode.ExtensionContext) { }

	openCustomDocument(uri: vscode.Uri) {
		return new TemporaryChatDocument(uri, this.context);
	}

	resolveCustomEditor(document: TemporaryChatDocument, panel: vscode.WebviewPanel) {
		TemporaryChatPanel.resolve(panel, this.context, document);
	}
}

class TemporaryChatPanel {
	private static readonly editors = new Set<TemporaryChatPanel>();
	private static current: TemporaryChatPanel | undefined;
	private readonly panel: vscode.WebviewPanel;
	private readonly context: vscode.ExtensionContext;
	private readonly document: TemporaryChatDocument;
	private readonly disposables: vscode.Disposable[] = [];
	private currentConversationId: string;
	private cancellation: vscode.CancellationTokenSource | undefined;
	private models: readonly vscode.LanguageModelChat[] | undefined;
	private modelsPromise: Promise<readonly vscode.LanguageModelChat[]> | undefined;
	private modelsVersion = 0;
	private readonly summaryCancellations = new Map<string, vscode.CancellationTokenSource>();

	static async show(context: vscode.ExtensionContext) {
		if (TemporaryChatPanel.current) {
			TemporaryChatPanel.current.panel.reveal(vscode.ViewColumn.Active);
			return;
		}
		await vscode.commands.executeCommand('vscode.openWith', editorUri, editorViewType, {
			viewColumn: vscode.ViewColumn.Active,
		});
	}

	static async startNewConversation(context: vscode.ExtensionContext) {
		await TemporaryChatPanel.show(context);
		await TemporaryChatPanel.current?.newConversation();
	}

	static resolve(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, document: TemporaryChatDocument) {
		const editor = new TemporaryChatPanel(panel, context, document);
		TemporaryChatPanel.editors.add(editor);
		TemporaryChatPanel.current = editor;
	}

	private static getEditors(document: TemporaryChatDocument) {
		return [...TemporaryChatPanel.editors].filter(editor => editor.document === document);
	}

	private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, document: TemporaryChatDocument) {
		this.panel = panel;
		this.context = context;
		this.document = document;
		this.currentConversationId = context.globalState.get<string>(currentConversationStorageKey)
			?? document.conversations[0]?.id
			?? randomUUID();
		this.panel.webview.options = {
			enableScripts: true,
			localResourceRoots: [context.extensionUri],
		};
		const current = this.getCurrentConversation();
		this.panel.title = current ? createTabTitle(getConversationSummary(current)) : 'New conversation';
		this.panel.iconPath = new vscode.ThemeIcon('comment-discussion');
		this.panel.webview.html = getWebviewHtml(this.panel.webview, context.extensionUri);

		this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
		this.panel.onDidChangeViewState(event => {
			if (event.webviewPanel.active) {
				TemporaryChatPanel.current = this;
			}
		}, undefined, this.disposables);
		this.panel.webview.onDidReceiveMessage(
			(message: WebviewMessage) => this.handleMessage(message),
			undefined,
			this.disposables,
		);
		vscode.lm.onDidChangeChatModels(() => {
			this.modelsVersion++;
			this.models = undefined;
			this.modelsPromise = undefined;
			void this.loadModels(this.modelsVersion);
		}, undefined, this.disposables);
	}

	private async handleMessage(message: WebviewMessage) {
		switch (message.type) {
			case 'ready':
				await Promise.all([this.loadModels(), this.renderConversations()]);
				break;
			case 'send':
				await this.send(message.text, message.modelId);
				break;
			case 'selectModel':
				await this.context.globalState.update(selectedModelStorageKey, message.modelId);
				break;
			case 'newConversation':
				await this.newConversation();
				break;
			case 'selectConversation':
				await this.selectConversation(message.conversationId);
				break;
			case 'deleteConversation':
				await this.deleteConversation(message.conversationId);
				break;
			case 'cancel':
				this.cancel();
				break;
			case 'openSettings':
				await vscode.commands.executeCommand('workbench.action.openSettings', 'temporaryChat.prompt');
				break;
		}
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

	private async refreshConversationHistory() {
		const conversations = this.getConversationItems();
		await Promise.all(TemporaryChatPanel.getEditors(this.document)
			.filter(editor => editor !== this)
			.map(editor => editor.panel.webview.postMessage({
				type: 'conversationHistory',
				conversations,
			})));
	}

	private async renderConversations() {
		const current = this.getCurrentConversation();
		this.panel.title = current ? createTabTitle(getConversationSummary(current)) : 'New conversation';
		await this.panel.webview.postMessage({
			type: 'conversations',
			currentConversationId: current?.id ?? this.currentConversationId,
			currentSummary: current ? getConversationTitle(current) : '',
			messages: current?.messages ?? [],
			conversations: this.getConversationItems(),
		});
	}

	private getCurrentConversation() {
		return this.document.conversations.find(conversation => conversation.id === this.currentConversationId);
	}

	private async newConversation() {
		this.cancel();
		this.currentConversationId = randomUUID();
		await this.persistConversations();
		await this.renderConversations();
	}

	private async selectConversation(conversationId: string) {
		if (!this.document.conversations.some(conversation => conversation.id === conversationId)) {
			return;
		}
		this.cancel();
		this.currentConversationId = conversationId;
		await this.context.globalState.update(currentConversationStorageKey, conversationId);
		await this.renderConversations();
	}

	private async deleteConversation(conversationId: string) {
		const conversation = this.document.conversations.find(candidate => candidate.id === conversationId);
		if (!conversation) {
			return;
		}
		const answer = await vscode.window.showWarningMessage(`Delete conversation "${conversation.summary}"?`, { modal: true }, 'Delete');
		if (answer !== 'Delete') {
			return;
		}
		this.cancelSummary(conversationId);
		this.document.conversations.splice(0, this.document.conversations.length,
			...this.document.conversations.filter(conversation => conversation.id !== conversationId));
		for (const editor of TemporaryChatPanel.getEditors(this.document)) {
			if (editor.currentConversationId === conversationId) {
				editor.cancel();
				editor.currentConversationId = [...this.document.conversations]
					.sort((left, right) => right.updatedAt - left.updatedAt)[0]?.id ?? randomUUID();
			}
		}
		await this.persistConversations();
		await Promise.all(TemporaryChatPanel.getEditors(this.document)
			.map(editor => editor.renderConversations()));
	}

	private async persistConversations() {
		await Promise.all([
			this.context.globalState.update(conversationsStorageKey, this.document.conversations),
			this.context.globalState.update(currentConversationStorageKey, this.currentConversationId),
			this.context.globalState.update(conversationStorageKey, undefined),
		]);
	}

	private async loadModels(version = this.modelsVersion) {
		try {
			const models = await this.getModels();
			if (version !== this.modelsVersion) {
				return;
			}
			await this.postModels(models);
			const providerNames = await getLanguageModelProviderNames(this.context, models);
			if (version !== this.modelsVersion) {
				return;
			}
			await this.postModels(models, providerNames);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await this.panel.webview.postMessage({ type: 'modelsError', message });
		}
	}

	private getModels(): Promise<readonly vscode.LanguageModelChat[]> {
		if (this.models) {
			return Promise.resolve(this.models);
		}
		if (!this.modelsPromise) {
			const modelsPromise = Promise.resolve(vscode.lm.selectChatModels()).then(models => {
				const uniqueModels = deduplicateModels(models);
				if (this.modelsPromise === modelsPromise) {
					this.models = uniqueModels;
				}
				return uniqueModels;
			}).finally(() => {
				if (this.modelsPromise === modelsPromise) {
					this.modelsPromise = undefined;
				}
			});
			this.modelsPromise = modelsPromise;
		}
		return this.modelsPromise;
	}

	private postModels(models: readonly vscode.LanguageModelChat[], providerNames?: ReadonlyMap<string, string>) {
		return this.panel.webview.postMessage({
			type: 'models',
			selectedModelId: this.context.globalState.get<string>(selectedModelStorageKey),
			models: models.map(model => ({
				id: model.id,
				name: model.name,
				providerName: providerNames?.get(model.id) ?? model.vendor,
				family: model.family,
			})),
		});
	}

	private async send(text: string, modelId: string) {
		const userText = text.trim();
		if (!userText) {
			return;
		}
		if (this.cancellation) {
			await this.panel.webview.postMessage({ type: 'error', message: 'The previous request is still stopping. Please try again shortly.' });
			return;
		}

		const cancellation = new vscode.CancellationTokenSource();
		this.cancellation = cancellation;
		const conversationId = this.currentConversationId;
		const conversation = this.getCurrentConversation();
		if (!conversation) {
			this.panel.title = createTabTitle(userText);
		}
		const prompt = vscode.workspace.getConfiguration('temporaryChat').get<string>('prompt', '').trim();
		const requestMessages = [
			...(prompt ? [vscode.LanguageModelChatMessage.User(prompt, 'instructions')] : []),
			...(conversation?.messages ?? []).map(message => message.role === 'user'
				? vscode.LanguageModelChatMessage.User(message.content)
				: vscode.LanguageModelChatMessage.Assistant(message.content)),
			vscode.LanguageModelChatMessage.User(userText),
		];

		try {
			const models = await this.getModels();
			const model = models.find(candidate => candidate.id === modelId) ?? models[0];
			if (!model) {
				throw new Error('No language model is available. Configure or sign in to a model provider in VS Code.');
			}

			const summaryPromise = conversation
				? undefined
				: this.generateSummary(model, userText, conversationId);
			await this.panel.webview.postMessage({ type: 'started', model: model.name });
			const response = await model.sendRequest(requestMessages, {}, cancellation.token);
			let answer = '';
			for await (const chunk of response.text) {
				answer += chunk;
				await this.panel.webview.postMessage({ type: 'chunk', text: chunk });
			}

			const updatedConversation = conversation ?? {
				id: conversationId,
				summary: createSummary(userText),
				updatedAt: Date.now(),
				messages: [],
			};
			updatedConversation.messages.push(
				{ role: 'user', content: userText },
				{ role: 'assistant', content: answer },
			);
			updatedConversation.updatedAt = Date.now();
			if (!conversation) {
				this.document.conversations.push(updatedConversation);
			}
			await this.persistConversations();
			await this.panel.webview.postMessage({ type: 'completed' });
			await Promise.all([
				this.renderConversations(),
				this.refreshConversationHistory(),
			]);
			if (summaryPromise) {
				void summaryPromise.then(summary => this.applyGeneratedSummary(conversationId, summary));
			}
		} catch (error) {
			this.cancelSummary(conversationId);
			if (error instanceof vscode.CancellationError || cancellation.token.isCancellationRequested) {
				await this.panel.webview.postMessage({ type: 'cancelled' });
			} else {
				const message = error instanceof Error ? error.message : String(error);
				await this.panel.webview.postMessage({ type: 'error', message });
			}
		} finally {
			cancellation.dispose();
			if (this.cancellation === cancellation) {
				this.cancellation = undefined;
			}
		}
	}

	private cancel() {
		this.cancellation?.cancel();
	}

	private async generateSummary(model: vscode.LanguageModelChat, userText: string, conversationId: string) {
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

	private async postSummary(conversationId: string, summary: string) {
		await Promise.all(TemporaryChatPanel.getEditors(this.document).map(editor => {
			if (editor.currentConversationId === conversationId) {
				editor.panel.title = createTabTitle(summary);
			}
			return editor.panel.webview.postMessage({ type: 'summaryChunk', conversationId, summary });
		}));
	}

	private async applyGeneratedSummary(conversationId: string, summary: string) {
		const conversation = this.document.conversations.find(candidate => candidate.id === conversationId);
		if (!conversation) {
			return;
		}
		conversation.summary = summary;
		await this.persistConversations();
		await Promise.all(TemporaryChatPanel.getEditors(this.document).map(editor => editor.renderConversations()));
	}

	private cancelSummary(conversationId: string) {
		this.summaryCancellations.get(conversationId)?.cancel();
	}

	private dispose() {
		this.cancel();
		for (const cancellation of this.summaryCancellations.values()) {
			cancellation.cancel();
			cancellation.dispose();
		}
		this.summaryCancellations.clear();
		TemporaryChatPanel.editors.delete(this);
		if (TemporaryChatPanel.current === this) {
			TemporaryChatPanel.current = TemporaryChatPanel.getEditors(this.document)[0];
		}
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
	}
}
