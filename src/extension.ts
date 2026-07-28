import * as vscode from 'vscode';
import { registerOnlyChat } from './onlyChatPanel';

export function activate(context: vscode.ExtensionContext) {
	registerOnlyChat(context);
}

export function deactivate() { }