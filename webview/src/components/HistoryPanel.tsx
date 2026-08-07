import { MessageSquare, MessagesSquare, Search, Trash2, X } from 'lucide-react';
import { useEffect, useState, type Ref, type UIEvent } from 'react';
import type { ConversationItem } from '../types';
import { EmptyState } from './ui/EmptyState';
import { IconButton, IconButtonSize } from './ui/IconButton';
import { TextButton } from './ui/TextButton';

const pageSize = 30;

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
	const [visibleCount, setVisibleCount] = useState(pageSize);
	const visibleConversations = filtered.slice(0, visibleCount);

	useEffect(() => {
		setVisibleCount(pageSize);
	}, [normalizedQuery]);

	const loadNextPage = (event: UIEvent<HTMLUListElement>) => {
		const list = event.currentTarget;
		if (visibleCount < filtered.length && list.scrollTop + list.clientHeight >= list.scrollHeight - 32) {
			setVisibleCount(current => Math.min(current + pageSize, filtered.length));
		}
	};

	return (
		<aside ref={panelRef} className="absolute top-11 left-2 z-115 grid max-h-[min(500px,calc(100vh-56px))] w-[min(340px,calc(100%-16px))] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-widget-border bg-menu shadow-widget" aria-label="Conversation history">
			<div className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 border-b border-widget-border p-1.5">
				<label className="grid h-8 min-w-0 grid-cols-[22px_minmax(0,1fr)] items-center rounded border border-transparent bg-input px-2 text-input-foreground focus-within:border-focus">
					<Search className="text-muted" size={14} aria-hidden="true" />
					<input
						className="h-full min-w-0 border-0 bg-transparent p-0 text-[13px] text-inherit outline-none placeholder:text-input-placeholder"
						type="search"
						value={query}
						onChange={event => onQueryChange(event.target.value)}
						placeholder="Filter conversations"
						aria-label="Filter conversations"
					/>
				</label>
				<IconButton label="Close conversation history" title="Close history" icon={<X size={14} aria-hidden="true" />} size={IconButtonSize.Medium} onClick={onClose} />
			</div>
			<ul className="min-h-0 list-none overflow-y-auto p-1.5" onScroll={loadNextPage}>
				{filtered.length === 0 && (
					<li>
						<EmptyState
							icon={normalizedQuery ? <Search size={20} aria-hidden="true" /> : <MessagesSquare size={20} aria-hidden="true" />}
							title={normalizedQuery ? 'No matching conversations' : 'No conversations yet'}
							description={normalizedQuery ? 'Try a different keyword.' : 'Your recent chats will appear here.'}
							className="min-h-40 gap-2 p-6 text-xs leading-4 text-muted"
							titleClassName="text-[13px] text-foreground"
						/>
					</li>
				)}
				{groupConversations(visibleConversations).map(group => (
					<li key={group.label}>
						<div className="px-2.5 pt-3 pb-1.5 text-[11px] font-semibold text-muted uppercase">{group.label}</div>
						<ul className="m-0 list-none p-0">
							{group.items.map(conversation => (
								<li className={`group grid grid-cols-[minmax(0,1fr)_32px] items-center rounded p-1 hover:bg-hover ${conversation.id === currentConversationId ? 'bg-selection text-selection-foreground' : ''}`} key={conversation.id}>
									<TextButton className="grid h-full min-w-0 grid-cols-[24px_minmax(0,1fr)] items-center pr-1 pl-2 text-left text-[13px] text-inherit" onClick={() => onSelect(conversation.id)}>
										<MessageSquare size={14} aria-hidden="true" />
										<span className="overflow-hidden text-ellipsis whitespace-nowrap leading-5">{conversation.summary}</span>
									</TextButton>
									<IconButton
										label="Delete conversation"
										icon={<Trash2 size={14} aria-hidden="true" />}
										size={IconButtonSize.Medium}
										className={`opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 ${conversation.id === currentConversationId ? 'opacity-100' : ''}`}
										onClick={() => onDelete(conversation.id)}
									/>
								</li>
							))}
						</ul>
					</li>
				))}
			</ul>
		</aside>
	);
}

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