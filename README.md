# Only Chat

Only Chat provides a focused AI chat panel for VS Code. Conversations are saved in the extension's local state and remain available after the panel is closed.

## Features

- Open the chat panel with `Cmd+Alt+I` on macOS or `Ctrl+Alt+I` on Windows and Linux.
- Use AI models available through the VS Code Language Model API.
- Select a language model below the message input. The list refreshes automatically when available models change.
- Create, switch between, and delete multiple conversations. Messages and context are restored when the panel is reopened.
- Stream model responses and stop generation at any time.
- Open VS Code settings from the panel to configure the default prompt.

## Usage

1. Install, sign in to, and authorize an extension that provides a language model, such as GitHub Copilot.
2. Use the keyboard shortcut or run `Only Chat: Open Chat` from the Command Palette.
3. Select the language model to use below the message input.
4. Type a message and press `Enter` to send it. Use `Shift+Enter` to insert a new line.
5. Use the history and new conversation buttons to manage conversations. Use the settings button to configure the prompt.

VS Code may ask for permission to access language models when the first request is sent.

## Settings

- `onlyChat.prompt`: The prompt used for conversations.

## Development

```bash
npm install
npm run compile
npm test
```
