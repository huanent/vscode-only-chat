import * as vscode from 'vscode';
import { getLanguageModelProviderNames } from '../languageModels';
import { storageKeys } from './constants';
import type { ModelItem } from './messages';

export class ModelService implements vscode.Disposable {
	private models: readonly vscode.LanguageModelChat[] | undefined;
	private modelsPromise: Promise<readonly vscode.LanguageModelChat[]> | undefined;
	private modelItems: ModelItem[] | undefined;
	private modelItemsPromise: Promise<ModelItem[]> | undefined;
	private cachedModelItems: ModelItem[];
	private version = 0;
	private readonly changeEmitter = new vscode.EventEmitter<number>();

	readonly onDidChange = this.changeEmitter.event;

	constructor(private readonly context: vscode.ExtensionContext) {
		const cachedModelItems = context.globalState.get<unknown>(storageKeys.cachedModels);
		this.cachedModelItems = Array.isArray(cachedModelItems)
			? cachedModelItems.filter(isModelItem)
			: [];
	}

	register(disposables: vscode.Disposable[]): void {
		disposables.push(vscode.lm.onDidChangeChatModels(() => {
			this.version++;
			this.models = undefined;
			this.modelsPromise = undefined;
			this.modelItems = undefined;
			this.modelItemsPromise = undefined;
			this.changeEmitter.fire(this.version);
		}));
	}

	dispose(): void {
		this.changeEmitter.dispose();
	}

	get currentVersion(): number {
		return this.version;
	}

	getCachedModelItems(): readonly ModelItem[] {
		return this.modelItems ?? this.cachedModelItems;
	}

	async getModels(): Promise<readonly vscode.LanguageModelChat[]> {
		if (this.models) {
			return this.models;
		}
		if (!this.modelsPromise) {
			const request = Promise.resolve(vscode.lm.selectChatModels()).then(models => {
				if (this.modelsPromise === request) {
					this.models = models;
				}
				return models;
			}).finally(() => {
				if (this.modelsPromise === request) {
					this.modelsPromise = undefined;
				}
			});
			this.modelsPromise = request;
		}
		return this.modelsPromise;
	}

	async getModelItems(models: readonly vscode.LanguageModelChat[]): Promise<ModelItem[]> {
		if (this.modelItems) {
			return this.modelItems;
		}
		if (!this.modelItemsPromise) {
			const request = getLanguageModelProviderNames(this.context, models).then(providerNames => {
				const visibleModels = new Map<string, ModelItem>();
				for (const model of models) {
					const providerName = providerNames.get(model.id) ?? model.vendor;
					const key = `${providerName}\u0000${model.name}`;
					if (!visibleModels.has(key)) {
						visibleModels.set(key, {
							id: model.id,
							name: model.name,
							providerName,
							family: model.family,
						});
					}
				}
				const modelItems = [...visibleModels.values()];
				if (this.modelItemsPromise === request) {
					this.modelItems = modelItems;
					this.cachedModelItems = modelItems;
					void this.context.globalState.update(storageKeys.cachedModels, modelItems);
				}
				return modelItems;
			}).finally(() => {
				if (this.modelItemsPromise === request) {
					this.modelItemsPromise = undefined;
				}
			});
			this.modelItemsPromise = request;
		}
		return this.modelItemsPromise;
	}
}

function isModelItem(value: unknown): value is ModelItem {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const model = value as Partial<ModelItem>;
	return typeof model.id === 'string'
		&& typeof model.name === 'string'
		&& typeof model.providerName === 'string'
		&& typeof model.family === 'string';
}