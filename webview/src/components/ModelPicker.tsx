import { Check, Sparkles } from 'lucide-react';
import { useModelPicker } from '../hooks/useModelPicker';
import type { ModelItem } from '../types';

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

	const label = error ? 'Failed to load models' : selectedModel?.name ?? (models.length ? 'Select model' : 'Loading models...');
	const providers = new Map<string, ModelItem[]>();
	for (const model of models) providers.set(model.providerName, [...(providers.get(model.providerName) ?? []), model]);

	return (
		<div className="relative min-w-0 max-w-[min(60vw,320px)] max-[620px]:max-w-[52vw]" ref={rootRef}>
			<button
				className={`flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded border-0 bg-transparent px-2 text-xs text-muted hover:bg-toolbar-hover hover:text-foreground disabled:cursor-default disabled:opacity-50 ${open ? 'bg-toolbar-hover text-foreground' : ''}`}
				type="button"
				disabled={disabled || models.length === 0}
				aria-haspopup="listbox"
				aria-expanded={open}
				title={selectedModel ? `${selectedModel.providerName} · ${selectedModel.name}` : label}
				onClick={() => setOpen(value => !value)}
			>
				<Sparkles className="shrink-0" size={14} aria-hidden="true" />
				<span className="overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
			</button>
			{open && (
				<div className="absolute bottom-[calc(100%+5px)] left-0 z-30 max-h-[min(320px,calc(100vh-150px))] w-[min(288px,calc(100vw-24px))] overflow-y-auto rounded border border-widget-border bg-menu p-1 text-menu-foreground shadow-menu" role="listbox" aria-label="Language models">
					{[...providers].map(([providerName, providerModels]) => (
						<div key={providerName}>
							<div className="px-1.5 pt-1.5 pb-0.5 text-[10px] font-semibold text-muted">{providerName}</div>
							{providerModels.map(model => (
								<button
									className="grid min-h-8 w-full grid-cols-[16px_minmax(0,1fr)] items-center gap-1 rounded border-0 bg-transparent px-1.5 py-1 text-left text-xs text-menu-foreground hover:bg-menu-selection aria-selected:[&_.model-check]:visible"
									key={model.id}
									role="option"
									aria-selected={model.id === selectedModelId}
									onClick={() => { onSelect(model.id); setOpen(false); }}
								>
									<Check className="model-check invisible" size={14} aria-hidden="true" />
									<span className="grid min-w-0">
										<span className="overflow-hidden text-ellipsis whitespace-nowrap">{model.name}</span>
										{model.family !== model.name && <small className="overflow-hidden text-[10px] text-ellipsis whitespace-nowrap text-muted">{model.family}</small>}
									</span>
								</button>
							))}
						</div>
					))}
				</div>
			)}
		</div>
	);
}