const templateDao = require('../dao/templateDao');
const novelDao = require('../dao/novelDao');
const configDao = require('../dao/configDao');
const categoryDao = require('../dao/categoryDao');
const { db } = require('../config/database');
const OpenAI = require('openai');

// 审核模式常量
const REVIEW_MODES = {
  AUTO: 'auto',                     // 全部通过
  AI: 'ai',                         // AI检查（通过/拒绝）
  AI_MANUAL: 'ai_manual',           // AI+手动（高置信度直接处理，不确定转人工）
  AI_REJECT_MANUAL: 'ai_reject_manual', // AI+手动（AI通过自动通过，AI拒绝转人工）
  MANUAL: 'manual',                 // 手动检查
};

// 获取当前审核模式
async function getReviewMode() {
  const val = await configDao.get('template_review_mode');
  return val || REVIEW_MODES.MANUAL;
}

// 获取 AI 审核的 provider 和 model 配置
async function getAiReviewConfig() {
  const providerName = await configDao.get('ai_review_provider');
  const modelName = await configDao.get('ai_review_model');
  return {
    providerName: providerName || null,
    modelName: modelName || null,
  };
}

// AI 审核模板内容
async function aiReviewTemplate(template) {
  // 读取配置的 AI 审核 Provider/Model
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

  // 如果配置了特定的 Provider/Model，查找对应的配置
  if (reviewConfig.providerName && reviewConfig.modelName) {
    const provider = providers.find(p => p.name === reviewConfig.providerName);
    if (provider) {
      baseURL = provider.baseUrl || baseURL;
      apiKey = provider.apiKey || apiKey;
      model = reviewConfig.modelName;
    }
  }

  const openai = new OpenAI({ baseURL, apiKey });

  const prompt = `请审核以下小说创作模板内容，判断是否适合公开发布。

审核标准：
1. 内容是否完整（有实质性的主题/世界观/剧情框架描述）
2. 是否包含违法违规内容（色情、暴力、政治敏感等）
3. 是否包含广告、联系方式等垃圾信息
4. 内容质量是否达到基本水准（描述通顺、有一定创意）

模板信息：
- 名称：${template.display_name}
- 分类：${template.category}
- 描述：${template.description}
- 主题：${template.theme || '无'}
- 世界观：${template.setting || '无'}
- 主线剧情：${template.main_plot || '无'}

请以JSON格式回复：
{
  "approved": true/false,
  "confidence": 0-100,
  "reason": "审核理由（中文，简短）",
  "issues": ["发现的问题1", "问题2"]
}`;

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: '你是一个内容审核助手，请严格按照审核标准输出JSON格式结果。' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.1,
    max_tokens: 500,
  });

  const text = response.choices[0]?.message?.content || '';
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch { /* ignore parse error */ }
  return { approved: false, confidence: 0, reason: 'AI审核解析失败，转人工处理', issues: [] };
}

const templateService = {
  REVIEW_MODES,

  // ---- 模板商店公开列表 ----
  async listPublicTemplates() {
    return templateDao.getAllPublic();
  },

  async listPublicCategories() {
    return categoryDao.getNames();
  },

  async getPublicTemplate(id) {
    const template = await templateDao.getById(id);
    if (!template || !template.enabled) throw { status: 404, message: '模板不存在' };
    return template;
  },

  // ---- 用户自有模板 ----
  async listMyTemplates(userId) {
    return templateDao.getByCreator(userId);
  },

  // 创建私有模板
  async createMyTemplate(userId, data) {
    if (!data.name || !data.display_name || !data.description) {
      throw { status: 400, message: '模板标识名、显示名称、描述为必填项' };
    }
    const existing = await templateDao.getByName(data.name);
    if (existing) throw { status: 409, message: '模板标识名已存在' };

    const id = await templateDao.create({
      name: data.name,
      display_name: data.display_name,
      description: data.description,
      category: data.category || '其他',
      cover_gradient: data.cover_gradient || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      icon: data.icon || 'BookOutlined',
      genre: data.genre || null,
      title_example: data.title_example || null,
      theme: data.theme || null,
      setting: data.setting || null,
      main_plot: data.main_plot || null,
      is_official: false,
      creator_id: userId,
      is_public: false,
      review_status: null,
      enabled: true,
      sort_order: 999,
    });
    return templateDao.getById(id);
  },

  // 更新自己的模板
  async updateMyTemplate(userId, templateId, data) {
    const template = await templateDao.getById(templateId);
    if (!template) throw { status: 404, message: '模板不存在' };
    if (template.creator_id !== userId) throw { status: 403, message: '无权修改此模板' };
    if (template.review_status === 'pending') throw { status: 400, message: '模板正在审核中，无法修改' };

    // 已通过 → 修改后标记为待审核；已拒绝 → 清除拒绝状态允许重提；未提交则保持不变
    let newReviewStatus = template.review_status;
    let newReviewNote = template.review_note;
    if (template.review_status === 'approved') {
      newReviewStatus = 'pending';
      newReviewNote = '内容已修改，待重新审核';
    } else if (template.review_status === 'rejected') {
      newReviewStatus = null;
      newReviewNote = null;
    }
    await templateDao.update(templateId, {
      display_name: data.display_name ?? template.display_name,
      description: data.description ?? template.description,
      category: data.category ?? template.category,
      cover_gradient: data.cover_gradient ?? template.cover_gradient,
      icon: data.icon ?? template.icon,
      genre: data.genre !== undefined ? data.genre : template.genre,
      title_example: data.title_example !== undefined ? data.title_example : template.title_example,
      theme: data.theme !== undefined ? data.theme : template.theme,
      setting: data.setting !== undefined ? data.setting : template.setting,
      main_plot: data.main_plot !== undefined ? data.main_plot : template.main_plot,
      review_status: newReviewStatus,
      review_note: newReviewNote,
      updated_at: db.fn.now(),
    });
    return templateDao.getById(templateId);
  },

  // 删除自己的模板
  async deleteMyTemplate(userId, templateId) {
    const template = await templateDao.getById(templateId);
    if (!template) throw { status: 404, message: '模板不存在' };
    if (template.creator_id !== userId) throw { status: 403, message: '无权删除此模板' };
    await templateDao.remove(templateId);
  },

  // 提交审核（设为公开）
  async submitForReview(userId, templateId) {
    const template = await templateDao.getById(templateId);
    if (!template) throw { status: 404, message: '模板不存在' };
    if (template.creator_id !== userId) throw { status: 403, message: '无权操作此模板' };
    if (template.review_status === 'pending') throw { status: 400, message: '模板已在审核中，请耐心等待' };
    if (template.review_status === 'rejected') throw { status: 400, message: '模板审核未通过，请先修改内容后再重新提交' };

    // 根据审核模式决定处理方式
    const mode = await getReviewMode();

    if (mode === REVIEW_MODES.AUTO) {
      // 全部通过：直接批准
      await templateDao.update(templateId, {
        is_public: true,
        review_status: 'approved',
        review_note: '系统自动通过',
        updated_at: db.fn.now(),
      });
      return { review_status: 'approved', message: '已自动通过审核并公开发布', mode };
    }

    if (mode === REVIEW_MODES.AI) {
      // AI检查：调用AI审核
      const aiResult = await aiReviewTemplate(template);
      if (aiResult.approved && aiResult.confidence >= 70) {
        await templateDao.update(templateId, {
          is_public: true,
          review_status: 'approved',
          review_note: `AI审核通过 (置信度: ${aiResult.confidence}%)：${aiResult.reason}`,
          updated_at: db.fn.now(),
        });
        return { review_status: 'approved', message: 'AI审核通过，已公开发布', mode, aiResult };
      }
      // AI不通过则拒绝
      await templateDao.update(templateId, {
        review_status: 'rejected',
        review_note: `AI审核未通过 (置信度: ${aiResult.confidence}%)：${aiResult.reason}。问题：${(aiResult.issues || []).join('；')}`,
        updated_at: db.fn.now(),
      });
      return { review_status: 'rejected', message: 'AI审核未通过', mode, aiResult };
    }

    if (mode === REVIEW_MODES.AI_MANUAL) {
      // AI+手动：AI先判断，能确定的结果直接处理，不确定的转人工
      const aiResult = await aiReviewTemplate(template);
      if (aiResult.approved && aiResult.confidence >= 90) {
        await templateDao.update(templateId, {
          is_public: true,
          review_status: 'approved',
          review_note: `AI审核通过 (置信度: ${aiResult.confidence}%)：${aiResult.reason}`,
          updated_at: db.fn.now(),
        });
        return { review_status: 'approved', message: 'AI审核通过，已公开发布', mode, aiResult };
      }
      if (!aiResult.approved && aiResult.confidence >= 90) {
        await templateDao.update(templateId, {
          review_status: 'rejected',
          review_note: `AI审核未通过 (置信度: ${aiResult.confidence}%)：${aiResult.reason}。问题：${(aiResult.issues || []).join('；')}`,
          updated_at: db.fn.now(),
        });
        return { review_status: 'rejected', message: 'AI审核未通过', mode, aiResult };
      }
      // 置信度不足，转人工
      await templateDao.update(templateId, {
        review_status: 'pending',
        review_note: `AI无法确定 (置信度: ${aiResult.confidence}%)：${aiResult.reason}，已转人工审核`,
        updated_at: db.fn.now(),
      });
      return { review_status: 'pending', message: 'AI无法判断，已提交人工审核', mode, aiResult };
    }

    if (mode === REVIEW_MODES.AI_REJECT_MANUAL) {
      // AI通过自动通过，AI拒绝转人工
      const aiResult = await aiReviewTemplate(template);
      if (aiResult.approved && aiResult.confidence >= 70) {
        await templateDao.update(templateId, {
          is_public: true,
          review_status: 'approved',
          review_note: `AI审核通过 (置信度: ${aiResult.confidence}%)：${aiResult.reason}`,
          updated_at: db.fn.now(),
        });
        return { review_status: 'approved', message: 'AI审核通过，已公开发布', mode, aiResult };
      }
      // AI拒绝 → 转人工审核
      await templateDao.update(templateId, {
        review_status: 'pending',
        review_note: `AI判定不建议通过 (置信度: ${aiResult.confidence}%)：${aiResult.reason}。问题：${(aiResult.issues || []).join('；')}。已转人工复核`,
        updated_at: db.fn.now(),
      });
      return { review_status: 'pending', message: 'AI建议拒绝，已转人工复核', mode, aiResult };
    }

    // MANUAL 模式：直接提交待审核
    await templateDao.update(templateId, {
      review_status: 'pending',
      review_note: '等待管理员审核',
      updated_at: db.fn.now(),
    });
    return { review_status: 'pending', message: '已提交审核，请等待管理员处理', mode };
  },

  // ---- 从模板创建小说 ----
  async createFromTemplate(userId, maxNovels, templateId, overrides = {}) {
    const count = await novelDao.countByUser(userId);
    if (count >= maxNovels) {
      throw { status: 403, message: `已达到最大小说数量限制（${maxNovels}本）` };
    }

    const template = await templateDao.getById(templateId);
    if (!template || !template.enabled) {
      throw { status: 404, message: '模板不存在或已禁用' };
    }

    const title = overrides.title || template.title_example || `${template.display_name} - ${Date.now()}`;

    const id = await novelDao.create({
      user_id: userId,
      title,
      genre: overrides.genre || template.genre || null,
      theme: template.theme || null,
      setting: template.setting || null,
      main_plot: template.main_plot || null,
      status: 'draft',
      current_step: 0,
    });

    await templateDao.incrementUsage(templateId);
    const novel = await novelDao.findById(id);
    return { novel, template };
  },

  // ---- 管理员操作 ----
  async createTemplate(data) {
    const existing = await templateDao.getByName(data.name);
    if (existing) throw { status: 409, message: '模板标识名已存在' };
    return templateDao.create({ ...data, is_official: true });
  },

  async updateTemplate(id, data) {
    const template = await templateDao.getById(id);
    if (!template) throw { status: 404, message: '模板不存在' };
    await templateDao.update(id, data);
    return templateDao.getById(id);
  },

  async deleteTemplate(id) {
    const template = await templateDao.getById(id);
    if (!template) throw { status: 404, message: '模板不存在' };
    return templateDao.remove(id);
  },

  // 获取待审核列表
  async getPendingReviews() {
    return templateDao.getPendingReviews();
  },

  // 获取全部模板（管理员）
  async getAllTemplates() {
    return templateDao.getAllForAdmin();
  },

  // 审核模板
  async reviewTemplate(templateId, { action, note }) {
    const template = await templateDao.getById(templateId);
    if (!template) throw { status: 404, message: '模板不存在' };
    if (template.review_status !== 'pending') throw { status: 400, message: '该模板未处于待审核状态' };

    if (action === 'approve') {
      await templateDao.update(templateId, {
        is_public: true,
        review_status: 'approved',
        review_note: note || '管理员审核通过',
        updated_at: db.fn.now(),
      });
      return { review_status: 'approved' };
    }
    if (action === 'reject') {
      await templateDao.update(templateId, {
        is_public: false,
        review_status: 'rejected',
        review_note: note || '管理员审核未通过',
        updated_at: db.fn.now(),
      });
      return { review_status: 'rejected' };
    }
    throw { status: 400, message: '无效的审核操作，请使用 approve 或 reject' };
  },

  // 获取和设置审核模式
  async getReviewModeConfig() {
    const mode = await getReviewMode();
    return {
      mode,
      modes: [
        { value: 'auto', label: '全部通过', desc: '用户提交即自动通过，无需审核' },
        { value: 'ai', label: 'AI检查', desc: '由AI自动审核，通过或拒绝均由AI决定' },
        { value: 'ai_manual', label: 'AI+手动（不确定转人工）', desc: 'AI高置信度直接处理，不确定的转人工审核' },
        { value: 'ai_reject_manual', label: 'AI+手动（拒绝转人工）', desc: 'AI通过则自动通过，AI拒绝则转人工复核' },
        { value: 'manual', label: '手动检查', desc: '所有模板都需要管理员手动审核' },
      ],
    };
  },

  async setReviewModeConfig(mode) {
    if (!Object.values(REVIEW_MODES).includes(mode)) {
      throw { status: 400, message: `无效的审核模式，可选值：${Object.values(REVIEW_MODES).join(', ')}` };
    }
    await configDao.set('template_review_mode', mode);
    return { mode };
  },

  // ---- AI 审核 Provider 配置 ----
  async getAiReviewProviderConfig() {
    const providerName = await configDao.get('ai_review_provider');
    const modelName = await configDao.get('ai_review_model');
    // 获取可用 provider 列表供前端选择
    const providers = (() => {
      try {
        const { getProviders } = require('../config/openai');
        return getProviders();
      } catch { return []; }
    })();
    // 优先筛选标记了 review 或 all 阶段的模型，若无则显示全部模型
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
    await configDao.set('ai_review_provider', providerName || '');
    await configDao.set('ai_review_model', modelName || '');
    return { providerName: providerName || '', modelName: modelName || '' };
  },

  // ---- 分类管理 ----
  async listAllCategories() {
    return categoryDao.getAll();
  },

  async createCategory(data) {
    if (!data.name) throw { status: 400, message: '分类名称不能为空' };
    const existing = await categoryDao.getByName(data.name);
    if (existing) throw { status: 409, message: '该分类已存在' };
    const id = await categoryDao.create({ name: data.name, sort_order: data.sort_order || 0 });
    return categoryDao.getById(id);
  },

  async updateCategory(id, data) {
    const cat = await categoryDao.getById(id);
    if (!cat) throw { status: 404, message: '分类不存在' };
    return categoryDao.update(id, { name: data.name ?? cat.name, sort_order: data.sort_order ?? cat.sort_order, enabled: data.enabled ?? cat.enabled });
  },

  async deleteCategory(id) {
    const cat = await categoryDao.getById(id);
    if (!cat) throw { status: 404, message: '分类不存在' };
    return categoryDao.remove(id);
  },
};

module.exports = templateService;
