import { randomUUID } from 'crypto';

export type StoredMessage = {
	role: 'user' | 'assistant';
	content: string;
	model?: string;
};

export type StoredConversation = {
	id: string;
	summary: string;
	updatedAt: number;
	messages: StoredMessage[];
};

export function createConversation(messages: StoredMessage[]): StoredConversation {
	const firstUserMessage = messages.find(message => message.role === 'user')?.content ?? 'New conversation';
	return {
		id: randomUUID(),
		summary: createSummary(firstUserMessage),
		updatedAt: Date.now(),
		messages,
	};
}

export function createSummary(text: string) {
	const summary = text.replace(/\s+/g, ' ').trim();
	return summary.length > 60 ? `${summary.slice(0, 60)}…` : summary;
}

export function normalizeGeneratedSummary(text: string) {
	return text
		.replace(/^[#*`"'“‘]+/, '')
		.replace(/[#*`"'”’。.!！?？]+$/, '')
		.replace(/^title\s*:\s*/i, '')
		.replace(/\s+/g, ' ')
		.trim();
}

export function createTabTitle(text: string) {
	const summary = text.replace(/\s+/g, ' ').trim();
	return summary.length > 20 ? `${summary.slice(0, 20)}…` : summary;
}

export function getConversationSummary(conversation: StoredConversation) {
	return createSummary(getConversationTitle(conversation));
}

export function getConversationTitle(conversation: StoredConversation) {
	return conversation.summary.replace(/\s+/g, ' ').trim();
}