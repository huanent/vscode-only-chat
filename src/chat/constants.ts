export const commandIds = {
	open: 'onlyChat.open',
	newConversation: 'onlyChat.newConversation',
	newTab: 'onlyChat.newTab',
} as const;

export const editorViewType = 'onlyChat.editor';
export const webviewFocusContextKey = 'onlyChat.webviewFocus';

export const storageKeys = {
	selectedModel: 'onlyChat.selectedModelId',
	conversations: 'onlyChat.conversations',
	currentConversation: 'onlyChat.currentConversationId',
	legacySelectedModel: 'temporaryChat.selectedModelId',
	legacyConversation: 'temporaryChat.conversation',
	legacyConversations: 'temporaryChat.conversations',
} as const;