import { ChatInput } from './components/ChatInput';
import { HistoryPanel } from './components/HistoryPanel';
import { MessageList } from './components/MessageList';
import { useChat } from './hooks/useChat';

export function App() {
	const chat = useChat();

	return (
		<div className="relative h-full px-2">
			<div className="absolute top-1.5 left-1.5 z-20 flex gap-1">
				<button ref={chat.historyButtonRef} className={iconButtonClass} title="Show conversation history" aria-label="Show conversation history" aria-expanded={chat.historyVisible} onClick={() => chat.setHistoryVisible(value => !value)}>
					<span className="codicon codicon-menu" aria-hidden="true" />
				</button>
			</div>
			{chat.historyVisible && (
				<HistoryPanel
					panelRef={chat.historyPanelRef}
					conversations={chat.conversations}
					currentConversationId={chat.currentConversationId}
					query={chat.historyQuery}
					onQueryChange={chat.setHistoryQuery}
					onClose={() => chat.setHistoryVisible(false)}
					onSelect={chat.selectConversation}
					onDelete={chat.deleteConversation}
				/>
			)}
			<div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto]">
				<MessageList messages={chat.messages} busy={chat.busy} editingIndex={chat.editingIndex} onEdit={chat.editMessage} />
				<ChatInput
					inputRef={chat.inputRef}
					input={chat.input}
					busy={chat.busy}
					editingIndex={chat.editingIndex}
					models={chat.models}
					selectedModelId={chat.selectedModelId}
					modelsError={chat.modelsError}
					onInputChange={chat.setInput}
					onSelectModel={chat.selectModel}
					onSend={chat.send}
				/>
			</div>
		</div>
	);
}

const iconButtonClass = 'grid size-8 place-items-center rounded border-0 bg-transparent p-0 text-icon [&_.codicon]:text-base hover:bg-toolbar-hover hover:text-foreground focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-focus';