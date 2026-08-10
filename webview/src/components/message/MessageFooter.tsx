import type { StoredMessage, TokenUsage } from '../../types';
import { MessageActions } from './MessageActions';

type MessageFooterProps = {
	message: StoredMessage;
	busy: boolean;
	copied: boolean;
	onEdit(): void;
	onRegenerate(): void;
	onCopy(): void;
};

export function MessageFooter({ message, busy, copied, onEdit, onRegenerate, onCopy }: MessageFooterProps) {
	const visibilityClassName = message.role === 'assistant'
		? ''
		: 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto';

	return (
		<div className={`flex min-h-7 max-w-full flex-wrap items-center gap-x-1 gap-y-0.5 ${visibilityClassName}`}>
			<MessageActions
				message={message}
				busy={busy}
				copied={copied}
				onEdit={onEdit}
				onRegenerate={onRegenerate}
				onCopy={onCopy}
			/>
			{message.model && <span className="max-w-55 overflow-hidden text-[11px] text-ellipsis whitespace-nowrap text-muted" title={message.model}>{message.model}</span>}
			{message.tokenUsage && (
				<span className="max-w-full overflow-hidden text-[11px] text-ellipsis whitespace-nowrap text-muted" title={formatTokenUsageTitle(message.tokenUsage)}>
					{formatTokenCount(message.tokenUsage.input)} in · {formatTokenCount(message.tokenUsage.output)} out
					{message.tokenUsage.cachedInput !== undefined && ` · ${formatTokenCount(message.tokenUsage.cachedInput)} cached`}
				</span>
			)}
		</div>
	);
}

function formatTokenCount(count: number) {
	return count < 1000 ? String(count) : `${(count / 1000).toFixed(count < 10000 ? 1 : 0)}k`;
}

function formatTokenUsageTitle(usage: TokenUsage) {
	return `${usage.input.toLocaleString()} input tokens · ${usage.output.toLocaleString()} output tokens${usage.cachedInput === undefined ? '' : ` · ${usage.cachedInput.toLocaleString()} cached input tokens`}`;
}