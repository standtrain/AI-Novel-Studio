const { Router } = require('express');
const chapterDao = require('../dao/chapterDao');
const novelDao = require('../dao/novelDao');
const authenticate = require('../middleware/authenticate');

const router = Router({ mergeParams: true });

router.use(authenticate);

// 获取小说所有章节
router.get('/', async (req, res) => {
  try {
    const novelId = parseInt(req.params.id, 10);
    const novel = await novelDao.findById(novelId);
    if (!novel || novel.user_id !== req.user.id) {
      return res.status(404).json({ error: '小说不存在' });
    }
    const chapters = await chapterDao.findByNovelId(novelId);
    res.json({ chapters });
  } catch (err) {
    res.status(500).json({ error: '获取章节列表失败' });
  }
});

// 获取单章
router.get('/:num', async (req, res) => {
  try {
    const novelId = parseInt(req.params.id, 10);
    const chapterNum = parseInt(req.params.num, 10);
    const novel = await novelDao.findById(novelId);
    if (!novel || novel.user_id !== req.user.id) {
      return res.status(404).json({ error: '小说不存在' });
    }
    const chapter = await chapterDao.findByNovelAndNumber(novelId, chapterNum);
    if (!chapter) {
      return res.status(404).json({ error: '章节不存在' });
    }
    res.json({ chapter });
  } catch (err) {
    res.status(500).json({ error: '获取章节失败' });
  }
});

// 编辑章节内容
router.put('/:num', async (req, res) => {
  try {
    const novelId = parseInt(req.params.id, 10);
    const chapterNum = parseInt(req.params.num, 10);
    const novel = await novelDao.findById(novelId);
    if (!novel || novel.user_id !== req.user.id) {
      return res.status(404).json({ error: '小说不存在' });
    }

    const allowedFields = ['title', 'content', 'summary'];
    const data = {};
    allowedFields.forEach(f => {
      if (req.body[f] !== undefined) data[f] = req.body[f];
    });
    if (req.body.content !== undefined) {
      const content = req.body.content;
      if (typeof content !== 'string') {
        return res.status(400).json({ error: '章节内容必须为文本' });
      }
      data.word_count = content.length;
    }

    await chapterDao.update(novelId, chapterNum, data);
    const chapter = await chapterDao.findByNovelAndNumber(novelId, chapterNum);
    res.json({ chapter });
  } catch (err) {
    res.status(500).json({ error: '编辑章节失败' });
  }
});

module.exports = router;
