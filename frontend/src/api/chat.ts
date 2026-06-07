// 通用 AI 对话 SSE API，复用 agents.ts 的 startSSE 工厂
import { startSSE } from './agents';

type SSEEventHandler = (event: string, data: any) => void;

export function startChatStream(
  message: string,
  onEvent: SSEEventHandler,
  conversationId?: number | null,
  files?: File[]
): AbortController {
  // 有文件时使用 FormData，浏览器自动设置 Content-Type 含 boundary
  if (files && files.length > 0) {
    const formData = new FormData();
    formData.append('message', message);
    if (conversationId) formData.append('conversationId', String(conversationId));
    files.forEach((f) => formData.append('files', f));
    return startSSE('/api/chat', formData, onEvent);
  }

  // 无文件时沿用 JSON 格式
  const body: Record<string, any> = { message };
  if (conversationId) body.conversationId = conversationId;
  return startSSE('/api/chat', JSON.stringify(body), onEvent);
}
