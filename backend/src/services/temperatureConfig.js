// 温度配置中心 — 统一管理所有阶段的 temperature 默认值
// 管理员可通过 site_config 覆盖任意阶段的默认温度
// 用户可通过 temperature_preset / custom_temperature 覆盖创作阶段

const configDao = require('../dao/configDao');
const { createLogger } = require('../utils/logger');
const logger = createLogger('temperature');

// 用户可在高级设置中自行配置的阶段
const USER_CONFIGURABLE_PHASES = new Set([
  'outline', 'characters', 'chapters_outline', 'write_chapter',
  'chapter_summary', 'plan_research', 'plan_generate', 'plan_revise',
  'context_assembly', 'polish', 'revise', 'template',
]);

// 所有阶段的硬编码默认值（作为最终兜底）
const PHASE_DEFAULTS = {
  // ---- 创作阶段（用户可覆盖） ----
  outline:              { value: 0.7,  label: '生成大纲',              category: 'creative' },
  characters:           { value: 0.7,  label: '生成人物设定',          category: 'creative' },
  chapters_outline:     { value: 0.6,  label: '生成逐章大纲',          category: 'creative' },
  write_chapter:        { value: 0.85, label: '写章节正文',            category: 'creative' },
  chapter_summary:      { value: 0.3,  label: '章节摘要',              category: 'creative' },
  plan_research:        { value: 0.7,  label: '规划-搜索研究',         category: 'creative' },
  plan_generate:        { value: 0.8,  label: '规划-方案生成',         category: 'creative' },
  plan_revise:          { value: 0.7,  label: '规划-修订方案',         category: 'creative' },
  context_assembly:     { value: 0.3,  label: '写作任务书组装',        category: 'creative' },
  polish:               { value: 0.5,  label: '润色修复',              category: 'creative' },
  revise:               { value: 0.7,  label: '内容修订',              category: 'creative' },

  // ---- 系统阶段（仅管理员可配置） ----
  review:               { value: 0.2,  label: '章节审查',              category: 'system' },
  review_retry:         { value: 0.1,  label: '审查重试',              category: 'system' },
  data_extraction:      { value: 0.15, label: '数据提取',              category: 'system' },
  import_title:         { value: 0.3,  label: '导入-提取书名',         category: 'system' },
  import_chars:         { value: 0.3,  label: '导入-提取角色',         category: 'system' },
  import_chapters:      { value: 0.2,  label: '导入-提取章节',         category: 'system' },
  ban:                  { value: 0.3,  label: '内容审核',              category: 'system' },
  template:             { value: 0.1,  label: '模板生成',              category: 'system' },
};

// 预设映射（与前端 TemperaturePreference.tsx 保持一致）
const PRESETS = {
  precise: 0.35,
  balanced: 0.7,
  creative: 0.9,
  wild: 1.1,
};

// 缓存
let _cache = null;
let _cacheTs = 0;
const CACHE_TTL = 60000; // 60秒缓存

function _configKey(phase) {
  return `temp_${phase}`;
}

async function _loadFromDb() {
  const config = {};
  for (const phase of Object.keys(PHASE_DEFAULTS)) {
    const val = await configDao.getFloat(_configKey(phase), null);
    if (val !== null) {
      config[phase] = val;
    }
  }
  return config;
}

async function _getConfig() {
  const now = Date.now();
  if (_cache && (now - _cacheTs) < CACHE_TTL) return _cache;
  _cache = await _loadFromDb();
  _cacheTs = now;
  return _cache;
}

function clearCache() {
  _cache = null;
  _cacheTs = 0;
}

/**
 * 获取指定阶段的温度值
 * 优先级：admin site_config > 硬编码默认值
 * @param {string} phase - 阶段名称
 * @returns {number} 温度值
 */
async function getPhaseTemperature(phase) {
  const config = await _getConfig();
  if (config[phase] !== undefined) return config[phase];
  const def = PHASE_DEFAULTS[phase];
  return def ? def.value : 0.7;
}

/**
 * 获取所有阶段配置（含标签、分类信息，供前端展示）
 */
function getAllPhaseConfigs() {
  return Object.entries(PHASE_DEFAULTS).map(([phase, info]) => ({
    phase,
    configKey: _configKey(phase),
    defaultValue: info.value,
    label: info.label,
    category: info.category,
  }));
}

/**
 * 解析创作阶段温度（供 Agent 使用）
 * 优先级：用户自定义 > 用户预设 > admin 阶段配置 > 硬编码默认值
 */
async function resolveCreativeTemperature(phase, userPreset, customTemperature, fallback) {
  // 1. 用户自定义温度
  if (userPreset === 'custom' && customTemperature !== null && customTemperature !== undefined) {
    return customTemperature;
  }
  // 2. 用户预设
  if (userPreset && userPreset !== 'balanced') {
    const presetVal = PRESETS[userPreset];
    if (presetVal !== undefined) return presetVal;
  }
  // 3. admin 阶段配置
  const adminVal = await _getConfig().then(c => c[phase]);
  if (adminVal !== undefined) return adminVal;
  // 4. 硬编码默认值
  return fallback;
}

/**
 * 解析系统阶段温度（仅 admin 可配置）
 * 优先级：admin 阶段配置 > 硬编码默认值
 */
async function resolveSystemTemperature(phase, fallback) {
  const config = await _getConfig();
  if (config[phase] !== undefined) return config[phase];
  return fallback;
}

/**
 * 获取用户可配置的阶段列表（供前端展示）
 */
function getUserConfigurablePhases() {
  return Object.entries(PHASE_DEFAULTS)
    .filter(([phase]) => USER_CONFIGURABLE_PHASES.has(phase))
    .map(([phase, info]) => ({
      phase,
      configKey: _configKey(phase),
      defaultValue: info.value,
      label: info.label,
    }));
}

/**
 * 解析用户阶段温度（供 BaseAgent._resolveTemperature 使用）
 * 优先级：用户逐阶段覆盖 > 用户自定义 > 用户预设 > admin 阶段配置 > 硬编码默认值
 * @param {string} phase - 阶段名称
 * @param {object|null} userPhaseConfigs - 用户的逐阶段覆盖 { phase: temperature }
 * @param {string} userPreset - 用户预设
 * @param {number|null} customTemperature - 用户自定义温度
 * @param {number} fallback - Agent 输入的兜底值
 */
async function resolveUserPhaseTemperature(phase, userPhaseConfigs, userPreset, customTemperature, fallback) {
  // 1. 用户逐阶段覆盖（最高优先级）
  if (userPhaseConfigs && userPhaseConfigs[phase] !== undefined) {
    return userPhaseConfigs[phase];
  }
  // 2. 用户自定义温度
  if (userPreset === 'custom' && customTemperature !== null && customTemperature !== undefined) {
    return customTemperature;
  }
  // 3. 用户预设
  if (userPreset && userPreset !== 'balanced') {
    const presetVal = PRESETS[userPreset];
    if (presetVal !== undefined) return presetVal;
  }
  // 4. admin 阶段配置
  const adminConfig = await _getConfig();
  if (adminConfig[phase] !== undefined) return adminConfig[phase];
  // 5. 硬编码默认值
  return fallback;
}

module.exports = {
  PHASE_DEFAULTS,
  PRESETS,
  USER_CONFIGURABLE_PHASES,
  getPhaseTemperature,
  getAllPhaseConfigs,
  getUserConfigurablePhases,
  resolveCreativeTemperature,
  resolveSystemTemperature,
  resolveUserPhaseTemperature,
  clearCache,
};
