import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { createConversation, type StoredConversation, type StoredMessage } from '../conversation';
import { storageKeys } from './constants';

export class ConversationStorage {
	private readonly persistedConversationIds = new Set<string>();

	private constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly storageUri: vscode.Uri | undefined,
	) { }

	static async create(context: vscode.ExtensionContext): Promise<ConversationStorage> {
		const configuredPath = vscode.workspace.getConfiguration('onlyChat')
			.get<string>('storagePath', '')
			.trim();
		const storageUri = configuredPath ? vscode.Uri.file(resolveStoragePath(configuredPath)) : undefined;
		if (storageUri) {
			await vscode.workspace.fs.createDirectory(storageUri);
		}
		return new ConversationStorage(context, storageUri);
	}

	async load(): Promise<StoredConversation[]> {
		if (!this.storageUri) {
			return this.loadFromGlobalState();
		}

		const conversations = await this.loadFromDirectory();
		if (conversations.length > 0) {
			return conversations;
		}

		const legacyConversations = this.loadFromGlobalState();
		if (legacyConversations.length > 0) {
			await this.persist(legacyConversations);
		}
		return legacyConversations;
	}

	async persist(conversations: readonly StoredConversation[]): Promise<void> {
		if (!this.storageUri) {
			await this.context.globalState.update(storageKeys.conversations, conversations);
			return;
		}

		const currentIds = new Set(conversations.map(conversation => conversation.id));
		await Promise.all([
			...conversations.map(conversation => this.writeConversation(conversation)),
			...[...this.persistedConversationIds]
				.filter(id => !currentIds.has(id))
				.map(id => this.deleteConversation(id)),
		]);
		this.persistedConversationIds.clear();
		currentIds.forEach(id => this.persistedConversationIds.add(id));
	}

	private loadFromGlobalState(): StoredConversation[] {
		const conversations = this.context.globalState.get<StoredConversation[]>(storageKeys.conversations)
			?? this.context.globalState.get<StoredConversation[]>(storageKeys.legacyConversations, []);
		if (conversations.length > 0) {
			return conversations;
		}

		const legacyMessages = this.context.globalState.get<StoredMessage[]>(storageKeys.legacyConversation, []);
		return legacyMessages.length > 0 ? [createConversation(legacyMessages)] : [];
	}

	private async loadFromDirectory(): Promise<StoredConversation[]> {
		const entries = await vscode.workspace.fs.readDirectory(this.storageUri!);
		const conversations: StoredConversation[] = [];
		for (const [name, type] of entries) {
			if (type !== vscode.FileType.File || path.extname(name).toLowerCase() !== '.json') {
				continue;
			}
			try {
				const content = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(this.storageUri!, name));
				const conversation = JSON.parse(new TextDecoder().decode(content));
				if (isStoredConversation(conversation) && name === `${conversation.id}.json`) {
					conversations.push(conversation);
					this.persistedConversationIds.add(conversation.id);
				}
			} catch { }
		}
		return conversations;
	}

	private async writeConversation(conversation: StoredConversation): Promise<void> {
		const uri = vscode.Uri.joinPath(this.storageUri!, `${conversation.id}.json`);
		const content = new TextEncoder().encode(`${JSON.stringify(conversation, undefined, 2)}\n`);
		await vscode.workspace.fs.writeFile(uri, content);
	}

	private async deleteConversation(id: string): Promise<void> {
		try {
			await vscode.workspace.fs.delete(vscode.Uri.joinPath(this.storageUri!, `${id}.json`));
		} catch (error) {
			if (!(error instanceof vscode.FileSystemError && error.code === 'FileNotFound')) {
				throw error;
			}
		}
	}
}

function resolveStoragePath(configuredPath: string): string {
	const expandedPath = configuredPath === '~'
		? os.homedir()
		: configuredPath.startsWith(`~${path.sep}`)
			? path.join(os.homedir(), configuredPath.slice(2))
			: configuredPath;
	if (!path.isAbsolute(expandedPath)) {
		throw new Error('Only Chat conversation storage path must be an absolute path.');
	}
	return expandedPath;
}

function isStoredConversation(value: unknown): value is StoredConversation {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const conversation = value as Partial<StoredConversation>;
	return typeof conversation.id === 'string'
		&& typeof conversation.summary === 'string'
		&& typeof conversation.updatedAt === 'number'
		&& Array.isArray(conversation.messages)
		&& conversation.messages.every(message => Boolean(message)
			&& (message.role === 'user' || message.role === 'assistant')
			&& typeof message.content === 'string'
			&& (message.model === undefined || typeof message.model === 'string')
			&& (message.tokenUsage === undefined || isTokenUsage(message.tokenUsage)));
}

function isTokenUsage(value: unknown): boolean {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const usage = value as Record<string, unknown>;
	return typeof usage.input === 'number'
		&& typeof usage.output === 'number'
		&& (usage.cachedInput === undefined || typeof usage.cachedInput === 'number');
}