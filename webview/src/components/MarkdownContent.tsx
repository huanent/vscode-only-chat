import { useMemo } from 'react';
import { renderMarkdown } from '../lib/markdown';

type MarkdownContentProps = {
	text: string;
	className?: string;
};

export function MarkdownContent({ text, className = '' }: MarkdownContentProps) {
	const html = useMemo(() => renderMarkdown(text), [text]);
	return <div className={`markdown-content min-w-0 max-w-full leading-[1.6] wrap-anywhere ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}