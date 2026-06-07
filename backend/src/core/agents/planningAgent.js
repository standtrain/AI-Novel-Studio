// 规划代理 — 对话式小说创作
// 通过多轮对话 + MCP 工具搜索，帮助用户从模糊需求到完整小说方案
const BaseAgent = require('./baseAgent');
const { parseToolCallResult } = require('../mcp/mcpToolAdapter');
const { getMcpClientManager } = require('../mcp/mcpClient');
const { pickModel } = require('../../config/openai');

const MAX_RESEARCH_TURNS = 4; // 最多搜索轮次
const MAX_TOOL_RESULT_CHARS = 6000; // 单次工具结果最大字符数

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
      const mcpService = require('../../services/mcpService');
      const userServers = await mcpService.getUserServers(null); // 获取所有可用服务器
      if (!userServers || userServers.length === 0) {
        return '无可用的搜索服务';
      }

      const manager = getMcpClientManager();
      // 在所有服务器中查找该工具
      for (const server of userServers) {
        try {
          const tools = await manager.getTools(server);
          const found = tools.find(t => t.name === toolName);
          if (found) {
            const result = await manager.callTool(server, toolName, args);
            return parseToolCallResult(result);
          }
        } catch {
          // 跳过失败的服务器
        }
      }
      return `工具 "${toolName}" 执行失败：未找到可用的服务器`;
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
4. 输出完整的方案：包括书名、题材、世界观、主线、角色设定、章纲

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
  "chapterCount": 预计总章数（数字）,
  "marketAnalysis": "市场分析说明（200-300字）",
  "innovationPoints": ["创新点1", "创新点2"],
  "characters": [
    {
      "name": "角色名",
      "role": "主角/配角/反派",
      "age": 年龄,
      "gender": "男/女",
      "personality": "性格描述（150-200字）",
      "background": "背景故事（200-300字）",
      "motivation": "动机（100-150字）",
      "arc": "成长弧线（150-200字）",
      "abilities": "能力/特长",
      "relationships": [{"with": "关联角色", "type": "关系类型", "dynamic": "关系动态"}]
    }
  ],
  "chapters": [
    {
      "chapter": 1,
      "title": "章节标题",
      "summary": "章节概要（150-200字）",
      "keyEvents": ["关键事件1", "关键事件2"],
      "charactersInvolved": ["出场角色"],
      "emotionalTone": "情绪基调",
      "endingHook": "结尾悬念"
    }
  ]
}

## 注意事项
- 如果搜索工具不可用，请根据你的知识库直接生成方案
- 角色数量建议 4-6 个
- 章节数量建议 10-30 章
- 方案要具体、可执行，避免空泛的建议`;

    if (this.globalPrompt) {
      prompt += `\n\n【全局写作风格指令】\n${this.globalPrompt}`;
    }
    if (this.skills && this.skills.length > 0) {
      const skillTexts = this.skills.map(s => `\n\n【技能增强：${s.display_name}】\n${s.resolvedPrompt}`);
      prompt += skillTexts.join('');
    }
    return prompt;
  }

  // 实际执行规划的主方法
  async planNovel(userInput, onProgress) {
    const searchTools = this._filterSearchTools();
    const openaiTools = searchTools.length > 0 ? searchTools : undefined;

    const { provider, model, skipReasons } = await this._resolve('plan');
    const client = this._getClient(provider);
    const researchTemperature = this._resolveTemperature('plan', 0.7);
    const planTemperature = this._resolveTemperature('plan', 0.8);

    const systemPrompt = this._buildSystemPrompt();
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `我想创建一部小说，我的需求是：${userInput}\n\n请先分析这个需求，然后搜索相关市场趋势和读者偏好信息（如果搜索工具可用），最后给出完整的小说创作方案。` },
    ];

    let researchSummary = '';
    let totalUsage = null;

    // 第一阶段：研究（多轮工具调用）
    onProgress('progress', { step: 'research', message: '正在分析需求，搜索最新创作趋势...' });

    for (let turn = 0; turn < MAX_RESEARCH_TURNS; turn++) {
      try {
        const response = await client.chat.completions.create({
          model,
          messages,
          tools: openaiTools,
          tool_choice: openaiTools ? 'auto' : undefined,
          temperature: researchTemperature,
        }, { signal: this._abortSignal });

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

    // 第二阶段：生成完整方案（流式输出）
    onProgress('progress', { step: 'generate', message: '研究完成，正在为你定制小说创作方案...' });

    const planSystemPrompt = `你是一位资深小说策划编辑。请基于用户需求和市场研究，生成完整的小说创作方案。

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
  "chapterCount": 预计总章数（数字，10-30之间）,
  "marketAnalysis": "市场分析（200-300字，基于搜索结果的趋势判断）",
  "innovationPoints": ["创新点1", "创新点2"],
  "characters": [
    {
      "name": "角色名",
      "role": "主角/重要配角/反派",
      "age": 年龄,
      "gender": "男/女",
      "personality": "性格描述（150-200字）",
      "background": "背景故事（200-300字）",
      "motivation": "核心动机（100-150字）",
      "arc": "成长弧线（150-200字）",
      "abilities": "能力或特长",
      "relationships": [{"with": "关联角色", "type": "关系类型", "dynamic": "关系动态描述（50-100字）"}]
    }
  ],
  "chapters": [
    {
      "chapter": 1,
      "title": "章节标题",
      "summary": "章节概要（150-200字）",
      "keyEvents": ["关键事件"],
      "charactersInvolved": ["出场角色名"],
      "emotionalTone": "情绪基调",
      "endingHook": "结尾悬念（50-80字）"
    }
  ]
}

## 创作原则
- 紧跟市场趋势，但要有独特创新点
- 角色要有血肉，避免脸谱化
- 章节要有节奏感，每章结尾留悬念
- 世界观要自洽且有扩展空间
- 书名要有记忆点和传播性

## 搜索结果参考
${researchSummary || '（无搜索结果，请基于你的知识库进行创作）'}`;

    // 使用流式 API 生成方案
    const streamMessages = [
      { role: 'system', content: planSystemPrompt },
      { role: 'user', content: `用户需求：${userInput}\n\n请生成完整的小说创作方案 JSON。` },
    ];

    let fullContent = '';
    let usage = null;

    try {
      const stream = await client.chat.completions.create({
        model,
        messages: streamMessages,
        temperature: planTemperature,
        max_tokens: this.maxTokens || 16000,
        stream: true,
        stream_options: { include_usage: true },
      }, { signal: this._abortSignal });

      for await (const chunk of stream) {
        if (this._abortSignal?.aborted) break;
        if (chunk.usage) {
          usage = chunk.usage;
        }
        const delta = chunk.choices?.[0]?.delta?.content || '';
        if (delta) {
          fullContent += delta;
          onProgress('chunk', { text: delta });
        }
      }

      if (usage) totalUsage = usage;

      // 解析 JSON 结果
      const plan = this.parseJSONWithSchema(fullContent, [
        'title', 'genre', 'theme', 'mainPlot', 'characters', 'chapters',
      ]);

      if (plan._parseError) {
        throw new Error('方案 JSON 解析失败：' + (plan._rawContent || '格式异常'));
      }

      return {
        plan,
        usage: totalUsage,
        model,
        provider: provider.name,
        skipReasons,
        researchSummary: researchSummary || undefined,
      };
    } catch (err) {
      throw err;
    }
  }

  // 根据用户反馈修订小说方案（多轮对话修订）
  async revisePlan(currentPlan, feedback, novelId, onProgress) {
    const { provider, model, skipReasons } = await this._resolve('plan');
    const client = this._getClient(provider);
    const reviseTemperature = this._resolveTemperature('plan', 0.7);

    const currentPlanStr = JSON.stringify(currentPlan, null, 2);

    const systemPrompt = `你是一位资深小说策划编辑。用户对当前的小说创作方案提出了修改意见，请根据反馈修订方案。

## 修订原则
- 仔细理解用户反馈，精准修改相关的部分
- 保持未涉及的部分不变
- 如果用户要求添加角色，补充角色设定并更新相关章节的出场角色
- 如果用户要求修改书名/题材/主线，相应调整所有相关部分
- 如果用户要求增删章节，更新章纲列表
- 修订后保持方案的完整性和一致性

## 输出要求
必须严格按照以下 JSON Schema 输出完整修订后的方案（直接输出纯 JSON，不要使用 \`\`\`json 代码块包裹）：
{
  "title": "书名",
  "genre": "题材类型",
  "theme": "核心主题阐述（200-300字）",
  "setting": "世界观设定（300-500字）",
  "tone": "基调",
  "targetAudience": "目标读者群体",
  "mainPlot": "主线剧情概述（500-800字）",
  "subPlots": ["支线1", "支线2"],
  "chapterCount": 预计总章数,
  "marketAnalysis": "市场分析（200-300字）",
  "innovationPoints": ["创新点1", "创新点2"],
  "revisionNote": "本次修订说明（50-100字，简要说明做了什么修改）",
  "characters": [
    {
      "name": "角色名",
      "role": "主角/重要配角/反派",
      "age": 年龄,
      "gender": "男/女",
      "personality": "性格描述（150-200字）",
      "background": "背景故事（200-300字）",
      "motivation": "核心动机（100-150字）",
      "arc": "成长弧线（150-200字）",
      "abilities": "能力或特长",
      "relationships": [{"with": "关联角色", "type": "关系类型", "dynamic": "关系动态描述（50-100字）"}]
    }
  ],
  "chapters": [
    {
      "chapter": 1,
      "title": "章节标题",
      "summary": "章节概要（150-200字）",
      "keyEvents": ["关键事件"],
      "charactersInvolved": ["出场角色名"],
      "emotionalTone": "情绪基调",
      "endingHook": "结尾悬念（50-80字）"
    }
  ]
}`;

    const userPrompt = `【当前方案】
${currentPlanStr}

【用户修改意见】
${feedback}

请输出修订后的完整方案 JSON。`;

    onProgress('progress', { step: 'revise', message: '正在根据你的反馈修订方案...' });

    let fullContent = '';
    let usage = null;
    let totalUsage = null;

    try {
      const stream = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: reviseTemperature,
        max_tokens: this.maxTokens || 16000,
        stream: true,
        stream_options: { include_usage: true },
      }, { signal: this._abortSignal });

      for await (const chunk of stream) {
        if (this._abortSignal?.aborted) break;
        if (chunk.usage) {
          usage = chunk.usage;
        }
        const delta = chunk.choices?.[0]?.delta?.content || '';
        if (delta) {
          fullContent += delta;
          onProgress('chunk', { text: delta });
        }
      }

      if (usage) totalUsage = usage;

      const plan = this.parseJSONWithSchema(fullContent, [
        'title', 'genre', 'theme', 'mainPlot', 'characters', 'chapters',
      ]);

      if (plan._parseError) {
        throw new Error('修订方案 JSON 解析失败：' + (plan._rawContent || '格式异常'));
      }

      return {
        plan,
        usage: totalUsage,
        model,
        provider: provider.name,
        skipReasons,
      };
    } catch (err) {
      throw err;
    }
  }
}

module.exports = PlanningAgent;
