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

export function deactivate() {}

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
			'临时 AI 对话',
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [context.extensionUri],
			},
		);

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
		this.panel.webview.html = getWebviewHtml(this.panel.webview);

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
		const answer = await vscode.window.showWarningMessage(`删除对话“${conversation.summary}”？`, { modal: true }, '删除');
		if (answer !== '删除') {
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
			await this.panel.webview.postMessage({ type: 'error', message: '上一条请求仍在结束，请稍后重试。' });
			return;
		}

		const cancellation = new vscode.CancellationTokenSource();
		this.cancellation = cancellation;
		const conversationId = this.currentConversationId;
		const conversation = this.getCurrentConversation();
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
				throw new Error('未找到可用的语言模型。请在 VS Code 中配置或登录模型 Provider。');
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

function getWebviewHtml(webview: vscode.Webview) {
	const nonce = getNonce();

	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
	<title>临时 AI 对话</title>
	<style nonce="${nonce}">
		:root { color-scheme: light dark; }
		* { box-sizing: border-box; }
		body { margin: 0; padding:0; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); font-size: 13px; }
		.app { height: 100vh; display: grid; grid-template-rows: auto 1fr auto; }
		header { display: grid; grid-template-columns: auto minmax(0, 1fr) 30px; align-items: center; gap: 6px; min-height: 40px; padding: 5px 4px; border-bottom: 1px solid var(--vscode-panel-border); }
		.header-actions { display: flex; gap: 2px; }
		.conversation-summary { overflow: hidden; color: var(--vscode-foreground); font-size: 13px; font-weight: 600; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
		select { min-width: 0; max-width: min(58vw, 320px); height: 26px; padding: 0 24px 0 7px; border: 0; color: var(--vscode-descriptionForeground); background: transparent; font: inherit; font-size: 12px; }
		select:hover { color: var(--vscode-foreground); background: var(--vscode-list-hoverBackground); }
		select:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
		button { min-height: 28px; padding: 0 12px; border: 1px solid var(--vscode-button-border, transparent); border-radius: 4px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); font: inherit; cursor: pointer; }
		button:hover { background: var(--vscode-button-hoverBackground); }
		button.secondary { border-color: transparent; color: var(--vscode-descriptionForeground); background: transparent; }
		button.secondary:hover { color: var(--vscode-foreground); background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground)); }
		button:disabled { opacity: .55; cursor: default; }
		.icon-button { width: 30px; padding: 0; font-size: 17px; }
		.history-backdrop { position: fixed; z-index: 10; inset: 0; display: grid; visibility: hidden; place-items: center; padding: 16px; background: rgba(0, 0, 0, .42); opacity: 0; transition: opacity 120ms ease, visibility 120ms ease; }
		.history-backdrop.open { visibility: visible; opacity: 1; }
		.history-panel { width: min(92vw, 520px); max-height: min(76vh, 560px); display: grid; grid-template-rows: auto minmax(120px, 1fr); overflow: hidden; border: 1px solid var(--vscode-panel-border); border-radius: 7px; background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background)); box-shadow: 0 16px 44px rgba(0, 0, 0, .34); transform: translateY(8px) scale(.98); transition: transform 120ms ease; }
		.history-backdrop.open .history-panel { transform: translateY(0) scale(1); }
		.history-heading { display: flex; align-items: center; min-height: 42px; padding: 6px 8px 6px 12px; border-bottom: 1px solid var(--vscode-panel-border); }
		.history-heading strong { flex: 1; font-size: 13px; }
		.history-list { overflow-y: auto; margin: 0; padding: 6px; list-style: none; }
		.history-empty { padding: 18px 10px; color: var(--vscode-descriptionForeground); line-height: 1.5; text-align: center; }
		.history-row { display: grid; grid-template-columns: minmax(0, 1fr) 30px; gap: 3px; margin-bottom: 2px; border-radius: 4px; }
		.history-row.active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
		.history-item { width: 100%; min-height: 38px; padding: 7px 9px; border: 0; color: inherit; background: transparent; text-align: left; overflow: hidden; }
		.history-item-title { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
		.history-item-time { display: block; margin-top: 2px; color: var(--vscode-descriptionForeground); font-size: 10px; }
		.history-row:not(.active):hover { background: var(--vscode-list-hoverBackground); }
		.delete-history { align-self: center; color: var(--vscode-descriptionForeground); background: transparent; }
		.delete-history:hover { color: var(--vscode-errorForeground); background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground)); }
		.messages { overflow-y: auto; padding: 12px 4px; }
		.empty { height: 100%; display: grid; place-content: center; padding: 24px; text-align: center; color: var(--vscode-descriptionForeground); line-height: 1.7; }
		.message { padding: 10px 8px 12px; border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 65%, transparent); }
		.message:last-child { border-bottom: 0; }
		.message-label { margin-bottom: 7px; color: var(--vscode-descriptionForeground); font-size: 11px; font-weight: 600; }
		.message-content { line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }
		.user { margin: 2px 0 8px; border-radius: 6px; background: var(--vscode-textBlockQuote-background); }
		.user .message-content { color: var(--vscode-foreground); }
		.composer { padding: 8px 4px 4px; border-top: 1px solid var(--vscode-panel-border); background: var(--vscode-editor-background); }
		textarea { width: 100%; resize: vertical; border: 0; outline: none; color: var(--vscode-input-foreground); background: transparent; font: inherit; line-height: 1.5; }
		.input-shell { overflow: hidden; border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 6px; background: var(--vscode-input-background); }
		.input-shell:focus-within { border-color: var(--vscode-focusBorder); }
		#input { min-height: 72px; max-height: 220px; padding: 10px 10px 4px; }
		.input-toolbar { display: flex; align-items: center; gap: 4px; min-height: 38px; padding: 4px 5px 5px; }
		.input-toolbar .spacer { flex: 1; }
		#send { min-width: 64px; height: 30px; }
		.status { min-height: 18px; padding: 4px 4px 0; color: var(--vscode-descriptionForeground); font-size: 11px; }
		@media (max-width: 420px) {
			select { max-width: 56vw; }
			#send { min-width: 56px; padding: 0 9px; }
		}
	</style>
</head>
<body>
	<div class="app">
		<header>
			<div class="header-actions">
				<button id="open-history" class="secondary icon-button" title="打开对话历史" aria-label="打开对话历史">≡</button>
				<button id="new-conversation" class="secondary icon-button" title="新建对话" aria-label="新建对话">+</button>
			</div>
			<div id="conversation-summary" class="conversation-summary" title="新对话">新对话</div>
			<button id="open-prompt-settings" class="secondary icon-button" title="打开提示词设置" aria-label="打开提示词设置">⚙</button>
		</header>
		<main id="messages" class="messages">
			<div id="empty" class="empty">开始一段 AI 对话<br>关闭面板后仍可继续</div>
		</main>
		<section class="composer">
			<div class="input-shell">
				<textarea id="input" aria-label="消息" placeholder="输入消息，Enter 发送，Shift+Enter 换行" autofocus></textarea>
				<div class="input-toolbar">
					<select id="model" aria-label="语言模型" title="选择语言模型" disabled>
						<option value="">正在加载模型...</option>
					</select>
					<span class="spacer"></span>
					<button id="send">发送</button>
				</div>
			</div>
			<div id="status" class="status" aria-live="polite"></div>
		</section>
	</div>
	<div id="history-backdrop" class="history-backdrop" aria-hidden="true">
		<aside class="history-panel" aria-label="对话历史">
			<div class="history-heading">
				<strong>对话历史</strong>
				<button id="close-history" class="secondary icon-button" title="关闭对话历史" aria-label="关闭对话历史">×</button>
			</div>
			<ul id="history-list" class="history-list">
				<li class="history-empty">暂无历史对话</li>
			</ul>
		</aside>
	</div>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const messages = document.getElementById('messages');
		const empty = document.getElementById('empty');
		const input = document.getElementById('input');
		const modelSelect = document.getElementById('model');
		const sendButton = document.getElementById('send');
		const status = document.getElementById('status');
		const conversationSummary = document.getElementById('conversation-summary');
		const historyBackdrop = document.getElementById('history-backdrop');
		const historyList = document.getElementById('history-list');
		let assistantContent;
		let busy = false;
		let currentConversationId;

		function appendMessage(role, text) {
			empty.hidden = true;
			const item = document.createElement('article');
			item.className = 'message ' + role;
			const label = document.createElement('div');
			label.className = 'message-label';
			label.textContent = role === 'user' ? '你' : 'AI';
			const content = document.createElement('div');
			content.className = 'message-content';
			content.textContent = text;
			item.append(label, content);
			messages.appendChild(item);
			messages.scrollTop = messages.scrollHeight;
			return content;
		}

		function openHistory() {
			historyBackdrop.classList.add('open');
			historyBackdrop.setAttribute('aria-hidden', 'false');
		}

		function closeHistory() {
			historyBackdrop.classList.remove('open');
			historyBackdrop.setAttribute('aria-hidden', 'true');
		}

		function restoreConversation(storedMessages) {
			messages.replaceChildren(empty);
			empty.hidden = storedMessages.length > 0;

			for (const storedMessage of storedMessages) {
				appendMessage(storedMessage.role, storedMessage.content);
			}
		}

		function renderConversations(conversations) {
			historyList.replaceChildren();
			if (conversations.length === 0) {
				const emptyItem = document.createElement('li');
				emptyItem.className = 'history-empty';
				emptyItem.textContent = '暂无历史对话';
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
					closeHistory();
				});
				const deleteButton = document.createElement('button');
				deleteButton.className = 'secondary icon-button delete-history';
				deleteButton.textContent = '×';
				deleteButton.title = '删除对话';
				deleteButton.setAttribute('aria-label', '删除对话');
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
			input.disabled = value;
			modelSelect.disabled = value || !modelSelect.value;
			sendButton.textContent = value ? '停止' : '发送';
			input.focus();
		}

		function send() {
			if (busy) {
				vscode.postMessage({ type: 'cancel' });
				return;
			}
			const text = input.value.trim();
			if (!text) return;
			if (messages.children.length === 1 && !empty.hidden) {
				conversationSummary.textContent = text.length > 42 ? text.slice(0, 42) + '…' : text;
				conversationSummary.title = text;
			}
			appendMessage('user', text);
			assistantContent = appendMessage('assistant', '');
			input.value = '';
			setBusy(true);
			status.textContent = '正在连接模型...';
			vscode.postMessage({ type: 'send', text, modelId: modelSelect.value });
		}

		sendButton.addEventListener('click', send);
		modelSelect.addEventListener('change', () => vscode.postMessage({ type: 'selectModel', modelId: modelSelect.value }));
		document.getElementById('open-history').addEventListener('click', openHistory);
		document.getElementById('new-conversation').addEventListener('click', () => vscode.postMessage({ type: 'newConversation' }));
		document.getElementById('close-history').addEventListener('click', closeHistory);
		document.getElementById('open-prompt-settings').addEventListener('click', () => vscode.postMessage({ type: 'openSettings' }));
		historyBackdrop.addEventListener('click', event => {
			if (event.target === historyBackdrop) closeHistory();
		});
		input.addEventListener('keydown', event => {
			if (event.key === 'Enter' && !event.shiftKey) {
				event.preventDefault();
				send();
			}
		});
		vscode.postMessage({ type: 'ready' });

		window.addEventListener('message', event => {
			const message = event.data;
			if (message.type === 'conversations') {
				currentConversationId = message.currentConversationId;
				restoreConversation(message.messages);
				renderConversations(message.conversations);
				const current = message.conversations.find(conversation => conversation.id === currentConversationId);
				conversationSummary.textContent = current?.summary ?? '新对话';
				conversationSummary.title = current?.summary ?? '新对话';
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
					option.textContent = '无可用模型';
					modelSelect.appendChild(option);
					status.textContent = '未找到可用的语言模型';
				}
				if (selectedModelId && Array.from(modelSelect.options).some(option => option.value === selectedModelId)) {
					modelSelect.value = selectedModelId;
				}
				modelSelect.disabled = message.models.length === 0;
			}
			if (message.type === 'modelsError') {
				modelSelect.replaceChildren();
				const option = document.createElement('option');
				option.textContent = '模型加载失败';
				modelSelect.appendChild(option);
				modelSelect.disabled = true;
				status.textContent = '模型加载失败：' + message.message;
			}
			if (message.type === 'started') status.textContent = '正在使用 ' + message.model;
			if (message.type === 'chunk') {
				assistantContent.textContent += message.text;
				messages.scrollTop = messages.scrollHeight;
			}
			if (message.type === 'completed') {
				status.textContent = '';
				setBusy(false);
			}
			if (message.type === 'cancelled') {
				status.textContent = '已停止生成';
				setBusy(false);
			}
			if (message.type === 'error') {
				assistantContent.textContent = '请求失败：' + message.message;
				status.textContent = '';
				setBusy(false);
			}
		});
	</script>
</body>
</html>`;
}

function createConversation(messages: StoredMessage[]): StoredConversation {
	const firstUserMessage = messages.find(message => message.role === 'user')?.content ?? '新对话';
	return {
		id: randomUUID(),
		summary: createSummary(firstUserMessage),
		updatedAt: Date.now(),
		messages,
	};
}

function createSummary(text: string) {
	return text.length > 42 ? `${text.slice(0, 42)}…` : text;
}

function getNonce() {
	const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let nonce = '';
	for (let index = 0; index < 32; index++) {
		nonce += characters.charAt(Math.floor(Math.random() * characters.length));
	}
	return nonce;
}
