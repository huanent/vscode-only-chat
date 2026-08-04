import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import type { StoredConversation } from '../conversation';
import { commandIds, editorViewType, storageKeys } from './constants';
import { ConversationStorage } from './conversationStorage';
import { OnlyChatDocument } from './document';
import { ModelService } from './modelService';
import { OnlyChatPanelController } from './panelController';

export class OnlyChatManager implements vscode.Disposable {
	private readonly conversations: StoredConversation[];
	private readonly controllers = new Set<OnlyChatPanelController>();
	private readonly modelService: ModelService;
	private readonly disposables: vscode.Disposable[] = [];
	private currentController: OnlyChatPanelController | undefined;

	private constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly conversationStorage: ConversationStorage,
		conversations: StoredConversation[],
	) {
		this.conversations = conversations;
		this.modelService = new ModelService(context);
	}

	static async create(context: vscode.ExtensionContext): Promise<OnlyChatManager> {
		const conversationStorage = await ConversationStorage.create(context);
		const conversations = await conversationStorage.load();
		return new OnlyChatManager(context, conversationStorage, conversations);
	}

	register(): void {
		this.modelService.register(this.disposables);
		const provider: vscode.CustomReadonlyEditorProvider<OnlyChatDocument> = {
			openCustomDocument: uri => new OnlyChatDocument(uri, this.conversations),
			resolveCustomEditor: (document, panel) => this.configurePanel(document, panel),
		};
		this.disposables.push(
			vscode.commands.registerCommand(commandIds.open, () => this.open(true)),
			vscode.commands.registerCommand(commandIds.newConversation, () => this.open(true)),
			vscode.commands.registerCommand(commandIds.newTab, () => this.open(false)),
			vscode.window.registerCustomEditorProvider(editorViewType, provider, {
				webviewOptions: { retainContextWhenHidden: true },
				supportsMultipleEditorsPerDocument: true,
			}),
		);
	}

	dispose(): void {
		this.controllers.forEach(controller => controller.dispose());
		this.modelService.dispose();
		this.disposables.forEach(disposable => disposable.dispose());
	}

	getEditors(): readonly OnlyChatPanelController[] {
		return [...this.controllers];
	}

	setCurrent(controller: OnlyChatPanelController): void {
		this.currentController = controller;
	}

	remove(controller: OnlyChatPanelController): void {
		this.controllers.delete(controller);
		if (this.currentController === controller) {
			this.currentController = this.controllers.values().next().value;
		}
	}

	async persist(currentConversationId: string): Promise<void> {
		await Promise.all([
			this.conversationStorage.persist(this.conversations),
			this.context.globalState.update(storageKeys.currentConversation, currentConversationId),
			this.context.globalState.update(storageKeys.legacyConversation, undefined),
		]);
	}

	private async open(reuseCurrent: boolean): Promise<void> {
		if (reuseCurrent && this.currentController) {
			this.currentController.reveal();
			await this.currentController.newConversation();
			return;
		}
		await vscode.commands.executeCommand('vscode.openWith', createEditorUri(), editorViewType, {
			viewColumn: vscode.ViewColumn.Active,
		});
	}

	private configurePanel(document: OnlyChatDocument, panel: vscode.WebviewPanel): void {
		if ([...this.controllers].some(controller => controller.document === document)) {
			void this.replaceSplitEditor(panel);
			return;
		}
		const controller = new OnlyChatPanelController(
			this.context,
			this,
			this.modelService,
			panel,
			document,
		);
		this.controllers.add(controller);
		this.currentController = controller;
	}

	private async replaceSplitEditor(panel: vscode.WebviewPanel): Promise<void> {
		const viewColumn = panel.viewColumn ?? vscode.ViewColumn.Active;
		panel.dispose();
		await vscode.commands.executeCommand('vscode.openWith', createEditorUri(), editorViewType, { viewColumn });
	}
}

function createEditorUri(): vscode.Uri {
	return vscode.Uri.from({
		scheme: 'only-chat',
		path: '/New conversation',
		query: new URLSearchParams({ id: randomUUID() }).toString(),
	});
}