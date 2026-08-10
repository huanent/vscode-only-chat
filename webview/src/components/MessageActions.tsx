import type { StoredMessage } from '../types';
import { IconButton, IconButtonVariant } from './ui/IconButton';

type MessageActionsProps = {
	message: StoredMessage;
	busy: boolean;
	copied: boolean;
	onEdit(): void;
	onRegenerate(): void;
	onCopy(): void;
};

export function MessageActions({ message, busy, copied, onEdit, onRegenerate, onCopy }: MessageActionsProps) {
	return (
		<>
			{message.role === 'user' && (
				<IconButton label="Edit message" icon={<span className="codicon codicon-edit text-[14px] leading-none" aria-hidden="true" />} variant={IconButtonVariant.Ghost} disabled={busy} onClick={onEdit} />
			)}
			{message.role === 'assistant' && (
				<IconButton label="Regenerate response" icon={<span className="codicon codicon-refresh text-[14px] leading-none" aria-hidden="true" />} variant={IconButtonVariant.Ghost} disabled={busy} onClick={onRegenerate} />
			)}
			<IconButton label={copied ? 'Copied' : 'Copy message'} icon={copied ? <span className="codicon codicon-check text-[14px] leading-none" aria-hidden="true" /> : <span className="codicon codicon-copy text-[14px] leading-none" aria-hidden="true" />} variant={IconButtonVariant.Ghost} onClick={onCopy} />
		</>
	);
}