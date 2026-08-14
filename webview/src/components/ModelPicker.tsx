import { useModelPicker } from '../hooks/useModelPicker';
import type { ModelItem } from '../types';
import { TextButton } from './ui/TextButton';

type ModelPickerProps = {
	models: ModelItem[];
	selectedModelId: string;
	disabled: boolean;
	error: boolean;
	onSelect(modelId: string): void;
};

export function ModelPicker({ models, selectedModelId, disabled, error, onSelect }: ModelPickerProps) {
	const { open, setOpen, rootRef } = useModelPicker(disabled);
	const selectedModel = models.find(model => model.id === selectedModelId);

	const label = error ? 'No models available' : selectedModel?.name ?? (models.length ? 'Select model' : 'Loading models...');
	const providers = new Map<string, ModelItem[]>();
	for (const model of models) providers.set(model.providerName, [...(providers.get(model.providerName) ?? []), model]);

	return (
		<div className="relative min-w-0 max-w-[min(60vw,320px)] max-[620px]:max-w-[52vw]" ref={rootRef}>
			<TextButton
				className={`flex h-7 min-w-0 max-w-full items-center gap-1.5 px-2 text-xs text-(--vscode-descriptionForeground) hover:bg-[var(--vscode-toolbar-hoverBackground,var(--vscode-list-hoverBackground))] hover:text-(--vscode-foreground) ${open ? 'bg-[var(--vscode-toolbar-hoverBackground,var(--vscode-list-hoverBackground))] text-(--vscode-foreground)' : ''}`}
				disabled={disabled || models.length === 0}
				aria-haspopup="listbox"
				aria-expanded={open}
				title={selectedModel ? `${selectedModel.providerName} · ${selectedModel.name}` : label}
				onClick={() => setOpen(value => !value)}
			>
				<span className="codicon codicon-sparkle shrink-0 text-[14px] leading-none" aria-hidden="true" />
				<span className="overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
			</TextButton>
			{open && (
				<div className="absolute bottom-[calc(100%+5px)] left-0 z-30 max-h-[min(320px,calc(100vh-150px))] w-[min(288px,calc(100vw-24px))] overflow-y-auto rounded border border-[var(--vscode-widget-border,var(--vscode-panel-border))] bg-[var(--vscode-menu-background,var(--vscode-editorWidget-background))] p-1 text-[var(--vscode-menu-foreground,var(--vscode-foreground))] shadow-[0_6px_20px_var(--vscode-widget-shadow)]" role="listbox" aria-label="Language models">
					{[...providers].map(([providerName, providerModels]) => (
						<div key={providerName}>
							<div className="px-1.5 pt-1.5 pb-0.5 text-[10px] font-semibold text-(--vscode-descriptionForeground)">{providerName}</div>
							{providerModels.map(model => (
								<TextButton
									className="grid min-h-8 w-full grid-cols-[16px_minmax(0,1fr)] items-center gap-1 px-1.5 py-1 text-left text-xs text-[var(--vscode-menu-foreground,var(--vscode-foreground))] hover:bg-[var(--vscode-menu-selectionBackground,var(--vscode-list-hoverBackground))] aria-selected:[&_.model-check]:visible"
									key={model.id}
									role="option"
									aria-selected={model.id === selectedModelId}
									onClick={() => { onSelect(model.id); setOpen(false); }}
								>
									<span className="codicon codicon-check model-check invisible text-[14px] leading-none" aria-hidden="true" />
									<span className="grid min-w-0">
										<span className="overflow-hidden text-ellipsis whitespace-nowrap">{model.name}</span>
										{model.family !== model.name && <small className="overflow-hidden text-[10px] text-ellipsis whitespace-nowrap text-(--vscode-descriptionForeground)">{model.family}</small>}
									</span>
								</TextButton>
							))}
						</div>
					))}
				</div>
			)}
		</div>
	);
}