import type { RefObject } from 'react';
import type { ModelItem } from '../types';
import { ModelPicker } from './ModelPicker';

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
		<section className="w-[calc(100%-40px)] max-w-210 justify-self-center bg-app pt-2 pb-2 max-[620px]:w-[calc(100%-20px)]">
			<div className={`relative rounded-lg border bg-input transition-colors duration-75 focus-within:border-focus ${editingIndex !== undefined ? 'border-focus shadow-[0_0_0_1px_var(--color-focus)]' : 'border-border'}`}>
				<div
					ref={inputRef}
					className="message-input min-h-11 max-h-45 w-full overflow-y-auto px-3 pt-2 pb-1 text-[13px] leading-[1.45] text-input-foreground outline-none whitespace-pre-wrap wrap-break-word data-[disabled=true]:opacity-60"
					role="textbox"
					aria-label="Message"
					aria-multiline="true"
					contentEditable={busy ? false : 'plaintext-only'}
					data-disabled={busy}
					data-placeholder="What’s on your mind?"
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
					{editingIndex !== undefined && <span className="flex items-center gap-1.5 text-xs text-focus"><span className="codicon codicon-edit text-sm" /> Editing message</span>}
					<ModelPicker models={models} selectedModelId={selectedModelId} disabled={busy} error={modelsError} onSelect={onSelectModel} />
					<span className="flex-1" />
					<button className="grid size-7 place-items-center rounded border-0 bg-transparent p-0 text-icon hover:bg-toolbar-hover hover:text-foreground disabled:cursor-default disabled:opacity-50" title={busy ? 'Stop generating' : 'Send'} aria-label={busy ? 'Stop generating' : 'Send'} disabled={!busy && (!input.trim() || !selectedModelId)} onClick={onSend}>
						<span className={`codicon text-base ${busy ? 'codicon-debug-stop' : 'codicon-send'}`} aria-hidden="true" />
					</button>
				</div>
			</div>
		</section>
	);
}