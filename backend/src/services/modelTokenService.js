// 模型 Token 限额服务层
const modelTokenDao = require('../dao/modelTokenDao');
const { createLogger } = require('../utils/logger');

const logger = createLogger('modeltoken');

const modelTokenService = {
  // 记录模型 Token 用量（在 LLM 调用完成后调用）
  async recordUsage(providerName, modelName, tokensUsed) {
    if (!tokensUsed || tokensUsed <= 0) return;
    try {
      await modelTokenDao.incrementUsage(providerName, modelName, tokensUsed);
    } catch (err) {
      logger.warn(`记录模型用量失败 ${providerName}/${modelName}: ${err.message}`);
    }
  },

  // 检查模型是否在 Token 限额内
  async checkModelAvailability(providerName, modelName) {
    try {
      const limits = await modelTokenDao.checkLimits(providerName, modelName);

      if (!limits.withinDaily) {
        return {
          available: false,
          reason: `模型 ${modelName} 已达每日 Token 上限（${limits.dailyUsed}/${limits.dailyLimit}）`,
        };
      }
      if (!limits.withinMonthly) {
        return {
          available: false,
          reason: `模型 ${modelName} 已达每月 Token 上限（${limits.monthlyUsed}/${limits.monthlyLimit}）`,
        };
      }
      return { available: true };
    } catch (err) {
      logger.warn(`检查模型可用性失败 ${providerName}/${modelName}: ${err.message}`);
      return { available: true }; // 出错时放行，避免阻塞
    }
  },

  // 管理员：获取所有限额配置
  async getAllLimits() {
    return modelTokenDao.findAll();
  },

  // 管理员：保存限额配置
  async saveLimit(providerName, modelName, config) {
    return modelTokenDao.upsert(providerName, modelName, config);
  },

  // 管理员：删除限额配置
  async deleteLimit(id) {
    return modelTokenDao.delete(id);
  },
};

module.exports = modelTokenService;
