import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import type { StoredMessage } from '../types';

export function useMessageNavigation(messages: StoredMessage[]) {
	const containerRef = useRef<HTMLElement>(null);
	const messageRefs = useRef<Array<HTMLElement | null>>([]);
	const previousMessageCountRef = useRef(0);
	const followLatestRef = useRef(true);
	const [scrollOverflow, setScrollOverflow] = useState({ top: false, bottom: false });
	const [activeAnchorIndex, setActiveAnchorIndex] = useState(0);
	const anchorIndexes = messages.reduce<number[]>((indexes, message, index) => {
		if (message.role === 'user') indexes.push(index);
		return indexes;
	}, []);

	const updateNavigation = () => {
		const container = containerRef.current;
		if (!container) return;
		const remainingScroll = container.scrollHeight - container.clientHeight - container.scrollTop;
		const top = container.scrollTop > 1;
		const bottom = remainingScroll > 1;
		setScrollOverflow(current => current.top === top && current.bottom === bottom ? current : { top, bottom });

		if (!bottom && anchorIndexes.length > 0) {
			const lastAnchorIndex = anchorIndexes.at(-1)!;
			setActiveAnchorIndex(current => current === lastAnchorIndex ? current : lastAnchorIndex);
			return;
		}

		const activationLine = container.getBoundingClientRect().top + Math.min(container.clientHeight * .3, 160);
		let nextAnchorIndex = anchorIndexes[0] ?? 0;
		for (const index of anchorIndexes) {
			const messageTop = messageRefs.current[index]?.getBoundingClientRect().top;
			if (messageTop === undefined || messageTop > activationLine) break;
			nextAnchorIndex = index;
		}
		setActiveAnchorIndex(current => current === nextAnchorIndex ? current : nextAnchorIndex);
	};
	const updateNavigationEvent = useEffectEvent(updateNavigation);

	const handleScroll = () => {
		const container = containerRef.current;
		if (!container) return;
		const remainingScroll = container.scrollHeight - container.clientHeight - container.scrollTop;
		followLatestRef.current = remainingScroll <= 1;
		updateNavigation();
	};

	const scrollToMessage = (index: number) => {
		const container = containerRef.current;
		const message = messageRefs.current[index];
		if (!container || !message) return;
		const top = container.scrollTop + message.getBoundingClientRect().top - container.getBoundingClientRect().top - 16;
		container.scrollTo({ top, behavior: 'smooth' });
		setActiveAnchorIndex(index);
	};

	useLayoutEffect(() => {
		const container = containerRef.current;
		const messageAdded = messages.length !== previousMessageCountRef.current;
		if (container && (messageAdded || followLatestRef.current)) {
			container.scrollTo({ top: container.scrollHeight });
			followLatestRef.current = true;
		}
		previousMessageCountRef.current = messages.length;
		updateNavigation();
	}, [messages.length, messages.at(-1)?.content]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const resizeObserver = new ResizeObserver(updateNavigationEvent);
		resizeObserver.observe(container);
		return () => resizeObserver.disconnect();
	}, []);

	return {
		containerRef,
		messageRefs,
		anchorIndexes,
		activeAnchorIndex,
		scrollOverflow,
		handleScroll,
		scrollToMessage,
	};
}