import * as vscode from 'vscode';
import { registerTemporaryChat } from './temporaryChatPanel';

export function activate(context: vscode.ExtensionContext) {
	registerTemporaryChat(context);
}

export function deactivate() { }