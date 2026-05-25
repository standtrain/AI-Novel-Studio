// SSE 流式请求，返回 AbortController 以便取消
// onEvent 回调接收 (eventType, data) => void

type SSEEventHandler = (event: string, data: any) => void;

// 统一错误处理：区分 429 额度超限和其他错误
function handleFetchError(response: Response, onEvent: SSEEventHandler) {
  response.json().then((err) => {
    if (response.status === 429 || err.code === 'TOKEN_QUOTA_EXCEEDED') {
      onEvent('error', {
        message: err.error || '每日 Token 额度已耗尽，请明天再试或升级账号',
        code: 'TOKEN_QUOTA_EXCEEDED',
      });
    } else {
      onEvent('error', err);
    }
  }).catch(() => onEvent('error', { message: '请求失败' }));
}

// 活跃流计数器，用于页面离开时提醒用户
let _activeStreamCount = 0;

function _addActiveStream() {
  if (_activeStreamCount === 0) {
    window.addEventListener('beforeunload', _beforeUnloadHandler);
  }
  _activeStreamCount++;
}

function _removeActiveStream() {
  _activeStreamCount = Math.max(0, _activeStreamCount - 1);
  if (_activeStreamCount === 0) {
    window.removeEventListener('beforeunload', _beforeUnloadHandler);
  }
}

function _beforeUnloadHandler(e: BeforeUnloadEvent) {
  e.preventDefault();
  // 现代浏览器会显示通用提示，自定义消息通常不生效
  e.returnValue = '';
}

function parseSSELine(line: string): { event?: string; data?: string } | null {
  if (!line || line.startsWith(':')) return null; // 忽略注释和空行
  if (line.startsWith('event: ')) {
    return { event: line.substring(7).trim() };
  }
  if (line.startsWith('data: ')) {
    return { data: line.substring(6).trim() };
  }
  return null;
}

async function readSSEStream(response: Response, onEvent: SSEEventHandler): Promise<void> {
  if (!response.body) {
    throw new Error('浏览器不支持 ReadableStream');
  }
  _addActiveStream();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 保留未完成的行

      for (const line of lines) {
        if (line === '') {
          // 空行表示一个事件结束（SSE 标准）
          // 此处不触发额外回调，因为 event 前面的 data 已经触发
          currentEvent = '';
          continue;
        }
        const parsed = parseSSELine(line);
        if (parsed) {
          if (parsed.event !== undefined) {
            currentEvent = parsed.event;
          }
          if (parsed.data !== undefined) {
            try {
              const jsonData = JSON.parse(parsed.data);
              onEvent(currentEvent || 'message', jsonData);
            } catch {
              onEvent(currentEvent || 'message', parsed.data);
            }
            currentEvent = '';
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
    _removeActiveStream();
  }
}

// 通用 SSE 请求工厂，消除 6 个方法中的重复代码
function startSSE(
  url: string,
  body: string,
  onEvent: SSEEventHandler
): AbortController {
  const controller = new AbortController();
  const token = localStorage.getItem('token');

  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body,
    signal: controller.signal,
  }).then((response) => {
    if (!response.ok) {
      handleFetchError(response, onEvent);
      return;
    }
    readSSEStream(response, onEvent);
  }).catch((err) => {
    if (err.name !== 'AbortError') {
      onEvent('error', { message: err.message });
    }
  });

  return controller;
}

export function startOutlineStream(
  novelId: number,
  userInput: string,
  onEvent: SSEEventHandler
): AbortController {
  return startSSE(
    `/api/novels/${novelId}/outline`,
    JSON.stringify({ userInput }),
    onEvent
  );
}

export function startCharactersStream(
  novelId: number,
  onEvent: SSEEventHandler
): AbortController {
  return startSSE(`/api/novels/${novelId}/characters`, '{}', onEvent);
}

export function startChapterOutlinesStream(
  novelId: number,
  onEvent: SSEEventHandler,
  startChapter?: number,
  autoMode?: boolean
): AbortController {
  const params = new URLSearchParams();
  if (startChapter) params.set('startChapter', String(startChapter));
  if (autoMode) params.set('auto', 'true');
  const qs = params.toString();
  const url = qs ? `/api/novels/${novelId}/chapters-outline?${qs}` : `/api/novels/${novelId}/chapters-outline`;
  return startSSE(url, '{}', onEvent);
}

export function startReviewStream(
  novelId: number,
  chapterNumber: number,
  onEvent: SSEEventHandler
): AbortController {
  return startSSE(`/api/novels/${novelId}/chapters/${chapterNumber}/review`, '{}', onEvent);
}

export function startExtractStream(
  novelId: number,
  chapterNumber: number,
  onEvent: SSEEventHandler
): AbortController {
  return startSSE(`/api/novels/${novelId}/chapters/${chapterNumber}/extract`, '{}', onEvent);
}

export function startWriteChapterStream(
  novelId: number,
  chapterNumber: number,
  onEvent: SSEEventHandler,
  autoMode?: boolean
): AbortController {
  const url = autoMode
    ? `/api/novels/${novelId}/chapters/${chapterNumber}/write?auto=true`
    : `/api/novels/${novelId}/chapters/${chapterNumber}/write`;
  return startSSE(url, '{}', onEvent);
}
