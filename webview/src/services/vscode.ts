export type OutboundMessage =
	| { type: 'ready' }
	| { type: 'focusChanged'; focused: boolean }
	| { type: 'send'; requestId: string; text: string; modelId: string; editMessageIndex?: number }
	| { type: 'selectModel'; modelId: string }
	| { type: 'newChat' }
	| { type: 'selectSession'; sessionId: string }
	| { type: 'deleteSession'; sessionId: string }
	| { type: 'cancel' };

const api = acquireVsCodeApi();

export function postMessage(message: OutboundMessage): void {
	api.postMessage(message);
}