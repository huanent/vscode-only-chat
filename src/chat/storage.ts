import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { StoredSession } from '../session';
import { storageKeys } from './constants';

export class SessionStorage {
	private readonly persistedSessionIds = new Set<string>();

	private constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly storageUri: vscode.Uri | undefined,
	) { }

	static async create(context: vscode.ExtensionContext): Promise<SessionStorage> {
		const configuredPath = vscode.workspace.getConfiguration('onlyChat')
			.get<string>('storagePath', '')
			.trim();
		const storageUri = configuredPath ? vscode.Uri.file(resolveStoragePath(configuredPath)) : undefined;
		if (storageUri) {
			await vscode.workspace.fs.createDirectory(storageUri);
		}
		return new SessionStorage(context, storageUri);
	}

	async load(): Promise<StoredSession[]> {
		if (!this.storageUri) {
			return this.loadFromGlobalState();
		}

		return this.loadFromDirectory();
	}

	async persist(sessions: readonly StoredSession[]): Promise<void> {
		if (!this.storageUri) {
			await this.context.globalState.update(storageKeys.sessions, sessions);
			return;
		}

		const currentIds = new Set(sessions.map(session => session.id));
		await Promise.all([
			...sessions.map(session => this.writeSession(session)),
			...[...this.persistedSessionIds]
				.filter(id => !currentIds.has(id))
				.map(id => this.deleteSession(id)),
		]);
		this.persistedSessionIds.clear();
		currentIds.forEach(id => this.persistedSessionIds.add(id));
	}

	private loadFromGlobalState(): StoredSession[] {
		return this.context.globalState.get<StoredSession[]>(storageKeys.sessions, []);
	}

	private async loadFromDirectory(): Promise<StoredSession[]> {
		const entries = await vscode.workspace.fs.readDirectory(this.storageUri!);
		const sessions: StoredSession[] = [];
		for (const [name, type] of entries) {
			if (type !== vscode.FileType.File || path.extname(name).toLowerCase() !== '.json') {
				continue;
			}
			try {
				const content = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(this.storageUri!, name));
				const session = JSON.parse(new TextDecoder().decode(content));
				if (isStoredSession(session) && name === `${session.id}.json`) {
					sessions.push(session);
					this.persistedSessionIds.add(session.id);
				}
			} catch { }
		}
		return sessions;
	}

	private async writeSession(session: StoredSession): Promise<void> {
		const uri = vscode.Uri.joinPath(this.storageUri!, `${session.id}.json`);
		const content = new TextEncoder().encode(`${JSON.stringify(session, undefined, 2)}\n`);
		await vscode.workspace.fs.writeFile(uri, content);
	}

	private async deleteSession(id: string): Promise<void> {
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
		throw new Error('Only Chat storage path must be an absolute path.');
	}
	return expandedPath;
}

function isStoredSession(value: unknown): value is StoredSession {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const session = value as Partial<StoredSession>;
	return typeof session.id === 'string'
		&& typeof session.summary === 'string'
		&& typeof session.updatedAt === 'number'
		&& Array.isArray(session.messages)
		&& session.messages.every(message => Boolean(message)
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
