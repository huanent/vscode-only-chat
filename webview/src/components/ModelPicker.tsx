import { useEffect, useRef, useState } from 'react';
import type { ModelItem } from '../types';

type ModelPickerProps = {
	models: ModelItem[];
	selectedModelId: string;
	disabled: boolean;
	error: boolean;
	onSelect(modelId: string): void;
};

export function ModelPicker({ models, selectedModelId, disabled, error, onSelect }: ModelPickerProps) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const selectedModel = models.find(model => model.id === selectedModelId);

	useEffect(() => {
		const close = (event: MouseEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
		};
		document.addEventListener('mousedown', close);
		return () => document.removeEventListener('mousedown', close);
	}, []);

	useEffect(() => {
		if (disabled) setOpen(false);
	}, [disabled]);

	const label = error ? 'Failed to load models' : selectedModel?.name ?? (models.length ? 'Select model' : 'Loading models...');
	const providers = new Map<string, ModelItem[]>();
	for (const model of models) providers.set(model.providerName, [...(providers.get(model.providerName) ?? []), model]);

	return (
		<div className="relative min-w-0 max-w-[min(60vw,320px)] max-[620px]:max-w-[52vw]" ref={rootRef}>
			<button
				className={`flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded border-0 bg-transparent px-2 text-xs text-muted [&_.codicon]:text-sm hover:bg-toolbar-hover hover:text-foreground disabled:cursor-default disabled:opacity-50 ${open ? 'bg-toolbar-hover text-foreground' : ''}`}
				type="button"
				disabled={disabled || models.length === 0}
				aria-haspopup="listbox"
				aria-expanded={open}
				title={selectedModel ? `${selectedModel.providerName} · ${selectedModel.name}` : label}
				onClick={() => setOpen(value => !value)}
			>
				<span className="codicon codicon-sparkle" aria-hidden="true" />
				<span className="overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
			</button>
			{open && (
				<div className="absolute bottom-[calc(100%+6px)] left-0 z-30 max-h-[min(380px,calc(100vh-150px))] w-[min(328px,calc(100vw-24px))] overflow-y-auto rounded-md border border-widget-border bg-menu p-1.5 text-menu-foreground shadow-menu" role="listbox" aria-label="Language models">
					{[...providers].map(([providerName, providerModels]) => (
						<div key={providerName}>
							<div className="px-2 pt-2 pb-1 text-[11px] font-semibold text-muted">{providerName}</div>
							{providerModels.map(model => (
								<button
									className="grid min-h-9 w-full grid-cols-[18px_minmax(0,1fr)] items-center gap-1.5 rounded border-0 bg-transparent px-2 py-1.5 text-left text-[13px] text-menu-foreground hover:bg-menu-selection aria-selected:[&_.codicon]:visible"
									key={model.id}
									role="option"
									aria-selected={model.id === selectedModelId}
									onClick={() => { onSelect(model.id); setOpen(false); }}
								>
									<span className="codicon codicon-check invisible" aria-hidden="true" />
									<span className="grid min-w-0">
										<span className="overflow-hidden text-ellipsis whitespace-nowrap">{model.name}</span>
										{model.family !== model.name && <small className="mt-px overflow-hidden text-[11px] text-ellipsis whitespace-nowrap text-muted">{model.family}</small>}
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