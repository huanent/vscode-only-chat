import type { StoredMessage } from '../types';
import { useMessageNavigation } from '../hooks/useMessageNavigation';
import { MarkdownContent } from './MarkdownContent';
import { MessageAnchors } from './MessageAnchors';

type MessageListProps = {
	messages: StoredMessage[];
	busy: boolean;
	editingIndex?: number;
	onEdit(index: number, text: string): void;
};

export function MessageList({ messages, busy, editingIndex, onEdit }: MessageListProps) {
	const navigation = useMessageNavigation(messages);

	return (
		<div className="relative min-h-0 w-[calc(100%-40px)] max-w-210 justify-self-center max-[620px]:w-[calc(100%-20px)]">
			<MessageAnchors messages={messages} indexes={navigation.anchorIndexes} activeIndex={navigation.activeAnchorIndex} onSelect={navigation.scrollToMessage} />
			<main className="h-full w-[calc(100%+12px)] overflow-x-hidden overflow-y-auto pr-4 pl-1" ref={navigation.containerRef} onScroll={navigation.handleScroll}>
				{messages.length === 0 && (
					<div className="grid h-full place-content-center justify-items-center text-center">
						<span className="codicon codicon-comment-discussion text-[32px]! leading-none! text-icon" aria-hidden="true" />
						<h1 className="mt-3.5 mb-0 text-xl font-semibold">What are you working on?</h1>
						<p className="mt-2 mb-0 max-w-105 text-[12px] leading-5 text-muted">Start with a question, a piece of code, or an idea you want to explore.</p>
					</div>
				)}
				{messages.length > 0 && <div className="min-h-full pt-8 pb-10">{messages.map((message, index) => {
					const isUser = message.role === 'user';
					const isEditing = editingIndex === index;
					const isLoading = !isUser && !message.content && busy;
					return (
						<article ref={element => { navigation.messageRefs.current[index] = element; }} className={`group flex py-2.5 ${isUser ? 'justify-end' : 'justify-start'}`} key={`${index}-${message.role}`}>
							<div className={`flex min-w-0 max-w-full flex-col ${isUser ? 'items-end' : 'items-start'}`}>
								{isLoading ? (
									<div className="message-loading" role="status" aria-label="Waiting for response">
										<span />
										<span />
										<span />
									</div>
								) : (
									<MarkdownContent text={message.content} className={`${isUser ? 'rounded-md border border-user-message-border bg-user-message px-3 py-2' : ''} ${isEditing ? 'border-focus shadow-[0_0_0_1px_var(--color-focus)]' : ''}`} />
								)}
								<div className="flex h-7 items-center gap-1 pt-0.5 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto">
									{message.role === 'user' && (
										<button className={messageActionClass} disabled={busy} title="Edit message" aria-label="Edit message" onClick={() => onEdit(index, message.content)}>
											<span className="codicon codicon-edit" aria-hidden="true" />
										</button>
									)}
									<button className={messageActionClass} title="Copy message" aria-label="Copy message" onClick={() => navigator.clipboard.writeText(message.content)}>
										<span className="codicon codicon-copy" aria-hidden="true" />
									</button>
									{message.model && <span className="max-w-55 overflow-hidden text-[11px] text-ellipsis whitespace-nowrap text-muted" title={message.model}>{message.model}</span>}
								</div>
						</div>
						</article>
					);
				})}</div>}
			</main>
			<div className={`message-list-fade message-list-fade-top ${navigation.scrollOverflow.top ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true" />
			<div className={`message-list-fade message-list-fade-bottom ${navigation.scrollOverflow.bottom ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true" />
		</div>
	);
}

const messageActionClass = 'grid size-7 place-items-center rounded border-0 bg-transparent p-0 text-icon [&_.codicon]:text-sm hover:bg-toolbar-hover hover:text-foreground disabled:cursor-default disabled:opacity-50';