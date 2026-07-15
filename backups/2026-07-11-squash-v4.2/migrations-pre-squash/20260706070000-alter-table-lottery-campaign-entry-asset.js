'use strict'

/**
 * 迁移：抽奖活动新增「入场资产」配置 lottery_campaigns.entry_asset_code
 *
 * 依据：docs/水晶奖品倍率活动设计方案.md §12.7 双层货币模型（可见层入场券）
 *      + §23.5 遗留项①（event_points 只发放/清零、无消耗场景，抽奖固定扣 points，待拍板落地）
 * 创建时间：2026-07-06（北京时间）
 * 拍板：给 lottery_campaigns 增加入场资产字段，抽奖扣费按活动配置扣对应资产：
 *   - 常驻活动 entry_asset_code='points'（全局可见积分，默认，语义与历史完全一致）
 *   - 限时稀缺翻倍活动 entry_asset_code='event_points'（活动专属可见代币，按 EVENT_<campaign_code> 桶隔离，到期清零）
 *
 * 设计说明（与现网一致，零技术债）：
 * - asset_code 在本系统是「软业务码」（account_asset_balances.asset_code / material_asset_types.asset_code 均无外键约束，
 *   靠 constants/AssetCode.js 常量收口），本字段沿用同一范式，不新增外键，避免与既有 asset_code 软引用体系不一致。
 * - VARCHAR(50) 对齐 account_asset_balances.asset_code 列宽；NOT NULL DEFAULT 'points' 保证存量活动语义不变（仍扣 points）。
 *
 * 回滚(down)：删除该列。
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.addColumn(
        'lottery_campaigns',
        'entry_asset_code',
        {
          type: Sequelize.STRING(50),
          allowNull: false,
          defaultValue: 'points',
          comment:
            '抽奖入场资产码(扣费货币):points=全局可见积分(默认,常驻活动)/event_points=活动专属代币(限时活动,按EVENT_<campaign_code>桶隔离到期清零);软业务码,收口constants/AssetCode.js'
        },
        { transaction, after: 'budget_mode' }
      )

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.removeColumn('lottery_campaigns', 'entry_asset_code', { transaction })
      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
