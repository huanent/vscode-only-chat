import * as vscode from 'vscode';
import type { StoredSession } from '../session';

export class OnlyChatDocument implements vscode.CustomDocument {
	constructor(
		readonly uri: vscode.Uri,
		readonly sessions: StoredSession[],
	) { }

	dispose(): void { }
}