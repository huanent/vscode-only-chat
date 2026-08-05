import { useEffect, useRef, useState } from 'react';
import { postMessage } from '../services/vscode';
import type { ConversationItem, InboundMessage, ModelItem, StoredMessage } from '../types';

type PendingRequest = {
	requestId: string;
	text: string;
	modelId: string;
	editMessageIndex?: number;
	assistantIndex: number;
};

export function useChat() {
	const [messages, setMessages] = useState<StoredMessage[]>([]);
	const [conversations, setConversations] = useState<ConversationItem[]>([]);
	const [currentConversationId, setCurrentConversationId] = useState<string>();
	const [models, setModels] = useState<ModelItem[]>([]);
	const [selectedModelId, setSelectedModelId] = useState('');
	const [modelsError, setModelsError] = useState(false);
	const [historyVisible, setHistoryVisible] = useState(false);
	const [historyQuery, setHistoryQuery] = useState('');
	const [input, setInput] = useState('');
	const [editingIndex, setEditingIndex] = useState<number>();
	const [busy, setBusy] = useState(false);
	const pendingRequestRef = useRef<PendingRequest | undefined>(undefined);
	const inputRef = useRef<HTMLDivElement>(null);
	const historyButtonRef = useRef<HTMLButtonElement>(null);
	const historyPanelRef = useRef<HTMLElement>(null);

	useEffect(() => {
		if (inputRef.current && inputRef.current.textContent !== input) {
			inputRef.current.textContent = input;
		}
	}, [input]);

	useEffect(() => {
		const handleMessage = (event: MessageEvent<InboundMessage>) => {
			const message = event.data;
			const pendingRequest = pendingRequestRef.current;
			switch (message.type) {
				case 'conversationHistory':
					setConversations(message.conversations);
					return;
				case 'conversations':
					setCurrentConversationId(message.currentConversationId);
					setMessages(message.messages);
					setConversations(message.conversations);
					setEditingIndex(undefined);
					setBusy(false);
					pendingRequestRef.current = undefined;
					return;
				case 'models': {
					setModels(message.models);
					setModelsError(false);
					setSelectedModelId(current => message.models.some(model => model.id === current)
						? current
						: message.models.find(model => model.id === message.selectedModelId)?.id ?? message.models[0]?.id ?? '');
					return;
				}
				case 'modelsError':
					setModels([]);
					setSelectedModelId('');
					setModelsError(true);
					return;
				case 'started':
					if (message.requestId !== pendingRequest?.requestId) return;
					setMessages(current => updateAssistant(current, pendingRequest.assistantIndex, item => ({ ...item, model: message.model })));
					return;
				case 'chunk':
					if (message.requestId !== pendingRequest?.requestId) return;
					setMessages(current => updateAssistant(current, pendingRequest.assistantIndex, item => ({ ...item, content: item.content + message.text })));
					return;
				case 'completed':
				case 'cancelled':
					if (message.requestId !== pendingRequest?.requestId) return;
					setBusy(false);
					pendingRequestRef.current = undefined;
					return;
				case 'error':
					if (!pendingRequest || (message.requestId && message.requestId !== pendingRequest.requestId)) return;
					if (message.retryWithoutEdit) pendingRequest.editMessageIndex = undefined;
					setMessages(current => updateAssistant(current, pendingRequest.assistantIndex, item => ({
						...item,
						error: message.message,
						errorDetails: message.details,
					})));
					setBusy(false);
					return;
				case 'summaryChunk':
					setConversations(current => current.map(conversation => conversation.id === message.conversationId
						? { ...conversation, summary: message.summary }
						: conversation));
					return;
			}
		};
		window.addEventListener('message', handleMessage);
		const focus = () => {
			postMessage({ type: 'focusChanged', focused: true });
			inputRef.current?.focus();
		};
		const blur = () => {
			setHistoryVisible(false);
			postMessage({ type: 'focusChanged', focused: false });
		};
		window.addEventListener('focus', focus);
		window.addEventListener('blur', blur);
		postMessage({ type: 'ready' });
		postMessage({ type: 'focusChanged', focused: document.hasFocus() });
		requestAnimationFrame(() => inputRef.current?.focus());
		return () => {
			window.removeEventListener('message', handleMessage);
			window.removeEventListener('focus', focus);
			window.removeEventListener('blur', blur);
		};
	}, []);

	useEffect(() => {
		const close = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			setHistoryVisible(false);
			if (editingIndex !== undefined) {
				setEditingIndex(undefined);
				setInput('');
			}
		};
		document.addEventListener('keydown', close);
		return () => document.removeEventListener('keydown', close);
	}, [editingIndex]);

	useEffect(() => {
		if (!historyVisible) return;
		const closeHistory = (event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof Node)) return;
			if (historyButtonRef.current?.contains(target) || historyPanelRef.current?.contains(target)) return;
			setHistoryVisible(false);
		};
		document.addEventListener('pointerdown', closeHistory);
		return () => document.removeEventListener('pointerdown', closeHistory);
	}, [historyVisible]);

	const selectModel = (modelId: string) => {
		setSelectedModelId(modelId);
		postMessage({ type: 'selectModel', modelId });
	};

	const startRequest = (request: Omit<PendingRequest, 'requestId'>) => {
		const pendingRequest = { ...request, requestId: crypto.randomUUID() };
		pendingRequestRef.current = pendingRequest;
		setBusy(true);
		postMessage({
			type: 'send',
			requestId: pendingRequest.requestId,
			text: pendingRequest.text,
			modelId: pendingRequest.modelId,
			editMessageIndex: pendingRequest.editMessageIndex,
		});
	};

	const send = () => {
		if (busy) {
			postMessage({ type: 'cancel' });
			return;
		}
		const text = input.trim();
		if (!text || !selectedModelId) return;
		const nextMessages = editingIndex === undefined ? [...messages] : messages.slice(0, editingIndex);
		nextMessages.push({ role: 'user', content: text }, { role: 'assistant', content: '' });
		setMessages(nextMessages);
		setInput('');
		startRequest({ text, modelId: selectedModelId, editMessageIndex: editingIndex, assistantIndex: nextMessages.length - 1 });
		setEditingIndex(undefined);
	};

	const retry = (assistantIndex: number) => {
		const failedRequest = pendingRequestRef.current;
		if (busy || !failedRequest || failedRequest.assistantIndex !== assistantIndex) return;
		setMessages(current => updateAssistant(current, assistantIndex, item => ({
			...item,
			content: '',
			error: undefined,
			errorDetails: undefined,
		})));
		startRequest({
			text: failedRequest.text,
			modelId: failedRequest.modelId,
			editMessageIndex: failedRequest.editMessageIndex,
			assistantIndex,
		});
	};

	const regenerate = (assistantIndex: number) => {
		const userIndex = assistantIndex - 1;
		const userMessage = messages[userIndex];
		if (busy || messages[assistantIndex]?.role !== 'assistant' || userMessage?.role !== 'user' || !selectedModelId) return;
		const nextMessages = [
			...messages.slice(0, userIndex),
			userMessage,
			{ role: 'assistant' as const, content: '' },
		];
		setMessages(nextMessages);
		startRequest({
			text: userMessage.content,
			modelId: selectedModelId,
			editMessageIndex: userIndex,
			assistantIndex: nextMessages.length - 1,
		});
	};

	const editMessage = (index: number, text: string) => {
		setEditingIndex(index);
		setInput(text);
		requestAnimationFrame(() => inputRef.current?.focus());
	};

	const selectConversation = (conversationId: string) => {
		setHistoryVisible(false);
		postMessage({ type: 'selectConversation', conversationId });
	};

	return {
		messages,
		conversations,
		currentConversationId,
		models,
		selectedModelId,
		modelsError,
		historyVisible,
		historyQuery,
		input,
		editingIndex,
		busy,
		inputRef,
		historyButtonRef,
		historyPanelRef,
		setHistoryVisible,
		setHistoryQuery,
		setInput,
		selectModel,
		selectConversation,
		deleteConversation: (conversationId: string) => postMessage({ type: 'deleteConversation', conversationId }),
		editMessage,
		regenerate,
		retry,
		send,
	};
}

function updateAssistant(
	messages: StoredMessage[],
	index: number | undefined,
	update: (message: StoredMessage) => StoredMessage,
): StoredMessage[] {
	if (index === undefined || messages[index]?.role !== 'assistant') return messages;
	return messages.map((message, messageIndex) => messageIndex === index ? update(message) : message);
}