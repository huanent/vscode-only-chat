export type StoredMessage = {
	role: 'user' | 'assistant';
	content: string;
	model?: string;
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
	| { type: 'started'; model: string }
	| { type: 'chunk'; text: string }
	| { type: 'completed' }
	| { type: 'cancelled' }
	| { type: 'error'; message: string }
	| { type: 'summaryChunk'; conversationId: string; summary: string };