'use strict'

/**
 * 新增列: consumption_records.activity_bonus_rate_locked
 * （以物易物与会员成长等级功能启用方案 拍板⑮-(b) 活动加成笔落地，2026-07-11）
 *
 * 背景:
 * - 发放组合器（settleApprovedConsumption）已预留 activity_bonus_reward 规则位与防复利排除名单，
 *   本迁移补齐"活动加成率提交时锁定"的落表载体，使活动加成从"预留"变为"配置即用"；
 * - 与 level_key_locked / earn_multiplier_locked 同一设计原则（拍板⑬-(a) 提交时锁定）：
 *   小票提交时点读取 system_settings 的 points/activity_bonus_rate 锁定入列，
 *   审核快慢与活动启停不影响已提交小票的到账金额（用户承诺一致）；
 * - 加法叠加（拍板⑮-(b)）：总加成 = 基础 × (1 + 等级加成率 + 活动加成率)，
 *   各加成独立成笔（level_bonus_reward / activity_bonus_reward），总倍数硬封顶 3.0。
 *
 * 变更内容:
 * 1. consumption_records 加 activity_bonus_rate_locked DECIMAL(4,2) NULL
 *    （NULL=存量记录/未配置活动，按 0 加成率处理，行为与现状完全一致）。
 *
 * 回滚: 删除该列。
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDefinition = await queryInterface.describeTable('consumption_records')
    if (!tableDefinition.activity_bonus_rate_locked) {
      await queryInterface.addColumn('consumption_records', 'activity_bonus_rate_locked', {
        type: Sequelize.DECIMAL(4, 2),
        allowNull: true,
        comment:
          '活动加成率提交时锁定值（拍板⑮-(b) 加法叠加；NULL=无活动加成，审核发分按锁定值出 activity_bonus_reward 笔）'
      })
      console.log('✅ consumption_records.activity_bonus_rate_locked 列已添加')
    } else {
      console.log('⏭️ activity_bonus_rate_locked 列已存在，跳过')
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('consumption_records', 'activity_bonus_rate_locked')
    console.log('⏪ consumption_records.activity_bonus_rate_locked 列已删除')
  }
}
