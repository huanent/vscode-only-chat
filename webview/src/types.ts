export type TokenUsage = {
	input: number;
	output: number;
	cachedInput?: number;
};

export type StoredMessage = {
	role: 'user' | 'assistant';
	content: string;
	model?: string;
	tokenUsage?: TokenUsage;
	error?: string;
	errorDetails?: string;
};

export type SessionItem = {
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
	| { type: 'sessionHistory'; sessions: SessionItem[] }
	| {
		type: 'sessions';
		currentSessionId: string;
		messages: StoredMessage[];
		sessions: SessionItem[];
	}
	| { type: 'models'; selectedModelId?: string; models: ModelItem[] }
	| { type: 'modelsError'; message: string }
	| { type: 'started'; requestId: string; model: string }
	| { type: 'chunk'; requestId: string; text: string }
	| { type: 'completed'; requestId: string; tokenUsage?: TokenUsage }
	| { type: 'cancelled'; requestId: string }
	| { type: 'error'; requestId?: string; message: string; details?: string; retryWithoutEdit?: boolean }
	| { type: 'summaryChunk'; sessionId: string; summary: string };