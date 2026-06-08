// 规划代理 — 对话式小说创作
// 通过多轮对话 + MCP 工具搜索，帮助用户从模糊需求到完整小说方案
const BaseAgent = require('./baseAgent');
const { parseToolCallResult } = require('../mcp/mcpToolAdapter');
const { getMcpClientManager } = require('../mcp/mcpClient');

const MAX_RESEARCH_TURNS = 4; // 最多搜索轮次
const MAX_TOOL_RESULT_CHARS = 6000; // 单次工具结果最大字符数

function _isEnabledValue(value, defaultValue = true) {
  if (value === undefined || value === null) return defaultValue;
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  return Boolean(value);
}

class PlanningAgent extends BaseAgent {
  // 筛选搜索相关 MCP 工具（web_search、search 等）
  _filterSearchTools() {
    if (!this.mcpTools || this.mcpTools.length === 0) return [];
    const searchKeywords = ['search', 'web', 'fetch', 'scrape', 'http', 'query', 'find', 'lookup', 'baidu', 'google', 'bing', 'news'];
    return this.mcpTools.filter(t => {
      const name = (t.function?.name || '').toLowerCase();
      const desc = (t.function?.description || '').toLowerCase();
      return searchKeywords.some(kw => name.includes(kw) || desc.includes(kw));
    });
  }

  // 执行 MCP 工具调用
  async _executeMcpTool(toolName, args) {
    try {
      const originalName = this._getMcpOriginalToolName ? this._getMcpOriginalToolName(toolName) : toolName;
      const server = this.mcpToolServers?.[originalName] || this.mcpToolServers?.[toolName];
      if (!server) {
        return `工具 "${toolName}" 执行失败：当前用户未启用该工具`;
      }
      if (!_isEnabledValue(server.enabled, true) || !_isEnabledValue(server.user_enabled, true)) {
        return '无可用的搜索服务';
      }

      const manager = getMcpClientManager();
      const tools = await manager.getTools(server);
      const found = tools.find(t => t.name === originalName);
      if (!found) {
        return `工具 "${toolName}" 执行失败：服务器未返回该工具`;
      }
      const result = await manager.callTool(server, originalName, args);
      return parseToolCallResult(result);
    } catch (err) {
      return `工具调用错误：${err.message}`;
    }
  }

  // 构建规划阶段的系统提示词
  _buildSystemPrompt() {
    let prompt = `你是一位资深的小说策划编辑。你的任务是帮助用户从模糊的想法出发，通过搜索最新市场趋势和读者偏好，制定一个具体可行的小说创作方案。

## 工作流程
1. 理解用户需求，分析目标读者和题材方向
2. 主动调用搜索工具研究当前热门趋势、读者偏好、同类作品特点
3. 基于研究结果，为用户量身定制小说创作方案
4. 只输出全文大纲方案：包括书名、题材、世界观、主线、支线、预计章数、市场分析和创新点

## 搜索策略
- 搜索当前流行的网络小说类型和热门题材
- 搜索目标读者群体的阅读偏好
- 搜索爆款小说的成功要素
- 如果用户指定了具体题材（如玄幻、都市、科幻），搜索该题材的最新趋势

## 输出格式
当你完成研究后，必须输出以下 JSON 格式的小说方案（不要包含在 \`\`\`json 代码块中，直接输出纯 JSON）：
{
  "title": "建议书名",
  "genre": "题材类型",
  "theme": "核心主题（200-300字）",
  "setting": "世界观设定（300-500字）",
  "tone": "基调（如：热血、轻松、悬疑、治愈）",
  "targetAudience": "目标读者群体",
  "mainPlot": "主线剧情概述（500-800字）",
  "subPlots": ["支线1（100字以上）", "支线2"],
  "chapterCount": 全书总章节数（100-200之间的整数）,
  "marketAnalysis": "市场分析说明（200-300字）",
  "innovationPoints": ["创新点1", "创新点2"]
}

## 注意事项
- 如果搜索工具不可用，请根据你的知识库直接生成方案
- chapterCount 字段要求：必须是 100-200 之间的整数，这是网文的标准篇幅，禁止返回 1 或任何小于 100 的值
- 禁止输出 characters、chapters 或正文内容，后续阶段由用户进入作品后手动生成
- 方案要具体、可执行，避免空泛的建议`;

    return this._enrichSystemPrompt(prompt, 'plan');
  }

  // 实际执行规划的主方法
  async planNovel(userInput, onProgress) {
    const searchTools = this._filterSearchTools();
    const openaiTools = searchTools.length > 0 ? this.getMcpOpenAITools(searchTools) : undefined;

    const researchTemperature = this._resolveTemperature('plan_research', 0.7);
    const planTemperature = this._resolveTemperature('plan_generate', 0.8);

    const systemPrompt = this._buildSystemPrompt();
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `我想创建一部小说，我的需求是：${userInput}\n\n请先分析这个需求，然后搜索相关市场趋势和读者偏好信息（如果搜索工具可用），最后只给出全文大纲方案。` },
    ];

    let researchSummary = '';
    let totalUsage = null;
    let usedModel = null;
    let usedProvider = null;
    let skipReasons = [];

    // 第一阶段：研究（多轮工具调用）
    onProgress('progress', { step: 'research', message: '正在分析需求，搜索最新创作趋势...' });

    for (let turn = 0; turn < MAX_RESEARCH_TURNS; turn++) {
      try {
        const researchResult = await this._withProviderRetry('plan_research', {}, async ({ provider, model, skipReasons: reasons }) => {
          const client = this._getClient(provider);
          const response = await client.chat.completions.create({
            model,
            messages,
            tools: openaiTools,
            tool_choice: openaiTools ? 'auto' : undefined,
            temperature: researchTemperature,
          }, { signal: this._abortSignal });
          return { response, model, provider: provider.name, skipReasons: reasons };
        });
        const response = researchResult.response;
        usedModel = researchResult.model;
        usedProvider = researchResult.provider;
        skipReasons = researchResult.skipReasons || skipReasons;

        if (response.usage) totalUsage = response.usage;

        const msg = response.choices[0].message;
        messages.push(msg);

        if (msg.tool_calls && msg.tool_calls.length > 0) {
          for (const toolCall of msg.tool_calls) {
            const toolName = toolCall.function.name;
            let toolArgs = {};
            try {
              toolArgs = JSON.parse(toolCall.function.arguments);
            } catch { /* 使用空参数 */ }

            onProgress('progress', {
              step: 'research',
              message: `正在调用工具 "${toolName}" 搜索相关信息...`,
              tool: toolName,
            });

            const toolResult = await this._executeMcpTool(toolName, toolArgs);
            const truncated = toolResult.length > MAX_TOOL_RESULT_CHARS
              ? toolResult.substring(0, MAX_TOOL_RESULT_CHARS) + '\n...(结果已截断)'
              : toolResult;

            researchSummary += `\n\n--- ${toolName} 结果 ---\n${truncated}`;

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: truncated,
            });
          }
          onProgress('progress', { step: 'research', message: '搜索完成，正在整合信息...' });
        } else {
          // LLM 没有调用工具，直接进入方案生成阶段
          break;
        }
      } catch (err) {
        if (err.status === 429) {
          onProgress('progress', { message: '请求受限，等待重试...' });
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }
        // 工具调用失败不中断流程，降级为直接生成
        onProgress('progress', { message: '搜索服务暂时不可用，将基于知识库直接生成方案...' });
        break;
      }
    }

    // 第二阶段：生成全文大纲（流式输出）
    onProgress('progress', { step: 'generate', message: '研究完成，正在为你定制全文大纲...' });

    const planSystemPrompt = this._enrichSystemPrompt(`你是一位资深小说策划编辑。请基于用户需求和市场研究，只生成小说的全文大纲方案。

【阶段边界】
- 本次只允许生成“全文大纲/整书规划”。
- 禁止生成角色详情、人物小传、章节大纲、逐章列表或正文内容。
- 如果需要提到角色，只能在 mainPlot 或 subPlots 中用一句话概括其功能，不要输出 characters 字段。
- 不要输出 chapters 字段；章节大纲会在用户进入作品后单独触发生成。

## 输出要求
必须严格按照以下 JSON Schema 输出（直接输出纯 JSON，不要使用 \`\`\`json 代码块包裹）：
{
  "title": "建议书名（要吸引眼球，符合网络小说命名风格）",
  "genre": "题材类型",
  "theme": "核心主题阐述（200-300字）",
  "setting": "世界观设定（300-500字，要有层次感和想象力）",
  "tone": "基调",
  "targetAudience": "目标读者群体",
  "mainPlot": "主线剧情概述（500-800字，要有起承转合）",
  "subPlots": ["支线1（100字以上）", "支线2"],
  "chapterCount": 全书总章节数（数字，100-200之间）,
  "marketAnalysis": "市场分析（200-300字，基于搜索结果的趋势判断）",
  "innovationPoints": ["创新点1", "创新点2"]
}

## 创作原则
- 紧跟市场趋势，但要有独特创新点
- 主线要清晰，包含明确的起承转合和长期悬念
- 支线只做整体规划，不展开人物小传或逐章细纲
- 世界观要自洽且有扩展空间
- 书名要有记忆点和传播性

## 搜索结果参考
${researchSummary || '（无搜索结果，请基于你的知识库进行创作）'}`, 'plan');

    // 使用流式 API 生成方案
    const streamMessages = [
      { role: 'system', content: planSystemPrompt },
      { role: 'user', content: `用户需求：${userInput}\n\n请只生成到全文大纲阶段的小说创作方案 JSON，不要生成角色设定、章节大纲或正文。` },
    ];

    try {
      const streamResult = await this.callLLMStream(
        planSystemPrompt,
        streamMessages[1].content,
        planTemperature,
        (text) => onProgress('chunk', { text }),
        'plan_generate',
        this._abortSignal,
        this.maxTokens || 16000
      );
      const fullContent = streamResult.content;

      if (streamResult.usage) totalUsage = streamResult.usage;
      usedModel = streamResult.model;
      usedProvider = streamResult.provider;
      skipReasons = [...skipReasons, ...(streamResult.skipReasons || [])];

      // 解析 JSON 结果
      const plan = this.parseJSONWithSchema(fullContent, [
        'title', 'genre', 'theme', 'mainPlot',
      ]);

      if (plan._parseError) {
        throw new Error('方案 JSON 解析失败：' + (plan._rawContent || '格式异常'));
      }

      return {
        plan,
        usage: totalUsage,
        model: usedModel,
        provider: usedProvider,
        skipReasons,
        researchSummary: researchSummary || undefined,
      };
    } catch (err) {
      throw err;
    }
  }

  // 根据用户反馈修订小说方案（多轮对话修订）
  async revisePlan(currentPlan, feedback, novelId, onProgress) {
    const reviseTemperature = this._resolveTemperature('plan_revise', 0.7);

    const currentPlanStr = JSON.stringify(currentPlan, null, 2);

    const systemPrompt = this._enrichSystemPrompt(`你是一位资深小说策划编辑。用户对当前的小说全文大纲提出了修改意见，请根据反馈修订全文大纲。

## 修订原则
- 仔细理解用户反馈，精准修改相关的部分
- 保持未涉及的部分不变
- 如果用户要求添加角色，只在主线或支线中概括该角色的叙事功能，不输出人物详情
- 如果用户要求修改书名/题材/主线，相应调整全文大纲相关部分
- 如果用户要求增删章节，只调整预计总章数和整体结构说明，不输出逐章章纲
- 修订后保持全文大纲的完整性和一致性
- 禁止输出 characters、chapters、章节正文或任何后续阶段内容

## 输出要求
必须严格按照以下 JSON Schema 输出完整修订后的全文大纲（直接输出纯 JSON，不要使用 \`\`\`json 代码块包裹）：
{
  "title": "书名",
  "genre": "题材类型",
  "theme": "核心主题阐述（200-300字）",
  "setting": "世界观设定（300-500字）",
  "tone": "基调",
  "targetAudience": "目标读者群体",
  "mainPlot": "主线剧情概述（500-800字）",
  "subPlots": ["支线1", "支线2"],
  "chapterCount": 全书总章节数（100-200之间的整数）,
  "marketAnalysis": "市场分析（200-300字）",
  "innovationPoints": ["创新点1", "创新点2"],
  "revisionNote": "本次修订说明（50-100字，简要说明做了什么修改）"
}`, 'plan_revise');

    const userPrompt = `【当前方案】
${currentPlanStr}

【用户修改意见】
${feedback}

请只输出修订后的全文大纲 JSON，不要生成角色设定、章节大纲或正文。`;

    onProgress('progress', { step: 'revise', message: '正在根据你的反馈修订方案...' });

    try {
      const streamResult = await this.callLLMStream(
        systemPrompt,
        userPrompt,
        reviseTemperature,
        (text) => onProgress('chunk', { text }),
        'plan_revise',
        this._abortSignal,
        this.maxTokens || 16000
      );
      const fullContent = streamResult.content;

      const plan = this.parseJSONWithSchema(fullContent, [
        'title', 'genre', 'theme', 'mainPlot',
      ]);

      if (plan._parseError) {
        throw new Error('修订方案 JSON 解析失败：' + (plan._rawContent || '格式异常'));
      }

      return {
        plan,
        usage: streamResult.usage,
        model: streamResult.model,
        provider: streamResult.provider,
        skipReasons: streamResult.skipReasons,
      };
    } catch (err) {
      throw err;
    }
  }
}

module.exports = PlanningAgent;
