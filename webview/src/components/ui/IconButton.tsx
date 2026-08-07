import type { ComponentPropsWithRef, ReactNode } from 'react';

export enum IconButtonVariant {
	Default = 'default',
	Ghost = 'ghost',
}

export enum IconButtonSize {
	Small = 'small',
	Medium = 'medium',
	Large = 'large',
}

type IconButtonProps = Omit<ComponentPropsWithRef<'button'>, 'aria-label' | 'children'> & {
	label: string;
	icon: ReactNode;
	size?: IconButtonSize;
	variant?: IconButtonVariant;
};

const sizeClasses: Record<IconButtonVariant, Record<IconButtonSize, string>> = {
	[IconButtonVariant.Default]: {
		[IconButtonSize.Small]: 'size-7',
		[IconButtonSize.Medium]: 'size-8',
		[IconButtonSize.Large]: 'size-9',
	},
	[IconButtonVariant.Ghost]: {
		[IconButtonSize.Small]: 'size-6',
		[IconButtonSize.Medium]: 'size-7',
		[IconButtonSize.Large]: 'size-8',
	},
};

const variantClasses: Record<IconButtonVariant, string> = {
	[IconButtonVariant.Default]: 'hover:bg-toolbar-hover hover:text-foreground',
	[IconButtonVariant.Ghost]: 'opacity-70 transition-opacity duration-75 enabled:hover:opacity-100',
};

export function IconButton({ label, icon, size = IconButtonSize.Small, variant = IconButtonVariant.Default, className = '', title = label, type = 'button', ...props }: IconButtonProps) {
	return (
		<button
			className={`${sizeClasses[variant][size]} ${variantClasses[variant]} grid place-items-center rounded border-0 bg-transparent p-0 text-icon disabled:cursor-default disabled:opacity-50 focus-visible:outline focus-visible:-outline-offset-1 focus-visible:outline-focus ${className}`}
			type={type}
			title={title}
			aria-label={label}
			{...props}
		>
			{icon}
		</button>
	);
}