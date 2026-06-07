// Agent 基类 — 统一 LLM 调用、重试、模型解析、技能/MCP 注入
const OpenAI = require('openai');
const { pickModel } = require('../../config/openai');
const { createLogger } = require('../../utils/logger');
const { resolveTemperature, shouldApplyUserTemperature } = require('../../utils/temperaturePreset');

const logger = createLogger('base-agent');

const PROMPT_INJECTED_MARK = '<!-- bookagent-advanced-prompt-injected -->';
const PROMPT_PHASE_ALIASES = {
  plan_revise: 'plan',
  import_analysis: 'all',
  character: 'characters',
  chapter_outline: 'chapters_outline',
  writing: 'write_chapter',
  context_assembly: 'write_chapter',
  review: 'write_chapter',
  polish: 'write_chapter',
  data_extraction: 'write_chapter',
};

function getPromptPhaseSet(phase) {
  const phases = new Set(['all']);
  if (phase) phases.add(phase);
  const normalized = PROMPT_PHASE_ALIASES[phase];
  if (normalized) phases.add(normalized);
  return phases;
}

class BaseAgent {
  constructor(contextManager, options = {}) {
    this._clients = new Map();
    this.ctx = contextManager || null;
    this._abortSignal = null;
    this.skills = options.skills || [];
    this.mcpTools = options.mcpTools || [];
    this.mcpToolServers = options.mcpToolServers || {};
    this.preferredModel = options.preferredModel || null;
    this.preferredProvider = options.preferredProvider || null;
    this.checkLimitFn = options.checkLimitFn || null;
    this.globalPrompt = options.globalPrompt || null;
    this.temperaturePreset = options.temperaturePreset || 'balanced';
    this.customTemperature = options.customTemperature ?? null;
    this.maxTokens = null;
  }

  // 获取或创建指定 provider 的 OpenAI 客户端
  _getClient(provider) {
    const key = provider.name;
    if (!this._clients.has(key)) {
      this._clients.set(key, new OpenAI({
        apiKey: provider.apiKey,
        baseURL: provider.baseUrl,
      }));
    }
    return this._clients.get(key);
  }

  // 根据阶段选择客户端和模型
  async _resolve(phase, options = {}) {
    return pickModel(phase, {
      preferredModelName: this.preferredModel,
      preferredProviderName: this.preferredProvider,
      checkLimitFn: this.checkLimitFn,
      requireVision: options.requireVision === true,
    });
  }

  // 创作类阶段使用用户温度偏好；审查、摘要、数据抽取等低温任务保持原始稳定设置
  _resolveTemperature(phase, requestedTemperature) {
    if (!shouldApplyUserTemperature(phase, requestedTemperature)) {
      return requestedTemperature;
    }
    return resolveTemperature(this.temperaturePreset, this.customTemperature);
  }

  // 将技能提示词和全局写作提示词注入系统提示词
  _enrichSystemPrompt(basePrompt, phase) {
    if (!basePrompt || basePrompt.includes(PROMPT_INJECTED_MARK)) {
      return basePrompt;
    }
    let enriched = basePrompt;

    // 个人全局提示词来自高级设置。这里统一注入到所有 Agent 调用，避免某些阶段漏掉。
    if (this.globalPrompt) {
      enriched += `\n\n【全局写作风格指令】\n${this.globalPrompt}`;
    }

    // 注入阶段匹配的技能提示词。别名阶段也要命中高级设置中的主阶段，避免写作/章纲等子阶段漏注入。
    const allowedPhases = getPromptPhaseSet(phase);
    const phaseSkills = this.skills.filter(s => allowedPhases.has(s.phase));
    if (phaseSkills.length === 0) return `${enriched}\n${PROMPT_INJECTED_MARK}`;
    const skillTexts = phaseSkills.map(s => `\n\n【技能增强：${s.display_name}】\n${s.resolvedPrompt}`);
    return `${enriched}${skillTexts.join('')}\n${PROMPT_INJECTED_MARK}`;
  }

  // 解析 JSON，失败返回 fallback
  parseJSON(text, fallback = null) {
    // 策略1：尝试提取 ```json ... ``` 代码块
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
    let raw = jsonMatch ? jsonMatch[1].trim() : text;

    // 策略2：如果没有代码块，尝试提取 JSON 对象或数组
    if (!jsonMatch) {
      // 优先尝试直接解析（处理 AI 返回完整 JSON 的情况）
      const trimmed = raw.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        raw = trimmed;
      } else {
        // 尝试提取 [...] 数组
        const arrStart = raw.indexOf('[');
        const arrEnd = raw.lastIndexOf(']');
        if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
          raw = raw.substring(arrStart, arrEnd + 1);
        } else {
          // 尝试提取 {...} 对象
          const objStart = raw.indexOf('{');
          const objEnd = raw.lastIndexOf('}');
          if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
            raw = raw.substring(objStart, objEnd + 1);
          }
        }
      }
    }

    // 清理常见 LLM JSON 格式问题
    const cleaned = raw
      .replace(/[￼�​]/g, '') // 移除对象替换符/零宽空格等异常 Unicode
      .replace(/\/\/[^\n]*/g, '')           // 移除单行注释
      .replace(/\/\*[\s\S]*?\*\//g, '')     // 移除多行注释
      .replace(/,\s*([}\]])/g, '$1');       // 移除尾随逗号

    try {
      return JSON.parse(cleaned);
    } catch (err1) {
      // 策略3：尝试修复单引号 JSON
      try {
        const unquotedFixed = cleaned.replace(/'/g, '"');
        return JSON.parse(unquotedFixed);
      } catch (err2) {
        logger.warn({ err: err1 }, 'JSON 解析失败，已尝试清理/修复');
        return fallback || { _parseError: true, _rawContent: (text || '').substring(0, 500) };
      }
    }
  }

  // 带 Schema 校验的 JSON 解析（检查必需字段是否存在）
  parseJSONWithSchema(text, requiredFields = [], fallback = null) {
    const result = this.parseJSON(text, fallback);
    if (result._parseError) return result;
    const missing = requiredFields.filter(f => !(f in result));
    if (missing.length > 0) {
      logger.warn({ missing }, 'JSON 缺少必需字段');
      return Object.assign(fallback || {}, result, { _missingFields: missing });
    }
    return result;
  }

  // 非流式 LLM 调用
  async callLLM(systemPrompt, userPrompt, temperature = 0.7, phase = 'writing', signal) {
    const { provider, model, skipReasons } = await this._resolve(phase);
    const client = this._getClient(provider);
    const abortSignal = signal || this._abortSignal;
    const effectiveTemperature = this._resolveTemperature(phase, temperature);
    const enrichedSystemPrompt = this._enrichSystemPrompt(systemPrompt, phase);

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: enrichedSystemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: effectiveTemperature,
      max_tokens: this.maxTokens,
    }, { signal: abortSignal });

    return {
      content: response.choices[0].message.content,
      usage: response.usage,
      model,
      provider: provider.name,
      skipReasons,
    };
  }

  // 流式 LLM 调用（支持 AbortSignal 和自动重试）
  async callLLMStream(systemPrompt, userPrompt, temperature, onChunk, phase = 'writing', signal, maxTokensOverride, options = {}) {
    const maxRetries = options.maxRetries || 3;
    const retryDelay = options.retryDelay || 5000;
    const maxTokens = maxTokensOverride || this.maxTokens;
    const effectiveTemperature = this._resolveTemperature(phase, temperature);
    const enrichedSystemPrompt = this._enrichSystemPrompt(systemPrompt, phase);

    let lastError = null;
    let skipReasons = [];

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const { provider, model, skipReasons: reasons } = await this._resolve(phase, {
          requireVision: options.requireVision === true,
        });
        skipReasons = reasons || [];
        const client = this._getClient(provider);
        const abortSignal = signal || this._abortSignal;

        const stream = await client.chat.completions.create({
          model,
          messages: options.messages
            ? [{ role: 'system', content: enrichedSystemPrompt }, ...options.messages]
            : [
                { role: 'system', content: enrichedSystemPrompt },
                { role: 'user', content: userPrompt },
              ],
          temperature: effectiveTemperature,
          max_tokens: maxTokens,
          stream: true,
          stream_options: { include_usage: true },
        }, { signal: abortSignal });

        let fullContent = '';
        let usage = null;

        for await (const chunk of stream) {
          if (abortSignal?.aborted) break;
          if (chunk.usage) {
            usage = chunk.usage;
          }
          const delta = chunk.choices?.[0]?.delta?.content || '';
          if (delta) {
            fullContent += delta;
            if (onChunk) onChunk(delta);
          }
        }

        return { content: fullContent, usage, model, provider: provider.name, skipReasons };

      } catch (err) {
        lastError = err;
        // 429 限流自动重试
        if (err.status === 429 || (err.message && err.message.includes('429'))) {
          logger.warn({ attempt: attempt + 1, maxRetries }, 'LLM 触发 429 限流，准备自动重试');
          if (attempt < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }
        }
        break;
      }
    }

    throw lastError;
  }

  // 获取上下文管理器的全局系统提示词
  _getGlobalContext() {
    if (!this.ctx) return '你是一个专业的小说创作助手。';
    return this.ctx.getGlobalSystemPrompt();
  }
}

module.exports = BaseAgent;
