const { Router } = require('express');
const templateService = require('../services/templateService');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { parsePositiveInt } = require('../utils/requestParser');

const router = Router();

// ==================== 公开接口 ====================

// 获取公开模板列表
router.get('/', async (_req, res) => {
  try {
    const templates = await templateService.listPublicTemplates();
    res.json({ templates });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '获取模板列表失败' });
  }
});

// 获取模板分类
router.get('/categories', async (_req, res) => {
  try {
    const categories = await templateService.listPublicCategories();
    res.json({ categories });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '获取分类列表失败' });
  }
});

// ==================== 用户自有模板接口（必须放在 /:id 之前） ====================

// 获取我的模板列表
router.get('/my/list', authenticate, async (req, res) => {
  try {
    const templates = await templateService.listMyTemplates(req.user.id);
    res.json({ templates });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '获取我的模板失败' });
  }
});

// 创建我的模板
router.post('/my', authenticate, async (req, res) => {
  try {
    const template = await templateService.createMyTemplate(req.user.id, req.body);
    res.status(201).json({ template });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '创建模板失败' });
  }
});

// 更新我的模板
router.put('/my/:id', authenticate, async (req, res) => {
  try {
    const templateId = parsePositiveInt(req.params.id, '模板ID');
    const template = await templateService.updateMyTemplate(req.user.id, templateId, req.body);
    res.json({ template });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '更新模板失败' });
  }
});

// 删除我的模板
router.delete('/my/:id', authenticate, async (req, res) => {
  try {
    const templateId = parsePositiveInt(req.params.id, '模板ID');
    await templateService.deleteMyTemplate(req.user.id, templateId);
    res.json({ message: '模板已删除' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '删除模板失败' });
  }
});

// 提交模板审核（设为公开）
router.post('/my/:id/submit', authenticate, async (req, res) => {
  try {
    const templateId = parsePositiveInt(req.params.id, '模板ID');
    const result = await templateService.submitForReview(req.user.id, templateId);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '提交审核失败' });
  }
});

// ==================== 管理员接口（必须放在 /:id 之前） ====================

// 获取所有模板（管理员）
router.get('/admin/all', authenticate, authorize('admin'), async (_req, res) => {
  try {
    const templates = await templateService.getAllTemplates();
    res.json({ templates });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '获取模板列表失败' });
  }
});

// 获取待审核列表
router.get('/admin/pending', authenticate, authorize('admin'), async (_req, res) => {
  try {
    const templates = await templateService.getPendingReviews();
    res.json({ templates });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '获取待审核列表失败' });
  }
});

// 审核模板
router.post('/admin/review/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const templateId = parsePositiveInt(req.params.id, '模板ID');
    const result = await templateService.reviewTemplate(templateId, req.body);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '审核失败' });
  }
});

// 获取审核模式配置
router.get('/admin/review-mode', authenticate, authorize('admin'), async (_req, res) => {
  try {
    const config = await templateService.getReviewModeConfig();
    res.json(config);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '获取审核配置失败' });
  }
});

// 设置审核模式
router.put('/admin/review-mode', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await templateService.setReviewModeConfig(req.body.mode);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '设置审核模式失败' });
  }
});

// 获取 AI 审核 Provider 配置
router.get('/admin/ai-review-config', authenticate, authorize('admin'), async (_req, res) => {
  try {
    const config = await templateService.getAiReviewProviderConfig();
    res.json(config);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '获取配置失败' });
  }
});

// 设置 AI 审核 Provider 配置
router.put('/admin/ai-review-config', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await templateService.setAiReviewProviderConfig(req.body.providerName, req.body.modelName);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '设置失败' });
  }
});

// 创建官方模板
router.post('/admin', authenticate, authorize('admin'), async (req, res) => {
  try {
    const id = await templateService.createTemplate(req.body);
    res.status(201).json({ id, message: '模板创建成功' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '创建模板失败' });
  }
});

// 管理更新模板
router.put('/admin/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const templateId = parsePositiveInt(req.params.id, '模板ID');
    const template = await templateService.updateTemplate(templateId, req.body);
    res.json({ template, message: '模板已更新' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '更新模板失败' });
  }
});

// 管理删除模板
router.delete('/admin/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const templateId = parsePositiveInt(req.params.id, '模板ID');
    await templateService.deleteTemplate(templateId);
    res.json({ message: '模板已删除' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '删除模板失败' });
  }
});

// ==================== 分类管理（管理员） ====================

// 获取所有分类
router.get('/admin/categories/all', authenticate, authorize('admin'), async (_req, res) => {
  try {
    const categories = await templateService.listAllCategories();
    res.json({ categories });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '获取分类失败' });
  }
});

// 创建分类
router.post('/admin/categories', authenticate, authorize('admin'), async (req, res) => {
  try {
    const cat = await templateService.createCategory(req.body);
    res.status(201).json({ category: cat });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '创建分类失败' });
  }
});

// 更新分类
router.put('/admin/categories/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const categoryId = parsePositiveInt(req.params.id, '分类ID');
    await templateService.updateCategory(categoryId, req.body);
    res.json({ message: '分类已更新' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '更新分类失败' });
  }
});

// 删除分类
router.delete('/admin/categories/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const categoryId = parsePositiveInt(req.params.id, '分类ID');
    await templateService.deleteCategory(categoryId);
    res.json({ message: '分类已删除' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '删除分类失败' });
  }
});

// ==================== 参数化路由（放最后） ====================

// 获取单个模板详情
router.get('/:id', async (req, res) => {
  try {
    const templateId = parsePositiveInt(req.params.id, '模板ID');
    const template = await templateService.getPublicTemplate(templateId);
    res.json({ template });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '获取模板详情失败' });
  }
});

// 从模板创建小说（需要登录）
router.post('/:id/use', authenticate, async (req, res) => {
  try {
    const maxNovels = req.user.max_novels || 3;
    const templateId = parsePositiveInt(req.params.id, '模板ID');
    const result = await templateService.createFromTemplate(
      req.user.id, maxNovels, templateId, req.body,
    );
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '从模板创建失败' });
  }
});

module.exports = router;
