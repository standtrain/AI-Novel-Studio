// Agent 基类 — 统一 LLM 调用、重试、模型解析、技能/MCP 注入
const OpenAI = require('openai');
const { pickModel } = require('../../config/openai');

class BaseAgent {
  constructor(contextManager, options = {}) {
    this._clients = new Map();
    this.ctx = contextManager || null;
    this._abortSignal = null;
    this.skills = options.skills || [];
    this.mcpTools = options.mcpTools || [];
    this.preferredModel = options.preferredModel || null;
    this.preferredProvider = options.preferredProvider || null;
    this.checkLimitFn = options.checkLimitFn || null;
    this.globalPrompt = options.globalPrompt || null;
    this.maxTokens = null;
    // 温度配置
    this.temperaturePreset = options.temperaturePreset || 'balanced';
    this.customTemperature = options.customTemperature || null;
    this.phaseTemperatures = options.phaseTemperatures || {};
    this.userPhaseTemperatures = options.userPhaseTemperatures || {};
  }

  // 预设温度映射
  _getPresetTemperature(preset) {
    const presets = {
      precise: 0.35,
      balanced: 0.7,
      creative: 0.9,
      wild: 1.1,
    };
    return presets[preset] || 0.7;
  }

  // 解析创作阶段温度：用户逐阶段覆盖 > 用户自定义 > 用户预设 > admin temp_* 配置 > 阶段硬编码默认值
  _resolveTemperature(phase, fallback) {
    // 1. 用户逐阶段覆盖（最高优先级）
    if (this.userPhaseTemperatures[phase] !== undefined) {
      return this.userPhaseTemperatures[phase];
    }
    // 2. 用户自定义温度
    if (this.temperaturePreset === 'custom' && this.customTemperature !== null) {
      return this.customTemperature;
    }
    // 3. 用户预设
    if (this.temperaturePreset && this.temperaturePreset !== 'balanced') {
      return this._getPresetTemperature(this.temperaturePreset);
    }
    // 4. admin temp_* 配置
    if (this.phaseTemperatures[phase] !== undefined) {
      return this.phaseTemperatures[phase];
    }
    // 5. 硬编码默认值
    return fallback;
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
  async _resolve(phase) {
    return pickModel(phase, {
      preferredModelName: this.preferredModel,
      preferredProviderName: this.preferredProvider,
      checkLimitFn: this.checkLimitFn,
    });
  }

  // 将技能提示词和全局写作提示词注入系统提示词
  _enrichSystemPrompt(basePrompt, phase) {
    let enriched = basePrompt;

    // 注入全局写作提示词（对写作、润色、修订阶段生效）
    const writingPhases = ['write_chapter', 'context_assembly', 'polish', 'review', 'outline', 'characters', 'chapters_outline'];
    if (this.globalPrompt && writingPhases.includes(phase)) {
      enriched += `\n\n【全局写作风格指令】\n${this.globalPrompt}`;
    }

    // 注入阶段匹配的技能提示词
    const phaseSkills = this.skills.filter(s => s.phase === phase || s.phase === 'all');
    if (phaseSkills.length === 0) return enriched;
    const skillTexts = phaseSkills.map(s => `\n\n【技能增强：${s.display_name}】\n${s.resolvedPrompt}`);
    return enriched + skillTexts.join('');
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
        console.warn(`JSON 解析失败: ${err1.message}（已尝试清理/修复）`);
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
      console.warn(`JSON 缺少必需字段: ${missing.join(', ')}`);
      return Object.assign(fallback || {}, result, { _missingFields: missing });
    }
    return result;
  }

  // 非流式 LLM 调用
  async callLLM(systemPrompt, userPrompt, temperature, phase = 'writing', signal) {
    if (temperature === undefined) {
      temperature = this._resolveTemperature(phase, 0.7);
    }
    const { provider, model, skipReasons } = await this._resolve(phase);
    const client = this._getClient(provider);
    const abortSignal = signal || this._abortSignal;

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
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

    let lastError = null;
    let skipReasons = [];

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const { provider, model, skipReasons: reasons } = await this._resolve(phase);
        skipReasons = reasons || [];
        const client = this._getClient(provider);
        const abortSignal = signal || this._abortSignal;

        const stream = await client.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature,
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
          console.log(`[LLM] 429 限流，自动重试中（第 ${attempt + 1}/${maxRetries} 次）...`);
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
