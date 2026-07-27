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
const selectedModelStorageKey = 'temporaryChat.selectedModelId';
const conversationStorageKey = 'temporaryChat.conversation';
const conversationsStorageKey = 'temporaryChat.conversations';
const currentConversationStorageKey = 'temporaryChat.currentConversationId';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand(commandId, () => TemporaryChatPanel.show(context)),
	);
}

export function deactivate() { }

class TemporaryChatPanel {
	private static current: TemporaryChatPanel | undefined;
	private readonly panel: vscode.WebviewPanel;
	private readonly context: vscode.ExtensionContext;
	private readonly disposables: vscode.Disposable[] = [];
	private conversations: StoredConversation[];
	private currentConversationId: string;
	private cancellation: vscode.CancellationTokenSource | undefined;

	static show(context: vscode.ExtensionContext) {
		if (TemporaryChatPanel.current) {
			TemporaryChatPanel.current.panel.reveal(vscode.ViewColumn.Beside);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			'temporaryChat',
			'New conversation',
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [context.extensionUri],
			},
		);
		panel.iconPath = new vscode.ThemeIcon('comment-discussion');

		TemporaryChatPanel.current = new TemporaryChatPanel(panel, context);
	}

	private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
		this.panel = panel;
		this.context = context;
		this.conversations = context.globalState.get<StoredConversation[]>(conversationsStorageKey, []);
		if (this.conversations.length === 0) {
			const legacyMessages = context.globalState.get<StoredMessage[]>(conversationStorageKey, []);
			if (legacyMessages.length > 0) {
				this.conversations = [createConversation(legacyMessages)];
			}
		}
		this.currentConversationId = context.globalState.get<string>(currentConversationStorageKey)
			?? this.conversations[0]?.id
			?? randomUUID();
		this.panel.webview.html = getWebviewHtml(this.panel.webview, context.extensionUri);

		this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
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
				await Promise.all([this.loadModels(), this.loadConversations()]);
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

	private async loadConversations() {
		const current = this.getCurrentConversation();
		this.panel.title = current?.summary ?? 'New conversation';
		await this.panel.webview.postMessage({
			type: 'conversations',
			currentConversationId: current?.id ?? this.currentConversationId,
			messages: current?.messages ?? [],
			conversations: [...this.conversations]
				.sort((left, right) => right.updatedAt - left.updatedAt)
				.map(conversation => ({
					id: conversation.id,
					summary: conversation.summary,
					updatedAt: conversation.updatedAt,
				})),
		});
	}

	private getCurrentConversation() {
		return this.conversations.find(conversation => conversation.id === this.currentConversationId);
	}

	private async newConversation() {
		this.cancel();
		this.currentConversationId = randomUUID();
		await this.persistConversations();
		await this.loadConversations();
	}

	private async selectConversation(conversationId: string) {
		if (!this.conversations.some(conversation => conversation.id === conversationId)) {
			return;
		}
		this.cancel();
		this.currentConversationId = conversationId;
		await this.context.globalState.update(currentConversationStorageKey, conversationId);
		await this.loadConversations();
	}

	private async deleteConversation(conversationId: string) {
		const conversation = this.conversations.find(candidate => candidate.id === conversationId);
		if (!conversation) {
			return;
		}
		const answer = await vscode.window.showWarningMessage(`Delete conversation "${conversation.summary}"?`, { modal: true }, 'Delete');
		if (answer !== 'Delete') {
			return;
		}
		if (this.currentConversationId === conversationId) {
			this.cancel();
		}
		this.conversations = this.conversations.filter(conversation => conversation.id !== conversationId);
		if (this.currentConversationId === conversationId) {
			this.currentConversationId = [...this.conversations]
				.sort((left, right) => right.updatedAt - left.updatedAt)[0]?.id ?? randomUUID();
		}
		await this.persistConversations();
		await this.loadConversations();
	}

	private async persistConversations() {
		await Promise.all([
			this.context.globalState.update(conversationsStorageKey, this.conversations),
			this.context.globalState.update(currentConversationStorageKey, this.currentConversationId),
			this.context.globalState.update(conversationStorageKey, undefined),
		]);
	}

	private async loadModels() {
		try {
			const models = await vscode.lm.selectChatModels();
			await this.panel.webview.postMessage({
				type: 'models',
				selectedModelId: this.context.globalState.get<string>(selectedModelStorageKey),
				models: models.map(model => ({
					id: model.id,
					name: model.name,
					vendor: model.vendor,
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
			this.panel.title = createSummary(userText);
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
				this.conversations.push(updatedConversation);
			}
			await this.persistConversations();
			await this.panel.webview.postMessage({ type: 'completed' });
			await this.loadConversations();
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
		TemporaryChatPanel.current = undefined;
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
	}
}

function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri) {
	const nonce = getNonce();
	const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css'));
	const markdownItUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'markdown-it', 'dist', 'markdown-it.min.js'));
	const domPurifyUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'dompurify', 'dist', 'purify.min.js'));

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src ${webview.cspSource} 'nonce-${nonce}';">
	<title>New conversation</title>
	<link rel="stylesheet" href="${codiconsUri}">
	<style nonce="${nonce}">
		:root { color-scheme: light dark; }
		* { box-sizing: border-box; }
		body { margin: 0; padding:0; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
		button, select { font: inherit; }
		button { cursor: pointer; }
		button:focus-visible, select:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
		button:disabled { cursor: default; opacity: .5; }
		.app { height: 100vh; display: grid; grid-template-rows: 36px minmax(0, 1fr); }
		header { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 0 8px 0 12px; border-bottom: 1px solid var(--vscode-panel-border); background: var(--vscode-editor-background); }
		.conversation-summary { overflow: hidden; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
		.header-actions { display: flex; align-items: center; gap: 2px; }
		.icon-button { width: 28px; height: 28px; display: inline-grid; place-items: center; padding: 0; border: 0; border-radius: 4px; color: var(--vscode-icon-foreground); background: transparent; }
		.icon-button:hover { color: var(--vscode-foreground); background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground)); }
		.icon-button .codicon { font-size: 16px; }
		.workspace { min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 220px; }
		.chat-area { min-width: 0; min-height: 0; display: grid; grid-template-rows: minmax(0, 1fr) auto; }
		.messages { overflow-y: auto; padding: 18px max(16px, calc((100% - 760px) / 2)) 28px; scroll-padding-bottom: 24px; }
		.empty { height: 100%; display: grid; place-content: center; color: var(--vscode-descriptionForeground); text-align: center; }
		.empty[hidden] { display: none; }
		.empty-mark { width: 36px; height: 36px; display: grid; place-items: center; margin: 0 auto 10px; border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); border-radius: 6px; color: var(--vscode-icon-foreground); background: var(--vscode-editorWidget-background); }
		.empty-mark .codicon { font-size: 19px; }
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
		.message-content table { display: block; width: max-content; max-width: 100%; overflow-x: auto; margin: 0 0 10px; border-collapse: collapse; border-spacing: 0; }
		.message-content th, .message-content td { padding: 5px 8px; border: 1px solid var(--vscode-panel-border); text-align: left; }
		.message-content th { background: var(--vscode-textBlockQuote-background); font-weight: 600; }
		.assistant { justify-content: flex-start; }
		.user { justify-content: flex-end; }
		.user .message-content { max-width: 82%; justify-self: end; padding: 7px 10px; border-radius: 4px; background: var(--vscode-textBlockQuote-background); }
		.message-content.loading { width: 32px; height: 24px; display: flex; align-items: center; gap: 3px; }
		.message-content.loading::before, .message-content.loading::after { width: 4px; height: 4px; border-radius: 50%; background: var(--vscode-descriptionForeground); content: ""; animation: loading-dot 900ms ease-in-out infinite; }
		.message-content.loading::after { animation-delay: 300ms; }
		.message-content.loading { background-image: radial-gradient(circle, var(--vscode-descriptionForeground) 2px, transparent 2.5px); background-position: center; background-repeat: no-repeat; }
		@keyframes loading-dot { 0%, 60%, 100% { opacity: .35; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-2px); } }
		.composer { padding: 10px max(16px, calc((100% - 760px) / 2)) 8px; background: var(--vscode-editor-background); }
		.input-shell { overflow: hidden; border: 1px solid var(--vscode-panel-border); border-radius: 8px; background: var(--vscode-editor-background); transition: border-color 80ms ease; }
		.input-shell:focus-within { border-color: var(--vscode-focusBorder); }
		.message-input { width: 100%; min-height: 58px; max-height: 220px; overflow-y: auto; padding: 9px 10px 3px; color: var(--vscode-input-foreground); line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; outline: 0; }
		.message-input:empty::before { color: var(--vscode-input-placeholderForeground); content: attr(data-placeholder); pointer-events: none; }
		.message-input[contenteditable="false"] { opacity: .6; }
		.input-toolbar { min-height: 32px; display: flex; align-items: center; gap: 6px; padding: 2px 4px 4px 5px; }
		.input-toolbar .spacer { flex: 1; }
		select { min-width: 0; max-width: min(60vw, 300px); height: 26px; padding: 0 24px 0 6px; border: 0; border-radius: 3px; color: var(--vscode-descriptionForeground); background: transparent; font-size: 11px; }
		select:hover { color: var(--vscode-foreground); background: var(--vscode-list-hoverBackground); }
		.send-button { width: 26px; height: 26px; display: inline-grid; place-items: center; padding: 0; border: 0; border-radius: 4px; color: var(--vscode-icon-foreground); background: transparent; }
		.send-button:hover { color: var(--vscode-foreground); background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground)); }
		.send-button .codicon { font-size: 15px; }
		.status { min-height: 15px; padding: 2px 1px 0; color: var(--vscode-descriptionForeground); font-size: 11px; }
		.history-panel { min-width: 0; min-height: 0; display: grid; grid-template-rows: 36px minmax(0, 1fr); overflow: hidden; border-left: 1px solid var(--vscode-panel-border); background: transparent; }
		.history-heading { display: flex; align-items: center; padding: 0 10px; border-bottom: 1px solid var(--vscode-panel-border); }
		.history-heading strong { flex: 1; font-size: 12px; }
		.history-list { overflow-y: auto; margin: 0; padding: 4px; background: transparent; list-style: none; }
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
		@media (max-width: 620px) { .workspace { grid-template-columns: minmax(0, 1fr) 160px; } .messages { padding-inline: 12px; } .composer { padding: 8px; } select { max-width: 42vw; } }
	</style>
</head>
<body>
	<div class="app">
		<header>
			<div id="conversation-summary" class="conversation-summary" title="New conversation">New conversation</div>
			<div class="header-actions">
				<button id="open-prompt-settings" class="icon-button" title="Prompt settings" aria-label="Open prompt settings"><span class="codicon codicon-settings-gear" aria-hidden="true"></span></button>
			</div>
		</header>
		<div class="workspace">
			<div class="chat-area">
				<main id="messages" class="messages">
					<div id="empty" class="empty"><div class="empty-mark"><span class="codicon codicon-comment-discussion" aria-hidden="true"></span></div><span>New conversation</span></div>
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
			<aside class="history-panel" aria-label="Conversation history">
				<div class="history-heading">
					<strong>Conversation history</strong>
					<button id="new-conversation" class="icon-button" title="New conversation" aria-label="New conversation"><span class="codicon codicon-add" aria-hidden="true"></span></button>
				</div>
				<ul id="history-list" class="history-list">
					<li class="history-empty">No conversation history</li>
				</ul>
			</aside>
		</div>
	</div>
	<script nonce="${nonce}" src="${markdownItUri}"></script>
	<script nonce="${nonce}" src="${domPurifyUri}"></script>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const markdown = window.markdownit({ breaks: true, html: false, linkify: true });
		const messages = document.getElementById('messages');
		const empty = document.getElementById('empty');
		const input = document.getElementById('input');
		const modelSelect = document.getElementById('model');
		const sendButton = document.getElementById('send');
		const status = document.getElementById('status');
		const conversationSummary = document.getElementById('conversation-summary');
		const historyList = document.getElementById('history-list');
		let assistantContent;
		let assistantText = '';
		let busy = false;
		let currentConversationId;

		function renderMarkdown(element, text) {
			element.innerHTML = DOMPurify.sanitize(markdown.render(text));
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
				conversationSummary.textContent = summary.length > 28 ? summary.slice(0, 28) + '…' : summary;
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
			if (message.type === 'conversations') {
				const preserveScroll = currentConversationId === message.currentConversationId;
				currentConversationId = message.currentConversationId;
				restoreConversation(message.messages, preserveScroll);
				renderConversations(message.conversations);
				const current = message.conversations.find(conversation => conversation.id === currentConversationId);
				conversationSummary.textContent = current?.summary ?? 'New conversation';
				conversationSummary.title = current?.summary ?? 'New conversation';
				status.textContent = '';
				setBusy(false);
			}
			if (message.type === 'models') {
				const selectedModelId = modelSelect.value || message.selectedModelId;
				modelSelect.replaceChildren();
				for (const model of message.models) {
					const option = document.createElement('option');
					option.value = model.id;
					option.textContent = model.name + ' · ' + model.vendor;
					option.title = model.family;
					modelSelect.appendChild(option);
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

function createSummary(text: string) {
	const summary = text.replace(/\s+/g, ' ').trim();
	return summary.length > 28 ? `${summary.slice(0, 28)}…` : summary;
}

function getNonce() {
	const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let nonce = '';
	for (let index = 0; index < 32; index++) {
		nonce += characters.charAt(Math.floor(Math.random() * characters.length));
	}
	return nonce;
}
