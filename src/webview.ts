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
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'nonce-${nonce}'; style-src-attr 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}';">
	<link rel="stylesheet" href="${styleUri}">
	<style nonce="${nonce}">
		.boot-shell { display: grid; height: 100%; grid-template-rows: minmax(0, 1fr) auto; padding: 0 10px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
		.boot-shell-main { display: grid; place-content: center; justify-items: center; gap: 14px; }
		.boot-shell-mark { width: 28px; height: 24px; border: 2px solid var(--vscode-descriptionForeground); border-radius: 7px; opacity: .7; }
		.boot-shell-mark::after { display: block; width: 7px; height: 7px; margin: 20px 0 0 4px; border: solid var(--vscode-descriptionForeground); border-width: 0 0 2px 2px; content: ''; transform: skewY(-35deg); }
		.boot-shell-line { width: 112px; height: 8px; border-radius: 4px; background: var(--vscode-descriptionForeground); opacity: .18; }
		.boot-shell-input { width: min(800px, calc(100% - 20px)); height: 72px; margin: 0 auto 12px; border: 1px solid var(--vscode-input-border, transparent); border-radius: 6px; background: var(--vscode-input-background, rgba(127, 127, 127, .08)); }
		@media (prefers-reduced-motion: no-preference) { .boot-shell-line { animation: boot-pulse 1.2s ease-in-out infinite; } }
		@keyframes boot-pulse { 50% { opacity: .35; } }
	</style>
	<title>New conversation</title>
</head>
<body>
	<div id="root">
		<div class="boot-shell" role="status" aria-label="Loading chat">
			<div class="boot-shell-main"><div class="boot-shell-mark" aria-hidden="true"></div><div class="boot-shell-line" aria-hidden="true"></div></div>
			<div class="boot-shell-input" aria-hidden="true"></div>
		</div>
	</div>
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