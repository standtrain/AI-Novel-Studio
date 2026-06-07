const { Router } = require('express');
const authenticate = require('../middleware/authenticate');
const { checkTokenQuota } = require('../middleware/tokenCounter');
const { getRateLimiter } = require('../middleware/rateLimiter');
const agentService = require('../services/agentService');
const { parsePositiveInt, parseOptionalPositiveInt } = require('../utils/requestParser');

const router = Router();

// 所有 Agent 创作路由都需要认证
router.use(authenticate);

// 动态限流（按用户组）
router.use((req, res, next) => {
  const groupName = req.user?.group_name || 'free';
  const limiter = getRateLimiter(groupName);
  limiter(req, res, next);
});

// Token 配额检查
router.use(checkTokenQuota);

// POST /api/novels/plan — 对话式创建：AI 搜索趋势后生成小说方案
router.post('/plan', async (req, res) => {
  try {
    const { userInput } = req.body;
    if (!userInput || userInput.trim().length < 5) {
      return res.status(400).json({ error: '请提供更详细的创作需求（至少5个字）' });
    }
    const task = agentService.planNovel(req.user.id, userInput);
    task.execute(req, res);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '对话规划失败' });
  }
});

// POST /api/novels/import-analyze — 智能导入：AI 分析文本提取小说结构
router.post('/import-analyze', async (req, res) => {
  try {
    let text;
    // 支持 JSON 格式（小文本）和 text/plain 格式（大文件 base64）
    const contentType = req.get('Content-Type') || '';
    if (contentType.includes('text/plain')) {
      // 原始文本体，直接作为 text 字段
      text = typeof req.body === 'string' ? req.body : '';
      if (!text) {
        return res.status(400).json({ error: '请求体为空' });
      }
    } else {
      text = req.body?.text || '';
      if (!text) {
        return res.status(400).json({ error: '请提供文本内容或文件' });
      }
    }

    // DOCX/DOC 文件（base64 编码），使用对应库解析
    if (text.startsWith('[DOCX_BASE64]') || text.startsWith('[DOC_BASE64]')) {
      const isDoc = text.startsWith('[DOC_BASE64]');
      const prefixLen = isDoc ? 12 : 13; // '[DOC_BASE64]'=12, '[DOCX_BASE64]'=13
      const base64 = text.substring(prefixLen);
      try {
        const buffer = Buffer.from(base64, 'base64');
        if (isDoc) {
          // .doc 旧格式：使用 word-extractor
          const WordExtractor = require('word-extractor');
          const extractor = new WordExtractor();
          const doc = await extractor.extract(buffer);
          text = doc.getBody();
        } else {
          // .docx 新格式：使用 mammoth
          const mammoth = require('mammoth');
          const result = await mammoth.extractRawText({ buffer });
          text = result.value;
        }
        if (!text || text.trim().length < 100) {
          return res.status(400).json({ error: '文档内容过短或解析失败，请确认文件包含足够的中文内容' });
        }
      } catch (parseErr) {
        return res.status(400).json({ error: '文档解析失败：' + parseErr.message });
      }
    }

    if (text.length < 100) {
      return res.status(400).json({ error: '文本内容过短，请至少提供100字以上的内容' });
    }
    const instructions = req.body?.instructions || '';
    const task = agentService.runImportAnalysis(req.user.id, text, instructions);
    task.execute(req, res);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '智能导入分析失败' });
  }
});

// POST /api/novels/:id/outline — 阶段1：生成整书大纲
router.post('/:id/outline', async (req, res) => {
  try {
    const novelId = parsePositiveInt(req.params.id, '小说ID');
    const { userInput } = req.body;
    if (!userInput) {
      return res.status(400).json({ error: '请输入小说需求描述' });
    }
    const task = await agentService.generateOutline(req.user.id, novelId, userInput);
    task.execute(req, res);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '生成大纲失败' });
  }
});

// POST /api/novels/:id/characters — 阶段2：生成人物设定
router.post('/:id/characters', async (req, res) => {
  try {
    const novelId = parsePositiveInt(req.params.id, '小说ID');
    const task = await agentService.generateCharacters(req.user.id, novelId);
    task.execute(req, res);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '生成人物设定失败' });
  }
});

// POST /api/novels/:id/chapters-outline — 阶段3：生成逐章大纲（支持分段生成 ?startChapter=N）
router.post('/:id/chapters-outline', async (req, res) => {
  try {
    const novelId = parsePositiveInt(req.params.id, '小说ID');
    const startChapter = parseOptionalPositiveInt(req.query.startChapter, '起始章节') || null;
    const task = await agentService.generateChapterOutlines(req.user.id, novelId, startChapter);
    task.execute(req, res);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '生成章节大纲失败' });
  }
});

// POST /api/novels/:id/chapters/:num/write — 阶段4：写第N章
router.post('/:id/chapters/:num/write', async (req, res) => {
  try {
    const novelId = parsePositiveInt(req.params.id, '小说ID');
    const chapterNum = parsePositiveInt(req.params.num, '章节号');
    const task = await agentService.writeChapter(req.user.id, novelId, chapterNum);
    task.execute(req, res);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '写章节失败' });
  }
});

// POST /api/novels/:id/chapters/:num/review — 独立审查章节（不重新生成正文）
router.post('/:id/chapters/:num/review', async (req, res) => {
  try {
    const novelId = parsePositiveInt(req.params.id, '小说ID');
    const chapterNum = parsePositiveInt(req.params.num, '章节号');
    const task = await agentService.reviewChapter(req.user.id, novelId, chapterNum);
    task.execute(req, res);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '审查章节失败' });
  }
});

// POST /api/novels/:id/chapters/:num/extract — 独立数据提取（从已有章节提取结构化数据）
router.post('/:id/chapters/:num/extract', async (req, res) => {
  try {
    const novelId = parsePositiveInt(req.params.id, '小说ID');
    const chapterNum = parsePositiveInt(req.params.num, '章节号');
    const task = await agentService.extractChapterData(req.user.id, novelId, chapterNum);
    task.execute(req, res);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '提取章节数据失败' });
  }
});

// POST /api/novels/:id/chapters/:num/regenerate — 重新生成某章
router.post('/:id/chapters/:num/regenerate', async (req, res) => {
  try {
    const novelId = parsePositiveInt(req.params.id, '小说ID');
    const chapterNum = parsePositiveInt(req.params.num, '章节号');
    const task = await agentService.writeChapter(req.user.id, novelId, chapterNum);
    task.execute(req, res);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '重新生成章节失败' });
  }
});

// POST /api/novels/:id/revise — AI 修订内容
router.post('/:id/revise', async (req, res) => {
  try {
    const novelId = parsePositiveInt(req.params.id, '小说ID');
    const { phase, chapterNumber, currentContent, feedback } = req.body;
    if (!phase || !feedback) {
      return res.status(400).json({ error: '缺少 phase 或 feedback 参数' });
    }
    const task = await agentService.reviseContent(req.user.id, novelId, { phase, chapterNumber, currentContent, feedback });
    task.execute(req, res);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '修订失败' });
  }
});

// POST /api/novels/:id/plan-revise — 多轮对话修订小说方案
router.post('/:id/plan-revise', async (req, res) => {
  try {
    const novelId = parsePositiveInt(req.params.id, '小说ID');
    const { feedback } = req.body;
    if (!feedback || feedback.trim().length < 3) {
      return res.status(400).json({ error: '请提供更详细的修订意见（至少3个字）' });
    }
    const task = agentService.planRevise(req.user.id, novelId, feedback);
    task.execute(req, res);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '对话修订失败' });
  }
});

module.exports = router;
