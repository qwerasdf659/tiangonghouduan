/**
 * Phase 4: 旧材料和钻石表改为只读模式
 *
 * 业务背景：
 * - Phase 3 已完成统一账本迁移（account_asset_balances + asset_transactions）
 * - 旧表（user_material_balances、material_transactions、user_diamond_accounts、diamond_transactions）不再接受新写入
 * - 将旧表改为只读，用于历史数据查询和迁移验证
 *
 * 操作说明：
 * - 为旧表添加注释标记为只读
 * - 不删除表结构和数据，保留用于历史查询
 * - MaterialService和DiamondService已改为只读版本
 *
 * 创建时间：2025-12-15
 * 作者：Phase 4 实施
 */

'use strict'

module.exports = {
  /**
   * up 迁移：标记旧表为只读模式
   * @param {QueryInterface} queryInterface - Sequelize查询接口
   * @param {Sequelize} Sequelize - Sequelize实例
   */
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔧 Phase 4: 开始标记旧材料和钻石表为只读模式...')

      // 1. 为 user_material_balances 表添加只读注释
      await queryInterface.sequelize.query(
        `ALTER TABLE user_material_balances 
         COMMENT = '材料余额表【只读 - Phase 4】- 历史数据，新业务使用account_asset_balances'`,
        { transaction }
      )
      console.log('✅ user_material_balances 表标记为只读')

      // 2. 为 material_transactions 表添加只读注释
      await queryInterface.sequelize.query(
        `ALTER TABLE material_transactions 
         COMMENT = '材料流水表【只读 - Phase 4】- 历史数据，新业务使用asset_transactions'`,
        { transaction }
      )
      console.log('✅ material_transactions 表标记为只读')

      // 3. 为 user_diamond_accounts 表添加只读注释
      await queryInterface.sequelize.query(
        `ALTER TABLE user_diamond_accounts 
         COMMENT = '钻石账户表【只读 - Phase 4】- 历史数据，新业务使用account_asset_balances'`,
        { transaction }
      )
      console.log('✅ user_diamond_accounts 表标记为只读')

      // 4. 为 diamond_transactions 表添加只读注释
      await queryInterface.sequelize.query(
        `ALTER TABLE diamond_transactions 
         COMMENT = '钻石流水表【只读 - Phase 4】- 历史数据，新业务使用asset_transactions'`,
        { transaction }
      )
      console.log('✅ diamond_transactions 表标记为只读')

      // 5. 创建只读视图（可选）- 方便历史数据查询
      await queryInterface.sequelize.query(
        `CREATE OR REPLACE VIEW v_legacy_material_balances AS
         SELECT 
           balance_id,
           user_id,
           asset_code,
           balance,
           created_at,
           updated_at,
           'LEGACY' as data_source
         FROM user_material_balances
         WHERE balance > 0`,
        { transaction }
      )
      console.log('✅ 创建旧材料余额视图 v_legacy_material_balances')

      await queryInterface.sequelize.query(
        `CREATE OR REPLACE VIEW v_legacy_diamond_accounts AS
         SELECT 
           account_id,
           user_id,
           balance,
           created_at,
           updated_at,
           'LEGACY' as data_source
         FROM user_diamond_accounts
         WHERE balance > 0`,
        { transaction }
      )
      console.log('✅ 创建旧钻石账户视图 v_legacy_diamond_accounts')

      await transaction.commit()
      console.log('🎉 Phase 4: 旧表只读模式设置完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ Phase 4: 设置旧表只读模式失败:', error)
      throw error
    }
  },

  /**
   * down 迁移：移除只读标记（回滚）
   * @param {QueryInterface} queryInterface - Sequelize查询接口
   * @param {Sequelize} Sequelize - Sequelize实例
   */
  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔧 Phase 4 回滚: 移除只读标记...')

      // 1. 移除 user_material_balances 表的只读注释
      await queryInterface.sequelize.query(
        `ALTER TABLE user_material_balances 
         COMMENT = '材料余额表'`,
        { transaction }
      )
      console.log('✅ user_material_balances 只读标记已移除')

      // 2. 移除 material_transactions 表的只读注释
      await queryInterface.sequelize.query(
        `ALTER TABLE material_transactions 
         COMMENT = '材料流水表'`,
        { transaction }
      )
      console.log('✅ material_transactions 只读标记已移除')

      // 3. 移除 user_diamond_accounts 表的只读注释
      await queryInterface.sequelize.query(
        `ALTER TABLE user_diamond_accounts 
         COMMENT = '钻石账户表'`,
        { transaction }
      )
      console.log('✅ user_diamond_accounts 只读标记已移除')

      // 4. 移除 diamond_transactions 表的只读注释
      await queryInterface.sequelize.query(
        `ALTER TABLE diamond_transactions 
         COMMENT = '钻石流水表'`,
        { transaction }
      )
      console.log('✅ diamond_transactions 只读标记已移除')

      // 5. 删除只读视图
      await queryInterface.sequelize.query('DROP VIEW IF EXISTS v_legacy_material_balances', {
        transaction
      })
      console.log('✅ 删除旧材料余额视图')

      await queryInterface.sequelize.query('DROP VIEW IF EXISTS v_legacy_diamond_accounts', {
        transaction
      })
      console.log('✅ 删除旧钻石账户视图')

      await transaction.commit()
      console.log('🎉 Phase 4 回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ Phase 4 回滚失败:', error)
      throw error
    }
  }
}
