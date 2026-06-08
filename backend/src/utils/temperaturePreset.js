const TEMPERATURE_PRESETS = {
  precise: {
    value: 0.35,
    label: '稳健',
    description: '更稳定、更少跳脱，适合严肃设定和复杂逻辑',
  },
  balanced: {
    value: 0.70,
    label: '均衡',
    description: '兼顾稳定与想象力，适合大多数创作',
  },
  creative: {
    value: 0.90,
    label: '发散',
    description: '更有变化和戏剧性，适合追求新鲜感',
  },
  wild: {
    value: 1.10,
    label: '大胆',
    description: '更开放、更冒险，适合脑洞和强风格尝试',
  },
  custom: {
    value: 0.70,
    label: '自定义',
    description: '使用你手动设置的温度值',
  },
};

const DEFAULT_TEMPERATURE_CONFIGS = {
  default_temperature: {
    value: 0.7,
    description: '默认temperature参数',
  },
  temp_outline: {
    value: 0.7,
    description: '整书大纲生成温度',
  },
  temp_characters: {
    value: 0.7,
    description: '角色设定生成温度',
  },
  temp_chapters_outline: {
    value: 0.6,
    description: '章节大纲生成温度',
  },
  temp_write_chapter: {
    value: 0.85,
    description: '章节正文写作温度',
  },
  temp_chapter_summary: {
    value: 0.3,
    description: '章节摘要生成温度',
  },
  temp_plan_research: {
    value: 0.7,
    description: '创作规划调研温度',
  },
  temp_plan_generate: {
    value: 0.8,
    description: '创作规划生成温度',
  },
  temp_plan_revise: {
    value: 0.7,
    description: '创作规划修订温度',
  },
  temp_context_assembly: {
    value: 0.3,
    description: '写作任务书组装温度',
  },
  temp_polish: {
    value: 0.5,
    description: '章节润色修复温度',
  },
  temp_revise: {
    value: 0.7,
    description: '正文修订温度',
  },
  temp_review: {
    value: 0.2,
    description: '章节审查温度',
  },
  temp_review_retry: {
    value: 0.1,
    description: '审查结果重试解析温度',
  },
  temp_data_extraction: {
    value: 0.15,
    description: '结构化数据抽取温度',
  },
  temp_import_title: {
    value: 0.3,
    description: '导入概览分析温度',
  },
  temp_import_chars: {
    value: 0.3,
    description: '导入角色提取温度',
  },
  temp_import_chapters: {
    value: 0.2,
    description: '导入章节分析温度',
  },
  temp_ban: {
    value: 0.3,
    description: '封禁申诉审核温度',
  },
  temp_template: {
    value: 0.1,
    description: '模板审核温度',
  },
};

const TEMPERATURE_CONFIG_KEYS = Object.freeze(Object.keys(DEFAULT_TEMPERATURE_CONFIGS));

const PHASE_TEMPERATURE_KEYS = {
  outline: 'temp_outline',
  characters: 'temp_characters',
  character: 'temp_characters',
  chapters_outline: 'temp_chapters_outline',
  chapter_outline: 'temp_chapters_outline',
  write_chapter: 'temp_write_chapter',
  writing: 'temp_write_chapter',
  chapter_summary: 'temp_chapter_summary',
  plan_research: 'temp_plan_research',
  plan_generate: 'temp_plan_generate',
  plan: 'temp_plan_generate',
  plan_revise: 'temp_plan_revise',
  context_assembly: 'temp_context_assembly',
  polish: 'temp_polish',
  revise: 'temp_revise',
  review: 'temp_review',
  review_retry: 'temp_review_retry',
  data_extraction: 'temp_data_extraction',
  import_title: 'temp_import_title',
  import_chars: 'temp_import_chars',
  import_chapters: 'temp_import_chapters',
  import_analysis: 'temp_import_title',
  ban: 'temp_ban',
  template: 'temp_template',
};

// 这些阶段更偏创作表达，适合让用户温度偏好生效
const CREATIVE_PHASES = new Set([
  'plan',
  'plan_generate',
  'plan_revise',
  'outline',
  'characters',
  'character',
  'chapters_outline',
  'chapter_outline',
  'write_chapter',
  'writing',
  'polish',
]);

function clampTemperature(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(2, Math.max(0, Math.round(n * 100) / 100));
}

function normalizeConfigTemperature(value, fallback = DEFAULT_TEMPERATURE_CONFIGS.default_temperature.value) {
  const normalized = clampTemperature(value);
  return normalized === null ? fallback : normalized;
}

function normalizeTemperatureConfigMap(config = {}) {
  const fallback = normalizeConfigTemperature(
    config.default_temperature,
    DEFAULT_TEMPERATURE_CONFIGS.default_temperature.value
  );
  const normalized = { default_temperature: fallback };
  for (const key of TEMPERATURE_CONFIG_KEYS) {
    if (key === 'default_temperature') continue;
    normalized[key] = normalizeConfigTemperature(
      config[key],
      DEFAULT_TEMPERATURE_CONFIGS[key]?.value ?? fallback
    );
  }
  return normalized;
}

function getTemperatureConfigKey(phase) {
  return PHASE_TEMPERATURE_KEYS[phase] || null;
}

function resolveConfiguredTemperature(phase, requestedTemperature, config = {}) {
  const normalizedConfig = normalizeTemperatureConfigMap(config);
  const key = getTemperatureConfigKey(phase);
  if (key && normalizedConfig[key] !== undefined) return normalizedConfig[key];
  const requested = clampTemperature(requestedTemperature);
  return requested === null ? normalizedConfig.default_temperature : requested;
}

function normalizeTemperaturePreference(preset, customTemperature) {
  const normalizedPreset = TEMPERATURE_PRESETS[preset] ? preset : 'balanced';
  const normalizedCustom = clampTemperature(customTemperature);

  return {
    preset: normalizedPreset,
    customTemperature: normalizedPreset === 'custom' ? (normalizedCustom ?? TEMPERATURE_PRESETS.balanced.value) : normalizedCustom,
  };
}

function resolveTemperature(preset, customTemperature) {
  const preference = normalizeTemperaturePreference(preset, customTemperature);
  if (preference.preset === 'custom') {
    return preference.customTemperature;
  }
  return TEMPERATURE_PRESETS[preference.preset].value;
}

function shouldApplyUserTemperature(phase, requestedTemperature) {
  if (phase === 'plan_research') return false;
  // 低温调用通常用于摘要、审查或结构化抽取，保持稳定性优先
  return CREATIVE_PHASES.has(phase) && Number(requestedTemperature) >= 0.5;
}

module.exports = {
  TEMPERATURE_PRESETS,
  DEFAULT_TEMPERATURE_CONFIGS,
  TEMPERATURE_CONFIG_KEYS,
  PHASE_TEMPERATURE_KEYS,
  clampTemperature,
  normalizeConfigTemperature,
  normalizeTemperatureConfigMap,
  normalizeTemperaturePreference,
  getTemperatureConfigKey,
  resolveConfiguredTemperature,
  resolveTemperature,
  shouldApplyUserTemperature,
};
