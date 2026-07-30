import * as vscode from 'vscode';
import { OnlyChatManager } from './chat/manager';

export function activate(context: vscode.ExtensionContext): void {
	const manager = new OnlyChatManager(context);
	manager.register();
	context.subscriptions.push(manager);
}

export function deactivate(): void { }