import * as vscode from 'vscode';
import type { StoredConversation } from '../conversation';

export class OnlyChatDocument implements vscode.CustomDocument {
	constructor(
		readonly uri: vscode.Uri,
		readonly conversations: StoredConversation[],
	) { }

	dispose(): void { }
}