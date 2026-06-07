// Agent SSE 编排服务
// 负责在 Express SSE 上下文和多个 Agent 之间架桥
// 写章主链（6步）：上下文→起草→审查→润色→数据提取→持久化

const NovelWritingAgent = require('../core/agents/novelAgent');
const ContextAgent = require('../core/agents/contextAgent');
const ReviewerAgent = require('../core/agents/reviewerAgent');
const DataAgent = require('../core/agents/dataAgent');
const ImportAgent = require('../core/agents/importAgent');
const ContextManager = require('../core/utils/contextManager');
const novelDao = require('../dao/novelDao');
const chapterDao = require('../dao/chapterDao');
const characterDao = require('../dao/characterDao');
const configDao = require('../dao/configDao');
const usageService = require('./usageService');
const queueManager = require('./queueManager');
const { db } = require('../config/database');
const { createLogger } = require('../utils/logger');
const { countWords, stripWordCountLabel } = require('../core/utils/wordCounter');

const logger = createLogger('agent');

// ========== 阶段映射 ==========
// 内部子阶段映射到对外暴露的 4 个主阶段，确保技能/MCP 配置正确匹配
const PHASE_MAP = {
  plan_revise: 'plan',
  import_analysis: 'all',
  character: 'characters',
  chapter_outline: 'chapters_outline',
  writing: 'write_chapter',
  context_assembly: 'write_chapter',
  review: 'write_chapter',
  polish: 'write_chapter',
  data_extraction: 'write_chapter',
  chat: 'all',
};

function _normalizePhase(phase) {
  return PHASE_MAP[phase] || phase;
}

// ========== Agent 创建（请求级缓存） ==========

// 请求级缓存：同一 userId 在一次请求链中只查一次配置/用户/MCP
const _agentCache = new Map(); // key: userId -> { maxTokens, globalPrompt, user, checkLimitFn, mcpTools, mcpToolServers, loaded }
const _CACHE_TTL = 60000; // 60 秒过期

function _getAgentCacheKey(userId) {
  return userId || '__anon__';
}

async function _loadAgentBaseConfig() {
  const maxTokens = await configDao.getInt('max_tokens_per_request', 0);
  let globalPrompt = null;
  try {
    const gp = await configDao.get('global_writing_prompt');
    if (gp && gp.trim()) globalPrompt = gp.trim();
  } catch { /* 忽略 */ }
  return { maxTokens, globalPrompt };
}

async function _loadUserConfig(userId) {
  const userDao = require('../dao/userDao');
  const user = await userDao.findById(userId);
  const modelTokenService = require('./modelTokenService');
  return {
    user,
    preferredModel: (user && user.preferred_model && user.can_choose_model) ? user.preferred_model : null,
    temperaturePreset: user?.temperature_preset || 'balanced',
    customTemperature: user?.custom_temperature ?? null,
    checkLimitFn: (providerName, modelName) => modelTokenService.checkModelAvailability(providerName, modelName),
  };
}

async function _loadMcpRuntime(userId) {
  const mcpService = require('./mcpService');
  return mcpService.getAvailableUserToolRuntime(userId);
}

async function _getOrCreateCache(userId) {
  const key = _getAgentCacheKey(userId);
  const now = Date.now();
  let entry = _agentCache.get(key);
  if (entry && (now - entry._ts) < _CACHE_TTL) return entry;

  // 并行加载所有共享配置
  const [baseConfig, userConfig, mcpRuntime] = await Promise.all([
    _loadAgentBaseConfig(),
    userId ? _loadUserConfig(userId).catch(() => ({ user: null, preferredModel: null, checkLimitFn: null })) : Promise.resolve({ user: null, preferredModel: null, checkLimitFn: null }),
    userId ? _loadMcpRuntime(userId).catch(() => ({ openaiTools: [], toolServers: {} })) : Promise.resolve({ openaiTools: [], toolServers: {} }),
  ]);

  entry = {
    ...baseConfig,
    ...userConfig,
    mcpTools: mcpRuntime.openaiTools || [],
    mcpToolServers: mcpRuntime.toolServers || {},
    _ts: now,
  };
  _agentCache.set(key, entry);
  return entry;
}

// 清除指定用户的缓存（配置变更时调用）
function _clearAgentCache(userId) {
  _agentCache.delete(_getAgentCacheKey(userId));
}

async function _createAgent(ctx, userId, phase, AgentClass = NovelWritingAgent) {
  const cached = await _getOrCreateCache(userId);
  const agentOptions = {};
  if (cached.globalPrompt) agentOptions.globalPrompt = cached.globalPrompt;
  if (cached.preferredModel) agentOptions.preferredModel = cached.preferredModel;
  if (cached.temperaturePreset) agentOptions.temperaturePreset = cached.temperaturePreset;
  if (cached.customTemperature !== undefined) agentOptions.customTemperature = cached.customTemperature;
  if (cached.checkLimitFn) agentOptions.checkLimitFn = cached.checkLimitFn;

  const agent = new AgentClass(ctx, agentOptions);
  agent.maxTokens = cached.maxTokens === 0 ? undefined : cached.maxTokens;

  // 注入 MCP 工具
  if (cached.mcpTools && cached.mcpTools.length > 0) {
    agent.mcpTools = cached.mcpTools;
    agent.mcpToolServers = cached.mcpToolServers || {};
  }

  // 注入技能提示词（按阶段查询，无法缓存因 phase 不同）
  if (userId && phase) {
    try {
      const skillService = require('./skillService');
      const ctxVars = {
        title: ctx?.novel?.title,
        genre: ctx?.novel?.genre,
        theme: ctx?.novel?.theme,
      };
      const exactSkills = await skillService.getActiveSkillPrompts(userId, phase, ctxVars);
      const parentPhase = _normalizePhase(phase);
      let parentSkills = [];
      if (parentPhase !== phase) {
        parentSkills = await skillService.getActiveSkillPrompts(userId, parentPhase, ctxVars);
      }
      const seen = new Set();
      agent.skills = [...exactSkills, ...parentSkills].filter(s => {
        if (seen.has(s.name)) return false;
        seen.add(s.name);
        return true;
      });
    } catch (err) {
      logger.warn('加载技能失败：' + err.message);
    }
  }

  return agent;
}

// ========== 任务追踪 ==========

const _activeTasks = new Map();

function _taskKey(novelId, phase) {
  return `${novelId}:${phase}`;
}

function _cancelTask(novelId, phase) {
  const key = _taskKey(novelId, phase);
  const existing = _activeTasks.get(key);
  if (existing) {
    logger.info(`取消旧的进行中任务：${key}`);
    const abortController = existing.abortController || existing;
    abortController.abort();
    _activeTasks.delete(key);
    if (existing.userId) {
      queueManager.unregisterRunning(existing.userId, existing.queueNovelId ?? novelId, existing.queuePhase ?? phase, queueManager.STATUS.CANCELLED);
    }
  }
}

function _registerTask(novelId, phase, abortController, queueMeta = {}) {
  const key = _taskKey(novelId, phase);
  _cancelTask(novelId, phase);
  _activeTasks.set(key, { abortController, ...queueMeta });
}

function _cleanupTask(novelId, phase, abortController, status = queueManager.STATUS.COMPLETED) {
  const key = _taskKey(novelId, phase);
  // 仅当 Map 中的 AbortController 与当前一致时才删除，防止旧任务误清新任务
  const existing = _activeTasks.get(key);
  const currentAbortController = existing?.abortController || existing;
  if (currentAbortController === abortController) {
    _activeTasks.delete(key);
    if (existing?.userId) {
      queueManager.unregisterRunning(existing.userId, existing.queueNovelId ?? novelId, existing.queuePhase ?? phase, status);
    }
  }
}

// 如果该 novel + phase 已有进行中任务，抛出 409 拒绝新请求
// 但如果旧任务已被中止（abortController.signal.aborted），自动清理并放行
function _rejectIfActive(novelId, phase) {
  const key = _taskKey(novelId, phase);
  const existing = _activeTasks.get(key);
  if (existing) {
    const abortController = existing.abortController || existing;
    // 检查任务是否已被abort或响应已结束
    if (abortController.signal?.aborted) {
      _activeTasks.delete(key);
    } else {
      throw { status: 409, message: '该操作正在进行中，请等待完成' };
    }
  }
  // 也检查相关的写章任务（写章时不允许独立审查/提取）
  if (phase !== 'write_chapter') {
    const writeKey = _taskKey(novelId, 'write_chapter');
    const writeTask = _activeTasks.get(writeKey);
    if (writeTask) {
      const writeAbortController = writeTask.abortController || writeTask;
      if (writeAbortController.signal?.aborted) {
        _activeTasks.delete(writeKey);
      } else {
        throw { status: 409, message: '章节正在生成中，请等待完成后再操作' };
      }
    }
  }
}

// ========== SSE 辅助 ==========

function setupSSE(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
}

function sendSSE(res, event, data) {
  if (res.writableEnded) return;
  try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* 客户端已断开 */ }
}

function _safeEnd(res) {
  if (!res.writableEnded) { try { res.end(); } catch { /* 忽略 */ } }
}

function _isAutoMode(req) {
  return req.query?.auto === 'true';
}

function _onClose(req, res, abortController, novelId, phase, onAbort) {
  req.on('close', () => {
    if (!res.writableEnded) {
      if (req.query?.background === 'true') {
        logger.info(`客户端断开，后台继续生成（novelId=${novelId}, phase=${phase}）`);
      } else {
        logger.info(`客户端断开连接，取消生成（novelId=${novelId}, phase=${phase}）`);
        abortController.abort();
        // 清理任务记录，允许用户重新发起请求
        _cleanupTask(novelId, phase, abortController, queueManager.STATUS.CANCELLED);
        onAbort?.();
      }
    }
  });
}

async function _waitForQueueTurn(req, res, userId, novelId, phase, abortController) {
  const groupPriority = await queueManager.getUserGroupPriority(userId);
  let queueTask = null;
  let cancelledWhileWaiting = false;

  const cancelWaiting = () => {
    if (queueTask) return;
    cancelledWhileWaiting = true;
    queueManager.cancelWaitingByResponse(res);
  };

  req.on('close', cancelWaiting);
  try {
    queueTask = await queueManager.enqueue(userId, novelId, phase, groupPriority, res);
  } finally {
    req.off?.('close', cancelWaiting);
  }
  if (cancelledWhileWaiting || res.writableEnded || abortController.signal.aborted) {
    queueManager.cancelWaitingByResponse(res);
    throw { status: queueManager.STATUS.CANCELLED, message: '任务已取消' };
  }

  queueManager.registerRunning(userId, novelId, phase, abortController, res, groupPriority, queueTask?.id);
  return { queueTaskId: queueTask?.id, groupPriority };
}

async function _acquireQueueSlot(req, res, userId, novelId, phase, abortController) {
  const slot = await _waitForQueueTurn(req, res, userId, novelId, phase, abortController);
  return {
    userId,
    novelId,
    phase,
    queueTaskId: slot.queueTaskId,
    groupPriority: slot.groupPriority,
    released: false,
  };
}

function _releaseQueueSlot(slot, status = queueManager.STATUS.COMPLETED) {
  if (!slot || slot.released) return;
  slot.released = true;
  queueManager.unregisterRunning(slot.userId, slot.novelId, slot.phase, status);
}

// ========== 工具函数 ==========

// 清洗正文中的 AI 元信息残留（修改说明、注释等）
function _stripMetaCommentary(text) {
  if (!text) return text;
  let cleaned = text;
  // 移除 "**修改说明（仅用于内部参考...）**" 整块
  cleaned = cleaned.replace(/\*{0,2}修改说明[（(][^)）]*[)）]\*{0,2}[\s\S]*?(?=\n\n|\n(?!\*)|$)/gi, '');
  // 移除 "**替换说明**：..." 等
  cleaned = cleaned.replace(/\*{0,2}(修改|替换|添加|删除|调整|优化)说明\*{0,2}[：:][^\n]*(\n[^\n]*)*/gi, '');
  // 移除独立行的 "此处添加了..." "已融入原文" 等
  cleaned = cleaned.replace(/^.*(此处添加了|已融入原文|此段落已|替换了原文|删除了原文|根据反馈修改).*\n?/gim, '');
  // 移除独立的 "（仅用于内部参考，不包含在输出中）" 行
  cleaned = cleaned.replace(/[（(]仅用于内部参考[，,]\s*不包含在输出中[）)]\s*/gi, '');
  // 移除空行堆积
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  return cleaned.trim();
}

function parseJson(val) {
  if (!val) return [];
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return []; }
}

async function _recordUsage(userId, novelId, phase, usage, model, provider) {
  if (!usage) return;
  const tokensUsed = await usageService.recordUsage(userId, novelId, phase, usage, model);
  try {
    const modelTokenService = require('./modelTokenService');
    await modelTokenService.recordUsage(provider, model, tokensUsed);
  } catch { /* 记录失败不阻塞主流程 */ }
}

// ========== 构建小说上下文对象 ==========

async function _buildNovelContext(novelId) {
  const novel = await novelDao.findById(novelId);
  if (!novel) throw { status: 404, message: '小说不存在' };

  const characters = await characterDao.findByNovelId(novelId);
  const allChapters = await chapterDao.findByNovelId(novelId);

  return { novel, characters, allChapters };
}

function _buildOutlineFromNovel(novel) {
  return {
    title: novel.title,
    genre: novel.genre,
    setting: novel.setting,
    theme: novel.theme,
    mainPlot: novel.main_plot,
    subPlots: novel.sub_plots ? parseJson(novel.sub_plots) : [],
    chapterCount: novel.chapter_count,
    tone: novel.tone,
  };
}

function _buildChapterData(chapter) {
  return {
    chapter: chapter.chapter_number,
    title: chapter.title,
    scenes: chapter.scenes ? parseJson(chapter.scenes) : [],
    conflict: chapter.conflict,
    turningPoint: chapter.turning_point,
    charactersInvolved: chapter.characters_involved ? parseJson(chapter.characters_involved) : [],
    emotionalTone: chapter.emotional_tone,
    endingHook: chapter.ending_hook,
  };
}

function _toPositiveInt(value, fallback = null) {
  const num = Number.parseInt(value, 10);
  return Number.isInteger(num) && num > 0 ? num : fallback;
}

function _safeText(value, fallback = null, maxLength = null) {
  if (value === undefined || value === null) return fallback;
  const text = typeof value === 'string' ? value.trim() : String(value).trim();
  if (!text) return fallback;
  return maxLength ? text.substring(0, maxLength) : text;
}

function _normalizeGeneratedCharacters(characters) {
  const seen = new Set();
  return (Array.isArray(characters) ? characters : [])
    .map((c, index) => {
      if (!c || typeof c !== 'object') return null;
      const name = _safeText(c.name, `角色${index + 1}`, 100);
      return {
        name,
        age: c.age ? String(c.age) : null,
        gender: _safeText(c.gender, null, 10),
        role: _safeText(c.role, null, 50),
        appearance: _safeText(c.appearance),
        personality: _safeText(c.personality),
        background: _safeText(c.background || c.abilities),
        motivation: _safeText(c.motivation),
        arc: _safeText(c.arc),
        relationships: JSON.stringify(Array.isArray(c.relationships) ? c.relationships : []),
      };
    })
    .filter((c) => {
      if (!c.name || seen.has(c.name)) return false;
      seen.add(c.name);
      return true;
    });
}

function _normalizeGeneratedChapters(chapters, { from = 1, to = Number.MAX_SAFE_INTEGER } = {}) {
  const seen = new Set();
  return (Array.isArray(chapters) ? chapters : [])
    .map((ch) => {
      if (!ch || typeof ch !== 'object') return null;
      const chapterNumber = _toPositiveInt(ch.chapter ?? ch.chapter_number);
      if (!chapterNumber || chapterNumber < from || chapterNumber > to || seen.has(chapterNumber)) return null;
      seen.add(chapterNumber);
      return {
        chapter_number: chapterNumber,
        title: _safeText(ch.title, `第${chapterNumber}章`, 200),
        brief: _safeText(ch.brief || ch.synopsis || ch.summary, null, 500),
        summary: _safeText(ch.summary || ch.synopsis, null, 255),
        scenes: JSON.stringify(ch.scenes || ch.keyEvents || ch.key_events || []),
        conflict: _safeText(ch.conflict, null, 500),
        turning_point: _safeText(ch.turningPoint || ch.turning_point, null, 500),
        characters_involved: JSON.stringify(ch.charactersInvolved || ch.characters_involved || []),
        emotional_tone: _safeText(ch.emotionalTone || ch.emotional_tone, null, 100),
        ending_hook: _safeText(ch.endingHook || ch.ending_hook || ch.hook, null, 500),
        status: 'outline',
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.chapter_number - b.chapter_number);
}

function _inferPlanStatus(characters, chapters) {
  if (chapters.length > 0) return { status: 'chapters_outline', currentStep: 3 };
  if (characters.length > 0) return { status: 'characters', currentStep: 2 };
  return { status: 'outline', currentStep: 1 };
}

// ========== SSE 通用执行框架 ==========
// 消除 generateOutline / generateCharacters / generateChapterOutlines / reviewChapter / extractChapterData 中的重复 SSE 样板代码

/**
 * 执行 SSE 任务的通用工厂
 * @param {object} req - Express 请求对象
 * @param {object} res - Express 响应对象
 * @param {number} novelId
 * @param {string} phase - 阶段标识
 * @param {object} agent - Agent 实例
 * @param {object} opts
 * @param {function} opts.task - (onProgress) => Promise<result>  实际执行函数
 * @param {function} opts.onDone - (result, res) => Promise<void>  成功回调（写 SSE + 持久化）
 * @param {string} [opts.label] - 错误日志标签
 * @param {boolean} [opts.rejectIfActive] - 是否在注册前检查重复任务
 */
function _runSSETask(req, res, novelId, phase, agent, opts) {
  const { task, onDone, label, rejectIfActive } = opts;
  const logLabel = label || phase;

  const abortController = new AbortController();
  if (rejectIfActive) {
    _rejectIfActive(novelId, phase);
  }

  setupSSE(res);
  const onProgress = (event, data) => {
    if (res.writableEnded) return;
    sendSSE(res, event, data);
  };
  _onClose(req, res, abortController, novelId, phase);

  (async () => {
    try {
      await _waitForQueueTurn(req, res, req.user.id, novelId, phase, abortController);
      _registerTask(novelId, phase, abortController, {
        userId: req.user.id,
        queueNovelId: novelId,
        queuePhase: phase,
      });
      agent._abortSignal = abortController.signal;

      const result = await task(onProgress);
      try {
        await onDone(result, res);
      } catch (innerErr) {
        logger.error(logLabel + '成功回调失败：' + innerErr.message);
        sendSSE(res, 'error', { message: '数据保存失败' });
        _safeEnd(res);
        _cleanupTask(novelId, phase, abortController, queueManager.STATUS.FAILED);
        return;
      }
      _safeEnd(res);
      _cleanupTask(novelId, phase, abortController, queueManager.STATUS.COMPLETED);
    } catch (err) {
      if (err.status === queueManager.STATUS.CANCELLED || abortController.signal.aborted) {
        _safeEnd(res);
        _cleanupTask(novelId, phase, abortController, queueManager.STATUS.CANCELLED);
        return;
      }
      logger.error(logLabel + '失败：' + err.message);
      sendSSE(res, 'error', { message: err.message });
      _safeEnd(res);
      _cleanupTask(novelId, phase, abortController, queueManager.STATUS.FAILED);
    }
  })();
}

const agentService = {
  // ========== 阶段1：生成大纲 ==========
  async generateOutline(userId, novelId, userInput) {
    const ctx = new ContextManager(novelDao, novelId);
    await ctx.loadContext();

    const agent = await _createAgent(ctx, userId, 'outline');

    return {
      execute: (req, res) => _runSSETask(req, res, novelId, 'outline', agent, {
        label: '大纲生成',
        task: (onProgress) => agent.generateBookOutline(userInput, onProgress),
        onDone: async ({ outline, usage, model, provider, skipReasons }, res) => {
          if (skipReasons && skipReasons.length > 0) {
            sendSSE(res, 'model_fallback', { preferredModel: agent.preferredModel, actualModel: model, reasons: skipReasons });
          }
          if (outline._parseError) {
            logger.error('大纲 JSON 解析失败，跳过保存');
            sendSSE(res, 'error', { message: '生成内容格式错误，请重试' });
            return;
          }
          await novelDao.update(novelId, {
            title: outline.title || null,
            genre: outline.genre || null,
            theme: outline.theme || null,
            setting: outline.setting || null,
            main_plot: outline.mainPlot || null,
            sub_plots: JSON.stringify(outline.subPlots || []),
            chapter_count: outline.chapterCount || outline.chapterOverview?.length,
            status: 'outline',
            current_step: 1,
          });
          await ctx.persist();
          await _recordUsage(userId, novelId, 'outline', usage, model, provider);
          sendSSE(res, 'done', {});
        },
      }),
    };
  },

  // ========== 阶段2：生成人物设定 ==========
  async generateCharacters(userId, novelId) {
    const { novel } = await _buildNovelContext(novelId);
    const ctx = new ContextManager(novelDao, novelId);
    await ctx.loadContext();

    const outline = _buildOutlineFromNovel(novel);

    const existingChars = await characterDao.findByNovelId(novelId);
    if (existingChars.length > 0) {
      ctx.saveCharacters(existingChars);
    }

    const agent = await _createAgent(ctx, userId, 'characters');

    return {
      execute: (req, res) => _runSSETask(req, res, novelId, 'characters', agent, {
        label: '人物设定生成',
        task: (onProgress) => agent.generateCharacterProfiles(outline, onProgress),
        onDone: async ({ characters, usage, model, provider, skipReasons }, res) => {
          if (skipReasons && skipReasons.length > 0) {
            sendSSE(res, 'model_fallback', { preferredModel: agent.preferredModel, actualModel: model, reasons: skipReasons });
          }
          if (!characters || !Array.isArray(characters) || characters.length === 0) {
            logger.error('人物设定为空或格式错误');
            sendSSE(res, 'error', { message: '生成人物设定格式错误，请重试' });
            return;
          }
          await characterDao.deleteByNovelId(novelId);
          await Promise.all(characters.map(c =>
            characterDao.create({
              novel_id: novelId,
              name: c.name || '未知',
              age: c.age ? String(c.age) : null,
              gender: c.gender || null,
              role: c.role || null,
              appearance: c.appearance || null,
              personality: c.personality || null,
              background: c.background || null,
              motivation: c.motivation || null,
              arc: c.arc || null,
              relationships: JSON.stringify(c.relationships || []),
            })
          ));
          await novelDao.update(novelId, { status: 'characters', current_step: 2 });
          await ctx.persist();
          await _recordUsage(userId, novelId, 'characters', usage, model, provider);
          sendSSE(res, 'result', { characters, usage, model });
          sendSSE(res, 'done', {});
        },
      }),
    };
  },

  // ========== 阶段3：生成逐章大纲（支持分段生成） ==========
  async generateChapterOutlines(userId, novelId, startChapter) {
    const { novel } = await _buildNovelContext(novelId);
    const ctx = new ContextManager(novelDao, novelId);
    await ctx.loadContext();

    const outline = _buildOutlineFromNovel(novel);
    const characters = await characterDao.findByNovelId(novelId);

    const batchSize = await configDao.getInt('chapters_per_batch', 20);
    const totalChapters = outline.chapterCount || 12;
    const from = startChapter || 1;
    const endChapter = Math.min(from + batchSize - 1, totalChapters);
    const isFirstBatch = from === 1;

    const agent = await _createAgent(ctx, userId, 'chapters_outline');

    return {
      execute: (req, res) => _runSSETask(req, res, novelId, 'chapters_outline', agent, {
        label: '章节大纲生成',
        task: (onProgress) => agent.generateChapterOutlines(outline, characters, onProgress, from, endChapter),
        onDone: async ({ chapters, usage, model, provider, skipReasons }, res) => {
          if (skipReasons && skipReasons.length > 0) {
            sendSSE(res, 'model_fallback', { preferredModel: agent.preferredModel, actualModel: model, reasons: skipReasons });
          }
          if (!chapters || !Array.isArray(chapters) || chapters.length === 0) {
            logger.error('章节大纲为空或格式错误');
            // 发送 done 事件（hasMore=true, nextStart=from）让前端自动链重试本批次，而非直接中断
            sendSSE(res, 'done', { batchStart: from, batchEnd: from - 1, totalChapters, hasMore: true, nextStart: from, parseError: true });
            return;
          }
          const normalizedChapters = _normalizeGeneratedChapters(chapters, { from, to: endChapter });
          if (normalizedChapters.length === 0) {
            logger.warn(`[章节大纲] AI 返回章节号无效或越界: from=${from}, end=${endChapter}`);
            sendSSE(res, 'done', { batchStart: from, batchEnd: from - 1, totalChapters, hasMore: true, nextStart: from, parseError: true });
            return;
          }
          if (isFirstBatch) {
            // 重新生成章纲时保留已写正文，只清理还没有正文的旧章纲，避免误删用户已完成内容。
            await db('chapters')
              .where('novel_id', novelId)
              .where((builder) => builder.whereNull('content').orWhere('content', ''))
              .del();
          }
          await Promise.all(normalizedChapters.map(async (ch) => {
            const existing = await chapterDao.findByNovelAndNumber(novelId, ch.chapter_number);
            if (existing?.content) {
              return chapterDao.update(novelId, ch.chapter_number, {
                title: ch.title,
                brief: ch.brief,
                summary: existing.summary || ch.summary,
                scenes: ch.scenes,
                conflict: ch.conflict,
                turning_point: ch.turning_point,
                characters_involved: ch.characters_involved,
                emotional_tone: ch.emotional_tone,
                ending_hook: ch.ending_hook,
              });
            }
            return chapterDao.upsert({
              novel_id: novelId,
              ...ch,
            });
          }));
          await novelDao.update(novelId, { status: 'chapters_outline', current_step: 3 });
          await ctx.persist();
          await _recordUsage(userId, novelId, 'chapter_outline', usage, model, provider);
          // 检测实际生成的最后章节号，防止因输出截断导致跳章
          const actualMax = Math.max(...normalizedChapters.map(ch => ch.chapter_number));
          const hasMore = actualMax < totalChapters;
          logger.info(`[章节大纲] 批次完成: from=${from}, actualMax=${actualMax}, totalChapters=${totalChapters}, hasMore=${hasMore}, nextStart=${hasMore ? actualMax + 1 : null}, chaptersCount=${normalizedChapters.length}`);
          sendSSE(res, 'done', { batchStart: from, batchEnd: actualMax, totalChapters, hasMore, nextStart: hasMore ? actualMax + 1 : null });
        },
      }),
    };
  },

  // ========== 阶段4：写章节（5步主链） ==========
  // 上下文组装 → 起草 → 审查+润色 → 数据提取 → 持久化
  async writeChapter(userId, novelId, chapterNumber) {
    const { novel, characters, allChapters } = await _buildNovelContext(novelId);
    const ctx = new ContextManager(novelDao, novelId);
    await ctx.loadContext();

    if (characters.length > 0) {
      ctx.saveCharacters(characters);
    }

    // 恢复已完成章节摘要到上下文
    const completedChapters = allChapters.filter(c => c.status === 'completed');
    completedChapters.forEach(c => {
      if (c.summary) ctx.addChapterSummary(c.chapter_number, c.summary);
    });

    // 获取当前章节大纲
    const chapterOutline = allChapters.find(c => c.chapter_number === chapterNumber);
    if (!chapterOutline) {
      throw { status: 404, message: '章节大纲不存在，请先生成章节大纲' };
    }

    const chapterData = _buildChapterData(chapterOutline);
    const totalChapters = novel.chapter_count || allChapters.length;

    // 获取上一章结尾（用于钩子承接检查）
    const prevChapter = allChapters.find(c => c.chapter_number === chapterNumber - 1);
    const previousChapterEnding = prevChapter?.content
      ? prevChapter.content.slice(-500)
      : '';

    // 获取未解决的伏笔（从已完成的章节中提取有 endingHook 但未闭合的）
    const unresolvedHooks = allChapters
      .filter(c => c.chapter_number < chapterNumber && c.status === 'completed' && c.ending_hook)
      .map(c => ({
        fromChapter: c.chapter_number,
        content: c.ending_hook,
        urgency: '中',
      }));

    const writingAgent = await _createAgent(ctx, userId, 'write_chapter');

    return {
      execute: (req, res) => {
        const abortController = new AbortController();
        _rejectIfActive(novelId, 'write_chapter');

        setupSSE(res);
        const onProgress = (event, data) => {
          if (res.writableEnded) return;
          sendSSE(res, event, data);
        };

        _onClose(req, res, abortController, novelId, 'write_chapter');

        (async () => {
          try {
            await _waitForQueueTurn(req, res, userId, novelId, 'write_chapter', abortController);
            _registerTask(novelId, 'write_chapter', abortController, {
              userId,
              queueNovelId: novelId,
              queuePhase: 'write_chapter',
            });
            writingAgent._abortSignal = abortController.signal;

            // ===== Step 1: 上下文组装 → 写作任务书 =====
            sendSSE(res, 'progress', { step: 'context', message: 'Step 1/5: 正在组装写作任务书...' });

            let writingBrief = null;
            try {
              const contextAgent = await _createAgent(ctx, userId, 'context_assembly', ContextAgent);
              contextAgent._abortSignal = abortController.signal;

              const contextProgress = (event, data) => {
                if (event === 'progress') onProgress(event, data);
              };

              writingBrief = await contextAgent.generateWritingBrief({
                novel: _buildOutlineFromNovel(novel),
                chapterOutline: chapterData,
                chapterNumber,
                totalChapters,
                characters: characters.map(c => ({
                  name: c.name, role: c.role, personality: c.personality,
                  motivation: c.motivation, speechPattern: c.speech_pattern || c.speechPattern,
                  arc: c.arc, background: c.background,
                })),
                previousSummaries: completedChapters.slice(-5).map(c => ({
                  chapter: c.chapter_number, summary: c.summary || '',
                })),
                unresolvedHooks,
              }, contextProgress);

              sendSSE(res, 'context_brief', { brief: writingBrief });
            } catch (ctxErr) {
              logger.warn('ContextAgent 失败，降级为传统模式：' + ctxErr.message);
              sendSSE(res, 'progress', { message: '写作任务书生成失败，使用传统模式继续...' });
            }

            // ===== Step 2: 起草正文 =====
            sendSSE(res, 'progress', { step: 'writing', message: writingBrief ? 'Step 2/5: 根据任务书起草正文...' : 'Step 2/5: 正在起草正文...' });

            const { chapter, usage: writeUsage, model, provider, skipReasons } = await writingAgent.writeChapter(
              chapterData, chapterNumber, totalChapters,
              (chunk) => onProgress('chunk', { text: chunk }),
              writingBrief
            );

            if (skipReasons && skipReasons.length > 0) {
              sendSSE(res, 'model_fallback', { preferredModel: writingAgent.preferredModel, actualModel: model, reasons: skipReasons });
            }

            if (!chapter || !chapter.content || chapter.content.trim().length === 0) {
              sendSSE(res, 'error', { message: '生成章节内容为空，请重试' });
              _safeEnd(res);
              _cleanupTask(novelId, 'write_chapter', abortController, queueManager.STATUS.FAILED);
              return;
            }

            let finalContent = _stripMetaCommentary(chapter.content);
            let reviewResult = null;
            let extractionResult = null;

            // ===== Step 3: 审查 =====
            sendSSE(res, 'progress', { step: 'review', message: 'Step 3/5: 正在审查章节质量...' });

            try {
              const reviewerAgent = await _createAgent(ctx, userId, 'review', ReviewerAgent);
              reviewerAgent._abortSignal = abortController.signal;

              reviewResult = await reviewerAgent.reviewChapter({
                chapterContent: finalContent,
                chapterNumber,
                novel: _buildOutlineFromNovel(novel),
                characters: characters.map(c => ({
                  name: c.name, role: c.role, personality: c.personality,
                  speechPattern: c.speech_pattern || c.speechPattern,
                })),
                chapterOutline: chapterData,
                previousSummaries: completedChapters.slice(-3).map(c => ({
                  chapter: c.chapter_number, summary: c.summary || '',
                })),
                previousChapterEnding,
              });

              sendSSE(res, 'review_result', {
                chapterNumber,
                issues: reviewResult.issues,
                summary: reviewResult.summary,
                blockingCount: reviewResult.issues.filter(i => i.blocking).length,
              });

              // ===== Step 4: 润色修复（仅在有阻断问题时执行） =====
              const blockingIssues = (reviewResult.issues || []).filter(i => i.blocking);

              if (blockingIssues.length > 0) {
                sendSSE(res, 'progress', { step: 'polish', message: `Step 4/5: 发现${blockingIssues.length}个阻断问题，正在修复...` });
                // 通知前端清除原稿流，准备接收润色后的内容
                sendSSE(res, 'polish_start', {});

                const fixHints = blockingIssues.map((i, idx) =>
                  `${idx + 1}. [${i.category}] ${i.description} — 修复方向：${i.fix_hint}`
                ).join('\n');

                const fixPrompt = `以下章节存在需要修复的问题，请修改：

【修复要求】
${fixHints}

【修改原则】
- 只修改有问题的部分，保留其他内容不变
- 保持原有风格和语气
- 修复后字数不能减少

【禁止】
- 禁止在输出中包含任何修改说明、注释、内部参考信息
- 禁止出现"修改说明""此处添加了""已融入原文""替换说明"等元信息
- 只输出纯正文，像一个真正的作家直接交稿一样

【原文】
${finalContent}

请输出修复后的完整章节正文。`;

                const polishAgent = await _createAgent(ctx, userId, 'polish');
                polishAgent._abortSignal = abortController.signal;

                const { content: polished } = await polishAgent.callLLMStream(
                  '你是一位资深小说编辑。请根据修复要求修改章节，只修改有问题的地方，保留其他内容。禁止输出任何修改说明、注释或内部参考信息，只输出纯正文。',
                  fixPrompt,
                  0.5,
                  (chunk) => onProgress('chunk', { text: chunk }),
                  'polish'
                );

                if (polished && polished.trim().length > 0) {
                  finalContent = _stripMetaCommentary(polished);
                  sendSSE(res, 'polish_done', { message: `已修复${blockingIssues.length}个阻断问题` });
                }
              } else {
                sendSSE(res, 'progress', { step: 'polish', message: 'Step 4/5: 审查通过，无需修复' });
              }
            } catch (reviewErr) {
              logger.warn('审查流程失败：' + reviewErr.message);
              sendSSE(res, 'progress', { message: 'Step 3/5: 审查跳过（服务异常），继续后续流程...' });
            }

            // ===== Step 5: 数据提取 + 持久化 =====
            sendSSE(res, 'progress', { step: 'extract_persist', message: 'Step 5/5: 正在提取数据并保存...' });

            try {
              const dataAgent = await _createAgent(ctx, userId, 'data_extraction', DataAgent);
              dataAgent._abortSignal = abortController.signal;

              const knownEntities = characters.map(c => ({
                id: c.name.toLowerCase().replace(/[^a-z0-9一-鿿]/g, '_'),
                name: c.name,
                type: '角色',
              }));

              extractionResult = await dataAgent.extractChapterData({
                chapterContent: finalContent,
                chapterNumber,
                knownEntities,
                characters,
              });

              sendSSE(res, 'extraction_result', {
                ...extractionResult,
                chapterNumber,
                entityCount: extractionResult.entities_appeared?.length || 0,
                deltaCount: extractionResult.state_deltas?.length || 0,
                eventCount: extractionResult.accepted_events?.length || 0,
                sceneCount: extractionResult.scenes?.length || 0,
                summary: extractionResult.summary_text || '',
              });
            } catch (extractErr) {
              logger.warn('数据提取失败：' + extractErr.message);
              sendSSE(res, 'progress', { message: '数据提取跳过（服务异常）' });
            }

            // ===== 持久化 =====
            // 清洗 AI 自报字数标注
            finalContent = stripWordCountLabel(finalContent);
            const finalWordCount = countWords(finalContent);

            // 1. 保存完成的内容 + summary（优先用 data-agent 的 summary）
            const finalSummary = extractionResult?.summary_text || chapter.summary;
            // 使用章纲中的标题作为默认，若正文包含新标题则由 data-agent 提取（此处以章纲为准）
            const finalTitle = chapterData.title || `第${chapterNumber}章`;
            await chapterDao.update(novelId, chapterNumber, {
              title: finalTitle,
              content: finalContent || '',
              summary: finalSummary || null,
              word_count: finalWordCount,
              status: 'completed',
              review_result: reviewResult ? JSON.stringify(reviewResult) : null,
              extraction_result: extractionResult ? JSON.stringify(extractionResult) : null,
            });

            await novelDao.update(novelId, {
              status: 'writing',
              current_step: 4,
            });

            // 检查是否全部完成：既要没有未完成章，也要已完成数量达到计划总章数。
            const refreshedChapters = await chapterDao.findByNovelId(novelId);
            const completedCount = refreshedChapters.filter(c => c.status === 'completed').length;
            const plannedChapterCount = novel.chapter_count || refreshedChapters.length;
            const incompleteCount = refreshedChapters.filter(c => c.status !== 'completed').length;
            if (plannedChapterCount > 0 && completedCount >= plannedChapterCount && incompleteCount === 0) {
              await novelDao.update(novelId, { status: 'completed' });
            }

            await ctx.persist();
            await _recordUsage(userId, novelId, 'write_chapter', writeUsage, model, provider);

            // 最终结果（不传 content，前端已通过 chunk 事件逐字接收）
            sendSSE(res, 'result', {
              chapter: {
                chapterNumber,
                title: chapterData.title,
                summary: finalSummary,
                wordCount: finalWordCount,
              },
              review: reviewResult ? {
                issues: reviewResult.issues,
                summary: reviewResult.summary,
              } : null,
              extraction: extractionResult ? {
                entityCount: extractionResult.entities_appeared?.length || 0,
                sceneCount: extractionResult.scenes?.length || 0,
              } : null,
              usage: writeUsage,
              model,
            });

            sendSSE(res, 'done', {});
            _safeEnd(res);
            _cleanupTask(novelId, 'write_chapter', abortController, queueManager.STATUS.COMPLETED);

          } catch (err) {
            if (err.status === queueManager.STATUS.CANCELLED || abortController.signal.aborted) {
              _safeEnd(res);
              _cleanupTask(novelId, 'write_chapter', abortController, queueManager.STATUS.CANCELLED);
              return;
            }
            if (res.writableEnded) return;
            logger.error('章节写作失败：' + err.message);
            sendSSE(res, 'error', { message: err.message });
            _safeEnd(res);
            _cleanupTask(novelId, 'write_chapter', abortController, queueManager.STATUS.FAILED);
          }
        })();
      },
    };
  },

  // ========== 独立审查（不重新生成正文） ==========
  async reviewChapter(userId, novelId, chapterNumber) {
    const { novel, characters, allChapters } = await _buildNovelContext(novelId);

    const targetChapter = allChapters.find(c => c.chapter_number === chapterNumber);
    if (!targetChapter || !targetChapter.content) {
      throw { status: 400, message: '该章节还没有正文内容，请先生成' };
    }

    const ctx = new ContextManager(novelDao, novelId);
    await ctx.loadContext();

    const chapterData = _buildChapterData(targetChapter);

    const prevChapter = allChapters.find(c => c.chapter_number === chapterNumber - 1);
    const previousChapterEnding = prevChapter?.content
      ? prevChapter.content.slice(-500)
      : '';

    const completedChapters = allChapters.filter(c => c.status === 'completed');

    const agent = await _createAgent(ctx, userId, 'review', ReviewerAgent);

    const reviewInput = {
      chapterContent: targetChapter.content,
      chapterNumber,
      novel: _buildOutlineFromNovel(novel),
      characters: characters.map(c => ({
        name: c.name, role: c.role, personality: c.personality,
        speechPattern: c.speech_pattern || c.speechPattern,
      })),
      chapterOutline: chapterData,
      previousSummaries: completedChapters.slice(-3).map(c => ({
        chapter: c.chapter_number, summary: c.summary || '',
      })),
      previousChapterEnding,
    };

    return {
      execute: (req, res) => _runSSETask(req, res, novelId, 'review', agent, {
        label: '独立审查',
        rejectIfActive: true,
        task: (onProgress) => agent.reviewChapter(reviewInput, onProgress),
        onDone: async (reviewResult, res) => {
          await chapterDao.update(novelId, chapterNumber, {
            review_result: JSON.stringify(reviewResult),
          });
          sendSSE(res, 'review_result', {
            chapterNumber,
            issues: reviewResult.issues,
            summary: reviewResult.summary,
            blockingCount: (reviewResult.issues || []).filter(i => i.blocking).length,
          });
          sendSSE(res, 'done', {});
        },
      }),
    };
  },

  // ========== 独立数据提取（用于已有章节） ==========
  async extractChapterData(userId, novelId, chapterNumber) {
    const { characters, allChapters } = await _buildNovelContext(novelId);

    const targetChapter = allChapters.find(c => c.chapter_number === chapterNumber);
    if (!targetChapter || !targetChapter.content) {
      throw { status: 400, message: '该章节还没有正文内容，请先生成' };
    }

    const ctx = new ContextManager(novelDao, novelId);
    await ctx.loadContext();

    const agent = await _createAgent(ctx, userId, 'data_extraction', DataAgent);

    const knownEntities = characters.map(c => ({
      id: c.name.toLowerCase().replace(/[^a-z0-9一-鿿]/g, '_'),
      name: c.name,
      type: '角色',
    }));

    const extractInput = {
      chapterContent: targetChapter.content,
      chapterNumber,
      knownEntities,
      characters,
    };

    return {
      execute: (req, res) => _runSSETask(req, res, novelId, 'extract', agent, {
        label: '独立数据提取',
        rejectIfActive: true,
        task: (onProgress) => agent.extractChapterData(extractInput, onProgress),
        onDone: async (extractionResult, res) => {
          await chapterDao.update(novelId, chapterNumber, {
            summary: extractionResult.summary_text || targetChapter.summary,
            extraction_result: JSON.stringify(extractionResult),
          });
          sendSSE(res, 'extraction_result', { ...extractionResult, chapterNumber });
          sendSSE(res, 'done', {});
        },
      }),
    };
  },

  // ========== AI 修订内容 ==========
  async reviseContent(userId, novelId, { phase, chapterNumber, currentContent, feedback }) {
    const novel = await novelDao.findById(novelId);
    if (!novel) throw { status: 404, message: '小说不存在' };

    const ctx = new ContextManager(novelDao, novelId);
    await ctx.loadContext();

    const ctxPrompt = ctx.getGlobalSystemPrompt();
    const currentStr = typeof currentContent === 'string' ? currentContent : JSON.stringify(currentContent, null, 2);

    return {
      execute: (req, res) => {
        const abortController = new AbortController();
        const queuePhase = 'revise_' + phase;

        setupSSE(res);
        const onProgress = (event, data) => {
          if (res.writableEnded) return;
          sendSSE(res, event, data);
        };

        _onClose(req, res, abortController, novelId, queuePhase);

        (async () => {
          try {
            await _waitForQueueTurn(req, res, userId, novelId, queuePhase, abortController);
            _registerTask(novelId, queuePhase, abortController, {
              userId,
              queueNovelId: novelId,
              queuePhase,
            });

            const agent = await _createAgent(ctx, userId, phase);
            agent._abortSignal = abortController.signal;

            const phaseLabels = { outline: '整书大纲', characters: '人物设定', chapters_outline: '章节大纲', write_chapter: '章节正文' };
            const label = phaseLabels[phase] || '内容';

            const structureMap = {
              outline: '必须输出完整大纲 JSON：{"title":"标题","genre":"类型","synopsis":"300-500字故事梗概","setting":"300-500字世界观详情","theme":"200-300字核心主题阐述","tone":"基调","targetAudience":"目标读者","mainPlot":"500-800字详细主线","subPlots":["100字以上支线描述"],"chapterCount":章数}',
              characters: '必须输出完整人物 JSON：{"characters":[{"name":"姓名","age":年龄,"gender":"性别","role":"主角/配角/反派","appearance":"150-200字外貌","personality":"200-300字性格","background":"300-500字背景","motivation":"150-200字动机","arc":"200-300字成长弧线","strengths":["优点"],"flaws":["缺点"],"quirks":["习惯"],"speechPattern":"语言特点","innerConflict":"100-150字内心冲突","secrets":"秘密","relationships":[{"with":"关联角色","type":"关系","dynamic":"100-150字关系动态"}]}]}',
              chapters_outline: '必须输出完整章纲 JSON：{"chapters":[{"chapter":1,"title":"章节标题","synopsis":"200-300字梗概","scenes":[{"number":1,"location":"地点","timeOfDay":"时间","description":"100-150字场景描述"}],"openingHook":"50-80字开篇","conflict":"100-150字核心冲突","turningPoint":"100-150字转折","characterDevelopment":{"角色名":"80-100字成长"},"subplotProgress":"支线推进","charactersInvolved":["角色"],"emotionalTone":"情绪曲线","endingHook":"50-80字悬念","foreshadowing":"伏笔"}]}',
              write_chapter: '请直接输出小说章节正文（纯文本，无需JSON），字数必须3500字以上。结构：开篇引入(300-500字)→场景一(600-800字)→场景二(600-800字)→高潮(600-800字)→收尾悬念(300-500字)，每个场景必须有环境描写(五感至少2种)、2轮以上对话、内心活动、1个印象深刻的细节。禁止输出任何修改说明、注释、字数标注或内部参考信息，只输出纯正文。',
            };

            onProgress('progress', { message: `正在根据你的反馈修改${label}...` });

            const systemPrompt = ctxPrompt +
              `\n你是一个小说编辑。用户对当前的${label}提出了修改意见，请根据反馈重新生成/修改${label}。` +
              `\n${structureMap[phase] || '请根据原有格式输出。'}` +
              `\n严格按上述格式输出，不要输出其他阶段的内容。`;

            const userPrompt = `当前${label}内容：\n${currentStr}\n\n用户修改意见：${feedback}\n\n请输出修改后的完整${label}。`;

            const phaseMap = { outline: 'outline', characters: 'character', chapters_outline: 'chapter_outline', write_chapter: 'writing' };
            const { content: revised, usage, model, provider, skipReasons } = await agent.callLLMStream(
              systemPrompt, userPrompt, 0.7,
              (chunk) => onProgress('chunk', { text: chunk }),
              phaseMap[phase] || 'writing'
            );

            if (skipReasons && skipReasons.length > 0) {
              onProgress('model_fallback', { preferredModel: agent.preferredModel, actualModel: model, reasons: skipReasons });
            }

            await _recordUsage(userId, novelId, 'revise_' + phase, usage, model, provider);

            let finalRevised = revised;
            let reviewResult = null;
            let wordCount = 0;

            // 章节正文修订后：清洗 + 字数统计 + 审查
            if (phase === 'write_chapter' && revised) {
              finalRevised = stripWordCountLabel(revised);
              wordCount = countWords(finalRevised);

              try {
                const { novel, characters, allChapters } = await _buildNovelContext(novelId);
                const reviewAgent = await _createAgent(null, userId, 'review', ReviewerAgent);
                reviewAgent._abortSignal = abortController.signal;

                const chapterData = allChapters.find(c => c.chapter_number === chapterNumber);
                const prevChapter = allChapters.find(c => c.chapter_number === chapterNumber - 1);

                onProgress('progress', { message: '正在审查修订结果...' });

                reviewResult = await reviewAgent.reviewChapter({
                  chapterContent: finalRevised,
                  chapterNumber: chapterNumber || 0,
                  novel: _buildOutlineFromNovel(novel),
                  characters: (characters || []).map(c => ({
                    name: c.name, role: c.role, personality: c.personality,
                    speechPattern: c.speech_pattern || c.speechPattern,
                  })),
                  chapterOutline: chapterData ? _buildChapterData(chapterData) : null,
                  previousSummaries: [],
                  previousChapterEnding: prevChapter?.content ? prevChapter.content.slice(-500) : '',
                }, onProgress);

                if (reviewResult) {
                  const blockingCount = (reviewResult.issues || []).filter(i => i.blocking).length;
                  onProgress('review_result', {
                    chapterNumber,
                    issues: reviewResult.issues,
                    summary: reviewResult.summary,
                    blockingCount,
                  });
                  if (blockingCount > 0) {
                    onProgress('progress', { message: `修订后审查发现${blockingCount}个阻断问题，建议再次修订` });
                  }
                }
              } catch (reviewErr) {
                logger.warn('修订后审查失败：' + reviewErr.message);
                onProgress('progress', { message: '审查步骤跳过（审查服务异常）' });
              }
            }

            if (res.writableEnded) return;
            onProgress('result', {
              revised: finalRevised,
              phase,
              usage,
              model,
              wordCount: wordCount || undefined,
              review: reviewResult ? {
                issues: reviewResult.issues,
                summary: reviewResult.summary,
              } : undefined,
            });
            onProgress('done', {});
            _safeEnd(res);
            _cleanupTask(novelId, queuePhase, abortController, queueManager.STATUS.COMPLETED);
          } catch (err) {
            if (err.status === queueManager.STATUS.CANCELLED || abortController.signal.aborted) {
              _safeEnd(res);
              _cleanupTask(novelId, queuePhase, abortController, queueManager.STATUS.CANCELLED);
              return;
            }
            if (res.writableEnded) return;
            logger.error('修订失败：' + err.message);
            sendSSE(res, 'error', { message: err.message });
            _safeEnd(res);
            _cleanupTask(novelId, queuePhase, abortController, queueManager.STATUS.FAILED);
          }
        })();
      },
    };
  },
};

// ========== 对话式规划创建小说 ==========
// 用户用自然语言描述需求，Agent 通过搜索工具研究趋势后生成完整方案
agentService.planNovel = function (userId, userInput) {
  if (!userInput || userInput.trim().length < 5) {
    throw { status: 400, message: '请提供更详细的创作需求（至少5个字）' };
  }

  const PlanningAgent = require('../core/agents/planningAgent');

  return {
    execute: async (req, res) => {
      const abortController = new AbortController();
      let agent;
      try {
        const ctx = { novel: null, characters: [], allChapters: [] };
        agent = await _createAgent(ctx, userId, 'plan', PlanningAgent);
      } catch (err) {
        setupSSE(res);
        sendSSE(res, 'error', { message: 'AI 服务初始化失败：' + err.message });
        _safeEnd(res);
        return;
      }
      agent._abortSignal = abortController.signal;

      setupSSE(res);
      const onProgress = (event, data) => {
        if (res.writableEnded) return;
        sendSSE(res, event, data);
      };
      _onClose(req, res, abortController, 0, 'plan');

      let queueSlot = null;
      let finalStatus = queueManager.STATUS.COMPLETED;
      try {
        queueSlot = await _acquireQueueSlot(req, res, userId, 0, 'plan', abortController);
        _registerTask(0, 'plan', abortController, {
          userId,
          queueNovelId: 0,
          queuePhase: 'plan',
        });
        agent._abortSignal = abortController.signal;

        // 执行规划
        const result = await agent.planNovel(userInput.trim(), onProgress);

        if (res.writableEnded || abortController.signal.aborted) {
          finalStatus = queueManager.STATUS.CANCELLED;
          return;
        }

        const plan = result.plan;
        // 严格校验：解析失败 或 缺少关键字段 都视为无效方案
        const missingFields = plan?._missingFields || [];
        if (!plan || plan._parseError || missingFields.length > 0) {
          const reason = plan?._parseError
            ? ('JSON 解析失败：' + (plan._rawContent || '').substring(0, 200))
            : ('方案不完整，缺少关键字段：' + missingFields.join('、'));
          sendSSE(res, 'error', { message: reason });
          _safeEnd(res);
          return;
        }
        // 额外安全校验：characters 和 chapters 必须为非空数组
        if (!Array.isArray(plan.characters) || plan.characters.length === 0 ||
            !Array.isArray(plan.chapters) || plan.chapters.length === 0) {
          sendSSE(res, 'error', { message: '方案缺少角色或章纲数据，生成不完整，请重试' });
          _safeEnd(res);
          return;
        }

        // 发送规划结果给前端展示
        sendSSE(res, 'plan_result', {
          title: plan.title,
          genre: plan.genre,
          theme: plan.theme,
          setting: plan.setting,
          tone: plan.tone,
          targetAudience: plan.targetAudience,
          mainPlot: plan.mainPlot,
          subPlots: plan.subPlots,
          chapterCount: plan.chapterCount,
          marketAnalysis: plan.marketAnalysis,
          innovationPoints: plan.innovationPoints,
          characters: plan.characters,
          chapters: plan.chapters,
        });

        // 自动创建小说（创建前再次检查是否已取消）
        try {
          if (abortController.signal.aborted) {
            logger.info('用户已取消，跳过自动创建小说');
            return;
          }
          const maxNovels = await configDao.getInt('max_novels_per_user', 50);
          const userNovels = await novelDao.countByUser(userId);
          if (userNovels >= maxNovels) {
            throw new Error('已达到最大小说数量限制');
          }

          if (abortController.signal.aborted) { logger.info('用户已取消，中止创建'); sendSSE(res, 'done', {}); _safeEnd(res); return; }
          const planCharacters = _normalizeGeneratedCharacters(plan.characters);
          const planChapters = _normalizeGeneratedChapters(plan.chapters, {
            from: 1,
            to: _toPositiveInt(plan.chapterCount, plan.chapters.length) || plan.chapters.length,
          });
          if (planCharacters.length === 0 || planChapters.length === 0) {
            throw new Error('方案缺少可保存的角色或章节编号');
          }
          const planStatus = _inferPlanStatus(planCharacters, planChapters);
          const chapterCount = Math.max(_toPositiveInt(plan.chapterCount, 0) || 0, planChapters.length, Math.max(...planChapters.map(ch => ch.chapter_number)));

          let novel;
          await db.transaction(async (trx) => {
            const [novelId] = await trx('novels').insert({
              user_id: userId,
              title: _safeText(plan.title, '未命名小说', 200),
              genre: _safeText(plan.genre, '', 100),
              theme: _safeText(plan.theme),
              setting: _safeText(plan.setting),
              main_plot: _safeText(plan.mainPlot),
              sub_plots: JSON.stringify(Array.isArray(plan.subPlots) ? plan.subPlots : []),
              chapter_count: chapterCount,
              status: planStatus.status,
              current_step: planStatus.currentStep,
            });

            await trx('characters').insert(planCharacters.map(c => ({ novel_id: novelId, ...c })));
            await trx('chapters').insert(planChapters.map(ch => ({ novel_id: novelId, ...ch })));
            novel = await trx('novels').where('id', novelId).first();
          });

          // 发送创建完成事件（含 novelId 用于跳转）
          sendSSE(res, 'novel_created', {
            novelId: novel.id,
            title: novel.title,
            status: plan.characters?.length > 0
              ? (plan.chapters?.length > 0 ? 'chapters_outline' : 'characters')
              : 'outline',
            currentStep: plan.chapters?.length > 0 ? 3 : (plan.characters?.length > 0 ? 2 : 1),
          });

          // 记录用量
          if (result.usage) {
            await _recordUsage(userId, novel.id, 'plan', result.usage, result.model, result.provider);
          }

        } catch (createErr) {
          finalStatus = queueManager.STATUS.FAILED;
          logger.error('自动创建小说失败：' + createErr.message);
          sendSSE(res, 'error', { message: '方案已生成，但自动创建小说失败：' + createErr.message });
          _safeEnd(res);
          return;
        }

        sendSSE(res, 'done', {});
        _safeEnd(res);

      } catch (err) {
        finalStatus = err.status === queueManager.STATUS.CANCELLED || abortController.signal.aborted
          ? queueManager.STATUS.CANCELLED
          : queueManager.STATUS.FAILED;
        logger.error('对话规划失败：' + err.message);
        if (finalStatus !== queueManager.STATUS.CANCELLED && !res.writableEnded) {
          sendSSE(res, 'error', { message: err.message });
        }
        _safeEnd(res);
      } finally {
        if (queueSlot) {
          _cleanupTask(0, 'plan', abortController, finalStatus);
        }
      }
    },
  };
};

// ========== 智能导入分析 ==========
// AI 分析原始文本，提取结构化小说数据（不创建数据库记录，结果返回给前端确认）
agentService.runImportAnalysis = function (userId, text, instructions) {
  if (!text || text.length < 100) {
    throw { status: 400, message: '文本内容过短，请至少提供100字以上的内容' };
  }

  return {
    execute: async (req, res) => {
      const abortController = new AbortController();
      let agent;
      try {
        agent = await _createAgent(null, userId, 'import_analysis', ImportAgent);
      } catch (err) {
        setupSSE(res);
        sendSSE(res, 'error', { message: 'AI 服务初始化失败：' + err.message });
        _safeEnd(res);
        return;
      }
      agent._abortSignal = abortController.signal;

      setupSSE(res);
      req.on('close', () => { abortController.abort(); });

      let queueSlot = null;
      let finalStatus = queueManager.STATUS.COMPLETED;
      try {
        queueSlot = await _acquireQueueSlot(req, res, userId, 0, 'import_analysis', abortController);
        _registerTask(0, 'import_analysis', abortController, {
          userId,
          queueNovelId: 0,
          queuePhase: 'import_analysis',
        });
        agent._abortSignal = abortController.signal;

        const result = await agent.analyzeImport(text, (event, data) => {
          if (!res.writableEnded) sendSSE(res, event, data);
        }, instructions);

        if (abortController.signal.aborted || res.writableEnded) {
          finalStatus = queueManager.STATUS.CANCELLED;
          return;
        }

        sendSSE(res, 'result', result);
        // 同时返回可导入的数据格式，方便前端直接调用 importNovelApi
        sendSSE(res, 'import_payload', {
          title: result.novel?.title || '导入的小说',
          genre: result.novel?.genre || '',
          novel: {
            title: result.novel?.title || '导入的小说',
            genre: result.novel?.genre || '',
            theme: result.novel?.theme || '',
            setting: result.novel?.setting || '',
            main_plot: result.novel?.main_plot || result.novel?.mainPlot || '',
            sub_plots: result.novel?.sub_plots || result.novel?.subPlots || [],
            chapter_count: result.novel?.chapter_count || result.novel?.chapterCount || result.chapters?.length || 0,
          },
          characters: (result.characters || []).map(c => ({
            name: c.name,
            role: c.role,
            age: c.age || '',
            gender: c.gender || '未知',
            appearance: c.appearance || '',
            personality: c.personality || '',
            background: c.background || c.abilities || '',
            motivation: c.motivation || '',
            arc: c.arc || '',
            // 保留对象关系，后端导入会统一归一化，避免丢失关系类型等扩展信息。
            relationships: c.relationships || [],
          })),
          chapters: (result.chapters || []).map(ch => ({
            chapter_number: ch.chapter_number || ch.chapter,
            title: ch.title || `第${ch.chapter_number || ch.chapter}章`,
            brief: ch.brief || ch.synopsis || ch.summary || '',
            summary: ch.summary || '',
            scenes: ch.scenes || ch.key_events || ch.keyEvents || [],
            key_events: ch.key_events || ch.keyEvents || ch.scenes || [],
            conflict: ch.conflict || '',
            turning_point: ch.turning_point || ch.turningPoint || '',
            characters_involved: ch.characters_involved || ch.charactersInvolved || [],
            emotional_tone: ch.emotional_tone || ch.emotionalTone || '',
            ending_hook: ch.ending_hook || ch.endingHook || ch.hook || '',
            content: ch.content || '',
            status: ch.content ? 'completed' : (ch.status || 'outline'),
            word_count: ch.word_count || ch.wordCount || 0,
          })),
        });
        _safeEnd(res);
      } catch (err) {
        finalStatus = err.status === queueManager.STATUS.CANCELLED || abortController.signal.aborted
          ? queueManager.STATUS.CANCELLED
          : queueManager.STATUS.FAILED;
        if (!res.writableEnded) {
          logger.error('智能导入分析失败：' + err.message);
          if (finalStatus !== queueManager.STATUS.CANCELLED) {
            sendSSE(res, 'error', { message: err.status && err.status < 500 ? err.message : '智能导入分析失败，请稍后重试' });
          }
        }
        _safeEnd(res);
      } finally {
        if (queueSlot) {
          _cleanupTask(0, 'import_analysis', abortController, finalStatus);
        }
      }
    },
  };
};

// ========== 多轮对话修订小说方案 ==========
agentService.planRevise = function (userId, novelId, feedback) {
  if (!feedback || feedback.trim().length < 3) {
    throw { status: 400, message: '请提供更详细的修订意见（至少3个字）' };
  }

  const PlanningAgent = require('../core/agents/planningAgent');

  return {
    execute: async (req, res) => {
      const abortController = new AbortController();
      let agent;
      try {
        const ctx = { novel: null, characters: [], allChapters: [] };
        agent = await _createAgent(ctx, userId, 'plan', PlanningAgent);
      } catch (err) {
        setupSSE(res);
        sendSSE(res, 'error', { message: 'AI 服务初始化失败：' + err.message });
        _safeEnd(res);
        return;
      }
      agent._abortSignal = abortController.signal;

      setupSSE(res);
      const onProgress = (event, data) => {
        if (res.writableEnded) return;
        sendSSE(res, event, data);
      };
      _onClose(req, res, abortController, novelId, 'plan_revise');

      let queueSlot = null;
      let finalStatus = queueManager.STATUS.COMPLETED;
      try {
        queueSlot = await _acquireQueueSlot(req, res, userId, novelId, 'plan_revise', abortController);
        _registerTask(novelId, 'plan_revise', abortController, {
          userId,
          queueNovelId: novelId,
          queuePhase: 'plan_revise',
        });
        agent._abortSignal = abortController.signal;

        // 从 DB 加载当前方案
        const novel = await novelDao.findById(novelId);
        if (!novel) {
          sendSSE(res, 'error', { message: '小说不存在' });
          _safeEnd(res);
          return;
        }

        const characters = await characterDao.findByNovelId(novelId);
        const chapters = await chapterDao.findByNovelId(novelId);

        const currentPlan = {
          title: novel.title,
          genre: novel.genre,
          theme: novel.theme,
          setting: novel.setting,
          mainPlot: novel.main_plot,
          subPlots: novel.sub_plots ? parseJson(novel.sub_plots) : [],
          chapterCount: novel.chapter_count,
          characters: characters.map(c => ({
            name: c.name,
            role: c.role,
            age: c.age,
            gender: c.gender,
            personality: c.personality,
            background: c.background,
            motivation: c.motivation,
            arc: c.arc,
            relationships: c.relationships ? parseJson(c.relationships) : [],
          })),
          chapters: chapters.map(ch => ({
            chapter: ch.chapter_number,
            title: ch.title,
            summary: ch.summary,
            keyEvents: ch.scenes ? parseJson(ch.scenes) : [],
            charactersInvolved: ch.characters_involved ? parseJson(ch.characters_involved) : [],
            emotionalTone: ch.emotional_tone,
            endingHook: ch.ending_hook,
          })),
        };

        // 执行修订
        const result = await agent.revisePlan(currentPlan, feedback.trim(), novelId, onProgress);

        if (res.writableEnded || abortController.signal.aborted) {
          finalStatus = queueManager.STATUS.CANCELLED;
          return;
        }

        const plan = result.plan;
        const missingFields = plan?._missingFields || [];
        if (!plan || plan._parseError || missingFields.length > 0) {
          const reason = plan?._parseError
            ? ('修订 JSON 解析失败：' + (plan._rawContent || '').substring(0, 200))
            : ('修订方案不完整，缺少关键字段：' + missingFields.join('、'));
          sendSSE(res, 'error', { message: reason });
          _safeEnd(res);
          return;
        }
        if (!Array.isArray(plan.characters) || plan.characters.length === 0 ||
            !Array.isArray(plan.chapters) || plan.chapters.length === 0) {
          sendSSE(res, 'error', { message: '修订方案缺少角色或章纲数据，请重试' });
          _safeEnd(res);
          return;
        }

        // 发送修订结果
        sendSSE(res, 'plan_result', {
          title: plan.title,
          genre: plan.genre,
          theme: plan.theme,
          setting: plan.setting,
          tone: plan.tone,
          targetAudience: plan.targetAudience,
          mainPlot: plan.mainPlot,
          subPlots: plan.subPlots,
          chapterCount: plan.chapterCount,
          marketAnalysis: plan.marketAnalysis,
          innovationPoints: plan.innovationPoints,
          revisionNote: plan.revisionNote,
          characters: plan.characters,
          chapters: plan.chapters,
        });

        // 更新数据库（更新前检查是否已取消）
        try {
          if (abortController.signal.aborted) {
            logger.info('用户已取消，跳过方案修订保存');
            return;
          }
          const planCharacters = _normalizeGeneratedCharacters(plan.characters);
          const planChapters = _normalizeGeneratedChapters(plan.chapters, {
            from: 1,
            to: _toPositiveInt(plan.chapterCount, novel.chapter_count || plan.chapters.length) || plan.chapters.length,
          });
          if (planCharacters.length === 0 || planChapters.length === 0) {
            throw new Error('修订方案缺少可保存的角色或章节编号');
          }
          const planStatus = _inferPlanStatus(planCharacters, planChapters);
          const chapterCount = Math.max(
            _toPositiveInt(plan.chapterCount, 0) || 0,
            novel.chapter_count || 0,
            planChapters.length,
            Math.max(...planChapters.map(ch => ch.chapter_number))
          );

          await db.transaction(async (trx) => {
            await trx('novels').where('id', novelId).update({
              title: _safeText(plan.title, novel.title, 200),
              genre: _safeText(plan.genre, novel.genre, 100),
              theme: _safeText(plan.theme),
              setting: _safeText(plan.setting),
              main_plot: _safeText(plan.mainPlot),
              sub_plots: JSON.stringify(Array.isArray(plan.subPlots) ? plan.subPlots : []),
              chapter_count: chapterCount,
              status: planStatus.status,
              current_step: planStatus.currentStep,
            });

            await trx('characters').where('novel_id', novelId).del();
            await trx('characters').insert(planCharacters.map(c => ({ novel_id: novelId, ...c })));

            // 修订方案时只替换未写正文的章纲，已完成章节正文和提取结果保留。
            await trx('chapters')
              .where('novel_id', novelId)
              .where((builder) => builder.whereNull('content').orWhere('content', ''))
              .del();
            for (const ch of planChapters) {
              const existing = await trx('chapters')
                .where({ novel_id: novelId, chapter_number: ch.chapter_number })
                .first();
              if (existing?.content) {
                await trx('chapters').where('id', existing.id).update({
                  title: ch.title,
                  brief: ch.brief,
                  summary: existing.summary || ch.summary,
                  scenes: ch.scenes,
                  conflict: ch.conflict,
                  turning_point: ch.turning_point,
                  characters_involved: ch.characters_involved,
                  emotional_tone: ch.emotional_tone,
                  ending_hook: ch.ending_hook,
                  updated_at: db.fn.now(),
                });
              } else {
                await trx('chapters').insert({ novel_id: novelId, ...ch });
              }
            }
          });

          if (result.usage) {
            await _recordUsage(userId, novelId, 'plan_revise', result.usage, result.model, result.provider);
          }

          sendSSE(res, 'revise_done', { message: plan.revisionNote || '方案已更新' });
        } catch (updateErr) {
          finalStatus = queueManager.STATUS.FAILED;
          logger.error('修订后更新数据库失败：' + updateErr.message);
          sendSSE(res, 'error', { message: '方案已生成，但保存失败：' + updateErr.message });
          _safeEnd(res);
          return;
        }

        sendSSE(res, 'done', {});
        _safeEnd(res);

      } catch (err) {
        finalStatus = err.status === queueManager.STATUS.CANCELLED || abortController.signal.aborted
          ? queueManager.STATUS.CANCELLED
          : queueManager.STATUS.FAILED;
        if (res.writableEnded) {
          return;
        }
        logger.error('对话修订失败：' + err.message);
        if (finalStatus !== queueManager.STATUS.CANCELLED) {
          sendSSE(res, 'error', { message: err.message });
        }
        _safeEnd(res);
      } finally {
        if (queueSlot) {
          _cleanupTask(novelId, 'plan_revise', abortController, finalStatus);
        }
      }
    },
  };
};

// ========== 通用AI多轮对话（支持持久化） ==========
agentService.chat = function (userId, message, conversationId, fileList) {
  if (!message || message.trim().length < 1) {
    throw { status: 400, message: '请输入消息内容' };
  }

  const chatDao = require('../dao/chatDao');
  const fs = require('fs');

  return {
    execute: async (req, res) => {
      const abortController = new AbortController();
      let agent;
      try {
        const ctx = { novel: null, characters: [], allChapters: [] };
        agent = await _createAgent(ctx, userId, 'chat');
      } catch (err) {
        setupSSE(res);
        sendSSE(res, 'error', { message: 'AI 服务初始化失败：' + err.message });
        _safeEnd(res);
        return;
      }
      agent._abortSignal = abortController.signal;

      setupSSE(res);
      _onClose(req, res, abortController, 0, 'chat');

      let queueSlot = null;
      let finalStatus = queueManager.STATUS.COMPLETED;
      let resolvedConvId = conversationId;
      let filePathsToClean = [];
      try {
        queueSlot = await _acquireQueueSlot(req, res, userId, 0, 'chat', abortController);
        agent._abortSignal = abortController.signal;

        // 自动创建对话（无 conversationId 时）
        if (!resolvedConvId) {
          const title = message.trim().substring(0, 50);
          resolvedConvId = await chatDao.create(userId, title);
        } else {
          const conv = await chatDao.findById(resolvedConvId, userId);
          if (!conv) {
            throw { status: 404, message: '对话不存在' };
          }
        }

        // 构建用于数据库存储的消息内容（包含文件引用信息）
        let storedMessage = message.trim();
        filePathsToClean = (fileList || []).map(f => f.path);

        if (fileList && fileList.length > 0) {
          const fileNames = fileList.map(f => f.originalName).join(', ');
          storedMessage += `\n\n[已上传文件：${fileNames}]`;

          // 通知前端已上传的文件列表
          sendSSE(res, 'file_uploads', {
            files: fileList.map(f => ({
              name: f.originalName,
              size: f.size,
              isImage: f.isImage,
            })),
          });
        }

        // 保存用户消息（含文件引用标记）
        await chatDao.addMessage(resolvedConvId, 'user', storedMessage);
        await chatDao.touch(resolvedConvId, userId);

        // 检查是否为首条消息，自动设置标题
        const msgCount = (await chatDao.listMessages(resolvedConvId)).length;
        if (msgCount <= 1) {
          const autoTitle = message.trim().substring(0, 50);
          await chatDao.updateTitle(resolvedConvId, userId, autoTitle);
        }

        // 发送 conversationId 给前端用于后续请求
        sendSSE(res, 'conversation', { conversationId: resolvedConvId });

        // 从数据库构建权威上下文，避免信任前端 history 或重复加入当前消息。
        const maxHistory = 20;
        const dbMessages = await chatDao.listMessages(resolvedConvId);
        const historyMessages = dbMessages
          .slice(-maxHistory)
          .filter((msg) => (msg.role === 'user' || msg.role === 'assistant') && msg.content)
          .map((msg) => ({ role: msg.role, content: String(msg.content) }));

        // 构建包含文件内容的最终用户消息（多模态支持）
        const lastUserMessage = { role: 'user', content: message.trim() };

        const hasImageUploads = (fileList || []).some(file => file.isImage);

        // 处理上传文件：文本文件读取内容拼接，图片转为 vision 格式
        if (fileList && fileList.length > 0) {
          const textParts = [];
          const visionParts = [];

          for (const file of fileList) {
            if (file.isImage) {
              try {
                const imgData = fs.readFileSync(file.path);
                const base64 = imgData.toString('base64');
                const mime = file.mimetype || 'image/png';
                visionParts.push({
                  type: 'image_url',
                  image_url: { url: `data:${mime};base64,${base64}`, detail: 'auto' },
                });
              } catch (readErr) {
                logger.error(`读取图片文件失败：${file.originalName} — ${readErr.message}`);
              }
            } else {
              // 文本文件：读取内容
              try {
                const content = fs.readFileSync(file.path, 'utf-8');
                if (content && content.trim()) {
                  const truncated = content.substring(0, 12000);
                  textParts.push(`\n\n=== 文件：${file.originalName} ===\n${truncated}`);
                }
              } catch (readErr) {
                // 非UTF-8编码或二进制文件，仅记录文件名
                textParts.push(`\n\n[用户上传了文件：${file.originalName}（${(file.size / 1024).toFixed(1)}KB）]`);
              }
            }
          }

          // 构建消息内容
          if (visionParts.length > 0) {
            // 多模态：图片 + 文本
            const contentArray = [{ type: 'text', text: message.trim() }];
            if (textParts.length > 0) {
              contentArray.push({ type: 'text', text: textParts.join('') });
            }
            contentArray.push(...visionParts);
            lastUserMessage.content = contentArray;
          } else if (textParts.length > 0) {
            lastUserMessage.content = message.trim() + textParts.join('');
          }
        }

        // 最终消息列表：历史 + 当前（文件增强）用户消息
        // 历史消息最后一条是刚存入的用户消息（含文件引用标记），用增强版替换
        const messages = historyMessages.slice(0, -1).concat([lastUserMessage]);

        const systemPrompt =
          '你是一位专业的小说创作助手。你可以：\n' +
          '1. 与用户讨论写作创意、故事构思、角色设计、世界观设定\n' +
          '2. 提供写作建议、文学技巧、叙事结构分析\n' +
          '3. 回答关于小说创作、出版、类型文学的任何问题\n' +
          '4. 进行头脑风暴，帮助用户突破写作瓶颈\n' +
          '5. 如果用户上传了文件或图片，请根据文件/图片内容进行针对性分析\n' +
          '请用热情、专业且富有启发性的方式回答，像一位经验丰富的写作导师。';

        const { content, usage, model, provider, skipReasons } = await agent.callLLMStream(
          systemPrompt,
          message.trim(),
          0.8,
          (chunk) => {
            if (!res.writableEnded) sendSSE(res, 'chunk', { text: chunk });
          },
          'chat',
          abortController.signal,
          undefined,
          { messages, requireVision: hasImageUploads }
        );

        if (skipReasons && skipReasons.length > 0) {
          sendSSE(res, 'model_fallback', {
            preferredModel: agent.preferredModel,
            actualModel: model,
            reasons: skipReasons,
          });
        }

        // 保存 AI 回复
        if (content && content.trim()) {
          await chatDao.addMessage(resolvedConvId, 'assistant', content.trim());
          await chatDao.touch(resolvedConvId, userId);
        }

        await _recordUsage(userId, 0, 'chat', usage, model, provider);
        sendSSE(res, 'done', { conversationId: resolvedConvId });
        _safeEnd(res);

      } catch (err) {
        finalStatus = err.status === queueManager.STATUS.CANCELLED || abortController.signal.aborted
          ? queueManager.STATUS.CANCELLED
          : queueManager.STATUS.FAILED;
        if (finalStatus !== queueManager.STATUS.CANCELLED && !res.writableEnded) {
          logger.error('AI对话失败：' + err.message);
          sendSSE(res, 'error', { message: err.status && err.status < 500 ? err.message : 'AI 对话处理失败，请稍后重试' });
        }
        _safeEnd(res);
      } finally {
        // 清理上传的文件
        filePathsToClean.forEach((p) => {
          try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* 忽略 */ }
        });
        if (queueSlot) {
          _releaseQueueSlot(queueSlot, finalStatus);
        }
      }
    },
  };
};

agentService.clearUserCache = function (userId) {
  _clearAgentCache(userId);
};

agentService.clearAllCaches = function () {
  _agentCache.clear();
};

module.exports = agentService;
