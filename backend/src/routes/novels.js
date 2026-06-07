const { Router } = require('express');
const { z } = require('zod');
const novelService = require('../services/novelService');
const authenticate = require('../middleware/authenticate');
const { parsePositiveInt, parsePagination } = require('../utils/requestParser');

const router = Router();

// 所有路由都需要认证
router.use(authenticate);

// 创建小说
const createSchema = z.object({
  title: z.string().min(1).max(200),
  genre: z.string().max(100).optional(),
});

// 导入小说的校验 schema（大部分字段可选，支持只导入大纲或含完整内容）
const importSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  genre: z.string().max(100).optional(),
  novel: z.object({
    title: z.string().min(1).max(200).optional(),
    genre: z.string().max(100).optional(),
    theme: z.string().optional(),
    setting: z.union([z.string(), z.record(z.any())]).optional(),
    main_plot: z.string().optional(),
    sub_plots: z.array(z.string()).optional(),
    chapter_count: z.number().int().nonnegative().optional(),
  }).optional(),
  characters: z.array(z.object({
    name: z.string().min(1).max(100),
    age: z.union([z.number(), z.string()]).optional().nullable(),
    gender: z.string().max(10).optional(),
    role: z.string().max(50).optional(),
    appearance: z.string().optional(),
    personality: z.string().optional(),
    background: z.string().optional(),
    motivation: z.string().optional(),
    arc: z.string().optional(),
    relationships: z.array(z.string()).optional(),
  })).optional(),
  chapters: z.array(z.object({
    chapter_number: z.number().int().positive(),
    title: z.string().max(200).optional(),
    brief: z.string().optional(),
    scenes: z.array(z.string()).optional(),
    conflict: z.string().optional(),
    turning_point: z.string().optional(),
    characters_involved: z.array(z.string()).optional(),
    emotional_tone: z.string().max(100).optional(),
    ending_hook: z.string().optional(),
    content: z.string().optional(),
    summary: z.string().optional(),
    status: z.enum(['outline', 'writing', 'completed']).optional(),
    word_count: z.number().int().nonnegative().optional(),
  })).optional(),
});

router.post('/', async (req, res) => {
  try {
    const body = createSchema.parse(req.body);
    const maxNovels = req.user.max_novels || 3;
    const novel = await novelService.createNovel(req.user.id, maxNovels, body);
    res.status(201).json({ novel });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: '输入数据格式不正确', details: err.errors });
    }
    res.status(err.status || 500).json({ error: err.message || '创建小说失败' });
  }
});

// 导入小说（POST /novels/import —— 必须在 PUT /:id 之前）
router.post('/import', async (req, res) => {
  try {
    const body = importSchema.parse(req.body);
    const maxNovels = req.user.max_novels || 3;
    const novel = await novelService.importNovel(req.user.id, maxNovels, body);
    res.status(201).json({ novel });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: '输入数据格式不正确', details: err.errors });
    }
    res.status(err.status || 500).json({ error: err.message || '导入小说失败' });
  }
});

// 获取小说列表
router.get('/', async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query, { defaultLimit: 10, maxLimit: 50 });
    const result = await novelService.listUserNovels(req.user.id, { page, limit });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '获取小说列表失败' });
  }
});

// 获取小说详情（支持 ?lightweight=true 跳过大字段）
router.get('/:id', async (req, res) => {
  try {
    const lightweight = req.query.lightweight === 'true';
    const novelId = parsePositiveInt(req.params.id, '小说ID');
    const novel = await novelService.getNovelDetail(novelId, req.user.id, { lightweight });
    res.json({ novel });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '获取小说失败' });
  }
});

// 获取单个章节完整内容
router.get('/:id/chapters/:chapterNum', async (req, res) => {
  try {
    const novelId = parsePositiveInt(req.params.id, '小说ID');
    const chapterNum = parsePositiveInt(req.params.chapterNum, '章节号');
    const chapter = await novelService.getChapterContent(
      novelId,
      req.user.id,
      chapterNum
    );
    res.json({ chapter });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '获取章节失败' });
  }
});

// 保存编辑后的内容（大纲/人设/章节大纲/章节正文）—— 必须在 PUT /:id 之前
router.put('/:id/save', async (req, res) => {
  try {
    const novelId = parsePositiveInt(req.params.id, '小说ID');
    const { phase, content } = req.body;
    const chapterNum = req.body.chapterNumber;

    if (phase === 'outline') {
      await novelService.saveOutline(novelId, req.user.id, content);
    } else if (phase === 'characters') {
      await novelService.saveCharacters(novelId, req.user.id, content);
    } else if (phase === 'chapters_outline') {
      await novelService.saveChaptersOutline(novelId, req.user.id, content);
    } else if (phase === 'chapter_content' && chapterNum) {
      await novelService.saveChapterContent(novelId, req.user.id, parsePositiveInt(chapterNum, '章节号'), content);
    } else {
      throw new Error(`未知的保存阶段: ${phase}`);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '保存失败' });
  }
});

// 更新小说信息
router.put('/:id', async (req, res) => {
  try {
    const novelId = parsePositiveInt(req.params.id, '小说ID');
    const novel = await novelService.updateNovel(novelId, req.user.id, req.body);
    res.json({ novel });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '更新失败' });
  }
});

// 删除小说
router.delete('/:id', async (req, res) => {
  try {
    const novelId = parsePositiveInt(req.params.id, '小说ID');
    const result = await novelService.deleteNovel(novelId, req.user.id);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '删除失败' });
  }
});

// 获取小说统计
router.get('/:id/stats', async (req, res) => {
  try {
    const novelId = parsePositiveInt(req.params.id, '小说ID');
    const stats = await novelService.getNovelStats(novelId, req.user.id);
    res.json(stats);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '获取统计失败' });
  }
});

module.exports = router;
