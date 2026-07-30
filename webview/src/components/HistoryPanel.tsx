import type { Ref } from 'react';
import type { ConversationItem } from '../types';

type HistoryPanelProps = {
	panelRef: Ref<HTMLElement>;
	conversations: ConversationItem[];
	currentConversationId?: string;
	query: string;
	onQueryChange(query: string): void;
	onClose(): void;
	onSelect(conversationId: string): void;
	onDelete(conversationId: string): void;
};

export function HistoryPanel({
	panelRef,
	conversations,
	currentConversationId,
	query,
	onQueryChange,
	onClose,
	onSelect,
	onDelete,
}: HistoryPanelProps) {
	const normalizedQuery = query.trim().toLocaleLowerCase();
	const filtered = normalizedQuery
		? conversations.filter(conversation => conversation.summary.toLocaleLowerCase().includes(normalizedQuery))
		: conversations;

	return (
		<aside ref={panelRef} className="absolute top-11 left-2 z-115 grid max-h-[min(500px,calc(100vh-56px))] w-[min(340px,calc(100%-16px))] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-widget-border bg-menu shadow-widget" aria-label="Conversation history">
			<div className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 border-b border-widget-border p-1.5">
				<label className="grid h-8 min-w-0 grid-cols-[22px_minmax(0,1fr)] items-center rounded border border-transparent bg-input px-2 text-input-foreground focus-within:border-focus">
					<span className="codicon codicon-search text-sm text-muted" aria-hidden="true" />
					<input
						className="h-full min-w-0 border-0 bg-transparent p-0 text-[13px] text-inherit outline-none placeholder:text-input-placeholder"
						type="search"
						value={query}
						onChange={event => onQueryChange(event.target.value)}
						placeholder="Filter conversations"
						aria-label="Filter conversations"
					/>
				</label>
				<button className={iconButtonClass} title="Close history" aria-label="Close conversation history" onClick={onClose}>
					<span className="codicon codicon-close" aria-hidden="true" />
				</button>
			</div>
			<ul className="min-h-0 list-none overflow-y-auto p-1.5">
				{filtered.length === 0 && (
					<li className="grid min-h-40 place-content-center justify-items-center gap-2 p-6 text-center text-xs leading-4 text-muted">
						<span className={`codicon text-xl ${normalizedQuery ? 'codicon-search' : 'codicon-comment-discussion'}`} aria-hidden="true" />
						<strong className="text-[13px] text-foreground">{normalizedQuery ? 'No matching conversations' : 'No conversations yet'}</strong>
						<span>{normalizedQuery ? 'Try a different keyword.' : 'Your recent chats will appear here.'}</span>
					</li>
				)}
				{groupConversations(filtered).map(group => (
					<li key={group.label}>
						<div className="px-2.5 pt-3 pb-1.5 text-[11px] font-semibold text-muted uppercase">{group.label}</div>
						<ul className="m-0 list-none p-0">
							{group.items.map(conversation => (
								<li className={`group grid min-h-9 grid-cols-[minmax(0,1fr)_32px] items-center rounded hover:bg-hover ${conversation.id === currentConversationId ? 'bg-selection text-selection-foreground' : ''}`} key={conversation.id}>
									<button className="grid h-full min-w-0 grid-cols-[24px_minmax(0,1fr)] items-center border-0 bg-transparent py-1 pr-1 pl-2 text-left text-[13px] text-inherit" onClick={() => onSelect(conversation.id)}>
										<span className="codicon codicon-comment text-sm" aria-hidden="true" />
										<span className="overflow-hidden text-ellipsis whitespace-nowrap leading-5">{conversation.summary}</span>
									</button>
									<button className={`${iconButtonClass} opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 ${conversation.id === currentConversationId ? 'opacity-100' : ''}`} title="Delete conversation" aria-label="Delete conversation" onClick={() => onDelete(conversation.id)}>
										<span className="codicon codicon-trash" aria-hidden="true" />
									</button>
								</li>
							))}
						</ul>
					</li>
				))}
			</ul>
		</aside>
	);
}

const iconButtonClass = 'grid size-8 place-items-center rounded border-0 bg-transparent p-0 text-icon [&_.codicon]:text-sm hover:bg-toolbar-hover hover:text-foreground focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-focus';

function groupConversations(conversations: ConversationItem[]) {
	const groups = new Map<string, ConversationItem[]>();
	for (const conversation of conversations) {
		const label = getConversationGroup(conversation.updatedAt);
		groups.set(label, [...(groups.get(label) ?? []), conversation]);
	}
	return [...groups].map(([label, items]) => ({ label, items }));
}

function getConversationGroup(updatedAt: number): string {
	const date = new Date(updatedAt);
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const conversationDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	const daysAgo = Math.round((today.getTime() - conversationDay.getTime()) / 86_400_000);
	if (daysAgo <= 0) return 'Today';
	if (daysAgo === 1) return 'Yesterday';
	if (daysAgo <= 3) return 'Previous 3 days';
	if (daysAgo <= 7) return 'Previous 7 days';
	return 'Older';
}