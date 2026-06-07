const OpenAI = require('openai');
const { db } = require('../config/database');
const ticketDao = require('../dao/ticketDao');
const inmailDao = require('../dao/inmailDao');
const banDao = require('../dao/banDao');
const configDao = require('../dao/configDao');
const { createLogger } = require('../utils/logger');

const TICKET_TYPES = ['general', 'appeal'];
const TICKET_STATUSES = ['open', 'answered', 'resolved', 'closed'];
const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const ADMIN_REPLY_TYPES = ['admin', 'ai'];
const TICKET_AI_REPLY_MODES = {
  MANUAL: 'manual',
  AI_MANUAL: 'ai_manual',
  AI_AUTO: 'ai_auto',
};
const TICKET_AI_REPLY_MODE_KEY = 'ticket_ai_reply_mode';
const logger = createLogger('ticket-service');

function parseJsonMaybe(value) {
  if (!value || typeof value !== 'string') return value || null;
  try { return JSON.parse(value); } catch { return value; }
}

function normalizeText(value, fieldName, { min = 1, max = 5000 } = {}) {
  if (typeof value !== 'string') {
    throw { status: 400, message: `${fieldName}格式不正确` };
  }
  const text = value.trim();
  if (text.length < min) {
    throw { status: 400, message: `${fieldName}不能少于${min}个字符` };
  }
  if (text.length > max) {
    throw { status: 400, message: `${fieldName}不能超过${max}个字符` };
  }
  return text;
}

function normalizeEnum(value, allowed, fieldName, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (!allowed.includes(value)) {
    throw { status: 400, message: `${fieldName}不合法` };
  }
  return value;
}

function normalizeQuery(value) {
  if (value === undefined || value === null || value === '') return undefined;
  return normalizeText(String(value), '搜索关键词', { min: 1, max: 80 });
}

function getLatestUserMessage(ticket, replies) {
  const latestUserReply = [...replies].reverse().find(reply => reply.sender_type === 'user');
  return String(latestUserReply?.content || ticket.content || '');
}

function hasExplicitHumanRequest(text) {
  const normalized = String(text || '').replace(/\s+/g, '');
  if (!normalized) return false;

  const negatedHumanRequest = /(不|无需|不用|别|不要|暂不|先不).{0,8}(转人工|人工客服|人工处理|人工回复|人工介入|联系人工|找人工|客服介入|管理员处理|人工跟进|人工复核)/;
  if (negatedHumanRequest.test(normalized)) return false;

  const explicitHumanRequest = /(转人工|人工客服|人工处理|人工回复|人工介入|联系人工|找人工|真人客服|人工服务|客服介入|管理员处理|请管理员|找管理员|投诉|升级工单|升级处理|人工跟进|人工复核)/;
  return explicitHumanRequest.test(normalized);
}

function decorateTicket(ticket) {
  if (!ticket) return ticket;
  const aiResult = parseJsonMaybe(ticket.ai_result);
  return {
    ...ticket,
    ai_result: aiResult,
    // 普通工单AI+手动模式会写入该标记，方便管理端一眼看到需要人工复核的工单。
    needs_manual_review: Boolean(aiResult?.ticket_ai_reply?.needsHuman),
    ai_manual_reason: aiResult?.ticket_ai_reply?.reason || '',
    appeal_ai_result: parseJsonMaybe(ticket.appeal_ai_result),
  };
}

function assertTicketOwner(ticket, userId) {
  if (!ticket || ticket.user_id !== userId) {
    throw { status: 404, message: '工单不存在' };
  }
}

function assertReplyAllowed(ticket) {
  if (['resolved', 'closed'].includes(ticket.status)) {
    throw { status: 400, message: '工单已结束，不能继续回复' };
  }
}

async function notifyUserByReply(ticket, replyId, content) {
  // 先认领回复通知状态，只有认领成功的一次请求会创建站内信。
  const claimed = await ticketDao.markReplyNotified(replyId);
  if (!claimed) return false;

  const title = ticket.type === 'appeal' ? '申诉工单已处理' : '工单已回复';
  try {
    await inmailDao.create(ticket.user_id, {
      title,
      content: `你的${ticket.type === 'appeal' ? '申诉工单' : '工单'}「${ticket.title}」有新的回复：\n${content}`,
      notification_id: null,
    });
  } catch (err) {
    await ticketDao.clearReplyNotified(replyId);
    throw err;
  }
  return true;
}

async function buildOpenAIClient() {
  const { getProviders } = require('../config/openai');
  const providers = getProviders();
  const providerName = await configDao.get('appeal_review_provider');
  const modelName = await configDao.get('appeal_review_model');
  let provider = providerName ? providers.find(p => p.name === providerName) : providers[0];
  let modelInfo = null;

  if (provider) {
    modelInfo = modelName ? provider.models?.find(m => m.name === modelName) : null;
    modelInfo = modelInfo || provider.models?.find(m => m.phases?.includes('review') || m.phases?.includes('all')) || provider.models?.[0];
  }

  if (!provider || !modelInfo) {
    provider = {
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      apiKey: process.env.OPENAI_API_KEY || '',
    };
    modelInfo = { name: process.env.OPENAI_MODEL || 'gpt-4o' };
  }

  if (!provider.apiKey) {
    throw { status: 400, message: '未配置可用的AI模型密钥' };
  }

  return {
    client: new OpenAI({ baseURL: provider.baseUrl, apiKey: provider.apiKey }),
    model: modelInfo.name,
  };
}

async function getTicketAiReplyMode() {
  const mode = await configDao.get(TICKET_AI_REPLY_MODE_KEY);
  return Object.values(TICKET_AI_REPLY_MODES).includes(mode) ? mode : TICKET_AI_REPLY_MODES.MANUAL;
}

function buildAiReplyPrompt(ticket, replies, { draft = true } = {}) {
  const conversation = replies.map((reply) => {
    const name = reply.sender_type === 'user' ? '用户' : (reply.sender_type === 'admin' ? '管理员' : 'AI/系统');
    return `${name}：${reply.content}`;
  }).join('\n\n');

  return `请为以下${ticket.type === 'appeal' ? '申诉工单' : '普通工单'}生成一段中文${draft ? '回复草稿' : '正式回复'}。

要求：
1. 语气礼貌、明确、可执行。
2. 不承诺系统没有确认过的结果，不编造未提供的信息。
3. 如果信息不足，请提出需要用户补充的内容。
4. 只输出回复正文，不要输出标题或额外解释。

工单标题：${ticket.title}
工单状态：${ticket.status}
工单内容与对话：
${conversation || ticket.content}`;
}

async function generateAiReplyContent(ticket, replies, { draft = true } = {}) {
  const { client, model } = await buildOpenAIClient();
  const prompt = buildAiReplyPrompt(ticket, replies, { draft });
  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: draft
          ? '你是平台工单客服助手，只生成可由管理员确认后发送给用户的中文回复草稿。'
          : '你是平台工单客服助手，请生成可直接发送给用户的中文正式回复。',
      },
      { role: 'user', content: prompt },
    ],
    temperature: draft ? 0.4 : 0.25,
    max_tokens: 600,
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) throw { status: 500, message: 'AI未返回可用回复' };
  return content;
}

async function generateAiReplyDecision(ticket, replies) {
  const { client, model } = await buildOpenAIClient();
  const conversation = replies.map((reply) => {
    const name = reply.sender_type === 'user' ? '用户' : (reply.sender_type === 'admin' ? '管理员' : 'AI/系统');
    return `${name}：${reply.content}`;
  }).join('\n\n');
  const latestUserMessage = getLatestUserMessage(ticket, replies);
  const userExplicitlyRequestedHuman = hasExplicitHumanRequest(latestUserMessage);
  const prompt = `请作为平台工单客服，先给用户一段可以直接发送的中文回复，并判断该工单是否还需要人工客服继续处理。

转人工判断必须严格遵守：
1. 只有用户在最新一条用户消息中明确表达“转人工、人工客服、联系人工、客服介入、管理员处理、投诉、升级处理”等意图时，needsHuman 才能为 true。
2. 仅因为涉及退款、账号、封禁、权限、隐私、安全、计费、数据恢复、系统状态不明、用户信息不足、用户情绪强烈或紧急度较高，都不能自动转人工。
3. 信息不足时，先在 reply 中礼貌追问需要补充的具体信息，并将 needsHuman 设为 false。
4. 无法确认后台状态时，不要编造结论，说明会根据用户补充的信息继续协助，并将 needsHuman 设为 false。
5. 当前服务端对最新用户消息的预判为：${userExplicitlyRequestedHuman ? '用户已明确要求人工，可以设为 true' : '用户未明确要求人工，必须设为 false'}。

请只输出JSON，格式如下：
{
  "reply": "发送给用户的中文回复正文",
  "needsHuman": ${userExplicitlyRequestedHuman ? 'true' : 'false'},
  "reason": "需要或不需要人工的中文原因，50字以内"
}

工单紧急度：${ticket.priority}
工单标题：${ticket.title}
工单状态：${ticket.status}
工单内容与对话：
${conversation || ticket.content}`;

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: '你是平台工单客服助手，必须输出可解析JSON，不要输出Markdown代码块。' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    max_tokens: 700,
  });

  const raw = response.choices[0]?.message?.content?.trim();
  if (!raw) throw { status: 500, message: 'AI未返回可用回复' };
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : raw);
    const reply = normalizeText(String(parsed.reply || ''), 'AI回复内容', { min: 1, max: 5000 });
    const needsHuman = userExplicitlyRequestedHuman && Boolean(parsed.needsHuman);
    return {
      reply,
      needsHuman,
      reason: needsHuman ? String(parsed.reason || '').trim().slice(0, 120) : '用户未明确要求人工，AI继续自动协助',
    };
  } catch {
    return {
      reply: raw.slice(0, 5000),
      needsHuman: false,
      reason: 'AI判断结果解析失败，保留为AI自动协助',
    };
  }
}

function buildTicketAiResult(ticket, decision, mode) {
  const existing = ticket.ai_result && typeof ticket.ai_result === 'object' ? ticket.ai_result : {};
  return {
    ...existing,
    ticket_ai_reply: {
      mode,
      needsHuman: Boolean(decision.needsHuman),
      reason: decision.reason || '',
      repliedAt: new Date().toISOString(),
    },
  };
}

function buildManualReviewHandledResult(ticket) {
  const existing = ticket.ai_result && typeof ticket.ai_result === 'object' ? ticket.ai_result : {};
  if (!existing.ticket_ai_reply) return existing;
  return {
    ...existing,
    ticket_ai_reply: {
      ...existing.ticket_ai_reply,
      // 管理员二次回复后清除“需人工”标记，避免列表持续误报。
      needsHuman: false,
      humanHandledAt: new Date().toISOString(),
    },
  };
}

async function createAiReplyAndNotify(ticketId, content, sourceReplyId, ticketUpdates = {}) {
  const trx = await db.transaction();
  let replyId;
  try {
    if (sourceReplyId) {
      const lastReply = await ticketDao.getLastReply(ticketId, trx, true);
      // 自动回复只允许紧跟触发它的用户消息，避免并发任务重复写入AI回复。
      if (!lastReply || lastReply.id !== sourceReplyId || lastReply.sender_type !== 'user') {
        await trx.rollback();
        return { skipped: true, reason: 'source_reply_changed' };
      }
    }
    replyId = await ticketDao.createReply({
      ticket_id: ticketId,
      sender_id: null,
      sender_type: 'ai',
      content,
      is_ai: true,
    }, trx);
    await ticketDao.updateTicket(ticketId, { status: 'answered', ...ticketUpdates }, trx);
    await trx.commit();
  } catch (err) {
    await trx.rollback();
    throw err;
  }

  const updated = decorateTicket(await ticketDao.getById(ticketId));
  await notifyUserByReply(updated, replyId, content);
  return { skipped: false, ticket: updated };
}

async function autoReplyIfEnabled(ticketId) {
  const mode = await getTicketAiReplyMode();
  if (![TICKET_AI_REPLY_MODES.AI_AUTO, TICKET_AI_REPLY_MODES.AI_MANUAL].includes(mode)) {
    return { skipped: true, reason: 'mode' };
  }

  const ticket = decorateTicket(await ticketDao.getById(ticketId));
  if (!ticket || ticket.type !== 'general' || ['resolved', 'closed'].includes(ticket.status)) {
    return { skipped: true, reason: 'ticket_state' };
  }

  const replies = await ticketDao.listReplies(ticketId);
  const lastReply = replies[replies.length - 1];
  // 只有用户刚刚发出的最后一条消息才触发自动回复，避免管理员刷新或AI回复后重复发送。
  if (!lastReply || lastReply.sender_type !== 'user') {
    return { skipped: true, reason: 'last_reply_not_user' };
  }

  if (mode === TICKET_AI_REPLY_MODES.AI_MANUAL) {
    const decision = await generateAiReplyDecision(ticket, replies);
    const nextStatus = decision.needsHuman ? 'open' : 'answered';
    const aiResult = buildTicketAiResult(ticket, decision, mode);
    return createAiReplyAndNotify(ticketId, decision.reply, lastReply.id, {
      status: nextStatus,
      ai_result: JSON.stringify(aiResult),
    });
  }

  const content = await generateAiReplyContent(ticket, replies, { draft: false });
  const aiResult = buildTicketAiResult(ticket, { needsHuman: false, reason: 'AI自动回复已完成' }, mode);
  return createAiReplyAndNotify(ticketId, content, lastReply.id, {
    status: 'answered',
    ai_result: JSON.stringify(aiResult),
  });
}

async function runAutoReplySafely(ticketId) {
  try {
    return await autoReplyIfEnabled(ticketId);
  } catch (err) {
    logger.warn({ err, ticketId }, '工单AI自动回复失败，已保留为人工待处理');
    return { skipped: true, reason: 'ai_error' };
  }
}

async function syncAppealTicketAfterReview(appealId, reviewResult, reviewerId, note) {
  let ticket = await ticketDao.getByAppealId(appealId);
  if (!ticket) {
    const appeal = await banDao.getAppealById(appealId);
    if (!appeal) return null;
    const ticketId = await ticketDao.createAppealTicketWithFirstReply({
      appealId,
      userId: appeal.user_id,
      content: appeal.content,
      aiResult: appeal.ai_result,
      status: 'resolved',
    });
    ticket = await ticketDao.getById(ticketId);
  }

  const replyContent = note || reviewResult.message;
  const trx = await db.transaction();
  let replyId;
  try {
    replyId = await ticketDao.createReply({
      ticket_id: ticket.id,
      sender_id: reviewerId || null,
      sender_type: reviewerId ? 'admin' : 'system',
      content: replyContent,
      is_ai: !reviewerId,
    }, trx);
    await ticketDao.updateTicket(ticket.id, {
      status: 'resolved',
      closed_at: db.fn.now(),
    }, trx);
    await trx.commit();
  } catch (err) {
    await trx.rollback();
    throw err;
  }

  const updated = decorateTicket(await ticketDao.getById(ticket.id));
  await notifyUserByReply(updated, replyId, replyContent);
  return updated;
}

const ticketService = {
  TICKET_TYPES,
  TICKET_STATUSES,
  TICKET_PRIORITIES,
  TICKET_AI_REPLY_MODES,

  async createUserTicket(userId, body) {
    const title = normalizeText(body.title, '工单标题', { min: 2, max: 120 });
    const content = normalizeText(body.content, '工单内容', { min: 5, max: 5000 });
    const priority = normalizeEnum(body.priority, TICKET_PRIORITIES, '优先级', 'normal');
    const ticketId = await ticketDao.createGeneralTicketWithFirstReply({ userId, title, content, priority });
    await runAutoReplySafely(ticketId);
    return this.getUserTicket(userId, ticketId);
  },

  async getAiReplyModeConfig() {
    const mode = await getTicketAiReplyMode();
    return {
      mode,
      modes: [
        { value: TICKET_AI_REPLY_MODES.MANUAL, label: '手动回复', desc: '普通工单由管理员手动处理，可按需输入回复' },
        { value: TICKET_AI_REPLY_MODES.AI_MANUAL, label: 'AI+手动', desc: 'AI先回复用户，只有用户明确要求人工时才保留为待处理' },
        { value: TICKET_AI_REPLY_MODES.AI_AUTO, label: 'AI自动回复', desc: '用户提交普通工单或继续追问后，AI自动回复并发送站内信' },
      ],
    };
  },

  async setAiReplyModeConfig(mode) {
    if (!Object.values(TICKET_AI_REPLY_MODES).includes(mode)) {
      throw { status: 400, message: '无效的工单AI回复模式' };
    }
    await configDao.set(TICKET_AI_REPLY_MODE_KEY, mode);
    return this.getAiReplyModeConfig();
  },

  async listUserTickets(userId, params) {
    const type = normalizeEnum(params.type, TICKET_TYPES, '工单类型', undefined);
    const status = normalizeEnum(params.status, TICKET_STATUSES, '工单状态', undefined);
    const priority = normalizeEnum(params.priority, TICKET_PRIORITIES, '紧急度', undefined);
    const result = await ticketDao.list({
      ...params,
      userId,
      type,
      status,
      priority,
      q: normalizeQuery(params.q),
    });
    return { ...result, rows: result.rows.map(decorateTicket) };
  },

  async listAdminTickets(params) {
    const type = normalizeEnum(params.type, TICKET_TYPES, '工单类型', undefined);
    const status = normalizeEnum(params.status, TICKET_STATUSES, '工单状态', undefined);
    const priority = normalizeEnum(params.priority, TICKET_PRIORITIES, '紧急度', undefined);
    const result = await ticketDao.list({
      ...params,
      type,
      status,
      priority,
      q: normalizeQuery(params.q),
    });
    return { ...result, rows: result.rows.map(decorateTicket) };
  },

  async getUserTicket(userId, ticketId) {
    const ticket = decorateTicket(await ticketDao.getById(ticketId));
    assertTicketOwner(ticket, userId);
    const replies = await ticketDao.listReplies(ticketId);
    return { ticket, replies };
  },

  async getAdminTicket(ticketId) {
    const ticket = decorateTicket(await ticketDao.getById(ticketId));
    if (!ticket) throw { status: 404, message: '工单不存在' };
    const replies = await ticketDao.listReplies(ticketId);
    return { ticket, replies };
  },

  async replyAsUser(userId, ticketId, body) {
    const ticket = decorateTicket(await ticketDao.getById(ticketId));
    assertTicketOwner(ticket, userId);
    assertReplyAllowed(ticket);
    const content = normalizeText(body.content, '回复内容', { min: 1, max: 5000 });

    const trx = await db.transaction();
    try {
      await ticketDao.createReply({
        ticket_id: ticketId,
        sender_id: userId,
        sender_type: 'user',
        content,
        is_ai: false,
      }, trx);
      await ticketDao.updateTicket(ticketId, { status: 'open' }, trx);
      await trx.commit();
    } catch (err) {
      await trx.rollback();
      throw err;
    }

    await runAutoReplySafely(ticketId);
    return this.getUserTicket(userId, ticketId);
  },

  async replyAsAdmin(ticketId, adminId, body) {
    const ticket = decorateTicket(await ticketDao.getById(ticketId));
    if (!ticket) throw { status: 404, message: '工单不存在' };
    if (['resolved', 'closed'].includes(ticket.status)) throw { status: 400, message: '工单已结束，不能回复' };

    const content = normalizeText(body.content, '回复内容', { min: 1, max: 5000 });
    const senderType = normalizeEnum(body.senderType, ADMIN_REPLY_TYPES, '回复类型', body.isAi ? 'ai' : 'admin');

    const trx = await db.transaction();
    let replyId;
    try {
      replyId = await ticketDao.createReply({
        ticket_id: ticketId,
        sender_id: senderType === 'admin' ? adminId : null,
        sender_type: senderType,
        content,
        is_ai: senderType === 'ai',
      }, trx);
      const ticketUpdates = { status: 'answered' };
      if (ticket.needs_manual_review) {
        ticketUpdates.ai_result = JSON.stringify(buildManualReviewHandledResult(ticket));
      }
      await ticketDao.updateTicket(ticketId, ticketUpdates, trx);
      await trx.commit();
    } catch (err) {
      await trx.rollback();
      throw err;
    }

    const updated = decorateTicket(await ticketDao.getById(ticketId));
    await notifyUserByReply(updated, replyId, content);
    return this.getAdminTicket(ticketId);
  },

  async closeUserTicket(userId, ticketId) {
    const ticket = decorateTicket(await ticketDao.getById(ticketId));
    assertTicketOwner(ticket, userId);
    if (ticket.type === 'appeal' && ticket.appeal_status === 'pending') {
      throw { status: 400, message: '申诉工单仍在审核中，不能自行关闭' };
    }
    await ticketDao.updateTicket(ticketId, { status: 'closed', closed_at: db.fn.now() });
    return this.getUserTicket(userId, ticketId);
  },

  async resolveTicket(ticketId, adminId, body) {
    const ticket = decorateTicket(await ticketDao.getById(ticketId));
    if (!ticket) throw { status: 404, message: '工单不存在' };

    if (ticket.type === 'appeal') {
      const action = normalizeEnum(body.action, ['approve', 'reject'], '申诉处理动作', undefined);
      const note = body.note ? normalizeText(body.note, '处理备注', { min: 1, max: 2000 }) : undefined;
      const banService = require('./banService');
      const result = await banService.reviewAppeal(ticket.appeal_id || ticket.source_id, { action, note }, adminId, { syncTicket: false });
      const updated = await syncAppealTicketAfterReview(ticket.appeal_id || ticket.source_id, result, adminId, note || result.message);
      return { ...result, ticket: updated };
    }

    if (['resolved', 'closed'].includes(ticket.status)) {
      throw { status: 400, message: '工单已结束，不能重复处理' };
    }

    const note = body.note ? normalizeText(body.note, '处理备注', { min: 1, max: 2000 }) : '';
    let replyId = null;
    if (note) {
      replyId = await ticketDao.createReply({
        ticket_id: ticketId,
        sender_id: adminId,
        sender_type: 'admin',
        content: note,
        is_ai: false,
      });
    }
    await ticketDao.updateTicket(ticketId, { status: 'resolved', closed_at: db.fn.now() });
    const updated = decorateTicket(await ticketDao.getById(ticketId));
    if (replyId) await notifyUserByReply(updated, replyId, note);
    return { message: '工单已解决', ticket: updated };
  },

  async generateAiReply(ticketId) {
    const { ticket, replies } = await this.getAdminTicket(ticketId);
    const draft = await generateAiReplyContent(ticket, replies, { draft: true });
    return { draft };
  },

  async createOrUpdateAppealTicket({ appealId, userId, content, aiResult, status = 'open' }) {
    const existing = await ticketDao.getByAppealId(appealId);
    if (existing) {
      await ticketDao.updateTicket(existing.id, {
        ai_result: aiResult ? JSON.stringify(aiResult) : existing.ai_result || null,
        status,
        closed_at: ['resolved', 'closed'].includes(status) ? db.fn.now() : null,
      });
      await ticketDao.linkAppealTicket(appealId, existing.id);
      return existing.id;
    }
    return ticketDao.createAppealTicketWithFirstReply({ appealId, userId, content, aiResult, status });
  },

  async syncAppealAutoReview({ appealId, aiResult, status, message }) {
    const appeal = await banDao.getAppealById(appealId);
    if (!appeal) return null;
    const ticketId = await this.createOrUpdateAppealTicket({
      appealId,
      userId: appeal.user_id,
      content: appeal.content,
      aiResult,
      status: status === 'pending' ? 'open' : 'resolved',
    });

    if (status === 'pending') return decorateTicket(await ticketDao.getById(ticketId));

    const replyContent = message || appeal.review_note || '申诉已处理';
    const replyId = await ticketDao.createReply({
      ticket_id: ticketId,
      sender_id: null,
      sender_type: 'ai',
      content: replyContent,
      is_ai: true,
    });
    await ticketDao.updateTicket(ticketId, { status: 'resolved', closed_at: db.fn.now() });
    const ticket = decorateTicket(await ticketDao.getById(ticketId));
    await notifyUserByReply(ticket, replyId, replyContent);
    return ticket;
  },

  async syncAppealReviewResult({ appealId, reviewResult, reviewerId, note }) {
    return syncAppealTicketAfterReview(appealId, reviewResult, reviewerId, note || reviewResult?.message);
  },
};

module.exports = ticketService;
