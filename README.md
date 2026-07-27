# Temporary Chat

Temporary Chat 为 VS Code 提供一个随开随用的 AI 对话面板。对话记录会保存在扩展本地状态中，关闭面板后可以继续。

## 功能

- 使用 `Cmd+Alt+I`（macOS）或 `Ctrl+Alt+I`（Windows/Linux）快速打开聊天面板。
- 通过 VS Code Language Model API 使用当前环境中可用的 AI 模型。
- 在输入框下方选择本次请求使用的语言模型，可用模型变化时会自动刷新。
- 支持新建、切换和删除多个历史对话，重新打开面板后恢复消息和上下文。
- 流式显示模型回复，并支持停止生成、清空当前对话。
- 通过顶部设置按钮打开 VS Code 设置并配置提示词。

## 使用

1. 确保 VS Code 中已安装、登录并授权一个提供语言模型的扩展，例如 GitHub Copilot。
2. 按下快捷键，或从命令面板运行 `Temporary Chat: 打开临时 AI 对话`。
3. 在输入框下方选择要使用的语言模型。
4. 输入消息后按 `Enter` 发送，使用 `Shift+Enter` 换行。
5. 使用顶部历史和新建按钮管理多个对话，设置按钮可配置提示词。

首次发起请求时，VS Code 可能会询问是否允许本扩展访问语言模型。

## 设置

- `temporaryChat.prompt`：新建临时对话时使用的默认提示词。

## 开发

```bash
npm install
npm run compile
npm test
```
