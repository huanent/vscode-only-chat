export type WebviewMessage =
	| { type: 'ready' }
	| { type: 'focusChanged'; focused: boolean }
	| { type: 'send'; requestId: string; text: string; modelId: string; editMessageIndex?: number }
	| { type: 'selectModel'; modelId: string }
	| { type: 'newChat' }
	| { type: 'selectSession'; sessionId: string }
	| { type: 'deleteSession'; sessionId: string }
	| { type: 'cancel' };

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