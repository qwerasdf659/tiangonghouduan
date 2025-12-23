/**
 * 迁移文件：数据回填 - 将selling_points转换为selling_amount
 *
 * 业务背景：
 * - 交易市场从积分定价（selling_points）迁移到DIAMOND资产定价（selling_amount）
 * - 需要将存量在售商品的selling_points转换为selling_amount
 * - 转换比例：1积分 = 0.05 DIAMOND（即20积分 = 1 DIAMOND）
 *
 * 变更内容：
 * - 回填selling_amount：CEIL(selling_points / 20)（向上取整，确保卖家不吃亏）
 * - 回填selling_asset_code：固定为'DIAMOND'
 * - 回填条件：market_status='on_sale' AND selling_amount IS NULL（只回填在售商品）
 *
 * 业务规则：
 * - 转换比例固定：1积分 = 0.05 DIAMOND（20积分 = 1 DIAMOND）
 * - 向上取整：确保卖家不吃亏（如19积分 → 1 DIAMOND，21积分 → 2 DIAMOND）
 * - 幂等性：可重复执行，只回填空值记录
 * - 只回填在售商品：避免覆盖已人工修正的数据或已撤回的商品
 *
 * 影响范围：
 * - user_inventory表在售商品数据
 * - 市场商品列表展示
 *
 * 创建时间：2025-12-15
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：回填selling_points到selling_amount
   *
   * 转换公式：
   * - selling_amount = CEIL(selling_points / 20)
   * - selling_asset_code = 'DIAMOND'
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize对象
   * @returns {Promise<void>}
   */
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 查询需要回填的记录数量
      const [beforeResults] = await queryInterface.sequelize.query(
        `
        SELECT COUNT(*) as count
        FROM user_inventory
        WHERE market_status = 'on_sale'
        AND selling_points IS NOT NULL
        AND selling_amount IS NULL
        `,
        { transaction }
      )

      const beforeCount = beforeResults[0].count

      if (beforeCount === 0) {
        console.log('ℹ️ 没有需要回填的记录，跳过数据迁移')
        await transaction.commit()
        return
      }

      console.log(`ℹ️ 发现${beforeCount}条需要回填的在售商品记录`)

      /*
       * 2. 执行数据回填（使用CEIL向上取整）
       * MySQL CEIL函数：向上取整，确保卖家不吃亏
       */
      const [updateResult] = await queryInterface.sequelize.query(
        `
        UPDATE user_inventory
        SET
          selling_amount = CEIL(selling_points / 20),
          selling_asset_code = 'DIAMOND'
        WHERE market_status = 'on_sale'
        AND selling_points IS NOT NULL
        AND selling_amount IS NULL
        `,
        { transaction }
      )

      // 3. 验证回填结果
      const [afterResults] = await queryInterface.sequelize.query(
        `
        SELECT COUNT(*) as count
        FROM user_inventory
        WHERE market_status = 'on_sale'
        AND selling_amount IS NOT NULL
        AND selling_asset_code = 'DIAMOND'
        `,
        { transaction }
      )

      const afterCount = afterResults[0].count
      const actualUpdated = updateResult.affectedRows || beforeCount

      await transaction.commit()

      console.log('✅ 数据回填成功')
      console.log(`   - 回填前在售商品数量：${beforeCount}`)
      console.log(`   - 实际更新记录数量：${actualUpdated}`)
      console.log(`   - 回填后DIAMOND定价商品数量：${afterCount}`)
      console.log('   - 转换比例：1积分 = 0.05 DIAMOND（20积分 = 1 DIAMOND）')
      console.log('   - 转换方式：向上取整（确保卖家不吃亏）')

      // 4. 显示转换示例（供验证）
      const [examples] = await queryInterface.sequelize.query(
        `
        SELECT
          inventory_id,
          name,
          selling_points,
          selling_amount,
          selling_asset_code
        FROM user_inventory
        WHERE market_status = 'on_sale'
        AND selling_amount IS NOT NULL
        LIMIT 5
        `
      )

      if (examples.length > 0) {
        console.log('   - 转换示例（前5条）：')
        examples.forEach(item => {
          console.log(
            `     [ID:${item.inventory_id}] ${item.name}: ${item.selling_points}积分 → ${item.selling_amount} ${item.selling_asset_code}`
          )
        })
      }
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 数据回填失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：清空selling_amount和selling_asset_code
   *
   * 注意：
   * - 此回滚不会恢复selling_points的数据（selling_points字段保留未修改）
   * - 只清空回填的selling_amount和selling_asset_code
   * - 回滚后系统会回到使用selling_points定价的模式
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize对象
   * @returns {Promise<void>}
   */
  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 查询需要清空的记录数量
      const [beforeResults] = await queryInterface.sequelize.query(
        `
        SELECT COUNT(*) as count
        FROM user_inventory
        WHERE selling_amount IS NOT NULL
        OR selling_asset_code IS NOT NULL
        `,
        { transaction }
      )

      const beforeCount = beforeResults[0].count

      if (beforeCount === 0) {
        console.log('ℹ️ 没有需要清空的记录，跳过回滚')
        await transaction.commit()
        return
      }

      console.log(`ℹ️ 发现${beforeCount}条需要清空的记录`)

      // 2. 清空selling_amount和selling_asset_code
      await queryInterface.sequelize.query(
        `
        UPDATE user_inventory
        SET
          selling_amount = NULL,
          selling_asset_code = NULL
        WHERE selling_amount IS NOT NULL
        OR selling_asset_code IS NOT NULL
        `,
        { transaction }
      )

      await transaction.commit()

      console.log('✅ 数据回滚成功')
      console.log(`   - 清空记录数量：${beforeCount}`)
      console.log('   - selling_amount和selling_asset_code已清空')
      console.log('   - selling_points字段保持不变')
      console.log('   - 系统已回滚到使用selling_points定价的模式')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 数据回滚失败:', error.message)
      throw error
    }
  }
}
