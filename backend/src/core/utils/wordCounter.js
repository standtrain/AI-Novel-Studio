// 字数统计工具 — 统计中文正文的实际字数（排除空白和 AI 自报）

/**
 * 计算中文正文的实际字数
 * 统计：中文字符、中文标点、英文单词、数字
 * 不统计：空白字符、换行符、Markdown 标记符号
 */
function countWords(text) {
  if (!text || typeof text !== 'string') return 0;

  // 先去除 AI 可能在末尾自报的字数行
  let cleaned = text.replace(/[【\[]本章字数[：:]\s*\d+\s*字[】\]]?\s*/gi, '');
  cleaned = cleaned.replace(/[（(]本章共计\s*\d+\s*字[）)]?\s*/gi, '');
  cleaned = cleaned.replace(/^\s*字数[：:]\s*\d+\s*$/gim, '');

  let count = 0;
  for (const ch of cleaned) {
    if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') continue;
    count++;
  }
  return count;
}

/**
 * 去除 AI 自报的字数标注行，返回清洗后的正文
 */
function stripWordCountLabel(text) {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/[【\[]本章字数[：:]\s*\d+\s*字[】\]]?\s*/gi, '')
    .replace(/[（(]本章共计\s*\d+\s*字[）)]?\s*/gi, '')
    .replace(/^\s*字数[：:]\s*\d+\s*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = { countWords, stripWordCountLabel };
