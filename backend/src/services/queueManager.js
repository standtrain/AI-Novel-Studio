/**
 * 队列管理器
 * 负责 AI SSE 任务的排队、优先级调度、等待老化和高优先级插队。
 */

const { createLogger } = require('../utils/logger');
const { db } = require('../config/database');

const logger = createLogger('queue');

// 优先级高于该值时，可以中断低优先级任务。
const FORCE_INTERRUPT_THRESHOLD = 90;
// 普通等待任务每等待 60 秒增加 1 点临时调度分，避免低优先级任务长期饥饿。
const AGING_INTERVAL_MS = 60 * 1000;
const MAX_AGING_BONUS = 30;
// AI 任务全局并发上限：默认 5；site_config.agent_max_concurrent_tasks = 0 表示不限制。
const DEFAULT_MAX_RUNNING_TASKS = 5;
const CONCURRENCY_CONFIG_KEY = 'agent_max_concurrent_tasks';
const CONCURRENCY_CONFIG_TTL_MS = 10 * 1000;
const RESERVATION_TIMEOUT_MS = 30 * 1000;
const QUEUE_POLL_INTERVAL_MS = 3000;
const QUEUE_NOTICE_INTERVAL_MS = 15000;
const DEFAULT_ESTIMATED_TASK_MS = 120 * 1000;

const STATUS = {
  WAITING: 'waiting',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  INTERRUPTED: 'interrupted',
};

const runningTasks = new Map();
const waitingQueue = [];
const reservedTasks = new Map();
let sequence = 0;
let processing = false;
let maxRunningTasks = DEFAULT_MAX_RUNNING_TASKS;
let maxRunningTasksLoadedAt = 0;
let maxRunningTasksLoading = null;
let queuePollTimer = null;

function buildTaskKey(userId, novelId, phase) {
  return `${userId}:${novelId || 0}:${phase}`;
}

function normalizePriority(value) {
  const priority = parseInt(value, 10);
  if (!Number.isFinite(priority)) return 10;
  return Math.max(1, Math.min(priority, 100));
}

function normalizeConcurrency(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_MAX_RUNNING_TASKS;
  return parsed;
}

async function refreshConcurrencyConfig(force = false) {
  const now = Date.now();
  if (!force && now - maxRunningTasksLoadedAt < CONCURRENCY_CONFIG_TTL_MS) {
    return maxRunningTasks;
  }
  if (maxRunningTasksLoading) return maxRunningTasksLoading;

  maxRunningTasksLoading = (async () => {
    try {
      const row = await db('site_config')
        .select('config_value')
        .where('config_key', CONCURRENCY_CONFIG_KEY)
        .first();
      maxRunningTasks = normalizeConcurrency(row?.config_value);
      maxRunningTasksLoadedAt = Date.now();
    } catch (err) {
      logger.warn(`读取 AI 任务并发配置失败: ${err.message}`);
      maxRunningTasksLoadedAt = Date.now();
    } finally {
      maxRunningTasksLoading = null;
    }
    return maxRunningTasks;
  })();

  return maxRunningTasksLoading;
}

function getMaxRunningTasks() {
  refreshConcurrencyConfig().catch(() => {});
  return maxRunningTasks;
}

function getAgingBonus(task, now = Date.now()) {
  return Math.min(MAX_AGING_BONUS, Math.floor((now - task.createdAt) / AGING_INTERVAL_MS));
}

function getEffectivePriority(task, now = Date.now()) {
  return task.groupPriority + getAgingBonus(task, now);
}

function compareTasks(a, b, now = Date.now()) {
  const effectiveDiff = getEffectivePriority(b, now) - getEffectivePriority(a, now);
  if (effectiveDiff !== 0) return effectiveDiff;
  const priorityDiff = b.groupPriority - a.groupPriority;
  if (priorityDiff !== 0) return priorityDiff;
  const timeDiff = a.createdAt - b.createdAt;
  if (timeDiff !== 0) return timeDiff;
  return a.sequence - b.sequence;
}

function sortWaitingQueue() {
  const now = Date.now();
  waitingQueue.sort((a, b) => compareTasks(a, b, now));
}

function sendSSE(res, event, data) {
  if (!res || res.writableEnded) return;
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch { /* 客户端已断开 */ }
}

function getQueuePosition(task) {
  sortWaitingQueue();
  return waitingQueue.findIndex((item) => item.id === task.id) + 1;
}

function formatEstimatedWait(ms) {
  const seconds = Math.max(1, Math.ceil((ms || 0) / 1000));
  if (seconds < 60) return `约 ${seconds} 秒`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `约 ${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes > 0 ? `约 ${hours} 小时 ${restMinutes} 分钟` : `约 ${hours} 小时`;
}

function estimateWaitMs(position) {
  return Math.max(1, position || 1) * DEFAULT_ESTIMATED_TASK_MS;
}

function buildQueuePayload(task, status, extra = {}) {
  const position = status === 'waiting' ? Math.max(1, getQueuePosition(task)) : 0;
  const estimatedWaitMs = status === 'waiting' ? estimateWaitMs(position) : 0;
  const capacity = extra.capacity || task.capacitySnapshot || {};
  return {
    status,
    position,
    priority: task.groupPriority,
    queueLength: waitingQueue.length,
    waitingCount: waitingQueue.length,
    runningCount: runningTasks.size,
    reservedCount: reservedTasks.size,
    maxRunningTasks: getMaxRunningTasks(),
    estimatedWaitMs,
    estimatedWaitText: status === 'waiting' ? formatEstimatedWait(estimatedWaitMs) : '即将开始',
    reason: extra.reason || task.queueReason || null,
    reasonText: extra.reasonText || task.queueReasonText || '',
    selectedMode: extra.selectedMode || task.selectedMode || 'default',
    providerName: extra.providerName || task.providerName || null,
    modelName: extra.modelName || task.modelName || null,
    providerInflight: capacity.inflight,
    providerMaxConcurrency: capacity.maxConcurrency,
    providerUnlimited: capacity.unlimited,
    waitedMs: Date.now() - task.createdAt,
    message: extra.message || '',
  };
}

function sendQueueNotice(task, status, extra = {}) {
  sendSSE(task.res, 'queue', buildQueuePayload(task, status, extra));
}

function sendQueueNoticeTo(res, task, status, extra = {}) {
  sendSSE(res, 'queue', buildQueuePayload(task, status, extra));
}

async function getUserGroupPriority(userId) {
  try {
    const user = await db('users')
      .join('user_groups', 'users.group_id', 'user_groups.id')
      .select('user_groups.queue_priority')
      .where('users.id', userId)
      .first();
    return normalizePriority(user?.queue_priority ?? 10);
  } catch (err) {
    logger.warn(`获取用户优先级失败 userId=${userId}: ${err.message}`);
    return 10;
  }
}

function findQueuedTask(userId, novelId, phase) {
  cleanupStaleQueuedTasks();
  const key = buildTaskKey(userId, novelId, phase);
  return reservedTasks.get(key) || waitingQueue.find((task) => task.key === key && !task.cancelled);
}

function removeFromQueue(userId, novelId, phase, reason = '任务已取消') {
  cleanupStaleQueuedTasks();
  const key = buildTaskKey(userId, novelId, phase);
  const index = waitingQueue.findIndex((task) => task.key === key);
  if (index === -1) {
    const reserved = reservedTasks.get(key);
    if (!reserved) return null;
    reservedTasks.delete(key);
    cancelQueuedTask(reserved, reason);
    processQueue();
    return reserved;
  }

  const task = waitingQueue.splice(index, 1)[0];
  cancelQueuedTask(task, reason);
  return task;
}

function isResponseClosed(res) {
  return !res || res.writableEnded || res.destroyed || res.closed;
}

function cancelQueuedTask(task, reason = '任务已取消') {
  if (!task || task.cancelled) return;
  task.cancelled = true;
  updateQueueTaskStatus(task.id, STATUS.CANCELLED, { interrupted_reason: reason });
  if (task.reject) task.reject({ status: STATUS.CANCELLED, message: reason });
}

function cleanupStaleQueuedTasks(now = Date.now()) {
  let removed = 0;
  for (let i = waitingQueue.length - 1; i >= 0; i--) {
    const task = waitingQueue[i];
    if (task.cancelled || isResponseClosed(task.res)) {
      waitingQueue.splice(i, 1);
      cancelQueuedTask(task, '客户端连接已断开，排队任务已取消');
      removed++;
    }
  }

  for (const [key, task] of reservedTasks) {
    const reservationExpired = task.reservedAt && (now - task.reservedAt > RESERVATION_TIMEOUT_MS);
    if (task.cancelled || isResponseClosed(task.res) || reservationExpired) {
      reservedTasks.delete(key);
      cancelQueuedTask(
        task,
        reservationExpired ? '任务获取执行权后未及时启动，已释放队列槽位' : '客户端连接已断开，排队任务已取消'
      );
      removed++;
    }
  }

  if (removed > 0) {
    logger.info(`清理失效队列任务 ${removed} 个`);
  }
  return removed;
}

function findLowestPriorityRunningTask() {
  let lowest = null;
  for (const [key, task] of runningTasks) {
    if (!lowest || task.groupPriority < lowest.groupPriority) {
      lowest = { key, ...task };
    }
  }
  return lowest;
}

async function interruptTask(taskKey, reason) {
  const task = runningTasks.get(taskKey);
  if (!task) return false;

  logger.info(`中断任务 ${taskKey}，原因：${reason}`);
  if (task.abortController) task.abortController.abort();
  sendSSE(task.res, 'error', { message: '任务被更高优先级请求中断，请稍后重试' });
  runningTasks.delete(taskKey);

  await updateQueueTaskStatus(task.taskId, STATUS.INTERRUPTED, { interrupted_reason: reason });
  processQueue();
  return true;
}

async function forceInterruptForHighPriority(userId, userPriority) {
  const priority = normalizePriority(userPriority);
  if (priority <= FORCE_INTERRUPT_THRESHOLD) return false;

  const lowest = findLowestPriorityRunningTask();
  if (!lowest || lowest.groupPriority >= priority) return false;

  return interruptTask(lowest.key, `被高优先级用户 ${userId} 插队中断`);
}

function hasCapacity() {
  cleanupStaleQueuedTasks();
  const limit = getMaxRunningTasks();
  return limit === 0 || runningTasks.size + reservedTasks.size < limit;
}

async function hasExecutionCapacity(task) {
  if (!hasCapacity()) {
    return {
      canRun: false,
      reason: 'global_concurrency_full',
      reasonText: '当前全局 AI 任务并发已满',
    };
  }
  if (!task?.capacityChecker) {
    return { canRun: true, reason: 'available' };
  }
  try {
    const result = await task.capacityChecker();
    return result || { canRun: true, reason: 'available' };
  } catch (err) {
    logger.warn(`检查 API 容量失败，允许进入执行阶段兜底重试: ${err.message}`);
    return { canRun: true, reason: 'capacity_check_failed' };
  }
}

function applyCapacityMeta(task, capacityStatus = {}) {
  task.queueReason = capacityStatus.reason || task.queueReason || null;
  task.queueReasonText = capacityStatus.reasonText || task.queueReasonText || '';
  task.selectedMode = capacityStatus.selectedMode || task.selectedMode || 'default';
  task.providerName = capacityStatus.providerName || task.providerName || null;
  task.modelName = capacityStatus.modelName || task.modelName || null;
  task.capacitySnapshot = capacityStatus.capacity || task.capacitySnapshot || null;
}

async function checkNeedWait(capacityChecker = null) {
  const task = { capacityChecker };
  const capacity = await hasExecutionCapacity(task);
  return !capacity.canRun;
}

async function getNextExecutableTask() {
  if (waitingQueue.length === 0) return null;
  sortWaitingQueue();
  for (let i = 0; i < waitingQueue.length; i++) {
    const task = waitingQueue[i];
    if (task.cancelled) continue;
    const capacityStatus = await hasExecutionCapacity(task);
    applyCapacityMeta(task, capacityStatus);
    if (!capacityStatus.canRun) {
      const now = Date.now();
      if (!task.lastNoticeAt || now - task.lastNoticeAt >= QUEUE_NOTICE_INTERVAL_MS) {
        task.lastNoticeAt = now;
        sendQueueNotice(task, 'waiting', {
          ...capacityStatus,
          message: capacityStatus.reasonText || '正在等待可用 API 接口',
        });
      }
      continue;
    }
    return waitingQueue.splice(i, 1)[0];
  }
  return null;
}

async function enqueue(userId, novelId, phase, groupPriority, res, options = {}) {
  await refreshConcurrencyConfig();
  const priority = normalizePriority(groupPriority);
  const existing = findQueuedTask(userId, novelId, phase);
  if (existing) {
    sendQueueNoticeTo(res, existing, 'waiting', {
      message: '相同任务已在队列中，请等待执行',
    });
    throw { status: 409, message: '相同任务已在队列中，请等待执行' };
  }

  const taskId = await createQueueTask(userId, novelId, phase, priority);
  const task = {
    id: taskId,
    key: buildTaskKey(userId, novelId, phase),
    userId,
    novelId: novelId || 0,
    phase,
    groupPriority: priority,
    createdAt: Date.now(),
    sequence: ++sequence,
    res,
    cancelled: false,
    capacityChecker: options.capacityChecker || null,
  };

  const waitPromise = new Promise((resolve, reject) => {
    task.resolve = resolve;
    task.reject = reject;
  });

  if (priority > FORCE_INTERRUPT_THRESHOLD) {
    await forceInterruptForHighPriority(userId, priority);
  }

  const capacityStatus = await hasExecutionCapacity(task);
  applyCapacityMeta(task, capacityStatus);

  if (capacityStatus.canRun) {
    task.reservedAt = Date.now();
    reservedTasks.set(task.key, task);
    logger.info(`任务直接执行: id=${taskId}, userId=${userId}, novelId=${novelId || 0}, phase=${phase}, priority=${priority}`);
    task.resolve(task);
    return waitPromise;
  }

  waitingQueue.push(task);
  sortWaitingQueue();

  task.lastNoticeAt = Date.now();
  sendQueueNotice(task, 'waiting', {
    ...capacityStatus,
    message: capacityStatus.reasonText || '当前接口繁忙，已加入等待队列',
  });

  logger.info(`任务入队: id=${taskId}, userId=${userId}, novelId=${novelId || 0}, phase=${phase}, priority=${priority}`);
  processQueue();
  ensureQueuePolling();

  return waitPromise;
}

async function processQueue() {
  await refreshConcurrencyConfig();
  if (processing) return;
  processing = true;

  try {
    while (hasCapacity()) {
      const next = await getNextExecutableTask();
      if (!next) break;
      if (next.cancelled) continue;

      logger.info(`队列任务开始执行: id=${next.id}, userId=${next.userId}, phase=${next.phase}, priority=${next.groupPriority}`);
      sendQueueNotice(next, 'running', {
        reason: 'available',
        message: '排队结束，开始执行任务',
      });
      next.reservedAt = Date.now();
      reservedTasks.set(next.key, next);
      next.resolve(next);
    }
  } finally {
    processing = false;
    ensureQueuePolling();
  }
}

function ensureQueuePolling() {
  cleanupStaleQueuedTasks();
  if (waitingQueue.length === 0) {
    if (queuePollTimer) {
      clearTimeout(queuePollTimer);
      queuePollTimer = null;
    }
    return;
  }
  if (queuePollTimer) return;
  queuePollTimer = setTimeout(() => {
    queuePollTimer = null;
    processQueue().catch((err) => logger.warn(`队列轮询失败: ${err.message}`));
  }, QUEUE_POLL_INTERVAL_MS);
}

function registerRunning(userId, novelId, phase, abortController, res, groupPriority, taskId = null) {
  const key = buildTaskKey(userId, novelId, phase);
  const priority = normalizePriority(groupPriority);

  runningTasks.set(key, {
    taskId,
    abortController,
    res,
    userId,
    groupPriority: priority,
    phase,
    novelId: novelId || 0,
    startTime: Date.now(),
  });
  reservedTasks.delete(key);

  logger.info(`注册运行任务: ${key}, queueTaskId=${taskId || '-'}, priority=${priority}`);
  updateQueueTaskStatus(taskId, STATUS.RUNNING);
}

function unregisterRunning(userId, novelId, phase, status = STATUS.COMPLETED) {
  const key = buildTaskKey(userId, novelId, phase);
  const task = runningTasks.get(key);
  runningTasks.delete(key);
  reservedTasks.delete(key);
  updateQueueTaskStatus(task?.taskId, status);
  logger.info(`结束运行任务: ${key}, status=${status}`);
  processQueue();
}

function cancelWaitingByResponse(res, reason = '客户端断开连接，排队任务已取消') {
  const index = waitingQueue.findIndex((task) => task.res === res);
  if (index === -1) {
    for (const [key, task] of reservedTasks) {
      if (task.res === res) {
        reservedTasks.delete(key);
        cancelQueuedTask(task, reason);
        processQueue();
        return true;
      }
    }
    return false;
  }
  const task = waitingQueue.splice(index, 1)[0];
  reservedTasks.delete(task.key);
  cancelQueuedTask(task, reason);
  processQueue();
  return true;
}

function getQueueStatus() {
  cleanupStaleQueuedTasks();
  const now = Date.now();
  const limit = getMaxRunningTasks();
  const running = [];
  for (const [key, task] of runningTasks) {
    running.push({
      key,
      taskId: task.taskId,
      userId: task.userId,
      groupPriority: task.groupPriority,
      phase: task.phase,
      novelId: task.novelId,
      runningMs: now - task.startTime,
      startTime: new Date(task.startTime).toISOString(),
    });
  }

  sortWaitingQueue();
  return {
    maxRunningTasks: limit,
    unlimited: limit === 0,
    runningCount: runningTasks.size,
    runningTasks: running,
    waitingCount: waitingQueue.length,
    waitingTasks: waitingQueue.map((task, index) => ({
      taskId: task.id,
      position: index + 1,
      userId: task.userId,
      groupPriority: task.groupPriority,
      effectivePriority: getEffectivePriority(task, now),
      phase: task.phase,
      novelId: task.novelId,
      waitingMs: now - task.createdAt,
    })),
  };
}

async function createQueueTask(userId, novelId, phase, groupPriority) {
  try {
    const [id] = await db('queue_tasks').insert({
      user_id: userId,
      novel_id: novelId || 0,
      phase,
      user_group_priority: normalizePriority(groupPriority),
      status: STATUS.WAITING,
    });
    return id;
  } catch (err) {
    logger.warn(`创建队列任务记录失败: ${err.message}`);
    return null;
  }
}

async function updateQueueTaskStatus(taskId, status, extra = {}) {
  if (!taskId) return;
  try {
    await db('queue_tasks')
      .where('id', taskId)
      .update({ status, updated_at: db.fn.now(), ...extra });
  } catch (err) {
    logger.warn(`更新队列任务状态失败: ${err.message}`);
  }
}

module.exports = {
  getUserGroupPriority,
  checkNeedWait,
  enqueue,
  registerRunning,
  unregisterRunning,
  cancelWaitingByResponse,
  removeFromQueue,
  getQueueStatus,
  forceInterruptForHighPriority,
  refreshConcurrencyConfig,
  createQueueTask,
  updateQueueTaskStatus,
  STATUS,
  FORCE_INTERRUPT_THRESHOLD,
  DEFAULT_MAX_RUNNING_TASKS,
};
