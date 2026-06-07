// 通用 AI 对话 SSE API，复用 agents.ts 的 startSSE 工厂
import { startSSE } from './agents';

type SSEEventHandler = (event: string, data: any) => void;

export function startChatStream(
  message: string,
  onEvent: SSEEventHandler,
  conversationId?: number | null
): AbortController {
  const body: Record<string, any> = { message };
  if (conversationId) body.conversationId = conversationId;
  return startSSE('/api/chat', JSON.stringify(body), onEvent);
}
