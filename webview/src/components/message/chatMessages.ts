import type { StoredMessage } from '../../types';

export type PendingRequest = {
	requestId: string;
	text: string;
	modelId: string;
	editMessageIndex?: number;
	assistantIndex: number;
};

export function updateAssistant(
	messages: StoredMessage[],
	index: number | undefined,
	update: (message: StoredMessage) => StoredMessage,
): StoredMessage[] {
	if (index === undefined || messages[index]?.role !== 'assistant') return messages;
	return messages.map((message, messageIndex) => messageIndex === index ? update(message) : message);
}