export const commandIds = {
	open: 'onlyChat.open',
	newChat: 'onlyChat.newChat',
	newTab: 'onlyChat.newTab',
} as const;

export const editorViewType = 'onlyChat.editor';
export const webviewFocusContextKey = 'onlyChat.webviewFocus';

export const storageKeys = {
	selectedModel: 'onlyChat.selectedModelId',
	cachedModels: 'onlyChat.cachedModels',
	sessions: 'onlyChat.sessions',
	currentSession: 'onlyChat.currentSessionId',
} as const;