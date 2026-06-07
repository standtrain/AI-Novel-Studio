// 多模型/多Provider 配置
// 支持同时对接多个 API 端点，按阶段自动选择模型
// 优先级：内存缓存 > process.env > site_config 数据库

const fs = require('fs');
const path = require('path');

const phaseMap = {
  plan: 'outline',
  character: 'characters',
  chapter_outline: 'chapters_outline',
  writing: 'write_chapter',
  review: 'review',
  ai_review: 'review',
};

// 运行时缓存（可通过 admin API 刷新，无需重启服务）
let cachedProviders = null;
let configDao = null; // 延迟注入，避免循环依赖

// Provider 优先级配置（数值越高越优先使用）
let providerPriorityMap = {};
const providerCooldowns = new Map();
const providerInflight = new Map();
const providerRoundRobin = new Map();
const DEFAULT_PROVIDER_COOLDOWN_MS = 60 * 1000;

// 注入 configDao（由 index.js 在 DB 就绪后调用）
function setConfigDao(dao) {
  configDao = dao;
}

// 读取 .env 文件中的值
function readEnvValue(key) {
  try {
    const envPath = path.join(__dirname, '../../.env');
    if (!fs.existsSync(envPath)) return null;
    const content = fs.readFileSync(envPath, 'utf-8');
    const regex = new RegExp(`^${key}\\s*=\\s*(.+)$`, 'm');
    const match = content.match(regex);
    if (!match) return null;
    let val = match[1].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    return val;
  } catch {
    return null;
  }
}

// 写入 .env 文件
function writeEnvValue(key, value) {
  try {
    const envPath = path.join(__dirname, '../../.env');
    let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
    const regex = new RegExp(`^${key}\\s*=\\s*.*$`, 'm');
    const newLine = `${key}=${value}`;
    if (regex.test(content)) {
      content = content.replace(regex, newLine);
    } else {
      content += `\n${newLine}`;
    }
    fs.writeFileSync(envPath, content.trim() + '\n', 'utf-8');
    process.env[key] = value;
    return true;
  } catch (e) {
    process.stderr.write(`写入 .env 失败：${e.message}\n`);
    return false;
  }
}

// 从 site_config DB 读取 providers
async function loadProvidersFromDB() {
  if (!configDao) return null;
  try {
    const val = await configDao.get('openai_providers');
    if (val) {
      return JSON.parse(val);
    }
  } catch { /* ignore */ }
  return null;
}

function parseProviders() {
  if (cachedProviders) return cachedProviders;

  if (process.env.OPENAI_PROVIDERS) {
    try {
      return JSON.parse(process.env.OPENAI_PROVIDERS);
    } catch (e) {
      process.stderr.write(`OPENAI_PROVIDERS 解析失败：${e.message}\n`);
    }
  }
  return null;
}

function buildSingleProvider() {
  return [{
    name: 'default',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY || '',
    maxConcurrency: 0,
    models: [{
      name: process.env.OPENAI_MODEL || 'gpt-4o',
      phases: ['outline', 'characters', 'chapters_outline', 'write_chapter', 'chat'],
    }],
  }];
}

function getProviders() {
  const providers = parseProviders();
  if (providers && providers.length > 0) return providers;
  return buildSingleProvider();
}

// 构建按优先级排序的 Provider 列表
function _sortedProviders() {
  const providers = getProviders();
  const sorted = providers.map((p, index) => ({
    ...p,
    _sourceIndex: index,
    effectivePriority: p.priority || providerPriorityMap[p.name] || 10,
  }));
  sorted.sort((a, b) => {
    const priorityDiff = b.effectivePriority - a.effectivePriority;
    if (priorityDiff !== 0) return priorityDiff;
    return a._sourceIndex - b._sourceIndex;
  });
  return sorted;
}

function _providerKey(provider) {
  return provider?.name || 'default';
}

function _getProviderMaxConcurrency(provider) {
  const raw = provider?.maxConcurrency ?? provider?.concurrency ?? provider?.apiConcurrency ?? 0;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function _isProviderCooling(providerName, now = Date.now()) {
  const until = providerCooldowns.get(providerName);
  if (!until) return false;
  if (until <= now) {
    providerCooldowns.delete(providerName);
    return false;
  }
  return true;
}

function _isProviderAtCapacity(provider) {
  const maxConcurrency = _getProviderMaxConcurrency(provider);
  if (maxConcurrency === 0) return false;
  return (providerInflight.get(_providerKey(provider)) || 0) >= maxConcurrency;
}

function _rotateSamePriorityProviders(providers, phaseKey) {
  const grouped = new Map();
  providers.forEach((provider) => {
    const key = provider.effectivePriority || 10;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(provider);
  });

  const result = [];
  [...grouped.keys()].sort((a, b) => b - a).forEach((priority) => {
    const group = grouped.get(priority);
    if (group.length <= 1) {
      result.push(...group);
      return;
    }
    const cursorKey = `${phaseKey}:${priority}`;
    const cursor = providerRoundRobin.get(cursorKey) || 0;
    for (let i = 0; i < group.length; i++) {
      result.push(group[(cursor + i) % group.length]);
    }
  });
  return result;
}

function _advanceProviderCursor(phaseKey, provider, providers) {
  if (!provider) return;
  const priority = provider.effectivePriority || 10;
  const group = providers.filter(p => (p.effectivePriority || 10) === priority);
  if (group.length <= 1) return;
  const index = group.findIndex(p => p.name === provider.name);
  if (index === -1) return;
  providerRoundRobin.set(`${phaseKey}:${priority}`, (index + 1) % group.length);
}

// 检查模型是否匹配阶段
function _modelMatchesPhase(model, phaseKey) {
  if (phaseKey === 'chat') {
    const phases = Array.isArray(model.phases) ? model.phases : [];
    return phases.some(phase => ['chat', 'all', 'outline', 'characters', 'chapters_outline', 'write_chapter'].includes(phase));
  }
  return model.phases.includes(phaseKey) || model.phases.includes('all');
}

function modelSupportsVision(model = {}) {
  if (model.supportsVision === true || model.vision === true) return true;
  const capabilityText = [
    ...(Array.isArray(model.capabilities) ? model.capabilities : []),
    ...(Array.isArray(model.modalities) ? model.modalities : []),
  ].join(' ').toLowerCase();
  if (/\b(image|vision|multimodal)\b/.test(capabilityText)) return true;

  const name = String(model.name || '').toLowerCase();
  if (/(embedding|tts|audio|whisper|moderation)/.test(name)) return false;
  return /(gpt-4o|gpt-4\.1|gpt-5|o3|o4|gemini|claude-3|claude-4|qwen.*vl|vision|llava|\bvl\b)/.test(name);
}

/**
 * 按阶段和用户偏好选择模型（异步，支持 Token 限额检查）
 * @param {string} phase - 写作阶段
 * @param {object} options - { preferredModelName, preferredProviderName, checkLimitFn, requireVision }
 * @returns {Promise<{provider, model: string, skipReasons: string[]}>}
 */
async function pickModel(phase, options = {}) {
  const { preferredModelName, preferredProviderName, checkLimitFn, requireVision } = options;
  const excludedProviders = new Set(options.excludeProviders || []);
  const providers = getProviders();
  const phaseKey = phaseMap[phase] || phase;
  const skipReasons = [];
  let availabilitySkipped = false;
  const sortedProviders = _rotateSamePriorityProviders(_sortedProviders(), phaseKey);

  // 辅助：在 provider 列表中查找模型并检查限额
  async function _tryFindModel(providerList, modelNameFilter) {
    for (const provider of providerList) {
      if (excludedProviders.has(provider.name)) continue;
      if (_isProviderCooling(provider.name)) {
        skipReasons.push(`API ${provider.name} 正在冷却中，已自动切换`);
        availabilitySkipped = true;
        continue;
      }
      if (_isProviderAtCapacity(provider)) {
        skipReasons.push(`API ${provider.name} 当前并发已满，已自动轮询下一个 API`);
        availabilitySkipped = true;
        continue;
      }
      for (const model of provider.models) {
        if (!_modelMatchesPhase(model, phaseKey)) continue;
        if (modelNameFilter && model.name !== modelNameFilter) continue;
        if (requireVision && !modelSupportsVision(model)) {
          skipReasons.push(`模型 ${provider.name}/${model.name} 不支持图片识别`);
          continue;
        }

        // 检查 Token 限额
        if (checkLimitFn) {
          try {
            const { available, reason } = await checkLimitFn(provider.name, model.name);
            if (!available) {
              skipReasons.push(reason);
              availabilitySkipped = true;
              continue; // 跳过此模型，尝试下一个
            }
          } catch {
            // checkLimitFn 异常时放行
          }
        }

        _advanceProviderCursor(phaseKey, provider, sortedProviders);
        return { provider, model: model.name };
      }
    }
    return null;
  }

  // 1. 用户首选模型（在所有 Provider 中查找）
  if (preferredModelName) {
    // 解析 provider_name::model_name 格式
    const parts = preferredModelName.split('::');
    const targetModelName = parts.length > 1 ? parts[1] : parts[0];
    const targetProviderName = parts.length > 1 ? parts[0] : null;

    let searchProviders = sortedProviders;
    if (targetProviderName) {
      // 先在指定 Provider 中查找
      const targetProvider = sortedProviders.find(p => p.name === targetProviderName);
      if (targetProvider) {
        searchProviders = [targetProvider, ...sortedProviders.filter(p => p.name !== targetProviderName)];
      }
    }

    const result = await _tryFindModel(searchProviders, targetModelName);
    if (result) return { ...result, skipReasons };

    skipReasons.push(`首选模型 ${preferredModelName} 不可用或未匹配当前阶段`);
  }

  // 2. 指定 Provider（兼容旧逻辑）
  if (preferredProviderName) {
    const preferred = sortedProviders.find(p => p.name === preferredProviderName);
    if (preferred) {
      const result = await _tryFindModel([preferred], null);
      if (result) return { ...result, skipReasons };
    }
  }

  // 3. 按管理员优先级顺序查找
  const result = await _tryFindModel(sortedProviders, null);
  if (result) return { ...result, skipReasons };

  // 4. 绝对兜底（跳过限额检查）
  if (availabilitySkipped) {
    throw { status: 429, message: '当前所有可用 API 均已超限、冷却中或并发已满，请稍后重试' };
  }
  const fallback = providers[0];
  if (!fallback) {
    throw { status: 500, message: '未配置可用 API Provider' };
  }
  const fallbackModel = fallback.models?.[0] || {};
  if (requireVision && !modelSupportsVision(fallbackModel)) {
    throw { status: 400, message: '当前可用模型不支持图片识别，请切换支持视觉能力的模型或移除图片后重试' };
  }
  if (!fallback || excludedProviders.has(fallback.name) || _isProviderCooling(fallback.name) || _isProviderAtCapacity(fallback)) {
    throw { status: 429, message: '当前所有可用 API 均不可用或并发已满，请稍后重试' };
  }
  return {
    provider: fallback,
    model: fallbackModel?.name || 'gpt-4o',
    skipReasons,
  };
}

function listProviders() {
  return getProviders().map(p => ({
    name: p.name,
    baseUrl: p.baseUrl,
    apiKey: p.apiKey ? '••••' + p.apiKey.slice(-4) : '',
    models: p.models.map(m => ({ name: m.name, phases: m.phases })),
  }));
}

// 获取完整配置（含 apiKey，仅 admin 使用）
function getProvidersFull() {
  return getProviders();
}

// 获取所有可选模型列表（按 Provider 分组，供用户选择）
function listSelectableModels() {
  const providers = getProviders();
  return providers.map(p => ({
    providerName: p.name,
    models: p.models.map(m => ({ name: m.name, phases: m.phases })),
  }));
}

/**
 * 获取下一个可用的 Provider（排除指定的那个）
 */
function getNextAvailableProvider(excludeProviderName) {
  const providers = getProviders();

  const sortedProviders = providers
    .filter(p => p.name !== excludeProviderName)
    .map(p => ({
      ...p,
      effectivePriority: p.priority || providerPriorityMap[p.name] || 10,
    }))
    .sort((a, b) => b.effectivePriority - a.effectivePriority);

  return sortedProviders.length > 0 ? sortedProviders[0] : providers[0];
}

function acquireProviderSlot(provider) {
  const key = _providerKey(provider);
  const maxConcurrency = _getProviderMaxConcurrency(provider);
  if (maxConcurrency > 0 && (providerInflight.get(key) || 0) >= maxConcurrency) {
    return null;
  }
  providerInflight.set(key, (providerInflight.get(key) || 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = Math.max(0, (providerInflight.get(key) || 1) - 1);
    if (next === 0) providerInflight.delete(key);
    else providerInflight.set(key, next);
  };
}

function markProviderUnavailable(providerName, reason = 'rate_limited', cooldownMs = DEFAULT_PROVIDER_COOLDOWN_MS) {
  if (!providerName) return;
  providerCooldowns.set(providerName, Date.now() + Math.max(1000, cooldownMs));
  process.stderr.write(`API ${providerName} 暂时不可用（${reason}），已冷却 ${cooldownMs}ms\n`);
}

function clearProviderRuntimeState() {
  providerCooldowns.clear();
  providerInflight.clear();
  providerRoundRobin.clear();
}

function isRetryableProviderError(err) {
  const status = err?.status || err?.response?.status;
  const code = String(err?.code || err?.error?.code || '').toLowerCase();
  const message = String(err?.message || err?.error?.message || '').toLowerCase();
  return status === 429 ||
    status === 408 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    code.includes('rate_limit') ||
    code.includes('quota') ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('quota') ||
    message.includes('限流') ||
    message.includes('超限') ||
    message.includes('额度');
}

/**
 * 更新 Provider 优先级配置
 */
function updateProviderPriority(name, priority) {
  providerPriorityMap[name] = priority;
}

// 更新 provider 配置（运行时生效 + 持久化）
async function updateProviders(providers) {
  const json = JSON.stringify(providers);
  writeEnvValue('OPENAI_PROVIDERS', json);
  if (configDao) {
    await configDao.set('openai_providers', json);
  }
  cachedProviders = providers;
  return true;
}

// 清除缓存（刷新配置用）
function clearCache() {
  cachedProviders = null;
  clearProviderRuntimeState();
}

// 启动后异步从 DB 加载（如果 .env 未配置）
async function initFromDB() {
  if (parseProviders()) return;
  const dbProviders = await loadProvidersFromDB();
  if (dbProviders) {
    cachedProviders = dbProviders;
    process.stdout.write('已从数据库加载 Provider 配置\n');
  }
}

module.exports = {
  getProviders,
  pickModel,
  listProviders,
  getProvidersFull,
  listSelectableModels,
  updateProviders,
  clearCache,
  initFromDB,
  setConfigDao,
  phaseMap,
  writeEnvValue,
  getNextAvailableProvider,
  updateProviderPriority,
  modelSupportsVision,
  acquireProviderSlot,
  markProviderUnavailable,
  isRetryableProviderError,
  clearProviderRuntimeState,
};
