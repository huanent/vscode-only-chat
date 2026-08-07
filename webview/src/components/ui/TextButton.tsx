import type { ComponentPropsWithRef } from 'react';

type TextButtonProps = ComponentPropsWithRef<'button'>;

export function TextButton({ className = '', type = 'button', ...props }: TextButtonProps) {
	return (
		<button
			className={`rounded border-0 bg-transparent disabled:cursor-default disabled:opacity-50 focus-visible:outline focus-visible:-outline-offset-1 focus-visible:outline-focus ${className}`}
			type={type}
			{...props}
		/>
	);
}