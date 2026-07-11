/**
 * 每日抽奖奖品中奖次数重置任务（原定时任务8）
 *
 * 业务用途：
 * - 每日凌晨自动重置所有奖品的今日中奖次数
 * - 确保每日中奖限制（max_daily_wins）正常工作
 * - 为新的一天的抽奖活动做准备
 *
 * 架构设计：
 * - 通过 AdminLotteryCampaignService 操作 LotteryCampaignPrize 表（V4.7.0拆分后）
 * - ServiceManager key: admin_lottery_campaign
 * - 批处理逻辑应在Service层，Model层只保留字段定义
 *
 * 调度频率：0 0 * * *（每天凌晨0点，由 scripts/maintenance/scheduled_tasks.js 注册）
 *
 * 创建时间：2025-12-11
 * 任务体自 scripts/maintenance/scheduled_tasks.js 原样搬移（技术债务方案 7.4-1，2026-07-11）
 */

/**
 * 每日抽奖奖品中奖次数重置任务类
 *
 * @class DailyLotteryPrizesReset
 * @description 批量重置所有奖品的daily_win_count为0
 */
class DailyLotteryPrizesReset {
  /**
   * 执行每日中奖次数重置
   *
   * @returns {Promise<Object>} 重置结果对象（updated_count/timestamp）
   */
  static async execute() {
    // P1-9：通过 ServiceManager 获取服务（snake_case key）
    const serviceManager = require('../services/index')
    if (!serviceManager._initialized) {
      await serviceManager.initialize()
    }
    const AdminLotteryCampaignService = serviceManager.getService('admin_lottery_campaign')

    // V4.7.0 拆分后：通过 AdminLotteryCampaignService 执行活动管理操作
    return AdminLotteryCampaignService.resetDailyWinCounts()
  }
}

module.exports = DailyLotteryPrizesReset
