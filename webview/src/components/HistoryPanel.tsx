import { useEffect, useState, type Ref, type UIEvent } from 'react';
import type { SessionItem } from '../types';
import { EmptyState } from './ui/EmptyState';
import { IconButton, IconButtonSize } from './ui/IconButton';
import { TextButton } from './ui/TextButton';

const pageSize = 30;

type HistoryPanelProps = {
	panelRef: Ref<HTMLElement>;
	sessions: SessionItem[];
	currentSessionId?: string;
	query: string;
	onQueryChange(query: string): void;
	onClose(): void;
	onSelect(sessionId: string): void;
	onDelete(sessionId: string): void;
};

export function HistoryPanel({
	panelRef,
	sessions,
	currentSessionId,
	query,
	onQueryChange,
	onClose,
	onSelect,
	onDelete,
}: HistoryPanelProps) {
	const normalizedQuery = query.trim().toLocaleLowerCase();
	const filtered = normalizedQuery
		? sessions.filter(session => session.summary.toLocaleLowerCase().includes(normalizedQuery))
		: sessions;
	const [visibleCount, setVisibleCount] = useState(pageSize);
	const visibleSessions = filtered.slice(0, visibleCount);

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
		<aside ref={panelRef} className="absolute top-11 left-2 z-115 grid max-h-[min(500px,calc(100vh-56px))] w-[min(340px,calc(100%-16px))] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-widget-border bg-menu shadow-widget" aria-label="Chat history">
			<div className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 border-b border-widget-border p-1.5">
				<label className="grid h-8 min-w-0 grid-cols-[22px_minmax(0,1fr)] items-center rounded border border-transparent bg-input px-2 text-input-foreground focus-within:border-focus">
					<span className="codicon codicon-search text-[14px] leading-none text-muted" aria-hidden="true" />
					<input
						className="h-full min-w-0 border-0 bg-transparent p-0 text-[13px] text-inherit outline-none placeholder:text-input-placeholder"
						type="search"
						value={query}
						onChange={event => onQueryChange(event.target.value)}
						placeholder="Search history"
						aria-label="Search history"
					/>
				</label>
				<IconButton label="Close chat history" title="Close history" icon={<span className="codicon codicon-close text-[14px] leading-none" aria-hidden="true" />} size={IconButtonSize.Large} onClick={onClose} />
			</div>
			<ul className="min-h-0 list-none overflow-y-auto p-1.5" onScroll={loadNextPage}>
				{filtered.length === 0 && (
					<li>
						<EmptyState
							icon={normalizedQuery ? <span className="codicon codicon-search text-[20px] leading-none" aria-hidden="true" /> : <span className="codicon codicon-comment-discussion text-[20px] leading-none" aria-hidden="true" />}
							title={normalizedQuery ? 'No matching chats' : 'No chats yet'}
							description={normalizedQuery ? 'Try a different keyword.' : 'Your recent chats will appear here.'}
							className="min-h-40 gap-2 p-6 text-xs leading-4 text-muted"
							titleClassName="text-[13px] text-foreground"
						/>
					</li>
				)}
				{groupSessions(visibleSessions).map(group => (
					<li key={group.label}>
						<div className="px-2.5 pt-3 pb-1.5 text-[11px] font-semibold text-muted uppercase">{group.label}</div>
						<ul className="m-0 list-none p-0">
							{group.items.map(session => (
								<li className={`group grid grid-cols-[minmax(0,1fr)_32px] items-center rounded p-1 ${session.id === currentSessionId ? 'bg-hover text-selection-foreground' : 'hover:bg-selection'}`} key={session.id}>
									<TextButton className="grid h-full min-w-0 grid-cols-[24px_minmax(0,1fr)] items-center pl-2 text-left text-4 text-inherit" onClick={() => onSelect(session.id)}>
										<span className="codicon codicon-comment text-[14px] leading-none" aria-hidden="true" />
										<span className="overflow-hidden text-ellipsis whitespace-nowrap leading-5">{session.summary}</span>
									</TextButton>
									<IconButton
										label="Delete chat"
										icon={<span className="codicon codicon-trash text-[14px] leading-none" aria-hidden="true" />}
										size={IconButtonSize.Medium}
										className={`opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 ${session.id === currentSessionId ? 'opacity-100' : ''}`}
										onClick={() => onDelete(session.id)}
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

function groupSessions(sessions: SessionItem[]) {
	const groups = new Map<string, SessionItem[]>();
	for (const session of sessions) {
		const label = getSessionGroup(session.updatedAt);
		groups.set(label, [...(groups.get(label) ?? []), session]);
	}
	return [...groups].map(([label, items]) => ({ label, items }));
}

function getSessionGroup(updatedAt: number): string {
	const date = new Date(updatedAt);
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const sessionDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	const daysAgo = Math.round((today.getTime() - sessionDay.getTime()) / 86_400_000);
	if (daysAgo <= 0) return 'Today';
	if (daysAgo === 1) return 'Yesterday';
	if (daysAgo <= 3) return 'Previous 3 days';
	if (daysAgo <= 7) return 'Previous 7 days';
	return 'Older';
}