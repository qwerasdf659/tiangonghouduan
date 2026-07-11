/**
 * 业务缓存监控任务（原定时任务28）
 *
 * 业务用途（定时任务统一管理改进 2026-01-30）：
 * - 激活 BusinessCacheHelper 缓存统计监控（原 startMonitor() 方法定义但从未被调用）
 * - 输出缓存命中率统计报告
 * - 低命中率告警（<60%且样本数>10时发出警告）
 * - 内存级别操作，无需分布式锁
 *
 * 调度频率：每10分钟（由 scripts/maintenance/scheduled_tasks.js 注册）
 *
 * 创建时间：2026-01-30
 * 任务体自 scripts/maintenance/scheduled_tasks.js 原样搬移（技术债务方案 7.4-1，2026-07-11）
 */

const logger = require('../utils/logger')

/**
 * 业务缓存监控任务类
 *
 * @class BusinessCacheMonitor
 * @description 输出业务缓存命中率统计并对低命中率告警
 */
class BusinessCacheMonitor {
  /**
   * 执行业务缓存监控
   *
   * @returns {Object} 监控结果（snapshot/has_low_hit_rate）
   */
  static execute() {
    /*
     * 获取 BusinessCacheHelper 并执行监控
     * 2026-01-30：使用解构导入获取 BusinessCacheHelper 类
     */
    const { BusinessCacheHelper } = require('../utils/BusinessCacheHelper')

    // 获取统计快照
    const snapshot = BusinessCacheHelper.getStatsSnapshot()

    // 记录监控日志
    logger.info('📊 [业务缓存监控] 统计报告', snapshot)

    // 检查告警条件（命中率低于60%且有足够样本）
    let hasLowHitRate = false
    Object.keys(snapshot).forEach(prefix => {
      const stats = snapshot[prefix]
      const hitRate = parseFloat(stats.hit_rate || '0')
      const totalRequests = (stats.hits || 0) + (stats.misses || 0)

      if (hitRate < 60 && totalRequests > 10) {
        logger.warn(`⚠️ [业务缓存监控] ${prefix} 缓存命中率偏低: ${hitRate}%`, {
          prefix,
          hit_rate: hitRate,
          total_requests: totalRequests
        })
        hasLowHitRate = true
      }
    })

    return { snapshot, has_low_hit_rate: hasLowHitRate }
  }
}

module.exports = BusinessCacheMonitor
