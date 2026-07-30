interface VsCodeApi<State = unknown> {
	postMessage(message: unknown): void;
	getState(): State | undefined;
	setState(state: State): void;
}

declare function acquireVsCodeApi<State = unknown>(): VsCodeApi<State>;

declare module '*.css';
declare module 'markdown-it-texmath';
declare module 'prismjs/components/prism-bash';
declare module 'prismjs/components/prism-c';
declare module 'prismjs/components/prism-cpp';
declare module 'prismjs/components/prism-csharp';
declare module 'prismjs/components/prism-go';
declare module 'prismjs/components/prism-java';
declare module 'prismjs/components/prism-jsx';
declare module 'prismjs/components/prism-markdown';
declare module 'prismjs/components/prism-python';
declare module 'prismjs/components/prism-rust';
declare module 'prismjs/components/prism-sql';
declare module 'prismjs/components/prism-tsx';
declare module 'prismjs/components/prism-typescript';
declare module 'prismjs/components/prism-yaml';