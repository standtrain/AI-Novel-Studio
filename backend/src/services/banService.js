const banDao = require('../dao/banDao');
const configDao = require('../dao/configDao');
const OpenAI = require('openai');

// 申诉审核模式常量
const APPEAL_REVIEW_MODES = {
  AUTO: 'auto',
  AI: 'ai',
  AI_MANUAL: 'ai_manual',
  MANUAL: 'manual',
};

async function getAppealReviewMode() {
  const val = await configDao.get('appeal_review_mode');
  return val || APPEAL_REVIEW_MODES.MANUAL;
}

async function getAiReviewConfig() {
  const providerName = await configDao.get('appeal_review_provider');
  const modelName = await configDao.get('appeal_review_model');
  return { providerName: providerName || null, modelName: modelName || null };
}

async function aiReviewAppeal(appeal, ban, user) {
  const reviewConfig = await getAiReviewConfig();
  const providers = (() => {
    try {
      const { getProviders } = require('../config/openai');
      return getProviders();
    } catch { return []; }
  })();

  let baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  let apiKey = process.env.OPENAI_API_KEY || 'sk-placeholder';
  let model = process.env.OPENAI_MODEL || 'gpt-4o';

  if (reviewConfig.providerName && reviewConfig.modelName) {
    const provider = providers.find(p => p.name === reviewConfig.providerName);
    if (provider) {
      baseURL = provider.baseUrl || baseURL;
      apiKey = provider.apiKey || apiKey;
      model = reviewConfig.modelName;
    }
  }

  const openai = new OpenAI({ baseURL, apiKey });

  const prompt = `请审核以下用户的账号申诉，判断是否应该解封该用户。

用户信息：
- 用户名：${user.username}
- 邮箱：${user.email}

封禁类型：${ban.type === 'ban' ? '管理员封禁' : '用户自行注销'}
封禁原因：${ban.reason || '未填写'}
封禁时间：${ban.created_at}

用户申诉内容：
${appeal.content}

请根据以下标准判断：
1. 申诉态度是否诚恳
2. 是否承认问题并承诺改正
3. 是否有合理的解封理由
4. 申诉内容是否具体、有说服力

请以JSON格式回复：
{
  "approved": true/false,
  "confidence": 0-100,
  "reason": "审核理由（中文，简短）",
  "suggestion": "处理建议（中文）"
}`;

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: '你是一个公正的账号申诉审核助手，请严格按照审核标准输出JSON格式结果。' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
    max_tokens: 500,
  });

  const text = response.choices[0]?.message?.content || '';
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch { /* ignore */ }
  return { approved: false, confidence: 0, reason: 'AI审核解析失败，转人工处理', suggestion: '' };
}

const banService = {
  APPEAL_REVIEW_MODES,

  // 管理员封禁用户
  async banUser(userId, operatorId, reason) {
    const existing = await banDao.getActiveBan(userId);
    if (existing) throw { status: 409, message: '该用户已处于封禁状态' };

    const id = await banDao.createBan({
      user_id: userId,
      type: 'ban',
      reason: reason || null,
      operator_id: operatorId,
      status: 'active',
    });
    return { id, message: '用户已封禁' };
  },

  // 管理员解封用户
  async unbanUser(banId, operatorId) {
    await banDao.liftBan(banId, operatorId);
    return { message: '封禁已解除' };
  },

  // 用户注销（记录到 user_bans）
  async deactivateUser(userId) {
    const existing = await banDao.getActiveBan(userId);
    if (existing) {
      // 已有封禁记录，直接禁用（不创建新记录避免重复）
      return { message: '账号已禁用' };
    }
    await banDao.createBan({
      user_id: userId,
      type: 'deactivate',
      reason: '用户自行注销账号',
      operator_id: userId,
      status: 'active',
    });
    return { message: '账号已注销' };
  },

  // 获取封禁列表
  async listBans(params) {
    return banDao.listAll(params);
  },

  // 用户提交申诉（公开接口，不需要登录）
  async submitAppeal(banId, userId, content) {
    if (!content || !content.trim()) throw { status: 400, message: '申诉内容不能为空' };
    const ban = await banDao.getActiveBan(userId);
    if (!ban || ban.id !== parseInt(banId)) throw { status: 404, message: '封禁记录不存在或已解除' };
    if (ban.type !== 'ban') throw { status: 400, message: '自助注销的账号不支持申诉，请联系管理员' };

    // 检查是否已有待审核的申诉
    const latest = await banDao.getLatestAppeal(banId, userId);
    if (latest && latest.status === 'pending') throw { status: 409, message: '已有待审核的申诉，请耐心等待' };

    const { db } = require('../config/database');
    const user = await db('users').where({ id: userId }).first();
    if (!user) throw { status: 404, message: '用户不存在' };

    const appealId = await banDao.createAppeal({
      ban_id: banId,
      user_id: userId,
      content: content.trim(),
      status: 'pending',
    });
    const ticketService = require('./ticketService');
    await ticketService.createOrUpdateAppealTicket({
      appealId,
      userId,
      content: content.trim(),
      status: 'open',
    });

    // 执行 AI 审核
    const mode = await getAppealReviewMode();
    const appeal = { id: appealId, content: content.trim() };
    let aiResult = null;

    if (mode === APPEAL_REVIEW_MODES.AUTO) {
      await banDao.liftBan(ban.id, null);
      const reviewNote = '系统自动审核通过，账号已解封';
      await db('user_appeals').where({ id: appealId }).update({
        status: 'approved',
        review_note: reviewNote,
        reviewed_by: null,
      });
      await ticketService.syncAppealAutoReview({
        appealId,
        aiResult: null,
        status: 'approved',
        message: reviewNote,
      });
      return { appealId, status: 'approved', message: '申诉已自动通过，账号已解封' };
    }

    if (mode === APPEAL_REVIEW_MODES.AI || mode === APPEAL_REVIEW_MODES.AI_MANUAL) {
      try {
        aiResult = await aiReviewAppeal(appeal, ban, user);
      } catch {
        aiResult = null;
      }

      if (aiResult) {
        await db('user_appeals').where({ id: appealId }).update({ ai_result: JSON.stringify(aiResult) });
        await ticketService.createOrUpdateAppealTicket({
          appealId,
          userId,
          content: content.trim(),
          aiResult,
          status: 'open',
        });

        if (mode === APPEAL_REVIEW_MODES.AI) {
          // AI 自动处理
          if (aiResult.approved && aiResult.confidence >= 70) {
            const reviewNote = `AI自动审核通过 (置信度: ${aiResult.confidence}%)：${aiResult.reason}`;
            await banDao.liftBan(ban.id, null);
            await db('user_appeals').where({ id: appealId }).update({
              status: 'approved',
              review_note: reviewNote,
              reviewed_by: null,
            });
            await ticketService.syncAppealAutoReview({
              appealId,
              aiResult,
              status: 'approved',
              message: reviewNote,
            });
            return { appealId, status: 'approved', message: 'AI审核通过，账号已自动解封', aiResult };
          }
          if (!aiResult.approved && aiResult.confidence >= 70) {
            const reviewNote = `AI自动审核拒绝 (置信度: ${aiResult.confidence}%)：${aiResult.reason}`;
            await db('user_appeals').where({ id: appealId }).update({
              status: 'rejected',
              review_note: reviewNote,
              reviewed_by: null,
            });
            await ticketService.syncAppealAutoReview({
              appealId,
              aiResult,
              status: 'rejected',
              message: reviewNote,
            });
            return { appealId, status: 'rejected', message: 'AI审核未通过', aiResult };
          }
        }
      }
    }

    return { appealId, status: 'pending', message: '申诉已提交，请等待管理员审核', mode, aiResult };
  },

  // 获取申诉列表
  async listAppeals(params) {
    return banDao.listAppeals(params);
  },

  // 审核申诉
  async reviewAppeal(appealId, { action, note }, reviewerId, options = {}) {
    const appeal = await banDao.getAppealById(appealId);
    if (!appeal) throw { status: 404, message: '申诉不存在' };
    if (appeal.status !== 'pending') throw { status: 400, message: '该申诉已处理' };
    const shouldSyncTicket = options.syncTicket !== false;

    if (action === 'approve') {
      // 通过申诉 → 解封
      const ban = await banDao.getActiveBan(appeal.user_id);
      if (ban) await banDao.liftBan(ban.id, reviewerId);
      const reviewNote = note || '管理员审核通过，账号已解封';
      await banDao.reviewAppeal(appealId, {
        status: 'approved',
        note: reviewNote,
        reviewerId,
      });
      const result = { status: 'approved', message: '申诉已通过，用户已解封' };
      if (shouldSyncTicket) {
        const ticketService = require('./ticketService');
        await ticketService.syncAppealReviewResult({ appealId, reviewResult: result, reviewerId, note: reviewNote });
      }
      return result;
    }
    if (action === 'reject') {
      const reviewNote = note || '管理员审核未通过';
      await banDao.reviewAppeal(appealId, {
        status: 'rejected',
        note: reviewNote,
        reviewerId,
      });
      const result = { status: 'rejected', message: '申诉已拒绝' };
      if (shouldSyncTicket) {
        const ticketService = require('./ticketService');
        await ticketService.syncAppealReviewResult({ appealId, reviewResult: result, reviewerId, note: reviewNote });
      }
      return result;
    }
    throw { status: 400, message: '无效的审核操作' };
  },

  // 获取和设置申诉审核模式
  async getReviewModeConfig() {
    const mode = await getAppealReviewMode();
    return {
      mode,
      modes: [
        { value: 'auto', label: '自动通过', desc: '所有申诉自动通过' },
        { value: 'ai', label: 'AI审核', desc: '由AI自动审核申诉，通过或拒绝均由AI决定' },
        { value: 'ai_manual', label: 'AI+手动', desc: 'AI审核后转人工复核' },
        { value: 'manual', label: '手动审核', desc: '所有申诉需管理员手动处理' },
      ],
    };
  },

  async setReviewModeConfig(mode) {
    if (!Object.values(APPEAL_REVIEW_MODES).includes(mode)) {
      throw { status: 400, message: '无效的审核模式' };
    }
    await configDao.set('appeal_review_mode', mode);
    return { mode };
  },

  async getAiReviewProviderConfig() {
    const providerName = await configDao.get('appeal_review_provider');
    const modelName = await configDao.get('appeal_review_model');
    const providers = (() => {
      try {
        const { getProviders } = require('../config/openai');
        return getProviders();
      } catch { return []; }
    })();
    const filtered = providers.map(p => ({
      name: p.name,
      baseUrl: p.baseUrl,
      models: p.models
        .filter(m => m.phases.includes('review') || m.phases.includes('all'))
        .map(m => ({ name: m.name })),
    })).filter(p => p.models.length > 0);

    return {
      providerName: providerName || '',
      modelName: modelName || '',
      providers: filtered.length > 0 ? filtered : providers.map(p => ({
        name: p.name,
        baseUrl: p.baseUrl,
        models: p.models.map(m => ({ name: m.name })),
      })),
    };
  },

  async setAiReviewProviderConfig(providerName, modelName) {
    await configDao.set('appeal_review_provider', providerName || '');
    await configDao.set('appeal_review_model', modelName || '');
    return { providerName: providerName || '', modelName: modelName || '' };
  },
};

module.exports = banService;
