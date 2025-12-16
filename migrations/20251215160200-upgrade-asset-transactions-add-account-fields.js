/**
 * 迁移文件：升级asset_transactions表（添加account_id和balance_before字段）
 *
 * 业务背景：
 * - 从user_id单账户体系升级到account_id多账户体系
 * - 支持用户账户、系统账户（平台手续费、铸币、销毁、托管）
 * - 添加balance_before字段用于完整对账（before + delta = after）
 *
 * 升级内容：
 * 1. 添加account_id字段（关联accounts.account_id）
 * 2. 添加balance_before字段（变动前余额）
 * 3. 保留user_id字段（向后兼容，但不再作为主要账户标识）
 * 4. 添加account_id索引用于查询优化
 *
 * 数据迁移策略：
 * - 新字段允许NULL（兼容历史数据）
 * - 历史数据的account_id需要通过数据迁移脚本填充
 * - 新业务代码必须填充account_id和balance_before
 *
 * 命名规范（snake_case）：
 * - 字段：account_id, balance_before
 * - 索引：idx_account_asset_time
 *
 * 创建时间：2025-12-15
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：添加account_id和balance_before字段
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize对象
   * @returns {Promise<void>} 无返回值，执行数据库迁移
   */
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始升级asset_transactions表...')

      // 1. 添加account_id字段（关联accounts.account_id）
      await queryInterface.addColumn(
        'asset_transactions',
        'account_id',
        {
          type: Sequelize.BIGINT,
          allowNull: true, // 允许NULL（兼容历史数据）
          comment:
            '账户ID（Account ID - 流水所属账户）：关联accounts.account_id，支持用户账户和系统账户（平台手续费、铸币、销毁、托管），新业务必填',
          references: {
            model: 'accounts',
            key: 'account_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT' // 账户删除时保护流水数据
        },
        { transaction }
      )
      console.log('✅ 添加account_id字段成功')

      // 2. 添加balance_before字段（变动前余额）
      await queryInterface.addColumn(
        'asset_transactions',
        'balance_before',
        {
          type: Sequelize.BIGINT,
          allowNull: true, // 允许NULL（兼容历史数据）
          comment:
            '变动前余额（Balance Before - 本次变动前的资产余额）：与balance_after配合用于完整对账（before + delta = after），新业务必填'
        },
        { transaction }
      )
      console.log('✅ 添加balance_before字段成功')

      // 3. 创建索引：account_id + asset_code + created_at（按账户和资产类型查询流水）
      await queryInterface.addIndex(
        'asset_transactions',
        ['account_id', 'asset_code', 'created_at'],
        {
          name: 'idx_account_asset_time',
          transaction,
          comment: '索引：账户ID + 资产代码 + 创建时间（用于查询账户的资产流水历史）'
        }
      )
      console.log('✅ 创建idx_account_asset_time索引成功')

      await transaction.commit()
      console.log('✅ asset_transactions表升级完成')
      console.log('📋 新增字段: account_id, balance_before')
      console.log('📋 新增索引: idx_account_asset_time')
      console.log('⚠️  注意: 历史数据的account_id需要通过数据迁移脚本填充')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：删除account_id和balance_before字段
   *
   * 注意：
   * - 回滚会丢失account_id和balance_before数据
   * - 回滚前需要确认是否需要备份数据
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} _Sequelize - Sequelize对象（未使用）
   * @returns {Promise<void>} 无返回值，执行数据库回滚
   */
  async down(queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始回滚asset_transactions表升级...')

      // 1. 删除索引：idx_account_asset_time
      await queryInterface.removeIndex('asset_transactions', 'idx_account_asset_time', {
        transaction
      })
      console.log('✅ 删除idx_account_asset_time索引成功')

      // 2. 删除balance_before字段
      await queryInterface.removeColumn('asset_transactions', 'balance_before', {
        transaction
      })
      console.log('✅ 删除balance_before字段成功')

      // 3. 删除account_id字段
      await queryInterface.removeColumn('asset_transactions', 'account_id', {
        transaction
      })
      console.log('✅ 删除account_id字段成功')

      await transaction.commit()
      console.log('✅ asset_transactions表回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
