/**
 * 每小时 DIY 作品超时自动解冻任务（原定时任务41）
 *
 * 业务用途（DIY 饰品设计引擎 V2.0，2026-03-31）：
 * - 扫描 status='frozen' 且 frozen_at 超过 24 小时的作品
 * - 自动调用 cancelDesign 解冻材料并将状态改为 cancelled
 *
 * 调度频率：35 * * * *（每小时第35分钟，由 scripts/maintenance/scheduled_tasks.js 注册）
 *
 * 创建时间：2026-03-31
 * 任务体自 scripts/maintenance/scheduled_tasks.js 原样搬移（技术债务方案 7.4-1，2026-07-11）
 */

const logger = require('../utils/logger')

/**
 * 每小时 DIY 作品超时自动解冻任务类
 *
 * @class HourlyDiyFrozenTimeout
 * @description 自动解冻超时冻结的 DIY 作品并释放材料
 */
class HourlyDiyFrozenTimeout {
  /**
   * 执行超时解冻扫描
   *
   * @returns {Promise<Object>} 执行结果（success_count/fail_count/total_found）
   */
  static async execute() {
    // P1-9：确保服务已初始化（等价于原 ScheduledTasks.initializeServices()）
    const serviceManager = require('../services/index')
    if (!serviceManager._initialized) {
      await serviceManager.initialize()
    }

    const { DiyWork, Account } = require('../models')
    const { Op } = require('sequelize')
    /*
     * 修复模块路径（2026-05-30）：旧 services/DIYService.js 已重构拆分为 services/diy/ 4 个子模块，
     * 统一入口为 DiyServiceFacade（与路由层 ServiceManager 'diy' 同一对象），其 cancelDesign 委托 DiyWorkService。
     */
    const { DiyServiceFacade: DIYService } = require('../services/diy')
    const TransactionManager = require('../utils/TransactionManager')

    // 查找冻结超过 24 小时的作品（关联 account 获取 user_id）
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const expiredWorks = await DiyWork.findAll({
      where: {
        status: 'frozen',
        frozen_at: { [Op.lt]: cutoff }
      },
      attributes: ['diy_work_id', 'account_id', 'work_code', 'frozen_at'],
      include: [{ model: Account, as: 'account', attributes: ['user_id'] }]
    })

    if (expiredWorks.length === 0) {
      logger.info('[定时任务41] DIY 超时解冻: 无超时冻结作品')
      return { success_count: 0, fail_count: 0, total_found: 0 }
    }

    logger.info(`[定时任务41] DIY 超时解冻: 发现 ${expiredWorks.length} 个超时冻结作品`)

    let successCount = 0
    let failCount = 0

    for (const work of expiredWorks) {
      try {
        await TransactionManager.execute(async transaction => {
          await DIYService.cancelDesign(work.diy_work_id, work.account_id, {
            transaction,
            userId: work.account?.user_id
          })
        })
        successCount++
        logger.info(
          `[定时任务41] 自动解冻成功: work_code=${work.work_code}, frozen_at=${work.frozen_at}`
        )
      } catch (error) {
        failCount++
        logger.error(`[定时任务41] 自动解冻失败: work_code=${work.work_code}`, error.message)
      }
    }

    logger.info(`[定时任务41] DIY 超时解冻完成: 成功=${successCount}, 失败=${failCount}`)
    return { success_count: successCount, fail_count: failCount, total_found: expiredWorks.length }
  }
}

module.exports = HourlyDiyFrozenTimeout
