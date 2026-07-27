import * as vscode from 'vscode';
import { randomUUID } from 'crypto';

type StoredMessage = {
	role: 'user' | 'assistant';
	content: string;
};

type StoredConversation = {
	id: string;
	summary: string;
	updatedAt: number;
	messages: StoredMessage[];
};

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
const editorUri = vscode.Uri.parse('temporary-chat:/Temporary Chat.temporary-chat');
const selectedModelStorageKey = 'temporaryChat.selectedModelId';
const conversationStorageKey = 'temporaryChat.conversation';
const conversationsStorageKey = 'temporaryChat.conversations';
const currentConversationStorageKey = 'temporaryChat.currentConversationId';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand(commandId, () => TemporaryChatPanel.show(context)),
		vscode.commands.registerCommand(newConversationCommandId, () => TemporaryChatPanel.startNewConversation(context)),
		vscode.window.registerCustomEditorProvider(editorViewType, new TemporaryChatEditorProvider(context), {
			webviewOptions: { retainContextWhenHidden: true },
			supportsMultipleEditorsPerDocument: true,
		}),
	);
}

export function deactivate() { }

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
		vscode.lm.onDidChangeChatModels(() => this.loadModels(), undefined, this.disposables);
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
			currentSummary: current ? getConversationTitle(current) : 'New conversation',
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

	private async loadModels() {
		try {
			const models = await vscode.lm.selectChatModels();
			const providerNames = await getLanguageModelProviderNames(this.context, models);
			await this.panel.webview.postMessage({
				type: 'models',
				selectedModelId: this.context.globalState.get<string>(selectedModelStorageKey),
				models: models.map(model => ({
					id: model.id,
					name: model.name,
					providerName: providerNames.get(model.id) ?? model.vendor,
					family: model.family,
				})),
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await this.panel.webview.postMessage({ type: 'modelsError', message });
		}
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
			const models = await vscode.lm.selectChatModels();
			const model = models.find(candidate => candidate.id === modelId) ?? models[0];
			if (!model) {
				throw new Error('No language model is available. Configure or sign in to a model provider in VS Code.');
			}

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
		} catch (error) {
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

	private dispose() {
		this.cancel();
		TemporaryChatPanel.editors.delete(this);
		if (TemporaryChatPanel.current === this) {
			TemporaryChatPanel.current = TemporaryChatPanel.getEditors(this.document)[0];
		}
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
	}
}

function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri) {
	const nonce = getNonce();
	const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css'));
	const markdownItUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'markdown-it', 'dist', 'markdown-it.min.js'));
	const katexCssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'katex', 'dist', 'katex.min.css'));
	const katexUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'katex', 'dist', 'katex.min.js'));
	const texmathCssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'markdown-it-texmath', 'css', 'texmath.css'));
	const texmathUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'markdown-it-texmath', 'texmath.js'));
	const domPurifyUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'dompurify', 'dist', 'purify.min.js'));

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'nonce-${nonce}'; style-src-attr 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}';">
	<title>New conversation</title>
	<link rel="stylesheet" href="${codiconsUri}">
	<link rel="stylesheet" href="${katexCssUri}">
	<link rel="stylesheet" href="${texmathCssUri}">
	<style nonce="${nonce}">
		:root { color-scheme: light dark; }
		* { box-sizing: border-box; }
		body { margin: 0; padding:0; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
		button, select { font: inherit; }
		button { cursor: pointer; }
		button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
		select:focus { outline: none; }
		button:disabled { cursor: default; opacity: .5; }
		.app { position: relative; height: 100vh; padding:0 4px; display: grid; grid-template-rows: 36px minmax(0, 1fr); }
		header { position: relative; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--vscode-panel-border); background: var(--vscode-editor-background); }
		.conversation-summary { position: absolute; left: 50%; width: min(calc(100% - 160px), 900px); overflow: hidden; font-size: 12px; font-weight: 700; text-align: center; text-overflow: ellipsis; white-space: nowrap; pointer-events: none; transform: translateX(-50%); }
		.header-actions { z-index: 1; display: flex; align-items: center; gap: 2px; }
		.icon-button { width: 28px; height: 28px; display: inline-grid; place-items: center; padding: 0; border: 0; border-radius: 4px; color: var(--vscode-icon-foreground); background: transparent; }
		.icon-button:hover { color: var(--vscode-foreground); background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground)); }
		.icon-button .codicon { font-size: 16px; }
		.workspace { min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr); }
		.chat-area { min-width: 0; min-height: 0; display: grid; grid-template-rows: minmax(0, 1fr) auto; }
		.messages { overflow-y: auto; padding: 18px max(80px, calc((100% - 900px) / 2)) 28px; scroll-padding-bottom: 24px; }
		.empty { display: none; }
		.message { display: flex; padding: 12px 0; }
		.message-content { min-width: 0; line-height: 1.6; overflow-wrap: anywhere; }
		.message-content > :first-child { margin-top: 0; }
		.message-content > :last-child { margin-bottom: 0; }
		.message-content p, .message-content ul, .message-content ol, .message-content blockquote, .message-content pre { margin: 0 0 10px; }
		.message-content ul, .message-content ol { padding-left: 22px; }
		.message-content blockquote { padding-left: 10px; border-left: 2px solid var(--vscode-textBlockQuote-border); color: var(--vscode-descriptionForeground); }
		.message-content code { padding: 1px 3px; border-radius: 3px; color: var(--vscode-textPreformat-foreground); background: var(--vscode-textCodeBlock-background); font-family: var(--vscode-editor-font-family); }
		.message-content pre { overflow-x: auto; padding: 10px; background: var(--vscode-textCodeBlock-background); }
		.message-content pre code { padding: 0; background: transparent; }
		.message-content a { color: var(--vscode-textLink-foreground); }
		.message-content .table-scroll { max-width: 100%; overflow-x: auto; margin: 0 0 10px; }
		.message-content table { width: max-content; min-width: 100%; border-collapse: collapse; border-spacing: 0; }
		.message-content th, .message-content td { padding: 5px 8px; border: 1px solid var(--vscode-panel-border); text-align: left; }
		.message-content th { background: var(--vscode-textBlockQuote-background); font-weight: 600; }
		.message-content .katex, .message-content .katex * { box-sizing: content-box; overflow-wrap: normal; word-break: normal; }
		.message-content .katex .fbox, .message-content .katex .fcolorbox, .message-content .katex .angl { box-sizing: border-box; }
		.message-content .katex-display { max-width: 100%; overflow-x: auto; overflow-y: hidden; }
		.assistant { justify-content: flex-start; }
		.user { justify-content: flex-end; }
		.user .message-content { max-width: 82%; justify-self: end; padding: 7px 10px; border: 1px solid var(--vscode-chat-requestBorder, var(--vscode-contrastBorder, var(--vscode-panel-border))); border-radius: 4px; background: var(--vscode-chat-requestBackground, var(--vscode-input-background, rgba(127, 127, 127, .12))); }
		.message-content.loading { width: 32px; height: 24px; display: flex; align-items: center; gap: 3px; }
		.message-content.loading::before, .message-content.loading::after { width: 4px; height: 4px; border-radius: 50%; background: var(--vscode-descriptionForeground); content: ""; animation: loading-dot 900ms ease-in-out infinite; }
		.message-content.loading::after { animation-delay: 300ms; }
		.message-content.loading { background-image: radial-gradient(circle, var(--vscode-descriptionForeground) 2px, transparent 2.5px); background-position: center; background-repeat: no-repeat; }
		@keyframes loading-dot { 0%, 60%, 100% { opacity: .35; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-2px); } }
		.composer { padding: 8px max(80px, calc((100% - 900px) / 2)) 6px; background: var(--vscode-editor-background); }
		.input-shell { overflow: hidden; border: 1px solid var(--vscode-panel-border); border-radius: 8px; background: var(--vscode-input-background, rgba(127, 127, 127, .08)); transition: border-color 80ms ease; }
		.input-shell:focus-within { border-color: var(--vscode-focusBorder); }
		.message-input { width: 100%; min-height: 40px; max-height: 180px; overflow-y: auto; padding: 7px 10px 1px; color: var(--vscode-input-foreground); line-height: 1.4; white-space: pre-wrap; overflow-wrap: anywhere; outline: 0; }
		.message-input:empty::before { color: var(--vscode-input-placeholderForeground); content: attr(data-placeholder); pointer-events: none; }
		.message-input[contenteditable="false"] { opacity: .6; }
		.input-toolbar { min-height: 28px; display: flex; align-items: center; gap: 6px; padding: 0 4px 3px 5px; }
		.input-toolbar .spacer { flex: 1; }
		select { min-width: 0; max-width: min(60vw, 300px); height: 26px; padding: 0 16px 0 6px; border: 0; border-radius: 3px; color: var(--vscode-descriptionForeground); background: transparent; font-size: 11px; }
		select:hover { color: var(--vscode-foreground); background: rgba(127, 127, 127, .08); }
		.send-button { width: 26px; height: 26px; display: inline-grid; place-items: center; padding: 0; border: 0; border-radius: 4px; color: var(--vscode-icon-foreground); background: transparent; }
		.send-button:hover { color: var(--vscode-foreground); background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground)); }
		.send-button .codicon { font-size: 15px; }
		.status { min-height: 15px; padding: 2px 1px 0; color: var(--vscode-descriptionForeground); font-size: 11px; }
		.history-panel { position: absolute; z-index: 10; top: 36px; left: 4px; width: min(320px, calc(100% - 8px)); max-height: min(480px, calc(100vh - 44px)); display: none; overflow: hidden; border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); border-radius: 4px; background: var(--vscode-menu-background, var(--vscode-editorWidget-background)); box-shadow: 0 4px 12px var(--vscode-widget-shadow); }
		.history-visible .history-panel { display: grid; }
		.history-list { max-height: inherit; overflow-y: auto; margin: 0; padding: 4px; background: transparent; list-style: none; }
		.history-empty { padding: 20px 10px; color: var(--vscode-descriptionForeground); text-align: center; }
		.history-row { display: grid; grid-template-columns: minmax(0, 1fr) 28px; align-items: center; border-radius: 3px; background: transparent; }
		.history-row.active { color: var(--vscode-list-activeSelectionForeground); }
		.history-item { min-width: 0; padding: 7px 8px; border: 0; color: inherit; background: transparent; text-align: left; }
		.history-item-title, .history-item-time { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
		.history-item-time { margin-top: 2px; color: var(--vscode-descriptionForeground); font-size: 10px; }
		.history-row.active .history-item-time { color: inherit; opacity: .8; }
		.delete-history { opacity: 0; }
		.history-row:hover .delete-history, .history-row:focus-within .delete-history { opacity: 1; }
		.delete-history:hover { color: var(--vscode-errorForeground); }
		@media (max-width: 620px) { select { max-width: 42vw; } }
	</style>
</head>
<body>
	<div class="app">
		<header>
			<button id="toggle-history" class="icon-button" title="Show conversation history" aria-label="Show conversation history" aria-controls="history-panel" aria-expanded="false"><span class="codicon codicon-menu" aria-hidden="true"></span></button>
			<div id="conversation-summary" class="conversation-summary" title="New conversation">New conversation</div>
			<div class="header-actions">
				<button id="new-conversation" class="icon-button" title="New conversation" aria-label="New conversation"><span class="codicon codicon-add" aria-hidden="true"></span></button>
				<button id="open-prompt-settings" class="icon-button" title="Prompt settings" aria-label="Open prompt settings"><span class="codicon codicon-settings-gear" aria-hidden="true"></span></button>
			</div>
		</header>
		<div id="workspace" class="workspace">
			<aside id="history-panel" class="history-panel" aria-label="Conversation history">
				<ul id="history-list" class="history-list">
					<li class="history-empty">No conversation history</li>
				</ul>
			</aside>
			<div class="chat-area">
				<main id="messages" class="messages">
					<div id="empty" class="empty"></div>
				</main>
				<section class="composer">
					<div class="input-shell">
						<div id="input" class="message-input" role="textbox" aria-label="Message" aria-multiline="true" contenteditable="plaintext-only" data-placeholder="Type a message. Enter to send, Shift+Enter for a new line" autofocus></div>
						<div class="input-toolbar">
							<select id="model" aria-label="Language model" title="Select a language model" disabled>
								<option value="">Loading models...</option>
							</select>
							<span class="spacer"></span>
							<button id="send" class="send-button" title="Send" aria-label="Send"><span class="codicon codicon-send" aria-hidden="true"></span></button>
						</div>
					</div>
					<div id="status" class="status" aria-live="polite"></div>
				</section>
			</div>
		</div>
	</div>
	<script nonce="${nonce}" src="${markdownItUri}"></script>
	<script nonce="${nonce}" src="${katexUri}"></script>
	<script nonce="${nonce}" src="${texmathUri}"></script>
	<script nonce="${nonce}" src="${domPurifyUri}"></script>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const markdown = window.markdownit({ breaks: true, html: false, linkify: true }).use(window.texmath, {
			engine: window.katex,
			delimiters: 'dollars',
			katexOptions: { strict: 'ignore', throwOnError: false },
		});
		const messages = document.getElementById('messages');
		const empty = document.getElementById('empty');
		const input = document.getElementById('input');
		const modelSelect = document.getElementById('model');
		const sendButton = document.getElementById('send');
		const status = document.getElementById('status');
		const conversationSummary = document.getElementById('conversation-summary');
		const workspace = document.getElementById('workspace');
		const toggleHistoryButton = document.getElementById('toggle-history');
		const historyPanel = document.getElementById('history-panel');
		const historyList = document.getElementById('history-list');
		let assistantContent;
		let assistantText = '';
		let busy = false;
		let currentConversationId;

		function setHistoryVisible(visible) {
			workspace.classList.toggle('history-visible', visible);
			toggleHistoryButton.title = visible ? 'Hide conversation history' : 'Show conversation history';
			toggleHistoryButton.setAttribute('aria-label', toggleHistoryButton.title);
			toggleHistoryButton.setAttribute('aria-expanded', String(visible));
		}

		function renderMarkdown(element, text) {
			element.innerHTML = DOMPurify.sanitize(markdown.render(text));
			for (const table of element.querySelectorAll('table')) {
				const scrollContainer = document.createElement('div');
				scrollContainer.className = 'table-scroll';
				table.parentNode.insertBefore(scrollContainer, table);
				scrollContainer.appendChild(table);
			}
		}

		function isNearBottom() {
			return messages.scrollHeight - messages.scrollTop - messages.clientHeight < 48;
		}

		function scrollToBottom() {
			messages.scrollTop = messages.scrollHeight;
		}

		function appendMessage(role, text, loading = false, follow = true) {
			empty.hidden = true;
			const item = document.createElement('article');
			item.className = 'message ' + role;
			const content = document.createElement('div');
			content.className = 'message-content';
			renderMarkdown(content, text);
			if (loading) content.classList.add('loading');
			item.appendChild(content);
			messages.appendChild(item);
			if (follow) scrollToBottom();
			return content;
		}

		function restoreConversation(storedMessages, preserveScroll) {
			const distanceFromBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight;
			messages.replaceChildren(empty);
			empty.hidden = storedMessages.length > 0;

			for (const storedMessage of storedMessages) {
				appendMessage(storedMessage.role, storedMessage.content, false, false);
			}
			if (preserveScroll) {
				messages.scrollTop = Math.max(0, messages.scrollHeight - messages.clientHeight - distanceFromBottom);
			} else {
				scrollToBottom();
			}
		}

		function renderConversations(conversations) {
			historyList.replaceChildren();
			if (conversations.length === 0) {
				const emptyItem = document.createElement('li');
				emptyItem.className = 'history-empty';
				emptyItem.textContent = 'No conversation history';
				historyList.appendChild(emptyItem);
				return;
			}

			for (const conversation of conversations) {
				const row = document.createElement('li');
				row.className = 'history-row' + (conversation.id === currentConversationId ? ' active' : '');
				const openButton = document.createElement('button');
				openButton.className = 'history-item';
				const title = document.createElement('span');
				title.className = 'history-item-title';
				title.textContent = conversation.summary;
				const time = document.createElement('span');
				time.className = 'history-item-time';
				time.textContent = new Date(conversation.updatedAt).toLocaleString();
				openButton.append(title, time);
				openButton.addEventListener('click', () => {
					setHistoryVisible(false);
					vscode.postMessage({ type: 'selectConversation', conversationId: conversation.id });
				});
				const deleteButton = document.createElement('button');
				deleteButton.className = 'icon-button delete-history';
				deleteButton.innerHTML = '<span class="codicon codicon-trash" aria-hidden="true"></span>';
				deleteButton.title = 'Delete conversation';
				deleteButton.setAttribute('aria-label', 'Delete conversation');
				deleteButton.addEventListener('click', event => {
					event.stopPropagation();
					vscode.postMessage({ type: 'deleteConversation', conversationId: conversation.id });
				});
				row.append(openButton, deleteButton);
				historyList.appendChild(row);
			}
		}

		function setBusy(value) {
			busy = value;
			input.setAttribute('contenteditable', value ? 'false' : 'plaintext-only');
			modelSelect.disabled = value || !modelSelect.value;
			sendButton.title = value ? 'Stop generating' : 'Send';
			sendButton.setAttribute('aria-label', value ? 'Stop generating' : 'Send');
			sendButton.firstElementChild.className = 'codicon ' + (value ? 'codicon-debug-stop' : 'codicon-send');
			input.focus();
		}

		function send() {
			if (busy) {
				vscode.postMessage({ type: 'cancel' });
				return;
			}
			const text = input.textContent.trim();
			if (!text) return;
			if (messages.children.length === 1 && !empty.hidden) {
				const summary = text.replace(/\s+/g, ' ').trim();
				conversationSummary.textContent = summary;
				conversationSummary.title = text;
			}
			appendMessage('user', text);
			assistantContent = appendMessage('assistant', '', true);
			assistantText = '';
			input.replaceChildren();
			setBusy(true);
			status.textContent = 'Connecting to model...';
			vscode.postMessage({ type: 'send', text, modelId: modelSelect.value });
		}

		sendButton.addEventListener('click', send);
		modelSelect.addEventListener('change', () => vscode.postMessage({ type: 'selectModel', modelId: modelSelect.value }));
		toggleHistoryButton.addEventListener('click', () => {
			setHistoryVisible(!workspace.classList.contains('history-visible'));
		});
		document.addEventListener('click', event => {
			if (!historyPanel.contains(event.target) && !toggleHistoryButton.contains(event.target)) {
				setHistoryVisible(false);
			}
		});
		document.addEventListener('keydown', event => {
			if (event.key === 'Escape') setHistoryVisible(false);
		});
		document.getElementById('new-conversation').addEventListener('click', () => vscode.postMessage({ type: 'newConversation' }));
		document.getElementById('open-prompt-settings').addEventListener('click', () => vscode.postMessage({ type: 'openSettings' }));
		input.addEventListener('keydown', event => {
			if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
				event.preventDefault();
				send();
			}
		});
		vscode.postMessage({ type: 'ready' });

		window.addEventListener('message', event => {
			const message = event.data;
			if (message.type === 'conversationHistory') {
				renderConversations(message.conversations);
			}
			if (message.type === 'conversations') {
				const preserveScroll = currentConversationId === message.currentConversationId;
				currentConversationId = message.currentConversationId;
				restoreConversation(message.messages, preserveScroll);
				renderConversations(message.conversations);
				conversationSummary.textContent = message.currentSummary;
				conversationSummary.title = message.currentSummary;
				status.textContent = '';
				setBusy(false);
			}
			if (message.type === 'models') {
				const selectedModelId = modelSelect.value || message.selectedModelId;
				modelSelect.replaceChildren();
				const modelsByProvider = new Map();
				for (const model of message.models) {
					const providerModels = modelsByProvider.get(model.providerName) ?? [];
					providerModels.push(model);
					modelsByProvider.set(model.providerName, providerModels);
				}
				for (const [providerName, models] of modelsByProvider) {
					const group = document.createElement('optgroup');
					group.label = providerName;
					for (const model of models) {
						const option = document.createElement('option');
						option.value = model.id;
						option.textContent = model.name;
						option.title = model.family;
						group.appendChild(option);
					}
					modelSelect.appendChild(group);
				}
				if (message.models.length === 0) {
					const option = document.createElement('option');
					option.textContent = 'No models available';
					modelSelect.appendChild(option);
					status.textContent = 'No language models are available';
				}
				if (selectedModelId && Array.from(modelSelect.options).some(option => option.value === selectedModelId)) {
					modelSelect.value = selectedModelId;
				}
				modelSelect.disabled = message.models.length === 0;
			}
			if (message.type === 'modelsError') {
				modelSelect.replaceChildren();
				const option = document.createElement('option');
				option.textContent = 'Failed to load models';
				modelSelect.appendChild(option);
				modelSelect.disabled = true;
				status.textContent = 'Failed to load models: ' + message.message;
			}
			if (message.type === 'started') status.textContent = 'Using ' + message.model;
			if (message.type === 'chunk') {
				const follow = isNearBottom();
				assistantContent.classList.remove('loading');
				assistantText += message.text;
				renderMarkdown(assistantContent, assistantText);
				if (follow) scrollToBottom();
			}
			if (message.type === 'completed') {
				assistantContent.classList.remove('loading');
				status.textContent = '';
				setBusy(false);
			}
			if (message.type === 'cancelled') {
				assistantContent.classList.remove('loading');
				status.textContent = 'Generation stopped';
				setBusy(false);
			}
			if (message.type === 'error') {
				assistantContent.classList.remove('loading');
				assistantContent.textContent = 'Request failed: ' + message.message;
				status.textContent = '';
				setBusy(false);
			}
		});
	</script>
</body>
</html>`;
}

function createConversation(messages: StoredMessage[]): StoredConversation {
	const firstUserMessage = messages.find(message => message.role === 'user')?.content ?? 'New conversation';
	return {
		id: randomUUID(),
		summary: createSummary(firstUserMessage),
		updatedAt: Date.now(),
		messages,
	};
}

async function getLanguageModelProviderNames(context: vscode.ExtensionContext, models: readonly vscode.LanguageModelChat[]) {
	const namesByVendor = new Map<string, string>();
	for (const extension of vscode.extensions.all) {
		const providers = extension.packageJSON?.contributes?.languageModelChatProviders;
		if (!Array.isArray(providers)) {
			continue;
		}
		for (const provider of providers) {
			if (typeof provider?.vendor !== 'string') {
				continue;
			}
			const name = typeof provider.displayName === 'string'
				? provider.displayName
				: typeof provider.name === 'string' ? provider.name : undefined;
			if (name) {
				namesByVendor.set(provider.vendor, name);
			}
		}
	}

	let configuredProviders: Array<{
		name?: string;
		vendor?: string;
		models?: Array<{ id?: string; name?: string }>;
	}> = [];
	try {
		const configurationUri = vscode.Uri.joinPath(context.globalStorageUri, '..', '..', 'chatLanguageModels.json');
		const content = await vscode.workspace.fs.readFile(configurationUri);
		const parsed = JSON.parse(new TextDecoder().decode(content));
		if (Array.isArray(parsed)) {
			configuredProviders = parsed;
		}
	} catch {
		configuredProviders = [];
	}

	const providerNames = new Map<string, string>();
	for (const model of models) {
		const configuredProvider = configuredProviders.find(provider =>
			provider.vendor === model.vendor
			&& provider.models?.some(candidate =>
				candidate.id === model.id
				|| candidate.id === model.family
				|| candidate.name === model.name,
			),
		);
		providerNames.set(
			model.id,
			configuredProvider?.name ?? namesByVendor.get(model.vendor) ?? model.vendor,
		);
	}
	return providerNames;
}

function createSummary(text: string) {
	const summary = text.replace(/\s+/g, ' ').trim();
	return summary.length > 60 ? `${summary.slice(0, 60)}…` : summary;
}

function createTabTitle(text: string) {
	const summary = text.replace(/\s+/g, ' ').trim();
	return summary.length > 10 ? `${summary.slice(0, 10)}…` : summary;
}

function getConversationSummary(conversation: StoredConversation) {
	return createSummary(getConversationTitle(conversation));
}

function getConversationTitle(conversation: StoredConversation) {
	const firstUserMessage = conversation.messages.find(message => message.role === 'user')?.content;
	return (firstUserMessage ?? conversation.summary).replace(/\s+/g, ' ').trim();
}

function getNonce() {
	const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let nonce = '';
	for (let index = 0; index < 32; index++) {
		nonce += characters.charAt(Math.floor(Math.random() * characters.length));
	}
	return nonce;
}
