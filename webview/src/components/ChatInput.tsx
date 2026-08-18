import type { RefObject } from 'react';
import type { ModelItem } from '../types';
import { ModelPicker } from './ModelPicker';
import { IconButton, IconButtonSize } from './ui/IconButton';

type ChatInputProps = {
	inputRef: RefObject<HTMLDivElement | null>;
	input: string;
	busy: boolean;
	editingIndex?: number;
	models: ModelItem[];
	selectedModelId: string;
	modelsError: boolean;
	onInputChange(value: string): void;
	onSelectModel(modelId: string): void;
	onSend(): void;
};

export function ChatInput({ inputRef, input, busy, editingIndex, models, selectedModelId, modelsError, onInputChange, onSelectModel, onSend }: ChatInputProps) {
	return (
		<section className="w-[calc(100%-40px)] max-w-210 justify-self-center bg-(--vscode-editor-background) py-2 max-[620px]:w-[calc(100%-20px)]">
			<div className={`relative rounded-lg border bg-(--vscode-input-background,rgba(127,127,127,.08)) transition-colors duration-75 focus-within:border-(--vscode-focusBorder) ${editingIndex !== undefined ? 'border-(--vscode-focusBorder) shadow-[0_0_0_1px_var(--vscode-focusBorder)]' : 'border-(--vscode-panel-border)'}`}>
				<div
					ref={inputRef}
					className="message-input min-h-9 max-h-45 w-full overflow-y-auto px-3 pt-2 pb-1 text-3 leading-[1.45] text-(--vscode-input-foreground) outline-none whitespace-pre-wrap wrap-break-word data-[disabled=true]:opacity-60"
					role="textbox"
					aria-label="Message"
					aria-multiline="true"
					contentEditable={busy ? false : 'plaintext-only'}
					data-disabled={busy}
					data-placeholder="What shall we explore together?"
					autoFocus
					onInput={event => onInputChange(event.currentTarget.textContent ?? '')}
					onKeyDown={event => {
						if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
							event.preventDefault();
							onSend();
						}
					}}
				/>
				<div className="flex min-h-8 items-center gap-2 px-1.5 pb-1.5">
					<ModelPicker models={models} selectedModelId={selectedModelId} disabled={busy} error={modelsError} onSelect={onSelectModel} />
					<span className="flex-1" />
					<IconButton
						label={busy ? 'Stop generating' : 'Send'}
						icon={busy ? <span className="codicon codicon-debug-stop text-[14px] leading-none" aria-hidden="true" /> : <span className="codicon codicon-send text-[14px] leading-none" aria-hidden="true" />}
						size={IconButtonSize.Medium}
						disabled={!busy && (!input.trim() || !selectedModelId)}
						onClick={onSend}
					/>
				</div>
			</div>
		</section>
	);
}