export type OutboundMessage =
	| { type: 'ready' }
	| { type: 'focusChanged'; focused: boolean }
	| { type: 'send'; requestId: string; text: string; modelId: string; editMessageIndex?: number }
	| { type: 'selectModel'; modelId: string }
	| { type: 'newConversation' }
	| { type: 'selectConversation'; conversationId: string }
	| { type: 'deleteConversation'; conversationId: string }
	| { type: 'cancel' };

const api = acquireVsCodeApi();

export function postMessage(message: OutboundMessage): void {
	api.postMessage(message);
}