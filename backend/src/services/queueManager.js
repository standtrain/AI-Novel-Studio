/**
 * 队列管理器
 * 负责 API 请求的排队、优先级调度、强制插队
 *
 * 核心功能：
 * 1. 429 错误时自动加入排队队列
 * 2. 按优先级排序，高优先级先执行
 * 3. 高优先级用户（>90）可强制中断低优先级任务
 */

const { createLogger } = require('../utils/logger');
const { db } = require('../config/database');

const logger = createLogger('queue');

// 强制插队阈值：优先级 > FORCE_INTERRUPT_THRESHOLD 时可中断他人
const FORCE_INTERRUPT_THRESHOLD = 90;

// 任务状态
const STATUS = {
  WAITING: 'waiting',
  RUNNING: 'running',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  INTERRUPTED: 'interrupted',
};

// 正在运行的任务 Map
// key: `${userId}:${novelId}:${phase}`
// value: { abortController, userId, groupPriority, status, startTime }
const runningTasks = new Map();

// 等待队列（按优先级排序）
// [{ userId, novelId, phase, groupPriority, createdAt, resolve, reject }]
const waitingQueue = [];

/**
 * 发送 SSE 错误事件
 */
function sendSSEError(res, message) {
  if (res && !res.writableEnded) {
    res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
  }
}

/**
 * 获取用户分组优先级
 */
async function getUserGroupPriority(userId) {
  try {
    const user = await db('users')
      .join('user_groups', 'users.group_id', 'user_groups.id')
      .select('user_groups.queue_priority')
      .where('users.id', userId)
      .first();
    return user?.queue_priority ?? 10;
  } catch (err) {
    logger.warn(`获取用户优先级失败 userId=${userId}: ${err.message}`);
    return 10;
  }
}

/**
 * 从队列中移除指定任务
 */
function removeFromQueue(userId, novelId, phase) {
  const key = `${userId}:${novelId}:${phase}`;
  const index = waitingQueue.findIndex(t =>
    `${t.userId}:${t.novelId}:${t.phase}` === key
  );
  if (index !== -1) {
    const task = waitingQueue.splice(index, 1)[0];
    // 拒绝 pending 的 Promise
    if (task.reject) {
      task.reject({ message: '任务被取消' });
    }
    return task;
  }
  return null;
}

/**
 * 查找最低优先级的运行中任务
 */
function findLowestPriorityRunningTask() {
  if (runningTasks.size === 0) return null;

  let lowest = null;
  for (const [key, task] of runningTasks) {
    if (lowest === null || task.groupPriority < lowest.groupPriority) {
      lowest = { key, ...task };
    }
  }
  return lowest;
}

/**
 * 中断指定的运行中任务
 */
async function interruptTask(taskKey, reason) {
  const task = runningTasks.get(taskKey);
  if (!task) return false;

  logger.info(`中断任务 ${taskKey}，原因: ${reason}`);

  // 调用 AbortController 中断 SSE 响应
  if (task.abortController) {
    task.abortController.abort();
  }

  // 通知被中断的客户端
  if (task.res) {
    sendSSEError(task.res, '网络错误，请稍后重试');
  }

  // 从运行中移除
  runningTasks.delete(taskKey);

  // 更新数据库状态
  try {
    await db('queue_tasks')
      .where({ user_id: task.userId, novel_id: task.novelId, phase: task.phase, status: STATUS.RUNNING })
      .update({ status: STATUS.INTERRUPTED, interrupted_reason: reason });
  } catch (err) {
    logger.warn(`更新任务状态失败: ${err.message}`);
  }

  return true;
}

/**
 * 强制插队：高优先级用户中断低优先级任务
 */
async function forceInterruptForHighPriority(userId, userPriority) {
  if (userPriority <= FORCE_INTERRUPT_THRESHOLD) {
    return false;
  }

  // 找到最低优先级的运行中任务
  const lowest = findLowestPriorityRunningTask();
  if (!lowest || lowest.groupPriority >= userPriority) {
    return false;
  }

  // 中断该任务
  return await interruptTask(lowest.key, `被高优先级用户(${userId})强制中断`);
}

/**
 * 检查是否需要排队
 */
async function checkNeedWait(userId) {
  // 如果有正在运行的任务，需要排队
  for (const [key, task] of runningTasks) {
    if (task.userId === userId) {
      return false; // 用户自己的任务已在运行
    }
  }
  return runningTasks.size > 0;
}

/**
 * 获取下一个可执行的任务
 */
function getNextExecutableTask() {
  if (waitingQueue.length === 0) return null;

  // 按优先级降序排列（优先级高的在前）
  waitingQueue.sort((a, b) => b.groupPriority - a.groupPriority);
  return waitingQueue[0];
}

/**
 * 入队等待
 * 返回一个 Promise，当轮到该任务时 resolve
 */
function enqueue(userId, novelId, phase, groupPriority, res) {
  return new Promise(async (resolve, reject) => {
    const task = {
      userId,
      novelId,
      phase,
      groupPriority,
      createdAt: Date.now(),
      res,
      resolve,
      reject,
    };

    // 检查是否需要强制插队
    if (groupPriority > FORCE_INTERRUPT_THRESHOLD) {
      await forceInterruptForHighPriority(userId, groupPriority);
    }

    // 添加到队列 + 持久化到数据库
    waitingQueue.push(task);
    createQueueTask(userId, novelId, phase, groupPriority);
    logger.info(`任务入队: userId=${userId}, novelId=${novelId}, phase=${phase}, priority=${groupPriority}`);

    // 尝试立即执行（如果没有正在运行的任务）
    await processQueue();
  });
}

/**
 * 处理队列
 */
async function processQueue() {
  if (runningTasks.size > 0) {
    return; // 已有任务在运行，等待完成
  }

  const next = waitingQueue.shift();
  if (!next) return;

  logger.info(`任务开始执行: userId=${next.userId}, phase=${next.phase}`);
  next.resolve();
}

/**
 * 注册运行中的任务
 */
function registerRunning(userId, novelId, phase, abortController, res, groupPriority) {
  const key = `${userId}:${novelId}:${phase}`;

  // 如果已有该任务，先移除
  if (runningTasks.has(key)) {
    runningTasks.delete(key);
  }

  runningTasks.set(key, {
    abortController,
    res,
    userId,
    groupPriority,
    phase,
    novelId,
    startTime: Date.now(),
  });

  logger.info(`注册运行任务: ${key}, priority=${groupPriority}`);
  updateQueueTaskStatus(userId, novelId, phase, STATUS.RUNNING);

  // 从等待队列移除（如果还在）
  removeFromQueue(userId, novelId, phase);

  // 尝试处理队列中的下一个任务
  processQueue();
}

/**
 * 取消注册运行中的任务
 */
function unregisterRunning(userId, novelId, phase) {
  const key = `${userId}:${novelId}:${phase}`;
  runningTasks.delete(key);
  updateQueueTaskStatus(userId, novelId, phase, STATUS.COMPLETED);
  logger.info(`取消运行任务: ${key}`);

  // 处理队列中的下一个任务
  processQueue();
}

/**
 * 获取队列状态（用于管理界面）
 */
function getQueueStatus() {
  const running = [];
  for (const [key, task] of runningTasks) {
    running.push({
      key,
      userId: task.userId,
      groupPriority: task.groupPriority,
      phase: task.phase,
      novelId: task.novelId,
      startTime: new Date(task.startTime).toISOString(),
    });
  }

  return {
    runningTasks: running,
    waitingCount: waitingQueue.length,
    waitingTasks: waitingQueue.map(t => ({
      userId: t.userId,
      groupPriority: t.groupPriority,
      phase: t.phase,
      novelId: t.novelId,
      waitingMs: Date.now() - t.createdAt,
    })),
  };
}

/**
 * 数据库队列操作
 */

// 创建队列任务记录
async function createQueueTask(userId, novelId, phase, groupPriority) {
  try {
    const [id] = await db('queue_tasks').insert({
      user_id: userId,
      novel_id: novelId,
      phase,
      user_group_priority: groupPriority,
      status: STATUS.WAITING,
    });
    return id;
  } catch (err) {
    logger.warn(`创建队列任务记录失败: ${err.message}`);
    return null;
  }
}

// 更新队列任务状态
async function updateQueueTaskStatus(userId, novelId, phase, status) {
  try {
    await db('queue_tasks')
      .where({ user_id: userId, novel_id: novelId, phase })
      .update({ status });
  } catch (err) {
    logger.warn(`更新队列任务状态失败: ${err.message}`);
  }
}

const queueManager = {
  getUserGroupPriority,
  checkNeedWait,
  enqueue,
  registerRunning,
  unregisterRunning,
  getQueueStatus,
  forceInterruptForHighPriority,
  createQueueTask,
  updateQueueTaskStatus,
  STATUS,
  FORCE_INTERRUPT_THRESHOLD,
};

module.exports = queueManager;