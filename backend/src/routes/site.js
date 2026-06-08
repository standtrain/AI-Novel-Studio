const express = require('express');
const configService = require('../services/configService');
const authenticate = require('../middleware/authenticate');
const { LEGAL_DOCUMENTS } = require('../constants/legalDefaults');
const userDao = require('../dao/userDao');
const { createLogger } = require('../utils/logger');
const {
  DEFAULT_USER_WRITING_PROMPT,
  USER_WRITING_PROMPT_MAX_LENGTH,
  normalizeUserWritingPrompt,
  resolveUserWritingPrompt,
} = require('../constants/writingPromptDefaults');

const router = express.Router();
const logger = createLogger('site-routes');

// GET /api/site/info —— 公开接口，无需认证
router.get('/info', async (_req, res) => {
  try {
    const siteName = await configService.get('site_name');
    const siteDescription = await configService.get('site_description');
    const faviconPath = await configService.get('favicon_path');
    const footerContent = await configService.get('footer_content');
    const hasCustomFavicon = !!(faviconPath && faviconPath.trim());
    res.json({
      siteName: siteName || 'AI Novel Studio',
      siteDescription: typeof siteDescription === 'string' ? siteDescription.trim() : '',
      faviconUrl: hasCustomFavicon ? `/uploads/${faviconPath}` : '/favicon.svg',
      footerContent: typeof footerContent === 'string' ? footerContent.trim() : '',
    });
  } catch (err) {
    res.status(500).json({ error: '获取站点信息失败' });
  }
});

// GET /api/site/legal/:type —— 公开协议页面内容，前端按纯文本转义展示
router.get('/legal/:type', async (req, res) => {
  try {
    const { type } = req.params;
    if (!Object.prototype.hasOwnProperty.call(LEGAL_DOCUMENTS, type)) {
      return res.status(400).json({ error: '协议类型不正确' });
    }

    const doc = LEGAL_DOCUMENTS[type];
    const configuredContent = await configService.get(doc.key);
    const content = typeof configuredContent === 'string' && configuredContent.trim()
      ? configuredContent
      : doc.defaultContent;

    res.json({
      type,
      title: doc.title,
      content,
    });
  } catch (err) {
    res.status(500).json({ error: '获取协议内容失败' });
  }
});

function buildWritingPromptResponse(rawPrompt) {
  const hasUserValue = rawPrompt !== null && rawPrompt !== undefined;
  const resolvedPrompt = resolveUserWritingPrompt(rawPrompt);
  return {
    prompt: resolvedPrompt || DEFAULT_USER_WRITING_PROMPT,
    defaultPrompt: DEFAULT_USER_WRITING_PROMPT,
    enabled: !!resolvedPrompt,
    source: hasUserValue ? (resolvedPrompt ? 'user' : 'disabled') : 'default',
  };
}

// GET /api/site/writing-prompt —— 获取当前用户的个人全局写作提示词（需认证）
router.get('/writing-prompt', authenticate, async (req, res) => {
  try {
    res.json(buildWritingPromptResponse(req.user.user_writing_prompt));
  } catch (err) {
    res.status(500).json({ error: '获取写作提示词失败' });
  }
});

// PUT /api/site/writing-prompt —— 更新当前用户的个人全局写作提示词（需认证）
router.put('/writing-prompt', authenticate, async (req, res) => {
  try {
    const { prompt } = req.body;
    if (typeof prompt !== 'string') {
      return res.status(400).json({ error: '请提供有效的提示词内容' });
    }
    const normalizedPrompt = normalizeUserWritingPrompt(prompt);
    if (normalizedPrompt.length > USER_WRITING_PROMPT_MAX_LENGTH) {
      return res.status(400).json({ error: `提示词不能超过 ${USER_WRITING_PROMPT_MAX_LENGTH} 个字符` });
    }

    await userDao.updateWritingPrompt(req.user.id, normalizedPrompt);
    const agentService = require('../services/agentService');
    agentService.clearUserCache(req.user.id);
    res.json({ success: true, ...buildWritingPromptResponse(normalizedPrompt) });
  } catch (err) {
    logger.error('保存写作提示词失败：' + (err.message || err));
    res.status(500).json({ error: '保存写作提示词失败' });
  }
});

// GET /api/site/notifications —— 获取启用的通知（公开接口）
router.get('/notifications', async (_req, res) => {
  try {
    const notificationDao = require('../dao/notificationDao');
    const [banners, popups] = await Promise.all([
      notificationDao.getActiveForBanner(),
      notificationDao.getActiveForPopup(),
    ]);
    res.json({ banners, popups });
  } catch (err) {
    res.status(500).json({ error: '获取通知失败' });
  }
});

module.exports = router;
