import type { ReactNode } from 'react';

type EmptyStateProps = {
	icon: ReactNode;
	title: ReactNode;
	titleAs?: 'h1' | 'strong';
	description?: ReactNode;
	className?: string;
	titleClassName?: string;
	descriptionClassName?: string;
};

export function EmptyState({ icon, title, titleAs: Title = 'strong', description, className = '', titleClassName = '', descriptionClassName = '' }: EmptyStateProps) {
	return (
		<div className={`grid place-content-center justify-items-center text-center ${className}`}>
			{icon}
			<Title className={titleClassName}>{title}</Title>
			{description !== undefined && <span className={descriptionClassName}>{description}</span>}
		</div>
	);
}