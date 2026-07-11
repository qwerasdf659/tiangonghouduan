/**
 * 每小时抽奖活动状态同步任务（原定时任务9）
 *
 * 业务用途：
 * - 每小时自动检查并同步抽奖活动状态
 * - 自动开启到达开始时间的draft活动（start_time <= 现在 < end_time → active）
 * - 自动结束已过结束时间的active活动（end_time < 现在 → ended）
 * - 确保活动状态与时间保持一致
 *
 * 架构设计：
 * - 从LotteryCampaign模型迁移到AdminLotteryCampaignService（V4.7.0拆分后）
 * - ServiceManager key: admin_lottery_campaign
 * - 批处理逻辑应在Service层，Model层只保留字段定义
 *
 * 调度频率：0 * * * *（每小时的0分，由 scripts/maintenance/scheduled_tasks.js 注册）
 *
 * 创建时间：2025-12-11
 * 任务体自 scripts/maintenance/scheduled_tasks.js 原样搬移（技术债务方案 7.4-1，2026-07-11）
 */

/**
 * 每小时抽奖活动状态同步任务类
 *
 * @class HourlyLotteryCampaignStatusSync
 * @description 自动开启/结束抽奖活动，保持状态与时间一致
 */
class HourlyLotteryCampaignStatusSync {
  /**
   * 执行活动状态同步
   *
   * @returns {Promise<Object>} 同步结果对象（started/ended/timestamp）
   */
  static async execute() {
    // P1-9：通过 ServiceManager 获取服务（snake_case key）
    const serviceManager = require('../services/index')
    if (!serviceManager._initialized) {
      await serviceManager.initialize()
    }
    const AdminLotteryCampaignService = serviceManager.getService('admin_lottery_campaign')

    // V4.7.0 拆分后：通过 AdminLotteryCampaignService 执行活动管理操作
    return AdminLotteryCampaignService.syncCampaignStatus()
  }
}

module.exports = HourlyLotteryCampaignStatusSync
