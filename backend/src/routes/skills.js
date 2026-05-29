const { Router } = require('express');
const authenticate = require('../middleware/authenticate');
const skillService = require('../services/skillService');

const router = Router();
router.use(authenticate);

// 获取用户技能视图（含个人配置状态）
router.get('/', async (req, res) => {
  try {
    const skills = await skillService.getUserSkills(req.user.id);
    res.json({ skills });
  } catch (err) {
    res.status(500).json({ error: '获取技能列表失败' });
  }
});

// 切换技能启用状态
router.put('/:id/toggle', async (req, res) => {
  try {
    const skillId = parseInt(req.params.id, 10);
    const { enabled } = req.body;
    if (enabled === undefined) {
      return res.status(400).json({ error: '缺少 enabled 参数' });
    }
    const result = await skillService.toggleUserSkill(req.user.id, skillId, enabled);
    res.json({ user_skill: result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '切换技能状态失败' });
  }
});

// 更新技能参数
router.put('/:id/params', async (req, res) => {
  try {
    const skillId = parseInt(req.params.id, 10);
    const { parameters } = req.body;
    if (parameters === undefined) {
      return res.status(400).json({ error: '缺少 parameters 参数' });
    }
    const result = await skillService.updateUserSkillParams(req.user.id, skillId, parameters);
    res.json({ user_skill: result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '更新技能参数失败' });
  }
});

module.exports = router;
