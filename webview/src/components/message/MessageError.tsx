import { TextButton } from '../ui/TextButton';

type MessageErrorProps = {
	message: string;
	details?: string;
	busy: boolean;
	onRetry(): void;
};

export function MessageError({ message, details, busy, onRetry }: MessageErrorProps) {
	return (
		<div className="mt-2 grid max-w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2 rounded border border-[var(--vscode-inputValidation-errorBorder,var(--vscode-errorForeground))] bg-[var(--vscode-inputValidation-errorBackground,var(--vscode-input-background))] px-2.5 py-2 text-(--vscode-errorForeground)" role="alert">
			<span className="codicon codicon-warning mt-0.5 shrink-0 text-[16px] leading-none" aria-hidden="true" />
			<span className="min-w-0 flex-1 wrap-break-word">{message}</span>
			<TextButton className="shrink-0 px-1.5 py-0.5 text-(--vscode-textLink-foreground) hover:bg-[var(--vscode-toolbar-hoverBackground,var(--vscode-list-hoverBackground))]" disabled={busy} onClick={onRetry}>Retry</TextButton>
			{details && (
				<details className="col-start-2 col-end-4 mt-1 min-w-0 text-(--vscode-foreground)">
					<summary className="cursor-pointer select-none text-xs text-(--vscode-textLink-foreground)">Show details</summary>
					<pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-(--vscode-textCodeBlock-background) p-2 font-mono text-xs text-(--vscode-textPreformat-foreground)">{details}</pre>
				</details>
			)}
		</div>
	);
}