// Agent SSE 编排服务
// 负责在 Express SSE 上下文和多个 Agent 之间架桥
// 写章主链（6步）：上下文→起草→审查→润色→数据提取→持久化

const NovelWritingAgent = require('../core/agents/novelAgent');
const ContextAgent = require('../core/agents/contextAgent');
const ReviewerAgent = require('../core/agents/reviewerAgent');
const DataAgent = require('../core/agents/dataAgent');
const ContextManager = require('../core/utils/contextManager');
const novelDao = require('../dao/novelDao');
const chapterDao = require('../dao/chapterDao');
const characterDao = require('../dao/characterDao');
const configDao = require('../dao/configDao');
const usageService = require('./usageService');
const queueManager = require('./queueManager');
const { createLogger } = require('../utils/logger');
const { countWords, stripWordCountLabel } = require('../core/utils/wordCounter');

const logger = createLogger('agent');

// ========== 阶段映射 ==========
// 内部子阶段映射到对外暴露的 4 个主阶段，确保技能/MCP 配置正确匹配
const PHASE_MAP = {
  context_assembly: 'write_chapter',
  review: 'write_chapter',
  polish: 'write_chapter',
  data_extraction: 'write_chapter',
};

function _normalizePhase(phase) {
  return PHASE_MAP[phase] || phase;
}

// ========== Agent 创建 ==========

async function _createAgent(ctx, userId, phase, AgentClass = NovelWritingAgent) {
  const agentOptions = {};

  const maxTokens = await configDao.getInt('max_tokens_per_request', 0);

  if (userId) {
    try {
      const userDao = require('../dao/userDao');
      const user = await userDao.findById(userId);
      if (user && user.preferred_model && user.can_choose_model) {
        agentOptions.preferredModel = user.preferred_model;
      }
      const modelTokenService = require('./modelTokenService');
      agentOptions.checkLimitFn = (providerName, modelName) =>
        modelTokenService.checkModelAvailability(providerName, modelName);
    } catch (err) {
      logger.warn('加载用户模型偏好失败：' + err.message);
    }
  }

  const agent = new AgentClass(ctx, agentOptions);
  agent.maxTokens = maxTokens === 0 ? undefined : maxTokens;

  // 注入技能提示词（精确阶段 + 映射父阶段，去重合并）
  if (userId && phase) {
    try {
      const skillService = require('./skillService');
      const ctxVars = {
        title: ctx?.novel?.title,
        genre: ctx?.novel?.genre,
        theme: ctx?.novel?.theme,
      };
      // 查询精确阶段技能
      const exactSkills = await skillService.getActiveSkillPrompts(userId, phase, ctxVars);
      // 如果是子阶段，同时查询父阶段技能
      const parentPhase = _normalizePhase(phase);
      let parentSkills = [];
      if (parentPhase !== phase) {
        parentSkills = await skillService.getActiveSkillPrompts(userId, parentPhase, ctxVars);
      }
      // 合并去重（按 name 去重，精确阶段优先）
      const seen = new Set();
      const merged = [...exactSkills, ...parentSkills].filter(s => {
        if (seen.has(s.name)) return false;
        seen.add(s.name);
        return true;
      });
      agent.skills = merged;
    } catch (err) {
      logger.warn('加载技能失败：' + err.message);
    }
  }

  // 注入 MCP 工具
  if (userId) {
    try {
      const mcpService = require('./mcpService');
      const mcpTools = await mcpService.getAvailableUserTools(userId);
      agent.mcpTools = mcpTools;
    } catch (err) {
      logger.warn('加载 MCP 工具失败：' + err.message);
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
    existing.abort();
    _activeTasks.delete(key);
  }
}

function _registerTask(novelId, phase, abortController) {
  const key = _taskKey(novelId, phase);
  _cancelTask(novelId, phase);
  _activeTasks.set(key, abortController);
}

function _cleanupTask(novelId, phase) {
  const key = _taskKey(novelId, phase);
  _activeTasks.delete(key);
}

// 如果该 novel + phase 已有进行中任务，抛出 409 拒绝新请求
function _rejectIfActive(novelId, phase) {
  const key = _taskKey(novelId, phase);
  if (_activeTasks.has(key)) {
    throw { status: 409, message: '该操作正在进行中，请等待完成' };
  }
  // 也检查相关的写章任务（写章时不允许独立审查/提取）
  const writeKey = _taskKey(novelId, 'write_chapter');
  if (phase !== 'write_chapter' && _activeTasks.has(writeKey)) {
    throw { status: 409, message: '章节正在生成中，请等待完成后再操作' };
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
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function _isAutoMode(req) {
  return req.query?.auto === 'true';
}

function _onClose(req, res, abortController, novelId, phase) {
  req.on('close', () => {
    if (!res.writableEnded) {
      if (_isAutoMode(req)) {
        logger.info(`auto 模式：客户端断开，后台继续生成（novelId=${novelId}, phase=${phase}）`);
      } else {
        logger.info(`客户端断开连接，取消生成（novelId=${novelId}, phase=${phase}）`);
        abortController.abort();
      }
    }
  });
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
  await usageService.recordUsage(userId, novelId, phase, usage, model);
  try {
    const modelTokenService = require('./modelTokenService');
    await modelTokenService.recordUsage(provider, model, usage.total_tokens || usage.totalTokens || 0);
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
  _registerTask(novelId, phase, abortController);
  agent._abortSignal = abortController.signal;

  setupSSE(res);
  const onProgress = (event, data) => {
    if (res.writableEnded) return;
    sendSSE(res, event, data);
  };
  _onClose(req, res, abortController, novelId, phase);

  task(onProgress)
    .then(async (result) => {
      if (res.writableEnded) return;
      try {
        await onDone(result, res);
      } catch (innerErr) {
        logger.error(logLabel + '成功回调失败：' + innerErr.message);
        sendSSE(res, 'error', { message: '数据保存失败' });
      }
      res.end();
      _cleanupTask(novelId, phase);
    })
    .catch((err) => {
      if (res.writableEnded) return;
      logger.error(logLabel + '失败：' + err.message);
      sendSSE(res, 'error', { message: err.message });
      res.end();
      _cleanupTask(novelId, phase);
    });
}
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
              age: (typeof c.age === 'number' && !isNaN(c.age)) ? c.age : null,
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
            sendSSE(res, 'error', { message: '生成章节大纲格式错误，请重试' });
            return;
          }
          if (isFirstBatch) {
            await chapterDao.deleteByNovelId(novelId);
          }
          await Promise.all(chapters.map(ch => {
            const base = {
              novel_id: novelId,
              chapter_number: ch.chapter || 0,
              title: ch.title || '未命名',
              scenes: JSON.stringify(ch.scenes || []),
              conflict: ch.conflict || null,
              turning_point: ch.turningPoint || null,
              characters_involved: JSON.stringify(ch.charactersInvolved || []),
              emotional_tone: ch.emotionalTone || null,
              ending_hook: ch.endingHook || null,
              status: 'outline',
            };
            return isFirstBatch ? chapterDao.create(base) : chapterDao.upsert(base);
          }));
          await novelDao.update(novelId, { status: 'chapters_outline', current_step: 3 });
          await ctx.persist();
          await _recordUsage(userId, novelId, 'chapter_outline', usage, model, provider);
          const hasMore = endChapter < totalChapters;
          sendSSE(res, 'done', { batchStart: from, batchEnd: endChapter, totalChapters, hasMore, nextStart: hasMore ? endChapter + 1 : null });
        },
      }),
    };
  },

  // ========== 阶段4：写章节（6步主链） ==========
  // 上下文组装 → 起草 → 审查 → 润色修复 → 数据提取 → 持久化
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
        _registerTask(novelId, 'write_chapter', abortController);
        writingAgent._abortSignal = abortController.signal;

        setupSSE(res);
        const onProgress = (event, data) => {
          if (res.writableEnded) return;
          sendSSE(res, event, data);
        };

        _onClose(req, res, abortController, novelId, 'write_chapter');

        (async () => {
          try {
            // ===== Step 1: 上下文组装 → 写作任务书 =====
            sendSSE(res, 'progress', { step: 'context', message: 'Step 1/5: 正在组装写作任务书...' });

            let writingBrief = null;
            try {
              const contextAgent = await _createAgent(ctx, userId, 'context_assembly', ContextAgent);
              contextAgent._abortSignal = abortController.signal;

              // 任务书不向用户流式展示，只发进度通知
              const contextProgress = (event, data) => {
                if (event === 'progress') onProgress(event, data);
                // chunk 事件不发送（任务书是内部参考，不展示给用户）
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
              // 降级：不使用任务书，NovelWritingAgent 会自动使用原有 prompt
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
              res.end();
              _cleanupTask(novelId, 'write_chapter');
              return;
            }

            let finalContent = _stripMetaCommentary(chapter.content);
            let reviewResult = null;
            let extractionResult = null;

            // ===== Step 3: 审查 =====
            try {
              sendSSE(res, 'progress', { step: 'review', message: 'Step 3/5: 正在审查章节质量...' });

              const reviewerAgent = await _createAgent(ctx, userId, 'review', ReviewerAgent);
              reviewerAgent._abortSignal = abortController.signal;

              // 审查不流式输出，结果由 agent 返回值提供
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

              // ===== Step 4: 润色修复 =====
              const blockingIssues = (reviewResult.issues || []).filter(i => i.blocking);
              const nonBlockingIssues = (reviewResult.issues || []).filter(i => !i.blocking);

              if (blockingIssues.length > 0) {
                sendSSE(res, 'progress', { step: 'polish', message: `Step 4/5: 发现${blockingIssues.length}个阻断问题，正在修复...` });

                // 构建修复 prompt
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
              } else if (nonBlockingIssues.length > 0) {
                sendSSE(res, 'progress', { step: 'polish', message: `Step 4/5: 发现${nonBlockingIssues.length}个非阻断问题，已记录` });
              } else {
                sendSSE(res, 'progress', { step: 'polish', message: 'Step 4/5: 审查通过，无问题' });
              }

            } catch (reviewErr) {
              logger.warn('审查流程失败：' + reviewErr.message);
              sendSSE(res, 'progress', { message: '审查步骤跳过（审查服务异常），继续后续流程...' });
            }

            // ===== Step 5: 数据提取 =====
            try {
              sendSSE(res, 'progress', { step: 'extract', message: 'Step 5/5: 正在提取结构化数据...' });

              const dataAgent = await _createAgent(ctx, userId, 'data_extraction', DataAgent);
              dataAgent._abortSignal = abortController.signal;

              const knownEntities = characters.map(c => ({
                id: c.name.toLowerCase().replace(/[^a-z0-9一-鿿]/g, '_'),
                name: c.name,
                type: '角色',
              }));

              // 数据提取不流式输出，结果由 agent 返回值提供
              extractionResult = await dataAgent.extractChapterData({
                chapterContent: finalContent,
                chapterNumber,
                knownEntities,
                characters,
              });

              sendSSE(res, 'extraction_result', {
                chapterNumber,
                entityCount: extractionResult.entities_appeared?.length || 0,
                deltaCount: extractionResult.state_deltas?.length || 0,
                eventCount: extractionResult.accepted_events?.length || 0,
                sceneCount: extractionResult.scenes?.length || 0,
                summary: extractionResult.summary_text || '',
              });

            } catch (extractErr) {
              logger.warn('数据提取失败：' + extractErr.message);
              sendSSE(res, 'progress', { message: '数据提取跳过（提取服务异常）' });
            }

            // ===== Step 6: 持久化 =====
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

            // 检查是否全部完成
            const updatedChapters = await chapterDao.findByNovelId(novelId);
            const allDone = updatedChapters.every(c => c.status === 'completed');
            if (allDone && updatedChapters.length >= totalChapters) {
              await novelDao.update(novelId, { status: 'completed' });
            }

            await ctx.persist();
            await _recordUsage(userId, novelId, 'write_chapter', writeUsage, model, provider);

            // 最终结果
            sendSSE(res, 'result', {
              chapter: {
                chapterNumber,
                title: chapterData.title,
                content: finalContent,
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
            res.end();
            _cleanupTask(novelId, 'write_chapter');

          } catch (err) {
            if (res.writableEnded) return;
            logger.error('章节写作失败：' + err.message);
            sendSSE(res, 'error', { message: err.message });
            res.end();
            _cleanupTask(novelId, 'write_chapter');
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
        _registerTask(novelId, 'revise_' + phase, abortController);

        setupSSE(res);
        const onProgress = (event, data) => {
          if (res.writableEnded) return;
          sendSSE(res, event, data);
        };

        _onClose(req, res, abortController, novelId, 'revise_' + phase);

        (async () => {
          try {
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
            res.end();
            _cleanupTask(novelId, 'revise_' + phase);
          } catch (err) {
            if (res.writableEnded) return;
            logger.error('修订失败：' + err.message);
            sendSSE(res, 'error', { message: err.message });
            res.end();
            _cleanupTask(novelId, 'revise_' + phase);
          }
        })();
      },
    };
  },
};

module.exports = agentService;
