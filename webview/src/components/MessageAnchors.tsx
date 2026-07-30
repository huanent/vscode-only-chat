import type { StoredMessage } from '../types';

type MessageAnchorsProps = {
	messages: StoredMessage[];
	indexes: number[];
	activeIndex: number;
	onSelect(index: number): void;
};

export function MessageAnchors({ messages, indexes, activeIndex, onSelect }: MessageAnchorsProps) {
	if (indexes.length <= 1) return null;

	return (
		<nav className="absolute top-1/2 -left-5 z-20 flex max-h-[calc(100%-56px)] w-4 -translate-y-1/2 flex-col items-center gap-0.5 overflow-y-auto py-1 scrollbar-none max-[620px]:-left-2.5 [&::-webkit-scrollbar]:hidden" aria-label="Message anchors">
			{indexes.map((messageIndex, anchorIndex) => {
				const message = messages[messageIndex];
				const active = messageIndex === activeIndex;
				const label = message.content.trim().replace(/\s+/g, ' ') || `Message ${anchorIndex + 1}`;
				return (
					<button
						className="group/anchor grid size-4 shrink-0 place-items-center border-0 bg-transparent p-0"
						key={messageIndex}
						title={label}
						aria-label={`Go to message ${anchorIndex + 1}: ${label}`}
						aria-current={active ? 'location' : undefined}
						onClick={() => onSelect(messageIndex)}
					>
						<span className={`block rounded-full transition-[width,height,background-color,opacity] duration-150 ${active ? 'h-3 w-1 bg-focus' : 'size-1 bg-muted opacity-45 group-hover/anchor:h-2 group-hover/anchor:w-1 group-hover/anchor:bg-foreground group-hover/anchor:opacity-80'}`} />
					</button>
				);
			})}
		</nav>
	);
}