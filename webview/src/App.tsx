import { HistoryPanel } from './components/HistoryPanel';
import { MessageList } from './components/MessageList';
import { ModelPicker } from './components/ModelPicker';
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
				<section className="w-[calc(100%-40px)] max-w-210 justify-self-center bg-app pt-2 pb-2 max-[620px]:w-[calc(100%-20px)]">
					<div className={`relative rounded-lg border bg-input transition-colors duration-75 focus-within:border-focus ${chat.editingIndex !== undefined ? 'border-focus shadow-[0_0_0_1px_var(--color-focus)]' : 'border-border'}`}>
						<div
							ref={chat.inputRef}
							className="message-input min-h-11 max-h-45 w-full overflow-y-auto px-3 pt-2 pb-1 text-[13px] leading-[1.45] text-input-foreground outline-none whitespace-pre-wrap wrap-break-word data-[disabled=true]:opacity-60"
							role="textbox"
							aria-label="Message"
							aria-multiline="true"
							contentEditable={chat.busy ? false : 'plaintext-only'}
							data-disabled={chat.busy}
							data-placeholder="Type a message. Enter to send, Shift+Enter for a new line"
							autoFocus
							onInput={event => chat.setInput(event.currentTarget.textContent ?? '')}
							onKeyDown={event => {
								if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
									event.preventDefault();
									chat.send();
								}
							}}
						/>
						<div className="flex min-h-8 items-center gap-2 px-1.5 pb-1.5">
							{chat.editingIndex !== undefined && <span className="flex items-center gap-1.5 text-xs text-focus"><span className="codicon codicon-edit text-sm" /> Editing message</span>}
							<ModelPicker models={chat.models} selectedModelId={chat.selectedModelId} disabled={chat.busy} error={chat.modelsError} onSelect={chat.selectModel} />
							<span className="flex-1" />
							<button className="grid size-7 place-items-center rounded border-0 bg-transparent p-0 text-icon hover:bg-toolbar-hover hover:text-foreground disabled:cursor-default disabled:opacity-50" title={chat.busy ? 'Stop generating' : 'Send'} aria-label={chat.busy ? 'Stop generating' : 'Send'} disabled={!chat.busy && (!chat.input.trim() || !chat.selectedModelId)} onClick={chat.send}>
								<span className={`codicon text-base ${chat.busy ? 'codicon-debug-stop' : 'codicon-send'}`} aria-hidden="true" />
							</button>
						</div>
					</div>
				</section>
			</div>
		</div>
	);
}

const iconButtonClass = 'grid size-8 place-items-center rounded border-0 bg-transparent p-0 text-icon [&_.codicon]:text-base hover:bg-toolbar-hover hover:text-foreground focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-focus';