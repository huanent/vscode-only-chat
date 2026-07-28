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
import { getLanguageModelProviderNames } from './languageModels';
import { getWebviewHtml } from './webview';

type WebviewMessage =
	| { type: 'ready' }
	| { type: 'focusChanged'; focused: boolean }
	| { type: 'send'; text: string; modelId: string; editMessageIndex?: number }
	| { type: 'selectModel'; modelId: string }
	| { type: 'newConversation' }
	| { type: 'selectConversation'; conversationId: string }
	| { type: 'deleteConversation'; conversationId: string }
	| { type: 'cancel' }
	| { type: 'openSettings' };

const commandId = 'onlyChat.open';
const newConversationCommandId = 'onlyChat.newConversation';
const newTabCommandId = 'onlyChat.newTab';
const editorViewType = 'onlyChat.editor';
const selectedModelStorageKey = 'onlyChat.selectedModelId';
const conversationsStorageKey = 'onlyChat.conversations';
const currentConversationStorageKey = 'onlyChat.currentConversationId';
const legacySelectedModelStorageKey = 'temporaryChat.selectedModelId';
const legacyConversationStorageKey = 'temporaryChat.conversation';
const legacyConversationsStorageKey = 'temporaryChat.conversations';
const webviewFocusContextKey = 'onlyChat.webviewFocus';

export function registerOnlyChat(context: vscode.ExtensionContext) {
	const editorProvider = new OnlyChatEditorProvider(context);
	context.subscriptions.push(
		vscode.commands.registerCommand(commandId, () => OnlyChatPanel.show()),
		vscode.commands.registerCommand(newConversationCommandId, () => OnlyChatPanel.startNewConversation()),
		vscode.commands.registerCommand(newTabCommandId, () => OnlyChatPanel.openNewTab()),
		vscode.window.registerCustomEditorProvider(editorViewType, editorProvider, {
			webviewOptions: { retainContextWhenHidden: true },
			supportsMultipleEditorsPerDocument: true,
		}),
	);
}

class OnlyChatDocument implements vscode.CustomDocument {
	constructor(readonly uri: vscode.Uri, readonly conversations: StoredConversation[]) { }

	dispose() { }
}

class OnlyChatEditorProvider implements vscode.CustomReadonlyEditorProvider<OnlyChatDocument> {
	private readonly conversations: StoredConversation[];

	constructor(private readonly context: vscode.ExtensionContext) {
		this.conversations = context.globalState.get<StoredConversation[]>(conversationsStorageKey)
			?? context.globalState.get<StoredConversation[]>(legacyConversationsStorageKey, []);
		if (this.conversations.length === 0) {
			const legacyMessages = context.globalState.get<StoredMessage[]>(legacyConversationStorageKey, []);
			if (legacyMessages.length > 0) {
				this.conversations.push(createConversation(legacyMessages));
			}
		}
	}

	openCustomDocument(uri: vscode.Uri) {
		return new OnlyChatDocument(uri, this.conversations);
	}

	resolveCustomEditor(document: OnlyChatDocument, panel: vscode.WebviewPanel) {
		if (OnlyChatPanel.hasEditor(document)) {
			void OnlyChatPanel.replaceSplitEditor(panel);
			return;
		}
		OnlyChatPanel.resolve(panel, this.context, document);
	}
}

class OnlyChatPanel {
	private static readonly editors = new Set<OnlyChatPanel>();
	private static current: OnlyChatPanel | undefined;
	private readonly panel: vscode.WebviewPanel;
	private readonly context: vscode.ExtensionContext;
	private readonly document: OnlyChatDocument;
	private readonly disposables: vscode.Disposable[] = [];
	private currentConversationId: string;
	private cancellation: vscode.CancellationTokenSource | undefined;
	private models: readonly vscode.LanguageModelChat[] | undefined;
	private modelsPromise: Promise<readonly vscode.LanguageModelChat[]> | undefined;
	private modelsVersion = 0;
	private readonly summaryCancellations = new Map<string, vscode.CancellationTokenSource>();

	static async show() {
		if (OnlyChatPanel.current) {
			OnlyChatPanel.current.panel.reveal(vscode.ViewColumn.Active);
			await OnlyChatPanel.current.newConversation();
			return;
		}
		await vscode.commands.executeCommand('vscode.openWith', this.createEditorUri(), editorViewType, {
			viewColumn: vscode.ViewColumn.Active,
		});
	}

	static async startNewConversation() {
		await OnlyChatPanel.show();
	}

	static async openNewTab() {
		await vscode.commands.executeCommand('vscode.openWith', this.createEditorUri(), editorViewType, {
			viewColumn: vscode.ViewColumn.Active,
		});
	}

	static hasEditor(document: OnlyChatDocument) {
		return [...OnlyChatPanel.editors].some(editor => editor.document === document);
	}

	static async replaceSplitEditor(panel: vscode.WebviewPanel) {
		const viewColumn = panel.viewColumn ?? vscode.ViewColumn.Active;
		panel.dispose();
		await vscode.commands.executeCommand('vscode.openWith', this.createEditorUri(), editorViewType, {
			viewColumn,
		});
	}

	private static createEditorUri() {
		const query = new URLSearchParams({ id: randomUUID() });
		return vscode.Uri.from({
			scheme: 'only-chat',
			path: '/New conversation',
			query: query.toString(),
		});
	}

	static resolve(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, document: OnlyChatDocument) {
		const editor = new OnlyChatPanel(panel, context, document);
		OnlyChatPanel.editors.add(editor);
		OnlyChatPanel.current = editor;
	}

	private static getEditors() {
		return [...OnlyChatPanel.editors];
	}

	private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, document: OnlyChatDocument) {
		this.panel = panel;
		this.context = context;
		this.document = document;
		this.currentConversationId = randomUUID();
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
				OnlyChatPanel.current = this;
			} else {
				void this.setWebviewFocus(false);
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
			case 'focusChanged':
				await this.setWebviewFocus(message.focused);
				break;
			case 'send':
				await this.send(message.text, message.modelId, message.editMessageIndex);
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
				await vscode.commands.executeCommand('workbench.action.openSettings', 'onlyChat.prompt');
				break;
		}
	}

	private setWebviewFocus(focused: boolean) {
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

	private async refreshConversationHistory() {
		const conversations = this.getConversationItems();
		await Promise.all(OnlyChatPanel.getEditors()
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
		for (const editor of OnlyChatPanel.getEditors()) {
			if (editor.currentConversationId === conversationId) {
				editor.cancel();
				editor.currentConversationId = [...this.document.conversations]
					.sort((left, right) => right.updatedAt - left.updatedAt)[0]?.id ?? randomUUID();
			}
		}
		await this.persistConversations();
		await Promise.all(OnlyChatPanel.getEditors()
			.map(editor => editor.renderConversations()));
	}

	private async persistConversations() {
		await Promise.all([
			this.context.globalState.update(conversationsStorageKey, this.document.conversations),
			this.context.globalState.update(currentConversationStorageKey, this.currentConversationId),
			this.context.globalState.update(legacyConversationStorageKey, undefined),
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
				if (this.modelsPromise === modelsPromise) {
					this.models = models;
				}
				return models;
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
		const visibleModels = new Map<string, {
			id: string;
			name: string;
			providerName: string;
			family: string;
		}>();
		for (const model of models) {
			const providerName = providerNames?.get(model.id) ?? model.vendor;
			const key = `${providerName}\u0000${model.name}`;
			if (!visibleModels.has(key)) {
				visibleModels.set(key, {
					id: model.id,
					name: model.name,
					providerName,
					family: model.family,
				});
			}
		}
		return this.panel.webview.postMessage({
			type: 'models',
			selectedModelId: this.context.globalState.get<string>(selectedModelStorageKey)
				?? this.context.globalState.get<string>(legacySelectedModelStorageKey),
			models: [...visibleModels.values()],
		});
	}

	private async send(text: string, modelId: string, editMessageIndex?: number) {
		const userText = text.trim();
		if (!userText) {
			return;
		}
		if (this.cancellation) {
			await this.panel.webview.postMessage({ type: 'error', message: 'The previous request is still stopping. Please try again shortly.' });
			return;
		}

		const conversationId = this.currentConversationId;
		const conversation = this.getCurrentConversation();
		if (editMessageIndex !== undefined
			&& (!conversation || !Number.isInteger(editMessageIndex) || conversation.messages[editMessageIndex]?.role !== 'user')) {
			await this.panel.webview.postMessage({ type: 'error', message: 'The message being edited is no longer available.' });
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
			await this.persistConversations();
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

		try {
			const models = await this.getModels();
			const model = models.find(candidate => candidate.id === modelId) ?? models[0];
			if (!model) {
				throw new Error('No language model is available. Configure or sign in to a model provider in VS Code.');
			}

			const summaryPromise = !conversation || editMessageIndex === 0
				? this.generateSummary(model, userText, conversationId)
				: undefined;
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
				{ role: 'assistant', content: answer, model: model.name },
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
		await Promise.all(OnlyChatPanel.getEditors().map(editor => {
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
		await Promise.all(OnlyChatPanel.getEditors().map(editor => editor.renderConversations()));
	}

	private cancelSummary(conversationId: string) {
		this.summaryCancellations.get(conversationId)?.cancel();
	}

	private dispose() {
		void this.setWebviewFocus(false);
		this.cancel();
		for (const cancellation of this.summaryCancellations.values()) {
			cancellation.cancel();
			cancellation.dispose();
		}
		this.summaryCancellations.clear();
		OnlyChatPanel.editors.delete(this);
		if (OnlyChatPanel.current === this) {
			OnlyChatPanel.current = OnlyChatPanel.getEditors()[0];
		}
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
	}
}
