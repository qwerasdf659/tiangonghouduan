/**
 * 数据库迁移：禁止 POINTS 和 BUDGET_POINTS 进入 C2C 交易
 *
 * 业务背景：
 * 根据产品决策（2026-01-08），C2C 市场只允许材料类资产交易
 * POINTS（普通积分）和 BUDGET_POINTS（预算积分）不允许进入 C2C 市场
 *
 * 变更内容：
 * - 将 POINTS 的 is_tradable 设为 FALSE
 * - 将 BUDGET_POINTS 的 is_tradable 设为 FALSE
 * - 保持 red_shard 等材料类资产的 is_tradable = TRUE
 *
 * 影响范围：
 * - MarketListingService.createFungibleAssetListing() 会校验 is_tradable
 * - 用户尝试挂牌 POINTS/BUDGET_POINTS 时会收到明确的拒绝提示
 *
 * 创建时间：2026年01月08日 北京时间
 * 数据库版本：V4.0
 * 风险等级：低（仅修改配置字段，不涉及资产变动）
 * 预计执行时间：<1秒
 */

'use strict'

module.exports = {
  /**
   * 正向迁移：禁止积分类资产进入 C2C
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize库
   * @returns {Promise<void>}
   */
  async up(queryInterface, Sequelize) {
    console.log('🔧 开始执行：禁止 POINTS/BUDGET_POINTS 进入 C2C 交易')

    // 1. 更新 POINTS 的 is_tradable
    const [pointsResult] = await queryInterface.sequelize.query(`
      UPDATE material_asset_types 
      SET is_tradable = FALSE 
      WHERE asset_code = 'POINTS'
    `)
    console.log(`  📦 POINTS: is_tradable 设为 FALSE (affected: ${pointsResult.affectedRows || 0})`)

    // 2. 更新 BUDGET_POINTS 的 is_tradable
    const [budgetResult] = await queryInterface.sequelize.query(`
      UPDATE material_asset_types 
      SET is_tradable = FALSE 
      WHERE asset_code = 'BUDGET_POINTS'
    `)
    console.log(
      `  📦 BUDGET_POINTS: is_tradable 设为 FALSE (affected: ${budgetResult.affectedRows || 0})`
    )

    // 3. 验证结果
    const [verification] = await queryInterface.sequelize.query(`
      SELECT asset_code, display_name, is_tradable 
      FROM material_asset_types 
      WHERE asset_code IN ('POINTS', 'BUDGET_POINTS', 'red_shard', 'DIAMOND')
      ORDER BY asset_code
    `)
    console.log('  📊 验证结果:')
    verification.forEach(row => {
      const status = row.is_tradable ? '✅ 可交易' : '🚫 禁止交易'
      console.log(`     - ${row.asset_code} (${row.display_name}): ${status}`)
    })

    console.log('✅ 迁移完成：积分类资产已禁止进入 C2C 交易')
  },

  /**
   * 回滚迁移：恢复积分类资产的 C2C 交易权限
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize库
   * @returns {Promise<void>}
   */
  async down(queryInterface, Sequelize) {
    console.log('🔄 开始回滚：恢复 POINTS/BUDGET_POINTS 的 C2C 交易权限')

    // 恢复 POINTS 的 is_tradable
    await queryInterface.sequelize.query(`
      UPDATE material_asset_types 
      SET is_tradable = TRUE 
      WHERE asset_code = 'POINTS'
    `)
    console.log('  📦 POINTS: is_tradable 恢复为 TRUE')

    // 恢复 BUDGET_POINTS 的 is_tradable
    await queryInterface.sequelize.query(`
      UPDATE material_asset_types 
      SET is_tradable = TRUE 
      WHERE asset_code = 'BUDGET_POINTS'
    `)
    console.log('  📦 BUDGET_POINTS: is_tradable 恢复为 TRUE')

    console.log('🔄 回滚完成：积分类资产已恢复 C2C 交易权限')
  }
}
