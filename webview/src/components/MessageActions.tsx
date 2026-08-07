import { Check, Copy, Pencil, RefreshCw } from 'lucide-react';
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
				<IconButton label="Edit message" icon={<Pencil size={14} aria-hidden="true" />} variant={IconButtonVariant.Ghost} disabled={busy} onClick={onEdit} />
			)}
			{message.role === 'assistant' && (
				<IconButton label="Regenerate response" icon={<RefreshCw size={14} aria-hidden="true" />} variant={IconButtonVariant.Ghost} disabled={busy} onClick={onRegenerate} />
			)}
			<IconButton label={copied ? 'Copied' : 'Copy message'} icon={copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />} variant={IconButtonVariant.Ghost} onClick={onCopy} />
		</>
	);
}