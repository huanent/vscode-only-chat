export type WebviewMessage =
	| { type: 'ready' }
	| { type: 'focusChanged'; focused: boolean }
	| { type: 'send'; requestId: string; text: string; modelId: string; editMessageIndex?: number }
	| { type: 'selectModel'; modelId: string }
	| { type: 'newConversation' }
	| { type: 'selectConversation'; conversationId: string }
	| { type: 'deleteConversation'; conversationId: string }
	| { type: 'cancel' };

export type ConversationItem = {
	id: string;
	summary: string;
	updatedAt: number;
};

export type ModelItem = {
	id: string;
	name: string;
	providerName: string;
	family: string;
};