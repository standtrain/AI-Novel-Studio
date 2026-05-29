// MCP 工具 Schema 与 OpenAI Function Calling 格式互转

/**
 * 将 MCP 工具列表转换为 OpenAI Function Calling 工具格式
 * @param {Array} mcpTools - MCP 工具数组 [{name, description, inputSchema}]
 * @returns {Array} OpenAI 工具格式 [{type: "function", function: {name, description, parameters}}]
 */
function toolsToOpenAIFunctions(mcpTools) {
  if (!Array.isArray(mcpTools)) return [];

  return mcpTools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description || '',
      parameters: convertSchema(tool.inputSchema),
    },
  }));
}

/**
 * 将 JSON Schema 转换为 OpenAI 兼容的 parameters 格式
 */
function convertSchema(schema) {
  if (!schema || typeof schema !== 'object') {
    return { type: 'object', properties: {} };
  }

  const result = {
    type: schema.type || 'object',
  };

  if (schema.properties) {
    result.properties = {};
    Object.keys(schema.properties).forEach(key => {
      const prop = schema.properties[key];
      result.properties[key] = {
        type: prop.type || 'string',
        description: prop.description || '',
      };
      if (prop.enum) result.properties[key].enum = prop.enum;
      if (prop.items) result.properties[key].items = prop.items;
    });
  }

  if (schema.required) {
    result.required = schema.required;
  }

  return result;
}

/**
 * 从 MCP 工具调用结果中提取文本内容
 * @param {object} result - MCP callTool 返回结果
 * @returns {string} 文本内容
 */
function parseToolCallResult(result) {
  if (!result) return '';
  if (typeof result === 'string') return result;

  // MCP 规范：content 是数组
  if (result.content && Array.isArray(result.content)) {
    return result.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');
  }

  return JSON.stringify(result);
}

module.exports = { toolsToOpenAIFunctions, convertSchema, parseToolCallResult };
