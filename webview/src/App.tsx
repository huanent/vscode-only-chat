import { Menu } from 'lucide-react';
import { ChatInput } from './components/ChatInput';
import { HistoryPanel } from './components/HistoryPanel';
import { MessageList } from './components/MessageList';
import { IconButton, IconButtonSize } from './components/ui/IconButton';
import { useChat } from './hooks/useChat';

export function App() {
	const chat = useChat();

	return (
		<div className="relative h-full px-2">
			<div className="absolute top-1.5 left-1.5 z-20 flex gap-1">
				<IconButton ref={chat.historyButtonRef} label="Show conversation history" icon={<Menu size={16} aria-hidden="true" />} size={IconButtonSize.Medium} aria-expanded={chat.historyVisible} onClick={() => chat.setHistoryVisible(value => !value)} />
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
				<MessageList messages={chat.messages} busy={chat.busy} editingIndex={chat.editingIndex} onEdit={chat.editMessage} onRegenerate={chat.regenerate} onRetry={chat.retry} />
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