/**
 * V4简化抽奖引擎策略配置
 * 餐厅积分抽奖系统 - 三策略版本配置
 *
 * @description 基础抽奖、保底策略、管理策略配置参数
 * @version 4.0.0
 * @date 2025-01-21
 * @timezone Asia/Shanghai (北京时间)
 */

module.exports = {
  // 基础抽奖策略配置
  basic: {
    // 默认概率配置
    defaultProbability: 0.1, // 10%中奖概率
    minProbability: 0.001, // 最小0.1%
    maxProbability: 0.95, // 最大95%

    // ✅ V4简化：移除用户等级加成，保持纯基础策略
  },

  // 保底策略配置
  guarantee: {
    // 标准保底配置
    standard: {
      enabled: true,
      triggerThreshold: 10, // 连续10次未中奖触发保底
      boostStart: 5, // 5次开始提升概率
      boostIncrement: 0.1, // 每次提升10%概率
      maxBoost: 0.5, // 最大提升50%
      forceWinThreshold: 15 // 15次强制中奖
    },

    // ✅ V4简化：移除VIP特殊保底，统一使用标准保底

    // 保底重置条件
    resetConditions: {
      onWin: true, // 中奖后重置
      timeWindow: 86400 // 24小时窗口
    }
  },

  // 管理策略配置
  management: {
    // 预设奖品队列配置
    presetQueue: {
      enabled: true,
      priority: 10, // 最高优先级
      queueExpiry: 2592000, // 预设队列30天过期
      maxQueueSize: 50 // 单用户最大50个预设奖品
    },

    // 管理员权限控制
    adminControl: {
      requireAuth: true, // 需要管理员认证
      logOperations: true, // 记录操作日志
      auditTrail: true // 审计追踪
    }
  },

  // 系统配置
  system: {
    // 执行超时配置
    timeout: {
      strategyExecution: 10000, // 策略执行10秒超时
      databaseQuery: 5000 // 数据库查询5秒超时
    },

    // 错误处理配置
    errorHandling: {
      maxRetries: 3, // 最大重试3次
      retryDelay: 1000, // 重试延迟1秒
      fallbackToBasic: true // 失败时降级到基础策略
    },

    // 缓存配置
    cache: {
      enabled: true,
      ttl: 300, // 缓存5分钟
      keyPrefix: 'lottery_engine:'
    },

    // 日志配置
    logging: {
      level: 'info', // info, debug, warn, error
      enableMetrics: true,
      enableAudit: true
    }
  },

  // 性能监控配置（简化）
  monitoring: {
    enabled: true,
    metrics: {
      trackExecutionTime: true,
      trackSuccessRate: true,
      trackErrorCount: true
    },
    alerts: {
      errorRateThreshold: 0.05, // 错误率5%告警
      responseTimeThreshold: 5000 // 响应时间5秒告警
    }
  }
}
