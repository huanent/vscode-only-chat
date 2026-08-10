import { useMarkdownContent } from '../hooks/useMarkdownContent';
import 'katex/dist/katex.min.css';
import 'markdown-it-texmath/css/texmath.css';

type MarkdownContentProps = {
	text: string;
	className?: string;
};

export function MarkdownContent({ text, className = '' }: MarkdownContentProps) {
	const { html, containerRef } = useMarkdownContent(text);

	return <div ref={containerRef} className={`markdown-content min-w-0 max-w-full leading-[1.6] wrap-anywhere ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}