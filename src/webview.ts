import * as vscode from 'vscode';

export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri) {
	const nonce = getNonce();
	const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css'));
	const markdownItUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'markdown-it', 'dist', 'markdown-it.min.js'));
	const katexCssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'katex', 'dist', 'katex.min.css'));
	const katexUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'katex', 'dist', 'katex.min.js'));
	const texmathCssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'markdown-it-texmath', 'css', 'texmath.css'));
	const texmathUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'markdown-it-texmath', 'texmath.js'));
	const domPurifyUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'dompurify', 'dist', 'purify.min.js'));
	const prismUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'prismjs', 'prism.js'));
	const prismLanguageUris = [
		'javascript', 'typescript', 'jsx', 'tsx', 'json', 'bash', 'python', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'sql', 'yaml', 'markdown',
	].map(language => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'prismjs', 'components', `prism-${language}.min.js`)));

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
		.message-content pre { overflow-x: auto; padding: 10px; border-radius: 4px; background: var(--vscode-textCodeBlock-background); }
		.message-content pre code { padding: 0; background: transparent; }
		.message-content .token.comment, .message-content .token.prolog, .message-content .token.doctype, .message-content .token.cdata { color: var(--vscode-editorLineNumber-foreground); }
		.message-content .token.punctuation { color: var(--vscode-editor-foreground); }
		.message-content .token.property, .message-content .token.tag, .message-content .token.boolean, .message-content .token.number, .message-content .token.constant, .message-content .token.symbol, .message-content .token.deleted { color: var(--vscode-debugTokenExpression-number, #b5cea8); }
		.message-content .token.selector, .message-content .token.attr-name, .message-content .token.string, .message-content .token.char, .message-content .token.builtin, .message-content .token.inserted { color: var(--vscode-debugTokenExpression-string, #ce9178); }
		.message-content .token.operator, .message-content .token.entity, .message-content .token.url, .message-content .language-css .token.string, .message-content .style .token.string { color: var(--vscode-symbolIcon-operatorForeground, #d4d4d4); }
		.message-content .token.atrule, .message-content .token.attr-value, .message-content .token.keyword { color: var(--vscode-symbolIcon-keywordForeground, #c586c0); }
		.message-content .token.function, .message-content .token.class-name { color: var(--vscode-symbolIcon-functionForeground, #dcdcaa); }
		.message-content .token.regex, .message-content .token.important, .message-content .token.variable { color: var(--vscode-symbolIcon-variableForeground, #9cdcfe); }
		.message-content .token.bold, .message-content .token.important { font-weight: 700; }
		.message-content .token.italic { font-style: italic; }
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
		.history-panel { position: absolute; z-index: 10; top: 42px; left: 8px; width: min(360px, calc(100% - 16px)); max-height: min(520px, calc(100vh - 54px)); display: none; grid-template-rows: auto minmax(0, 1fr); overflow: hidden; border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); border-radius: 8px; background: var(--vscode-menu-background, var(--vscode-editorWidget-background)); box-shadow: 0 8px 24px var(--vscode-widget-shadow); }
		.history-visible .history-panel { display: grid; animation: reveal-history 120ms ease-out; transform-origin: top left; }
		@keyframes reveal-history { from { opacity: 0; transform: translateY(-4px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
		.history-header { min-height: 44px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 6px 8px 6px 12px; border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); }
		.history-header-icon { color: var(--vscode-icon-foreground); font-size: 16px; }
		.history-heading { min-width: 0; display: flex; align-items: baseline; gap: 7px; }
		.history-title { font-size: 12px; font-weight: 600; }
		.history-count { color: var(--vscode-descriptionForeground); font-size: 10px; }
		.history-list { min-height: 0; overflow-y: auto; margin: 0; padding: 6px; background: transparent; list-style: none; }
		.history-empty { min-height: 150px; display: grid; place-content: center; justify-items: center; gap: 8px; padding: 24px 16px; color: var(--vscode-descriptionForeground); text-align: center; }
		.history-empty .codicon { font-size: 24px; opacity: .65; }
		.history-empty-title { color: var(--vscode-foreground); font-size: 12px; font-weight: 600; }
		.history-empty-description { max-width: 220px; font-size: 11px; line-height: 1.4; }
		.history-group { padding: 10px 8px 5px; color: var(--vscode-descriptionForeground); font-size: 10px; font-weight: 600; text-transform: uppercase; }
		.history-group:first-child { padding-top: 4px; }
		.history-row { display: grid; grid-template-columns: minmax(0, 1fr) 32px; align-items: center; min-height: 40px; border-radius: 5px; color: var(--vscode-foreground); background: transparent; }
		.history-row + .history-row { margin-top: 2px; }
		.history-row:hover, .history-row:focus-within { background: var(--vscode-list-hoverBackground); }
		.history-row.active { color: var(--vscode-list-activeSelectionForeground); background: var(--vscode-list-activeSelectionBackground); }
		.history-item { min-width: 0; height: 100%; display: grid; grid-template-columns: 28px minmax(0, 1fr); align-items: center; gap: 2px; padding: 6px 4px 6px 8px; border: 0; color: inherit; background: transparent; text-align: left; }
		.history-item-icon { color: var(--vscode-icon-foreground); font-size: 15px; opacity: .8; }
		.history-item-title { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
		.history-item-title { font-size: 12px; font-weight: 500; }
		.history-row.active .history-item-icon { color: inherit; opacity: .82; }
		.delete-history { margin-right: 8px; opacity: 0; }
		.history-row:hover .delete-history, .history-row:focus-within .delete-history, .history-row.active .delete-history { opacity: 1; }
		.delete-history:hover { color: var(--vscode-errorForeground); }
		@media (prefers-reduced-motion: reduce) { .history-visible .history-panel { animation: none; } }
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
				<div class="history-header">
					<span class="codicon codicon-history history-header-icon" aria-hidden="true"></span>
					<div class="history-heading">
						<span class="history-title">Conversation history</span>
						<span id="history-count" class="history-count">0 chats</span>
					</div>
					<button id="close-history" class="icon-button" title="Close history" aria-label="Close conversation history"><span class="codicon codicon-close" aria-hidden="true"></span></button>
				</div>
				<ul id="history-list" class="history-list">
					<li class="history-empty"><span class="codicon codicon-comment-discussion" aria-hidden="true"></span><span class="history-empty-title">No conversations yet</span><span class="history-empty-description">Your recent chats will appear here.</span></li>
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
	<script nonce="${nonce}" src="${prismUri}"></script>
	${prismLanguageUris.map(uri => `<script nonce="${nonce}" src="${uri}"></script>`).join('\n\t')}
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
		const historyCount = document.getElementById('history-count');
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
			Prism.highlightAllUnder(element);
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
			historyCount.textContent = conversations.length + (conversations.length === 1 ? ' chat' : ' chats');
			if (conversations.length === 0) {
				const emptyItem = document.createElement('li');
				emptyItem.className = 'history-empty';
				emptyItem.innerHTML = '<span class="codicon codicon-comment-discussion" aria-hidden="true"></span><span class="history-empty-title">No conversations yet</span><span class="history-empty-description">Your recent chats will appear here.</span>';
				historyList.appendChild(emptyItem);
				return;
			}

			let currentGroup;
			for (const conversation of conversations) {
				const group = getConversationGroup(conversation.updatedAt);
				if (group !== currentGroup) {
					currentGroup = group;
					const heading = document.createElement('li');
					heading.className = 'history-group';
					heading.textContent = group;
					historyList.appendChild(heading);
				}
				const row = document.createElement('li');
				row.className = 'history-row' + (conversation.id === currentConversationId ? ' active' : '');
				const openButton = document.createElement('button');
				openButton.className = 'history-item';
				const icon = document.createElement('span');
				icon.className = 'codicon codicon-comment history-item-icon';
				icon.setAttribute('aria-hidden', 'true');
				const title = document.createElement('span');
				title.className = 'history-item-title';
				title.textContent = conversation.summary;
				openButton.append(icon, title);
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

		function getConversationGroup(updatedAt) {
			const date = new Date(updatedAt);
			const now = new Date();
			const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
			const conversationDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
			const daysAgo = Math.round((today.getTime() - conversationDay.getTime()) / 86400000);
			if (daysAgo <= 0) return 'Today';
			if (daysAgo === 1) return 'Yesterday';
			if (daysAgo <= 3) return 'Previous 3 days';
			if (daysAgo <= 7) return 'Previous 7 days';
			return 'Older';
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
		document.getElementById('close-history').addEventListener('click', () => setHistoryVisible(false));
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
			if (message.type === 'summaryChunk' && message.conversationId === currentConversationId) {
				conversationSummary.textContent = message.summary;
				conversationSummary.title = message.summary;
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

function getNonce() {
	const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let nonce = '';
	for (let index = 0; index < 32; index++) {
		nonce += characters.charAt(Math.floor(Math.random() * characters.length));
	}
	return nonce;
}
