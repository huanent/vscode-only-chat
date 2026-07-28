import * as vscode from 'vscode';

export async function getLanguageModelProviderNames(context: vscode.ExtensionContext, models: readonly vscode.LanguageModelChat[]) {
	const namesByVendor = new Map<string, string>();
	for (const extension of vscode.extensions.all) {
		const providers = extension.packageJSON?.contributes?.languageModelChatProviders;
		if (!Array.isArray(providers)) {
			continue;
		}
		for (const provider of providers) {
			if (typeof provider?.vendor !== 'string') {
				continue;
			}
			const name = typeof provider.displayName === 'string'
				? provider.displayName
				: typeof provider.name === 'string' ? provider.name : undefined;
			if (name) {
				namesByVendor.set(provider.vendor, name);
			}
		}
	}

	let configuredProviders: Array<{
		name?: string;
		vendor?: string;
		models?: Array<{ id?: string; name?: string }>;
	}> = [];
	try {
		const configurationUri = vscode.Uri.joinPath(context.globalStorageUri, '..', '..', 'chatLanguageModels.json');
		const content = await vscode.workspace.fs.readFile(configurationUri);
		const parsed = JSON.parse(new TextDecoder().decode(content));
		if (Array.isArray(parsed)) {
			configuredProviders = parsed;
		}
	} catch {
		configuredProviders = [];
	}

	const providerNames = new Map<string, string>();
	for (const model of models) {
		const configuredProvider = configuredProviders.find(provider =>
			provider.vendor === model.vendor
			&& provider.models?.some(candidate =>
				candidate.id === model.id
				|| candidate.id === model.family
				|| candidate.name === model.name,
			),
		);
		providerNames.set(
			model.id,
			configuredProvider?.name ?? namesByVendor.get(model.vendor) ?? model.vendor,
		);
	}
	return providerNames;
}