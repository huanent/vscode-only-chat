import * as vscode from 'vscode';
import { getLanguageModelProviderNames } from '../languageModels';
import type { ModelItem } from './messages';

export class ModelService implements vscode.Disposable {
	private models: readonly vscode.LanguageModelChat[] | undefined;
	private modelsPromise: Promise<readonly vscode.LanguageModelChat[]> | undefined;
	private version = 0;
	private readonly changeEmitter = new vscode.EventEmitter<number>();

	readonly onDidChange = this.changeEmitter.event;

	constructor(private readonly context: vscode.ExtensionContext) { }

	register(disposables: vscode.Disposable[]): void {
		disposables.push(vscode.lm.onDidChangeChatModels(() => {
			this.version++;
			this.models = undefined;
			this.modelsPromise = undefined;
			this.changeEmitter.fire(this.version);
		}));
	}

	dispose(): void {
		this.changeEmitter.dispose();
	}

	get currentVersion(): number {
		return this.version;
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
		const providerNames = await getLanguageModelProviderNames(this.context, models);
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
		return [...visibleModels.values()];
	}
}