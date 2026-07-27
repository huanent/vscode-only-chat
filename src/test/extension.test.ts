import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
	test('contributes and registers the open command', async () => {
		const extension = vscode.extensions.getExtension('undefined_publisher.temporary-chat');
		assert.ok(extension);

		await extension.activate();
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('temporaryChat.open'));
	});

	test('contributes the default prompt setting', () => {
		const prompt = vscode.workspace.getConfiguration('temporaryChat').get<string>('prompt');
		assert.strictEqual(prompt, '请使用清晰、准确、简洁的中文回答。');
	});
});
