/**
 * V4简化抽奖引擎核心配置
 * 餐厅积分抽奖系统 - 三策略版本
 *
 * @description 只保留三种策略的简化配置：BasicLotteryStrategy、GuaranteeStrategy、ManagementStrategy
 * @version 4.0.0
 * @date 2025-01-21
 * @timezone Asia/Shanghai (北京时间)
 */

module.exports = {
  // 引擎基础配置
  engine: {
    name: 'V4 Simplified Lottery Engine',
    version: '4.0.0',
    environment: process.env.NODE_ENV || 'development',
    timezone: 'Asia/Shanghai',
    region: 'China'
  },

  // ✅ V4三策略配置
  strategies: {
    // 基础抽奖策略
    basic: {
      enabled: true,
      defaultProbability: 0.1, // 10%基础概率
      minProbability: 0.001,
      maxProbability: 0.95,
      maxDrawsPerDay: 10,
      pointsCostPerDraw: 100
    },

    // 保底策略
    guarantee: {
      enabled: true,
      triggerThreshold: 10, // 连续10次未中奖触发保底
      forceWinThreshold: 15, // 15次强制中奖
      guaranteePrizeValue: 100 // 保底奖品价值
    },

    // 管理策略
    management: {
      enabled: true,
      requireAdminAuth: true,
      logOperations: true,
      maxPresetQueue: 50
    }
  },

  // 系统限制配置
  limits: {
    maxExecutionTime: 10000, // 10秒超时
    maxRetries: 3,
    cacheTimeout: 300 // 5分钟缓存
  },

  // 日志配置
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableMetrics: true,
    enableAudit: true
  },

  // 性能监控
  monitoring: {
    enabled: true,
    errorThreshold: 0.05, // 5%错误率告警
    responseTimeThreshold: 5000 // 5秒响应时间告警
  }
}
