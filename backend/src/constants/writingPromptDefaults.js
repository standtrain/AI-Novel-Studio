const DEFAULT_USER_WRITING_PROMPT = `1. 保持原文核心语义与情节走向不变，在此基础上提升表达质量，尊重作者的创作意图与角色个性。
2. 语句通顺、逻辑清晰：补充缺失主语，修正语法错误，消除歧义表达。短句与长句交替使用，保持自然的阅读节奏。
3. 句式灵活多变，避免同一句式连续重复；相邻句段中的高频词汇使用恰当近义词替换，专业术语辅以通俗解释。
4. 叙事语言流畅自然不堆砌修饰；对话贴合角色身份与性格，口语化但不粗俗；描写注重画面感与沉浸感，避免空洞形容词罗列。
5. 根据小说类型（玄幻/都市/科幻/言情等）适当调整用词与修辞风格，不同类型场景（动作/抒情/悬疑）采用对应的语言节奏。
6. 使用规范中文标点，避免中英符号混用；段落间保持逻辑衔接，段落长度适中以维持视觉呼吸感。
7. 以上要求适用于所有写作输出阶段，请严格执行。`;

const USER_WRITING_PROMPT_MAX_LENGTH = 12000;

function normalizeUserWritingPrompt(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveUserWritingPrompt(value) {
  // null 表示用户尚未配置，沿用系统默认；空字符串表示用户明确关闭个人提示词。
  if (value === null || value === undefined) return DEFAULT_USER_WRITING_PROMPT;
  const prompt = normalizeUserWritingPrompt(value);
  return prompt || null;
}

module.exports = {
  DEFAULT_USER_WRITING_PROMPT,
  USER_WRITING_PROMPT_MAX_LENGTH,
  normalizeUserWritingPrompt,
  resolveUserWritingPrompt,
};
