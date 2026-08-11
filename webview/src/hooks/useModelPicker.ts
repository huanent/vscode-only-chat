import { useEffect, useRef, useState } from 'react';

export function useModelPicker(disabled: boolean) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const close = (event: MouseEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
		};
		const closeOnBlur = () => setOpen(false);
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setOpen(false);
		};
		document.addEventListener('mousedown', close);
		document.addEventListener('keydown', closeOnEscape);
		window.addEventListener('blur', closeOnBlur);
		return () => {
			document.removeEventListener('mousedown', close);
			document.removeEventListener('keydown', closeOnEscape);
			window.removeEventListener('blur', closeOnBlur);
		};
	}, []);

	useEffect(() => {
		if (disabled) setOpen(false);
	}, [disabled]);

	return { open, setOpen, rootRef };
}