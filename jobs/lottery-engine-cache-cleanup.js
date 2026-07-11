/**
 * 抽奖引擎缓存清理任务（原定时任务27）
 *
 * 业务用途（定时任务统一管理改进 2026-01-30）：
 * - 合并迁移自 CacheManager.js 的构造函数 setInterval（每10分钟清理过期缓存）
 * - 通过 unified_lottery_engine 服务获取 cacheManager 实例执行清理
 * - 内存级别操作，无需分布式锁
 * - 2026-06-04 下线：ManagementStrategy 内存缓存清理已随 per-user 暗箱干预移除
 *
 * 调度频率：每10分钟（由 scripts/maintenance/scheduled_tasks.js 注册）
 *
 * 创建时间：2026-01-30
 * 任务体自 scripts/maintenance/scheduled_tasks.js 原样搬移（技术债务方案 7.4-1，2026-07-11）
 */

const logger = require('../utils/logger')

/**
 * 抽奖引擎缓存清理任务类
 *
 * @class LotteryEngineCacheCleanup
 * @description 清理抽奖引擎 CacheManager 中的过期内存缓存
 */
class LotteryEngineCacheCleanup {
  /**
   * 执行抽奖引擎缓存清理
   *
   * @param {string} [logPrefix='[定时任务]'] - CacheManager 清理失败时的日志前缀（手动触发时为 '[手动触发]'）
   * @returns {Promise<Object>} 清理报告（cache_manager_cleaned/total_cleaned）
   */
  static async execute(logPrefix = '[定时任务]') {
    // P1-9：通过 ServiceManager 获取 unified_lottery_engine 服务（snake_case key）
    const serviceManager = require('../services/index')
    if (!serviceManager._initialized) {
      await serviceManager.initialize()
    }

    let cacheManagerCleaned = 0

    /*
     * 清理 CacheManager 缓存
     * 2026-01-30：通过 unified_lottery_engine 服务获取 cacheManager 实例
     */
    try {
      const engine = serviceManager.getService('unified_lottery_engine')
      if (engine && engine.cacheManager && typeof engine.cacheManager.cleanup === 'function') {
        cacheManagerCleaned = engine.cacheManager.cleanup()
      }
    } catch (cmError) {
      logger.warn(`${logPrefix} CacheManager 清理失败（非致命）`, { error: cmError.message })
    }

    return {
      cache_manager_cleaned: cacheManagerCleaned,
      total_cleaned: cacheManagerCleaned
    }
  }
}

module.exports = LotteryEngineCacheCleanup
