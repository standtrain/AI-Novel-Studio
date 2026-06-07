const { Router } = require('express');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const skillService = require('../services/skillService');
const { parsePositiveInt } = require('../utils/requestParser');

const router = Router();
router.use(authenticate);
router.use(authorize('admin'));

// 获取所有技能
router.get('/', async (req, res) => {
  try {
    const skills = await skillService.getAllSkills();
    res.json({ skills });
  } catch (err) {
    res.status(500).json({ error: '获取技能列表失败' });
  }
});

// 创建技能
router.post('/', async (req, res) => {
  try {
    const skill = await skillService.createSkill(req.body);
    res.status(201).json({ skill });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '创建技能失败' });
  }
});

// 更新技能
router.put('/:id', async (req, res) => {
  try {
    const skillId = parsePositiveInt(req.params.id, '技能ID');
    const skill = await skillService.updateSkill(skillId, req.body);
    res.json({ skill });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '更新技能失败' });
  }
});

// 删除技能
router.delete('/:id', async (req, res) => {
  try {
    const skillId = parsePositiveInt(req.params.id, '技能ID');
    await skillService.deleteSkill(skillId);
    res.json({ success: true, message: '技能已删除' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '删除技能失败' });
  }
});

// 批量导入技能（Claude Code skills/ 目录格式）
router.post('/batch-import', async (req, res) => {
  try {
    const { skills } = req.body;
    if (!skills || !Array.isArray(skills)) {
      return res.status(400).json({ error: '请提供 skills 数组' });
    }
    const results = await skillService.batchImportSkills(skills);
    res.status(201).json(results);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '批量导入失败' });
  }
});

module.exports = router;
