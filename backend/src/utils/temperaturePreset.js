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

// 这些阶段更偏创作表达，适合让用户温度偏好生效
const CREATIVE_PHASES = new Set([
  'plan',
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
  // 低温调用通常用于摘要、审查或结构化抽取，保持稳定性优先
  return CREATIVE_PHASES.has(phase) && Number(requestedTemperature) >= 0.5;
}

module.exports = {
  TEMPERATURE_PRESETS,
  clampTemperature,
  normalizeTemperaturePreference,
  resolveTemperature,
  shouldApplyUserTemperature,
};
