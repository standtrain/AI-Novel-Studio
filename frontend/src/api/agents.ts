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
      onEvent('error', { message: err.error || err.message || '请求失败' });
    }
  }).catch(() => onEvent('error', { message: '请求失败' }));
}

// 活跃流计数器和控制器追踪，用于页面离开时提醒并中断
let _activeStreamCount = 0;
const _activeControllers = new Set<AbortController>();

function _addActiveStream(controller: AbortController) {
  if (_activeStreamCount === 0) {
    window.addEventListener('beforeunload', _beforeUnloadHandler);
  }
  _activeStreamCount++;
  _activeControllers.add(controller);
}

function _removeActiveStream(controller: AbortController) {
  _activeStreamCount = Math.max(0, _activeStreamCount - 1);
  _activeControllers.delete(controller);
  if (_activeStreamCount === 0) {
    window.removeEventListener('beforeunload', _beforeUnloadHandler);
  }
}

function _beforeUnloadHandler(e: BeforeUnloadEvent) {
  // 中断所有活跃的 SSE 请求
  _activeControllers.forEach(c => c.abort());
  _activeControllers.clear();
  e.preventDefault();
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

async function readSSEStream(response: Response, onEvent: SSEEventHandler, controller: AbortController): Promise<void> {
  if (!response.body) {
    throw new Error('浏览器不支持 ReadableStream');
  }
  _addActiveStream(controller);

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
    _removeActiveStream(controller);
  }
}

// 通用 SSE 请求工厂，消除 6 个方法中的重复代码
// 支持409错误自动重试（取消后重新发起请求时后端任务可能还未清理）
export function startSSE(
  url: string,
  body: string,
  onEvent: SSEEventHandler,
  contentType: string = 'application/json',
  maxRetries: number = 3,
  retryDelay: number = 500
): AbortController {
  const controller = new AbortController();
  const token = localStorage.getItem('token');
  let streamFinished = false;
  let retryCount = 0;

  // 主动 abort 时通知前端，避免 isStreaming 卡死
  // 但如果流已正常结束（done），不触发 abort 事件，避免自动链竞态
  controller.signal.addEventListener('abort', () => {
    if (!streamFinished) {
      onEvent('abort', {});
    }
  });

  function doFetch() {
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        Authorization: `Bearer ${token}`,
      },
      body,
      signal: controller.signal,
    }).then((response) => {
      if (!response.ok) {
        // 409冲突错误：任务正在进行中，自动重试
        if (response.status === 409 && retryCount < maxRetries) {
          retryCount++;
          setTimeout(doFetch, retryDelay);
          return;
        }
        handleFetchError(response, onEvent);
        return;
      }
      readSSEStream(response, onEvent, controller).finally(() => { streamFinished = true; });
    }).catch((err) => {
      if (err.name !== 'AbortError') {
        onEvent('error', { message: err.message });
      }
    });
  }

  doFetch();
  return controller;
}

export function startOutlineStream(
  novelId: number,
  userInput: string,
  onEvent: SSEEventHandler,
  background?: boolean
): AbortController {
  const url = background ? `/api/novels/${novelId}/outline?background=true` : `/api/novels/${novelId}/outline`;
  return startSSE(
    url,
    JSON.stringify({ userInput }),
    onEvent
  );
}

export function startCharactersStream(
  novelId: number,
  onEvent: SSEEventHandler,
  background?: boolean
): AbortController {
  const url = background ? `/api/novels/${novelId}/characters?background=true` : `/api/novels/${novelId}/characters`;
  return startSSE(url, '{}', onEvent);
}

export function startChapterOutlinesStream(
  novelId: number,
  onEvent: SSEEventHandler,
  startChapter?: number,
  autoMode?: boolean,
  background?: boolean
): AbortController {
  const params = new URLSearchParams();
  if (startChapter) params.set('startChapter', String(startChapter));
  if (autoMode) params.set('auto', 'true');
  if (background) params.set('background', 'true');
  const qs = params.toString();
  const url = qs ? `/api/novels/${novelId}/chapters-outline?${qs}` : `/api/novels/${novelId}/chapters-outline`;
  return startSSE(url, '{}', onEvent);
}

export function startReviewStream(
  novelId: number,
  chapterNumber: number,
  onEvent: SSEEventHandler,
  background?: boolean
): AbortController {
  const url = background ? `/api/novels/${novelId}/chapters/${chapterNumber}/review?background=true` : `/api/novels/${novelId}/chapters/${chapterNumber}/review`;
  return startSSE(url, '{}', onEvent);
}

export function startExtractStream(
  novelId: number,
  chapterNumber: number,
  onEvent: SSEEventHandler,
  background?: boolean
): AbortController {
  const url = background ? `/api/novels/${novelId}/chapters/${chapterNumber}/extract?background=true` : `/api/novels/${novelId}/chapters/${chapterNumber}/extract`;
  return startSSE(url, '{}', onEvent);
}

export function startWriteChapterStream(
  novelId: number,
  chapterNumber: number,
  onEvent: SSEEventHandler,
  autoMode?: boolean,
  background?: boolean
): AbortController {
  const params = new URLSearchParams();
  if (autoMode) params.set('auto', 'true');
  if (background) params.set('background', 'true');
  const qs = params.toString();
  const url = qs ? `/api/novels/${novelId}/chapters/${chapterNumber}/write?${qs}` : `/api/novels/${novelId}/chapters/${chapterNumber}/write`;
  return startSSE(url, '{}', onEvent);
}

// 智能导入分析：发送文本，AI 分析后 SSE 流式返回结果
export function startImportAnalysisStream(
  text: string,
  instructions: string,
  onEvent: SSEEventHandler
): AbortController {
  const isDocx = text.startsWith('[DOCX_BASE64]') || text.startsWith('[DOC_BASE64]');
  // 统一使用 JSON 格式发送，确保 instructions 不会丢失
  return startSSE(
    '/api/novels/import-analyze',
    JSON.stringify({ text, instructions: instructions?.trim() || undefined, isDocx: isDocx || undefined }),
    onEvent,
    'application/json'
  );
}

// 对话式创建：用户用自然语言描述需求，AI 通过搜索工具研究趋势后生成小说方案
export function startNovelPlanningStream(
  userInput: string,
  onEvent: SSEEventHandler
): AbortController {
  return startSSE(
    '/api/novels/plan',
    JSON.stringify({ userInput }),
    onEvent
  );
}

// 多轮对话修订：根据用户反馈修订已生成的小说方案
export function startNovelPlanReviseStream(
  novelId: number,
  feedback: string,
  onEvent: SSEEventHandler
): AbortController {
  return startSSE(
    `/api/novels/${novelId}/plan-revise`,
    JSON.stringify({ feedback }),
    onEvent
  );
}

