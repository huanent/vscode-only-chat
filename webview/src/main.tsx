import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '@vscode/codicons/dist/codicon.css';
import './styles.css';

const root = document.getElementById('root');
if (!root) {
	throw new Error('The Only Chat root element is missing.');
}

createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>,
);