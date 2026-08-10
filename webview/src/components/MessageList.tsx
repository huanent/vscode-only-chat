import { useEffect, useRef, useState } from 'react';
import type { StoredMessage } from '../types';
import { useMessageNavigation } from '../hooks/useMessageNavigation';
import { getRandomQuote } from '../lib/quotes';
import { MarkdownContent } from './MarkdownContent';
import { MessageActions } from './MessageActions';
import { MessageAnchors } from './MessageAnchors';
import { EmptyState } from './ui/EmptyState';
import { TextButton } from './ui/TextButton';

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
	const [copiedIndex, setCopiedIndex] = useState<number>();
	const [quote] = useState(getRandomQuote);
	const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
	const greeting = getGreeting(new Date().getHours());

	useEffect(() => () => clearTimeout(copyFeedbackTimerRef.current), []);

	const copyMessage = async (index: number, content: string) => {
		await navigator.clipboard.writeText(content);
		clearTimeout(copyFeedbackTimerRef.current);
		setCopiedIndex(index);
		copyFeedbackTimerRef.current = setTimeout(() => setCopiedIndex(undefined), 1500);
	};

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
				{messages.length > 0 && <div className="min-h-full pt-8 pb-10">{messages.map((message, index) => {
					const isUser = message.role === 'user';
					const isEditing = editingIndex === index;
					const isLoading = !isUser && !message.content && !message.error && busy;
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
								{message.error && (
									<div className="mt-2 grid max-w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2 rounded border border-error-border bg-error px-2.5 py-2 text-error-foreground" role="alert">
										<span className="codicon codicon-warning mt-0.5 shrink-0 text-[16px] leading-none" aria-hidden="true" />
										<span className="min-w-0 flex-1 wrap-break-word">{message.error}</span>
										<TextButton className="shrink-0 px-1.5 py-0.5 text-link hover:bg-toolbar-hover" disabled={busy} onClick={() => onRetry(index)}>Retry</TextButton>
										{message.errorDetails && (
											<details className="col-start-2 col-end-4 mt-1 min-w-0 text-foreground">
												<summary className="cursor-pointer select-none text-xs text-link">Show details</summary>
												<pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-code p-2 font-mono text-xs text-code-foreground">{message.errorDetails}</pre>
											</details>
										)}
									</div>
								)}
								<div className="flex min-h-7 max-w-full flex-wrap items-center gap-x-1 gap-y-0.5 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto">
									<MessageActions
										message={message}
										busy={busy}
										copied={copiedIndex === index}
										onEdit={() => onEdit(index, message.content)}
										onRegenerate={() => onRegenerate(index)}
										onCopy={() => void copyMessage(index, message.content)}
									/>
									{message.model && <span className="max-w-55 overflow-hidden text-[11px] text-ellipsis whitespace-nowrap text-muted" title={message.model}>{message.model}</span>}
									{message.tokenUsage && (
										<span className="max-w-full overflow-hidden text-[11px] text-ellipsis whitespace-nowrap text-muted" title={formatTokenUsageTitle(message.tokenUsage)}>
											{formatTokenCount(message.tokenUsage.input)} in · {formatTokenCount(message.tokenUsage.output)} out
											{message.tokenUsage.cachedInput !== undefined && ` · ${formatTokenCount(message.tokenUsage.cachedInput)} cached`}
										</span>
									)}
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

function getGreeting(hour: number) {
	if (hour < 12) return 'Good morning';
	if (hour < 18) return 'Good afternoon';
	return 'Good evening';
}

function formatTokenCount(count: number) {
	return count < 1000 ? String(count) : `${(count / 1000).toFixed(count < 10000 ? 1 : 0)}k`;
}

function formatTokenUsageTitle(usage: { input: number; output: number; cachedInput?: number }) {
	return `${usage.input.toLocaleString()} input tokens · ${usage.output.toLocaleString()} output tokens${usage.cachedInput === undefined ? '' : ` · ${usage.cachedInput.toLocaleString()} cached input tokens`}`;
}