import { useEffect, useRef, useState } from 'react';
import type { StoredMessage } from '../../types';
import { MessageContent } from './MessageContent';
import { MessageError } from './MessageError';
import { MessageFooter } from './MessageFooter';

type MessageItemProps = {
	message: StoredMessage;
	busy: boolean;
	isEditing: boolean;
	messageRef(element: HTMLElement | null): void;
	onEdit(): void;
	onRegenerate(): void;
	onRetry(): void;
};

export function MessageItem({ message, busy, isEditing, messageRef, onEdit, onRegenerate, onRetry }: MessageItemProps) {
	const [copied, setCopied] = useState(false);
	const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
	const isUser = message.role === 'user';
	const isLoading = !isUser && !message.content && !message.error && busy;

	useEffect(() => () => clearTimeout(copyFeedbackTimerRef.current), []);

	const copyMessage = async () => {
		await navigator.clipboard.writeText(message.content);
		clearTimeout(copyFeedbackTimerRef.current);
		setCopied(true);
		copyFeedbackTimerRef.current = setTimeout(() => setCopied(false), 1500);
	};

	return (
		<article ref={messageRef} className={`group flex py-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
			<div className={`flex min-w-0 max-w-full flex-col ${isUser ? 'items-end' : 'items-start'}`}>
				<MessageContent content={message.content} isUser={isUser} isEditing={isEditing} isLoading={isLoading} />
				{message.error && <MessageError message={message.error} details={message.errorDetails} busy={busy} onRetry={onRetry} />}
				<MessageFooter
					message={message}
					busy={busy}
					copied={copied}
					onEdit={onEdit}
					onRegenerate={onRegenerate}
					onCopy={() => void copyMessage()}
				/>
			</div>
		</article>
	);
}