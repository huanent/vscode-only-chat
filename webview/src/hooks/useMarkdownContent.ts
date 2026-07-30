import { useEffect, useMemo, useRef } from 'react';
import { renderMarkdown } from '../lib/markdown';

export function useMarkdownContent(text: string) {
	const html = useMemo(() => renderMarkdown(text), [text]);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const elements = Array.from(containerRef.current?.querySelectorAll<HTMLElement>('pre, .katex-display') ?? []);
		const updateOverflow = (element: HTMLElement) => {
			const maxScrollLeft = element.scrollWidth - element.clientWidth;
			element.dataset.overflowLeft = String(element.scrollLeft > 1);
			element.dataset.overflowRight = String(maxScrollLeft - element.scrollLeft > 1);
		};
		const resizeObserver = new ResizeObserver(entries => entries.forEach(entry => updateOverflow(entry.target as HTMLElement)));
		const cleanups = elements.map(element => {
			const update = () => updateOverflow(element);
			update();
			element.addEventListener('scroll', update, { passive: true });
			resizeObserver.observe(element);
			return () => element.removeEventListener('scroll', update);
		});

		return () => {
			cleanups.forEach(cleanup => cleanup());
			resizeObserver.disconnect();
		};
	}, [html]);

	return { html, containerRef };
}