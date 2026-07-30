import * as vscode from 'vscode';

export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
	const nonce = getNonce();
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'chat.css'));
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'chat.js'));

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource}; style-src-attr 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<link rel="stylesheet" href="${styleUri}">
	<title>New conversation</title>
</head>
<body>
	<div id="root"></div>
	<script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce(): string {
	const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let nonce = '';
	for (let index = 0; index < 32; index++) {
		nonce += characters.charAt(Math.floor(Math.random() * characters.length));
	}
	return nonce;
}