const express = require('express');
const configService = require('../services/configService');
const authenticate = require('../middleware/authenticate');

const router = express.Router();

// GET /api/site/info —— 公开接口，无需认证
router.get('/info', async (_req, res) => {
  try {
    const siteName = await configService.get('site_name');
    const siteDescription = await configService.get('site_description');
    res.json({
      siteName: siteName || 'AI Novel Studio',
      siteDescription: siteDescription || '基于AI的小说创作平台',
    });
  } catch (err) {
    res.status(500).json({ error: '获取站点信息失败' });
  }
});

// GET /api/site/writing-prompt —— 获取全局写作提示词（需认证）
router.get('/writing-prompt', authenticate, async (_req, res) => {
  try {
    const prompt = await configService.get('global_writing_prompt');
    res.json({ prompt: prompt || '' });
  } catch (err) {
    res.status(500).json({ error: '获取写作提示词失败' });
  }
});

// PUT /api/site/writing-prompt —— 更新全局写作提示词（需认证）
router.put('/writing-prompt', authenticate, async (req, res) => {
  try {
    const { prompt } = req.body;
    if (typeof prompt !== 'string') {
      return res.status(400).json({ error: '请提供有效的提示词内容' });
    }
    await configService.set('global_writing_prompt', prompt.trim());
    res.json({ success: true, prompt: prompt.trim() });
  } catch (err) {
    res.status(500).json({ error: '保存写作提示词失败' });
  }
});

module.exports = router;
