import { useState } from 'react';
import type { StoredMessage } from '../types';
import { useMessageNavigation } from '../hooks/useMessageNavigation';
import { getRandomQuote } from '../lib/quotes';
import { MessageAnchors } from './MessageAnchors';
import { MessageItem } from './message/MessageItem';
import { EmptyState } from './ui/EmptyState';

type MessageListProps = {
	messages: StoredMessage[];
	busy: boolean;
	editingIndex?: number;
	onEdit(index: number, text: string): void;
	onRegenerate(index: number): void;
	onRetry(index: number): void;
};

export function MessageList({ messages, busy, editingIndex, onEdit, onRegenerate, onRetry }: MessageListProps) {
	const navigation = useMessageNavigation(messages);
	const [quote] = useState(getRandomQuote);
	const greeting = getGreeting(new Date().getHours());

	return (
		<div className="relative min-h-0 w-[calc(100%-40px)] max-w-210 justify-self-center max-[620px]:w-[calc(100%-20px)]">
			<MessageAnchors messages={messages} indexes={navigation.anchorIndexes} activeIndex={navigation.activeAnchorIndex} onSelect={navigation.scrollToMessage} />
			<main className="h-full w-[calc(100%+12px)] overflow-x-hidden overflow-y-auto pr-4 pl-1" ref={navigation.containerRef} onScroll={navigation.handleScroll}>
				{messages.length === 0 && (
					<EmptyState
						icon={<span className="codicon codicon-comment-discussion text-[32px]! leading-none text-icon" aria-hidden="true" />}
						title={greeting}
						titleAs="h1"
						description={<>“{quote.text}” — {quote.author}</>}
						className="h-full"
						titleClassName="mt-3.5 text-xl font-semibold"
						descriptionClassName="mt-2 max-w-105 text-[12px] leading-5 text-muted"
					/>
				)}
				{messages.length > 0 && <div className="min-h-full pt-8 pb-10">{messages.map((message, index) => (
					<MessageItem
						key={`${index}-${message.role}`}
						message={message}
						busy={busy}
						isEditing={editingIndex === index}
						messageRef={element => { navigation.messageRefs.current[index] = element; }}
						onEdit={() => onEdit(index, message.content)}
						onRegenerate={() => onRegenerate(index)}
						onRetry={() => onRetry(index)}
					/>
				))}</div>}
			</main>
			<div className={`message-list-fade message-list-fade-top ${navigation.scrollOverflow.top ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true" />
			<div className={`message-list-fade message-list-fade-bottom ${navigation.scrollOverflow.bottom ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true" />
		</div>
	);
}

function getGreeting(hour: number) {
	if (hour < 12) return 'Good morning';
	if (hour < 18) return 'Good afternoon';
	return 'Good evening';
}