const { Router } = require('express');
const { z } = require('zod');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const authenticate = require('../middleware/authenticate');
const { checkTokenQuota } = require('../middleware/tokenCounter');
const { getRateLimiter } = require('../middleware/rateLimiter');
const agentService = require('../services/agentService');
const chatDao = require('../dao/chatDao');
const { parsePositiveInt } = require('../utils/requestParser');

const router = Router();
const MAX_CHAT_MESSAGE_LENGTH = 8000;
const CHAT_TEXT_EXTS = ['.txt', '.md', '.csv', '.json', '.xml', '.html', '.htm'];
const CHAT_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
const CHAT_ALLOWED_EXTS = [...CHAT_TEXT_EXTS, ...CHAT_IMAGE_EXTS];
const DEFAULT_FILE_PROMPT = '请分析这些文件，并给出关键内容总结和写作建议。';

function cleanupUploadedFiles(files = []) {
  files.forEach((f) => {
    if (!f?.path) return;
    try { fs.unlinkSync(f.path); } catch { /* 忽略清理失败 */ }
  });
}

// 聊天文件上传配置
const UPLOADS_DIR = path.join(__dirname, '../../../uploads/chat');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const chatStorage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename(_req, file, cb) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const baseName = path.basename(file.originalname || 'upload').slice(0, 120);
    const safeName = baseName.replace(/[^a-zA-Z0-9._\-一-鿿]/g, '_');
    cb(null, `${timestamp}_${random}_${safeName}`);
  },
});

const chatUpload = multer({
  storage: chatStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (CHAT_ALLOWED_EXTS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件类型：${ext || '未知'}，请上传文本、HTML、JSON、CSV、Markdown 或图片文件`));
    }
  },
});

// 所有路由都需要认证
router.use(authenticate);

// ========== 对话 CRUD（无需限流/配额） ==========

// GET /api/chat/conversations — 获取对话列表
router.get('/conversations', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const result = await chatDao.listByUser(req.user.id, { page, limit });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || '获取对话列表失败' });
  }
});

// POST /api/chat/conversations — 新建对话
router.post('/conversations', async (req, res) => {
  try {
    const body = z.object({
      title: z.string().min(1).max(200).default('新对话'),
    }).parse(req.body);
    const id = await chatDao.create(req.user.id, body.title);
    res.status(201).json({ id, title: body.title });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: '参数错误', details: err.errors });
    }
    res.status(500).json({ error: err.message || '创建对话失败' });
  }
});

// GET /api/chat/conversations/:id — 获取对话详情（含消息列表）
router.get('/conversations/:id', async (req, res) => {
  try {
    const convId = parsePositiveInt(req.params.id, '对话ID');
    const conv = await chatDao.findById(convId, req.user.id);
    if (!conv) return res.status(404).json({ error: '对话不存在' });
    const messages = await chatDao.listMessages(convId);
    res.json({ ...conv, messages });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '获取对话失败' });
  }
});

// DELETE /api/chat/conversations/:id — 删除对话
router.delete('/conversations/:id', async (req, res) => {
  try {
    const convId = parsePositiveInt(req.params.id, '对话ID');
    const deleted = await chatDao.remove(convId, req.user.id);
    res.json({ success: true, deleted: deleted > 0 });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '删除对话失败' });
  }
});

// ========== SSE 对话端点（需限流+配额） ==========

// 动态限流（按用户组）
const withRateLimit = (req, res, next) => {
  const groupName = req.user?.group_name || 'default';
  getRateLimiter(groupName)(req, res, next);
};

// 处理上传并解析 body 字段
function parseChatUpload(req, res) {
  return new Promise((resolve, reject) => {
    chatUpload.array('files', 5)(req, res, (err) => {
      if (err) {
        cleanupUploadedFiles(req.files || []);
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') reject({ status: 400, message: '文件大小不能超过 10MB' });
          else if (err.code === 'LIMIT_FILE_COUNT') reject({ status: 400, message: '一次最多上传 5 个文件' });
          else reject({ status: 400, message: `上传错误：${err.message}` });
        } else {
          reject({ status: 400, message: err.message || '上传失败' });
        }
        return;
      }
      resolve({ files: req.files || [], body: req.body || {} });
    });
  });
}

// POST /api/chat — 发送消息并获取AI流式回复
router.post('/', withRateLimit, checkTokenQuota, async (req, res) => {
  let uploadedFiles = []; // 请求结束时清理

  try {
    // 先处理文件上传（multipart 或普通 JSON body）
    const isMultipart = req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data');

    let message, conversationId;

    if (isMultipart) {
      const { files, body } = await parseChatUpload(req, res);
      uploadedFiles = files;
      message = body.message || '';
      conversationId = body.conversationId || null;
    } else {
      const parsed = z.object({
        message: z.string().trim().min(1, '请输入对话内容').max(MAX_CHAT_MESSAGE_LENGTH, `对话内容不能超过${MAX_CHAT_MESSAGE_LENGTH}字`),
        conversationId: z.union([z.number(), z.string()]).optional().nullable(),
      }).passthrough().parse(req.body);
      message = parsed.message;
      conversationId = parsed.conversationId;
    }

    // 构建文件信息列表
    const fileList = uploadedFiles.map((f) => {
      const ext = path.extname(f.originalname).toLowerCase();
      const isImage = CHAT_IMAGE_EXTS.includes(ext);
      return {
        originalName: f.originalname,
        filename: f.filename,
        path: f.path,
        size: f.size,
        mimetype: f.mimetype,
        isImage,
      };
    });

    const normalizedMessage = typeof message === 'string' ? message.trim() : '';
    if (!normalizedMessage && fileList.length === 0) {
      return res.status(400).json({ error: '请输入对话内容或上传文件' });
    }
    if (normalizedMessage.length > MAX_CHAT_MESSAGE_LENGTH) {
      cleanupUploadedFiles(uploadedFiles);
      return res.status(400).json({ error: `对话内容不能超过${MAX_CHAT_MESSAGE_LENGTH}字` });
    }

    let resolvedConvId = null;
    if (conversationId !== undefined && conversationId !== null && conversationId !== '') {
      resolvedConvId = parsePositiveInt(conversationId, '对话ID');
      const conv = await chatDao.findById(resolvedConvId, req.user.id);
      if (!conv) {
        cleanupUploadedFiles(uploadedFiles);
        return res.status(404).json({ error: '对话不存在' });
      }
    }

    const effectiveMessage = normalizedMessage || DEFAULT_FILE_PROMPT;
    const task = await agentService.chat(req.user.id, effectiveMessage, resolvedConvId, fileList);
    task.execute(req, res);
  } catch (err) {
    // 出错时清理已上传文件
    cleanupUploadedFiles(uploadedFiles);

    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors?.[0]?.message || '参数错误', details: err.errors });
    }
    res.status(err.status || 500).json({ error: err.message || '对话请求失败' });
  }
});

module.exports = router;
