const { Router } = require('express');
const { z } = require('zod');
const novelService = require('../services/novelService');
const authenticate = require('../middleware/authenticate');

const router = Router();

// 所有路由都需要认证
router.use(authenticate);

// 创建小说
const createSchema = z.object({
  title: z.string().min(1).max(200),
  genre: z.string().max(100).optional(),
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

// 获取小说列表
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const result = await novelService.listUserNovels(req.user.id, { page, limit });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: '获取小说列表失败' });
  }
});

// 获取小说详情
router.get('/:id', async (req, res) => {
  try {
    const novel = await novelService.getNovelDetail(parseInt(req.params.id, 10), req.user.id);
    res.json({ novel });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '获取小说失败' });
  }
});

// 保存编辑后的内容（大纲/人设/章节大纲/章节正文）—— 必须在 PUT /:id 之前
router.put('/:id/save', async (req, res) => {
  try {
    const novelId = parseInt(req.params.id, 10);
    const { phase, content } = req.body;
    const chapterNum = req.body.chapterNumber;

    if (phase === 'outline') {
      await novelService.saveOutline(novelId, req.user.id, content);
    } else if (phase === 'characters') {
      await novelService.saveCharacters(novelId, req.user.id, content);
    } else if (phase === 'chapters_outline') {
      await novelService.saveChaptersOutline(novelId, req.user.id, content);
    } else if (phase === 'chapter_content' && chapterNum) {
      await novelService.saveChapterContent(novelId, req.user.id, chapterNum, content);
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
    const novel = await novelService.updateNovel(parseInt(req.params.id, 10), req.user.id, req.body);
    res.json({ novel });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '更新失败' });
  }
});

// 删除小说
router.delete('/:id', async (req, res) => {
  try {
    const result = await novelService.deleteNovel(parseInt(req.params.id, 10), req.user.id);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '删除失败' });
  }
});

// 获取小说统计
router.get('/:id/stats', async (req, res) => {
  try {
    const stats = await novelService.getNovelStats(parseInt(req.params.id, 10), req.user.id);
    res.json(stats);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '获取统计失败' });
  }
});

module.exports = router;
