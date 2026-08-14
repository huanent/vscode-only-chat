import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import {
	createSummary,
	createTabTitle,
	getSessionSummary,
	normalizeGeneratedSummary,
	type StoredSession,
	type TokenUsage,
} from '../session';
import { getWebviewHtml } from '../webview';
import { storageKeys, webviewFocusContextKey } from './constants';
import type { OnlyChatDocument } from './document';
import type { OnlyChatManager } from './manager';
import type { ModelItem, WebviewMessage } from './messages';
import type { ModelService } from './modelService';

export class OnlyChatPanelController implements vscode.Disposable {
	private readonly disposables: vscode.Disposable[] = [];
	private currentSessionId: string = randomUUID();
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

	async newChat(): Promise<void> {
		this.cancel();
		this.currentSessionId = randomUUID();
		await this.manager.persist(this.currentSessionId);
		await this.renderSessions();
	}

	async refreshSessions(): Promise<void> {
		await this.renderSessions();
	}

	private async handleMessage(message: WebviewMessage): Promise<void> {
		try {
			switch (message.type) {
				case 'ready':
					await this.postCachedModels();
					await Promise.all([this.loadModels(), this.renderSessions()]);
					return;
				case 'focusChanged':
					await this.setWebviewFocus(message.focused);
					return;
				case 'send':
					await this.send(message.requestId, message.text, message.modelId, message.editMessageIndex);
					return;
				case 'selectModel':
					await this.context.globalState.update(storageKeys.selectedModel, message.modelId);
					return;
				case 'newChat':
					await this.newChat();
					return;
				case 'selectSession':
					await this.selectSession(message.sessionId);
					return;
				case 'deleteSession':
					await this.deleteSession(message.sessionId);
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

	private getSessionItems() {
		return [...this.document.sessions]
			.sort((left, right) => right.updatedAt - left.updatedAt)
			.map(session => ({
				id: session.id,
				summary: getSessionSummary(session),
				updatedAt: session.updatedAt,
			}));
	}

	private async refreshSessionHistory(): Promise<void> {
		const sessions = this.getSessionItems();
		await Promise.all(this.manager.getEditors()
			.filter(editor => editor !== this)
			.map(editor => editor.panel.webview.postMessage({ type: 'sessionHistory', sessions })));
	}

	private async renderSessions(): Promise<void> {
		const current = this.getCurrentSession();
		this.updateTitle(current);
		await this.panel.webview.postMessage({
			type: 'sessions',
			currentSessionId: current?.id ?? this.currentSessionId,
			messages: current?.messages ?? [],
			sessions: this.getSessionItems(),
		});
	}

	private updateTitle(session = this.getCurrentSession()): void {
		this.panel.title = session ? createTabTitle(getSessionSummary(session)) : 'Only Chat';
	}

	private getCurrentSession(): StoredSession | undefined {
		return this.document.sessions.find(session => session.id === this.currentSessionId);
	}

	private async selectSession(sessionId: string): Promise<void> {
		if (!this.document.sessions.some(session => session.id === sessionId)) {
			return;
		}
		this.cancel();
		this.currentSessionId = sessionId;
		await this.context.globalState.update(storageKeys.currentSession, sessionId);
		await this.renderSessions();
	}

	private async deleteSession(sessionId: string): Promise<void> {
		if (!this.document.sessions.some(candidate => candidate.id === sessionId)) {
			return;
		}
		this.cancelSummary(sessionId);
		this.document.sessions.splice(
			0,
			this.document.sessions.length,
			...this.document.sessions.filter(candidate => candidate.id !== sessionId),
		);
		for (const editor of this.manager.getEditors()) {
			if (editor.currentSessionId === sessionId) {
				editor.cancel();
				editor.currentSessionId = [...this.document.sessions]
					.sort((left, right) => right.updatedAt - left.updatedAt)[0]?.id ?? randomUUID();
			}
		}
		await this.manager.persist(this.currentSessionId);
		await Promise.all(this.manager.getEditors().map(editor => editor.renderSessions()));
	}

	private async loadModels(version = this.modelService.currentVersion): Promise<void> {
		try {
			const models = await this.modelService.getModels();
			if (version !== this.modelService.currentVersion) {
				return;
			}
			if (models.length === 0) {
				throw new Error('No language models are available. Make sure a model provider is installed and signed in locally.');
			}
			const modelItems = await this.modelService.getModelItems(models);
			if (version !== this.modelService.currentVersion) {
				return;
			}
			await this.postModels(modelItems);
		} catch (error) {
			if (this.modelService.getCachedModelItems().length > 0) {
				return;
			}
			await this.panel.webview.postMessage({
				type: 'modelsError',
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private async postCachedModels(): Promise<void> {
		const modelItems = this.modelService.getCachedModelItems();
		if (modelItems.length > 0) {
			await this.postModels(modelItems);
		}
	}

	private postModels(models: readonly ModelItem[]): Thenable<boolean> {
		return this.panel.webview.postMessage({
			type: 'models',
			selectedModelId: this.context.globalState.get<string>(storageKeys.selectedModel),
			models,
		});
	}

	private async send(requestId: string, text: string, modelId: string, editMessageIndex?: number): Promise<void> {
		const userText = text.trim();
		if (!userText) {
			return;
		}
		if (this.cancellation) {
			await this.panel.webview.postMessage({
				type: 'error',
				requestId,
				message: 'The previous request is still stopping. Please try again shortly.',
			});
			return;
		}

		const sessionId = this.currentSessionId;
		const session = this.getCurrentSession();
		if (editMessageIndex !== undefined
			&& (!session || !Number.isInteger(editMessageIndex) || session.messages[editMessageIndex]?.role !== 'user')) {
			await this.panel.webview.postMessage({
				type: 'error',
				requestId,
				message: 'The message being edited is no longer available.',
			});
			return;
		}

		const cancellation = new vscode.CancellationTokenSource();
		this.cancellation = cancellation;
		let editApplied = false;
		if (session && editMessageIndex !== undefined) {
			session.messages.splice(editMessageIndex);
			editApplied = true;
			session.updatedAt = Date.now();
			if (editMessageIndex === 0) {
				session.summary = createSummary(userText);
				this.panel.title = createTabTitle(userText);
			}
			await this.manager.persist(this.currentSessionId);
			await this.refreshSessionHistory();
		}
		if (!session) {
			this.panel.title = createTabTitle(userText);
		}

		const prompt = vscode.workspace.getConfiguration('onlyChat').get<string>('prompt', '').trim();
		const requestMessages = [
			...(prompt ? [vscode.LanguageModelChatMessage.User(prompt, 'instructions')] : []),
			...(session?.messages ?? []).map(message => message.role === 'user'
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
			const summaryPromise = !session || editMessageIndex === 0
				? this.generateSummary(model, userText, sessionId)
				: undefined;
			modelName = model.name;
			await this.panel.webview.postMessage({ type: 'started', requestId, model: modelName });
			const inputTokenCountPromise = countMessageTokens(model, requestMessages, cancellation.token);
			const response = await model.sendRequest(requestMessages, {}, cancellation.token);
			for await (const chunk of response.text) {
				answer += chunk;
				await this.panel.webview.postMessage({ type: 'chunk', requestId, text: chunk });
			}
			const tokenUsage = await resolveTokenUsage(response, model, answer, inputTokenCountPromise, cancellation.token);

			const updatedSession = session ?? createStoredSession(sessionId, userText);
			updatedSession.messages.push(
				{ role: 'user', content: userText },
				{ role: 'assistant', content: answer, model: modelName, tokenUsage },
			);
			updatedSession.updatedAt = Date.now();
			if (!session) {
				this.document.sessions.push(updatedSession);
			}
			await this.manager.persist(this.currentSessionId);
			await this.panel.webview.postMessage({ type: 'completed', requestId, tokenUsage });
			await Promise.all([this.renderSessions(), this.refreshSessionHistory()]);
			if (summaryPromise) {
				void summaryPromise.then(summary => this.applyGeneratedSummary(sessionId, summary));
			}
		} catch (error) {
			this.cancelSummary(sessionId);
			if (error instanceof vscode.CancellationError || cancellation.token.isCancellationRequested) {
				const updatedSession = session ?? createStoredSession(sessionId, userText);
				updatedSession.messages.push({ role: 'user', content: userText });
				if (answer) {
					updatedSession.messages.push({ role: 'assistant', content: answer, model: modelName });
				}
				updatedSession.updatedAt = Date.now();
				if (!session) {
					this.document.sessions.push(updatedSession);
				}
				await this.manager.persist(this.currentSessionId);
				await this.panel.webview.postMessage({ type: 'cancelled', requestId });
				await Promise.all([this.renderSessions(), this.refreshSessionHistory()]);
			} else {
				const errorDetails = describeError(error);
				await this.panel.webview.postMessage({
					type: 'error',
					requestId,
					message: errorDetails.message,
					details: errorDetails.details,
					retryWithoutEdit: editApplied,
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
		sessionId: string,
	): Promise<string> {
		const cancellation = new vscode.CancellationTokenSource();
		this.summaryCancellations.set(sessionId, cancellation);
		let summary = '';
		try {
			const response = await model.sendRequest([
				vscode.LanguageModelChatMessage.User(
					`Create a concise chat title that captures the user's intent. `
					+ `Use the same language as the user, no more than 12 words, and output only the title without quotes or punctuation wrappers.\n\nUser input:\n${userText}`,
				),
			], {}, cancellation.token);
			for await (const chunk of response.text) {
				summary = normalizeGeneratedSummary(summary + chunk);
				if (summary) {
					await this.postSummary(sessionId, summary);
				}
			}
			return summary || createSummary(userText);
		} catch {
			return createSummary(userText);
		} finally {
			if (this.summaryCancellations.get(sessionId) === cancellation) {
				this.summaryCancellations.delete(sessionId);
			}
			cancellation.dispose();
		}
	}

	private async postSummary(sessionId: string, summary: string): Promise<void> {
		await Promise.all(this.manager.getEditors().map(editor => {
			if (editor.currentSessionId === sessionId) {
				editor.panel.title = createTabTitle(summary);
			}
			return editor.panel.webview.postMessage({ type: 'summaryChunk', sessionId, summary });
		}));
	}

	private async applyGeneratedSummary(sessionId: string, summary: string): Promise<void> {
		const session = this.document.sessions.find(candidate => candidate.id === sessionId);
		if (!session) {
			return;
		}
		session.summary = summary;
		await this.manager.persist(this.currentSessionId);
		await Promise.all(this.manager.getEditors().map(editor => editor.renderSessions()));
	}

	private cancelSummary(sessionId: string): void {
		this.summaryCancellations.get(sessionId)?.cancel();
	}
}

function createStoredSession(id: string, userText: string): StoredSession {
	return {
		id,
		summary: createSummary(userText),
		updatedAt: Date.now(),
		messages: [],
	};
}

function describeError(error: unknown): { message: string; details?: string } {
	const message = getErrorMessage(error);
	const details = collectErrorDetails(error)
		.filter(detail => detail !== message)
		.join('\n');
	return {
		message,
		details: details || 'The model provider did not return any additional error details.',
	};
}

async function countMessageTokens(
	model: vscode.LanguageModelChat,
	messages: vscode.LanguageModelChatMessage[],
	token: vscode.CancellationToken,
): Promise<number | undefined> {
	try {
		const counts = await Promise.all(messages.map(message => model.countTokens(message, token)));
		return counts.reduce((total, count) => total + count, 0);
	} catch {
		return undefined;
	}
}

async function resolveTokenUsage(
	response: vscode.LanguageModelChatResponse,
	model: vscode.LanguageModelChat,
	answer: string,
	inputTokenCountPromise: Promise<number | undefined>,
	token: vscode.CancellationToken,
): Promise<TokenUsage | undefined> {
	const reportedUsage = await getReportedTokenUsage(response);
	if (reportedUsage) return reportedUsage;

	const [input, output] = await Promise.all([
		inputTokenCountPromise,
		Promise.resolve(model.countTokens(answer, token)).catch(() => undefined),
	]);
	return input === undefined || output === undefined ? undefined : { input, output };
}

async function getReportedTokenUsage(response: vscode.LanguageModelChatResponse): Promise<TokenUsage | undefined> {
	const responseRecord = response as unknown as Record<string, unknown>;
	const rawUsage = await Promise.resolve(responseRecord.tokenUsage ?? responseRecord.usage);
	if (!rawUsage || typeof rawUsage !== 'object') return undefined;

	const usage = rawUsage as Record<string, unknown>;
	const inputDetails = getRecord(usage.inputTokenDetails ?? usage.input_tokens_details ?? usage.promptTokensDetails ?? usage.prompt_tokens_details);
	const input = getTokenCount(usage, ['input', 'inputTokens', 'input_tokens', 'promptTokens', 'prompt_tokens']);
	const output = getTokenCount(usage, ['output', 'outputTokens', 'output_tokens', 'completionTokens', 'completion_tokens']);
	if (input === undefined || output === undefined) return undefined;

	const cachedInput = getTokenCount(usage, ['cachedInput', 'cachedInputTokens', 'cached_input_tokens', 'cacheReadInputTokens'])
		?? (inputDetails ? getTokenCount(inputDetails, ['cachedTokens', 'cached_tokens']) : undefined);
	return { input, output, ...(cachedInput === undefined ? {} : { cachedInput }) };
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function getTokenCount(source: Record<string, unknown>, keys: string[]): number | undefined {
	for (const key of keys) {
		const value = source[key];
		if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.round(value);
	}
	return undefined;
}

function collectErrorDetails(error: unknown, seen = new Set<unknown>()): string[] {
	if (error === null || error === undefined || seen.has(error)) {
		return [];
	}
	if (typeof error !== 'object') {
		return [String(error)];
	}
	seen.add(error);
	const details: string[] = [];
	if (error instanceof vscode.LanguageModelError) {
		details.push(`Language model error code: ${error.code}`);
	}
	const record = error as Record<string, unknown>;
	for (const [label, key] of [['Error code', 'code'], ['HTTP status', 'status'], ['HTTP status', 'statusCode']] as const) {
		const value = record[key];
		if ((typeof value === 'string' || typeof value === 'number') && String(value) !== '') {
			details.push(`${label}: ${value}`);
		}
	}
	const errorMessage = getErrorMessage(error);
	if (errorMessage) {
		details.push(errorMessage);
	}
	details.push(...collectErrorDetails(record.cause, seen));
	return [...new Set(details)];
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim()) {
		return error.message.trim();
	}
	if (typeof error === 'object' && error !== null) {
		const message = (error as Record<string, unknown>).message;
		if (typeof message === 'string' && message.trim()) {
			return message.trim();
		}
	}
	return String(error);
}