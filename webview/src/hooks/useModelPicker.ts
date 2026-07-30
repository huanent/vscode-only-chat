import { useEffect, useRef, useState } from 'react';

export function useModelPicker(disabled: boolean) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const close = (event: MouseEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
		};
		document.addEventListener('mousedown', close);
		return () => document.removeEventListener('mousedown', close);
	}, []);

	useEffect(() => {
		if (disabled) setOpen(false);
	}, [disabled]);

	return { open, setOpen, rootRef };
}