'use strict'

/**
 * 数据迁移：将exchange_items的virtual_value_price转换为material cost
 *
 * 业务背景：
 * - V4.5.0统一为材料资产支付
 * - 历史商品使用virtual_value_price定价
 * - 需要转换为cost_asset_code + cost_amount
 *
 * 转换规则：
 * - 默认材料资产：red_shard（碎红水晶）
 * - 转换比例：1 virtual_value = 1 red_shard
 * - 最小成本：1个材料
 *
 * 影响范围：
 * - exchange_items表：填充cost_asset_code和cost_amount
 *
 * 创建时间：2025-12-18
 * 优先级：必须在删除旧字段迁移之前执行
 */

module.exports = {
  /**
   * 执行迁移：将virtual_value_price转换为material cost
   *
   * @param {import('sequelize').QueryInterface} queryInterface - Sequelize查询接口
   * @param {import('sequelize').Sequelize} Sequelize - Sequelize实例
   * @returns {Promise<void>} 迁移完成后resolve
   */
  async up(queryInterface, Sequelize) {
    console.log('🔄 [数据迁移] 开始转换virtual_value_price为material cost...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 检查哪些记录需要迁移
      const [itemsToMigrate] = await queryInterface.sequelize.query(
        `SELECT 
          item_id, 
          name,
          virtual_value_price, 
          cost_asset_code, 
          cost_amount 
        FROM exchange_items 
        WHERE cost_asset_code IS NULL OR cost_amount IS NULL`,
        { transaction }
      )

      console.log(`  ├─ 找到 ${itemsToMigrate.length} 条商品需要迁移`)

      if (itemsToMigrate.length === 0) {
        console.log('  ✅ 所有商品已有cost字段，无需迁移')
        await transaction.commit()
        return
      }

      // 2. 批量更新（使用默认材料：red_shard）
      const updateResult = await queryInterface.sequelize.query(
        `UPDATE exchange_items 
        SET 
          cost_asset_code = 'red_shard',
          cost_amount = GREATEST(IFNULL(virtual_value_price, 1), 1)
        WHERE cost_asset_code IS NULL OR cost_amount IS NULL`,
        { transaction }
      )

      console.log(`  ├─ 已更新 ${updateResult[0].affectedRows || itemsToMigrate.length} 条商品记录`)

      // 3. 验证迁移结果
      const [verifyResult] = await queryInterface.sequelize.query(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN cost_asset_code IS NULL THEN 1 ELSE 0 END) as missing_code,
          SUM(CASE WHEN cost_amount IS NULL THEN 1 ELSE 0 END) as missing_amount
        FROM exchange_items`,
        { transaction }
      )

      if (verifyResult[0].missing_code > 0 || verifyResult[0].missing_amount > 0) {
        throw new Error(
          `迁移验证失败：仍有 ${verifyResult[0].missing_code} 条记录缺少cost_asset_code`
        )
      }

      console.log(`  ✅ 验证通过：所有 ${verifyResult[0].total} 条商品都有完整的cost字段`)

      // 4. 输出迁移摘要
      console.log('\n📊 迁移摘要：')
      console.log(`  - 迁移商品数：${itemsToMigrate.length}`)
      console.log(`  - 默认材料：red_shard（碎红水晶）`)
      console.log(`  - 转换规则：cost_amount = MAX(virtual_value_price, 1)`)

      await transaction.commit()
      console.log('\n✅ [数据迁移] 完成virtual_value_price → material cost转换')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ [数据迁移] 转换失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：清除cost字段数据（恢复为NULL）
   *
   * @param {import('sequelize').QueryInterface} queryInterface - Sequelize查询接口
   * @param {import('sequelize').Sequelize} Sequelize - Sequelize实例
   * @returns {Promise<void>} 回滚完成后resolve
   */
  async down(queryInterface, Sequelize) {
    console.log('⏪ [回滚] 开始清除material cost数据...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 清除迁移的cost数据（恢复为NULL）
      await queryInterface.sequelize.query(
        `UPDATE exchange_items 
        SET 
          cost_asset_code = NULL,
          cost_amount = NULL
        WHERE cost_asset_code = 'red_shard'`,
        { transaction }
      )

      await transaction.commit()
      console.log('✅ [回滚] 已清除material cost数据')
      console.log('⚠️  [警告] virtual_value_price数据已丢失，需要从备份恢复')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ [回滚] 清除cost数据失败:', error.message)
      throw error
    }
  }
}
