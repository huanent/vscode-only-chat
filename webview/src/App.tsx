import { useEffect, useRef, useState } from 'react';
import { HistoryPanel } from './components/HistoryPanel';
import { MessageList } from './components/MessageList';
import { ModelPicker } from './components/ModelPicker';
import { postMessage } from './services/vscode';
import type { ConversationItem, InboundMessage, ModelItem, StoredMessage } from './types';

export function App() {
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
	const assistantIndexRef = useRef<number | undefined>(undefined);
	const inputRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (inputRef.current && inputRef.current.textContent !== input) {
			inputRef.current.textContent = input;
		}
	}, [input]);

	useEffect(() => {
		const handleMessage = (event: MessageEvent<InboundMessage>) => {
			const message = event.data;
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
					assistantIndexRef.current = undefined;
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
					setMessages(current => updateAssistant(current, assistantIndexRef.current, item => ({ ...item, model: message.model })));
					return;
				case 'chunk':
					setMessages(current => updateAssistant(current, assistantIndexRef.current, item => ({ ...item, content: item.content + message.text })));
					return;
				case 'completed':
				case 'cancelled':
					setBusy(false);
					return;
				case 'error':
					setMessages(current => updateAssistant(current, assistantIndexRef.current, item => ({ ...item, content: `Request failed: ${message.message}` })));
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
		const focus = () => postMessage({ type: 'focusChanged', focused: true });
		const blur = () => postMessage({ type: 'focusChanged', focused: false });
		window.addEventListener('focus', focus);
		window.addEventListener('blur', blur);
		postMessage({ type: 'ready' });
		postMessage({ type: 'focusChanged', focused: document.hasFocus() });
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

	const selectModel = (modelId: string) => {
		setSelectedModelId(modelId);
		postMessage({ type: 'selectModel', modelId });
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
		assistantIndexRef.current = nextMessages.length - 1;
		setMessages(nextMessages);
		setInput('');
		setBusy(true);
		postMessage({ type: 'send', text, modelId: selectedModelId, editMessageIndex: editingIndex });
		setEditingIndex(undefined);
	};

	return (
		<div className="relative h-full px-2">
			<div className="absolute top-1.5 left-1.5 z-20 flex gap-1">
				<button className={iconButtonClass} title="Show conversation history" aria-label="Show conversation history" aria-expanded={historyVisible} onClick={() => setHistoryVisible(value => !value)}>
					<span className="codicon codicon-menu" aria-hidden="true" />
				</button>
			</div>
			{historyVisible && (
				<HistoryPanel
					conversations={conversations}
					currentConversationId={currentConversationId}
					query={historyQuery}
					onQueryChange={setHistoryQuery}
					onClose={() => setHistoryVisible(false)}
					onSelect={conversationId => {
						setHistoryVisible(false);
						postMessage({ type: 'selectConversation', conversationId });
					}}
					onDelete={conversationId => postMessage({ type: 'deleteConversation', conversationId })}
				/>
			)}
			<div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto]">
				<MessageList messages={messages} busy={busy} editingIndex={editingIndex} onEdit={(index, text) => {
					setEditingIndex(index);
					setInput(text);
					requestAnimationFrame(() => inputRef.current?.focus());
				}} />
				<section className="w-[calc(100%-40px)] max-w-210 justify-self-center bg-app pt-2 pb-2 max-[620px]:w-[calc(100%-20px)]">
					<div className={`relative rounded-lg border bg-input transition-colors duration-75 focus-within:border-focus ${editingIndex !== undefined ? 'border-focus shadow-[0_0_0_1px_var(--color-focus)]' : 'border-border'}`}>
						<div
							ref={inputRef}
							className="message-input min-h-11 max-h-45 w-full overflow-y-auto px-3 pt-2 pb-1 text-[13px] leading-[1.45] text-input-foreground outline-none whitespace-pre-wrap wrap-break-word data-[disabled=true]:opacity-60"
							role="textbox"
							aria-label="Message"
							aria-multiline="true"
							contentEditable={busy ? false : 'plaintext-only'}
							data-disabled={busy}
							data-placeholder="Type a message. Enter to send, Shift+Enter for a new line"
							autoFocus
							onInput={event => setInput(event.currentTarget.textContent ?? '')}
							onKeyDown={event => {
								if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
									event.preventDefault();
									send();
								}
							}}
						/>
						<div className="flex min-h-8 items-center gap-2 px-1.5 pb-1.5">
							{editingIndex !== undefined && <span className="flex items-center gap-1.5 text-xs text-focus"><span className="codicon codicon-edit text-sm" /> Editing message</span>}
							<ModelPicker models={models} selectedModelId={selectedModelId} disabled={busy} error={modelsError} onSelect={selectModel} />
							<span className="flex-1" />
							<button className="grid size-7 place-items-center rounded border-0 bg-transparent p-0 text-icon hover:bg-toolbar-hover hover:text-foreground disabled:cursor-default disabled:opacity-50" title={busy ? 'Stop generating' : 'Send'} aria-label={busy ? 'Stop generating' : 'Send'} disabled={!busy && (!input.trim() || !selectedModelId)} onClick={send}>
								<span className={`codicon text-base ${busy ? 'codicon-debug-stop' : 'codicon-send'}`} aria-hidden="true" />
							</button>
						</div>
					</div>
				</section>
			</div>
		</div>
	);
}

const iconButtonClass = 'grid size-8 place-items-center rounded border-0 bg-transparent p-0 text-icon [&_.codicon]:text-base hover:bg-toolbar-hover hover:text-foreground focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-focus';

function updateAssistant(
	messages: StoredMessage[],
	index: number | undefined,
	update: (message: StoredMessage) => StoredMessage,
): StoredMessage[] {
	if (index === undefined || messages[index]?.role !== 'assistant') return messages;
	return messages.map((message, messageIndex) => messageIndex === index ? update(message) : message);
}