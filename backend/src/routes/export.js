const { Router } = require('express');
const authenticate = require('../middleware/authenticate');
const exportGuard = require('../middleware/exportGuard');
const exportService = require('../services/exportService');

const router = Router({ mergeParams: true });

// GET /api/novels/:id/export?format=docx&scope=full
// GET /api/novels/:id/export?format=txt&scope=chapter&chapterNum=1
// GET /api/novels/:id/export?format=pdf&scope=range&chapters=1-5
router.get('/:id/export', authenticate, exportGuard, async (req, res) => {
  try {
    const novelId = parseInt(req.params.id, 10);
    const { format, scope, chapters, chapterNum } = req.query;

    const options = {
      chapterNum: chapterNum ? parseInt(chapterNum, 10) : undefined,
      chapters: chapters || undefined,
    };

    const result = await exportService.generateExport(format, scope, novelId, req.user.id, options);

    // RFC 5987 编码中文文件名
    const encodedFilename = encodeURIComponent(result.filename);
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
    res.setHeader('Content-Length', result.buffer.length);
    res.send(result.buffer);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '导出失败' });
  }
});

module.exports = router;
