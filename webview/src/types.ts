export type StoredMessage = {
	role: 'user' | 'assistant';
	content: string;
	model?: string;
	error?: string;
	errorDetails?: string;
};

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

export type InboundMessage =
	| { type: 'conversationHistory'; conversations: ConversationItem[] }
	| {
		type: 'conversations';
		currentConversationId: string;
		messages: StoredMessage[];
		conversations: ConversationItem[];
	}
	| { type: 'models'; selectedModelId?: string; models: ModelItem[] }
	| { type: 'modelsError'; message: string }
	| { type: 'started'; requestId: string; model: string }
	| { type: 'chunk'; requestId: string; text: string }
	| { type: 'completed'; requestId: string }
	| { type: 'cancelled'; requestId: string }
	| { type: 'error'; requestId?: string; message: string; details?: string; retryWithoutEdit?: boolean }
	| { type: 'summaryChunk'; conversationId: string; summary: string };