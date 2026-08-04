import * as vscode from 'vscode';
import { OnlyChatManager } from './chat/manager';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const manager = await OnlyChatManager.create(context);
	manager.register();
	context.subscriptions.push(manager);
}

export function deactivate(): void { }