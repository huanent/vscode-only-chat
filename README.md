# Only Chat

A focused AI chat editor for VS Code, powered by the Language Model API.

## Features

- Use any language model available in VS Code and switch models per request.
- Stream responses with support for Markdown, syntax highlighting, tables, and math.
- Create, switch, and delete conversations stored in VS Code local state.
- Open multiple chat tabs and continue from shared conversation history.
- Copy responses, edit an earlier message, regenerate the following conversation, or stop an active request.
- Configure a custom conversation prompt from VS Code settings.

## Getting Started

1. Install and sign in to a VS Code extension that provides language models, such as GitHub Copilot.
2. Run **Only Chat: Open Chat** from the Command Palette or use the shortcut below.
3. Select a model, enter a message, and press `Enter`. Use `Shift+Enter` for a new line.

VS Code may request permission to access language models when you send the first message.

## Shortcuts

| Action | macOS | Windows / Linux |
| --- | --- | --- |
| Open Only Chat | `Cmd+Alt+I` | `Ctrl+Alt+I` |
| New conversation | `Cmd+N` | `Ctrl+N` |
| New chat tab | `Cmd+T` | `Ctrl+T` |

## Settings

- `onlyChat.prompt`: instructions added to every conversation.

## Development

```bash
npm install
npm run compile
npm test
```
