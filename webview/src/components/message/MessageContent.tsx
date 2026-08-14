import { lazy, Suspense } from 'react';

const MarkdownContent = lazy(() => import('../MarkdownContent').then(module => ({ default: module.MarkdownContent })));

type MessageContentProps = {
	content: string;
	isUser: boolean;
	isEditing: boolean;
	isLoading: boolean;
};

export function MessageContent({ content, isUser, isEditing, isLoading }: MessageContentProps) {
	if (isLoading) {
		return (
			<div className="message-loading" role="status" aria-label="Waiting for response">
				<span />
				<span />
				<span />
			</div>
		);
	}

	return (
		<Suspense fallback={<div className="min-w-0 max-w-full whitespace-pre-wrap wrap-anywhere">{content}</div>}>
			<MarkdownContent text={content} className={`${isUser ? 'rounded-md border border-[var(--vscode-chat-requestBorder,var(--vscode-panel-border))] bg-[var(--vscode-chat-requestBackground,var(--vscode-input-background))] px-3 py-2' : ''} ${isEditing ? 'border-(--vscode-focusBorder) shadow-[0_0_0_1px_var(--vscode-focusBorder)]' : ''}`} />
		</Suspense>
	);
}