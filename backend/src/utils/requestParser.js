// 请求参数解析工具：统一处理 ID、分页等常见输入，避免非法值悄悄进入业务层
function parsePositiveInt(value, fieldName = '参数') {
  const normalized = typeof value === 'string' ? value.trim() : value;
  const isIntegerLike = typeof normalized === 'number'
    ? Number.isInteger(normalized)
    : /^[1-9]\d*$/.test(String(normalized));
  const n = isIntegerLike ? Number(normalized) : NaN;

  if (!Number.isSafeInteger(n) || n <= 0) {
    const err = new Error(`${fieldName}必须为正整数`);
    err.status = 400;
    throw err;
  }
  return n;
}

function parseOptionalPositiveInt(value, fieldName = '参数') {
  if (value === undefined || value === null || value === '') return undefined;
  return parsePositiveInt(value, fieldName);
}

function parsePagination(query, { defaultPage = 1, defaultLimit = 20, maxLimit = 100 } = {}) {
  const pageRaw = query?.page;
  const limitRaw = query?.limit;

  const page = pageRaw === undefined ? defaultPage : parsePositiveInt(pageRaw, 'page');
  const requestedLimit = limitRaw === undefined ? defaultLimit : parsePositiveInt(limitRaw, 'limit');
  const limit = Math.min(requestedLimit, maxLimit);

  return { page, limit };
}

module.exports = {
  parsePositiveInt,
  parseOptionalPositiveInt,
  parsePagination,
};
