/**
 * 数据库迁移：移除 v1 二维码相关字段
 *
 * 背景（2026-01-12 商家员工域权限体系升级 - P0 v1 字段彻底移除）：
 * - v1 永久码数据已通过 cleanup_v1_qrcode_data.js 脚本清理
 * - 项目未上线，无需保留历史兼容字段
 * - 彻底移除 qr_code_version 和 is_legacy_v1 字段简化数据模型
 *
 * 移除内容：
 * 1. consumption_records.qr_code_version 字段
 * 2. consumption_records.is_legacy_v1 字段
 * 3. idx_consumption_records_qr_code_version 索引
 *
 * 回滚策略：
 * - 重新添加字段和索引（仅开发环境使用，生产环境不应回滚）
 *
 * @since 2026-01-12
 * @see docs/商家员工域权限体系升级方案.md - 3B v1 彻底移除
 */

'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('📝 [Migration] 开始移除 v1 二维码相关字段...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 移除 qr_code_version 索引（如果存在）
      const [indexes] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM consumption_records WHERE Key_name = 'idx_consumption_records_qr_code_version'`,
        { transaction }
      )

      if (indexes.length > 0) {
        await queryInterface.removeIndex(
          'consumption_records',
          'idx_consumption_records_qr_code_version',
          {
            transaction
          }
        )
        console.log('✅ [Migration] 删除 idx_consumption_records_qr_code_version 索引')
      } else {
        console.log('ℹ️ [Migration] 索引 idx_consumption_records_qr_code_version 不存在，跳过')
      }

      // 2. 检查并删除 is_legacy_v1 字段
      const [isLegacyColumns] = await queryInterface.sequelize.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
           AND TABLE_NAME = 'consumption_records' 
           AND COLUMN_NAME = 'is_legacy_v1'`,
        { transaction }
      )

      if (isLegacyColumns.length > 0) {
        await queryInterface.removeColumn('consumption_records', 'is_legacy_v1', { transaction })
        console.log('✅ [Migration] 删除 is_legacy_v1 字段')
      } else {
        console.log('ℹ️ [Migration] is_legacy_v1 字段不存在，跳过')
      }

      // 3. 检查并删除 qr_code_version 字段
      const [qrVersionColumns] = await queryInterface.sequelize.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
           AND TABLE_NAME = 'consumption_records' 
           AND COLUMN_NAME = 'qr_code_version'`,
        { transaction }
      )

      if (qrVersionColumns.length > 0) {
        await queryInterface.removeColumn('consumption_records', 'qr_code_version', { transaction })
        console.log('✅ [Migration] 删除 qr_code_version 字段')
      } else {
        console.log('ℹ️ [Migration] qr_code_version 字段不存在，跳过')
      }

      await transaction.commit()
      console.log('🎉 [Migration] v1 二维码相关字段移除完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ [Migration] 移除 v1 字段失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('📝 [Migration] 回滚：重新添加 v1 二维码相关字段...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 重新添加 qr_code_version 字段
      await queryInterface.addColumn(
        'consumption_records',
        'qr_code_version',
        {
          type: Sequelize.ENUM('v1', 'v2'),
          allowNull: true,
          defaultValue: 'v2',
          comment: '二维码版本（v1=永久码/已废弃，v2=动态码/防重放）'
        },
        { transaction }
      )
      console.log('✅ [Migration] 恢复 qr_code_version 字段')

      // 2. 重新添加 is_legacy_v1 字段
      await queryInterface.addColumn(
        'consumption_records',
        'is_legacy_v1',
        {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: '是否为 v1 历史遗留数据'
        },
        { transaction }
      )
      console.log('✅ [Migration] 恢复 is_legacy_v1 字段')

      // 3. 重新添加索引
      await queryInterface.addIndex('consumption_records', ['qr_code_version'], {
        name: 'idx_consumption_records_qr_code_version',
        transaction
      })
      console.log('✅ [Migration] 恢复 idx_consumption_records_qr_code_version 索引')

      await transaction.commit()
      console.log('🎉 [Migration] 回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ [Migration] 回滚失败:', error.message)
      throw error
    }
  }
}
