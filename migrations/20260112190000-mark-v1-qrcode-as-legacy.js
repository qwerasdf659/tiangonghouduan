'use strict'

/**
 * 商家员工域权限体系升级 - 标记 v1 永久码数据为历史数据
 *
 * 迁移脚本：
 * 1. 添加 qr_code_version 字段标记二维码版本
 * 2. 添加 is_legacy_v1 字段标记 v1 历史数据
 * 3. 更新现有 v1 永久码记录
 *
 * 业务背景：
 * - v1 永久码存在重复使用风险
 * - v2 动态码带 nonce 防重放
 * - 不删除历史数据，只做标记便于追溯
 *
 * 创建时间：2026-01-12
 * 依据文档：docs/商家员工域权限体系升级方案.md
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('📝 [Migration] 开始标记 v1 永久码数据...')

      // 1. 检查 qr_code_version 字段是否已存在
      const [columns] = await queryInterface.sequelize.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'consumption_records' 
         AND COLUMN_NAME = 'qr_code_version'`,
        { transaction }
      )

      if (columns.length === 0) {
        // 添加 qr_code_version 字段
        await queryInterface.addColumn(
          'consumption_records',
          'qr_code_version',
          {
            type: Sequelize.ENUM('v1', 'v2'),
            allowNull: true,
            defaultValue: null,
            comment: '二维码版本（v1=永久码/不安全，v2=动态码/防重放）'
          },
          { transaction }
        )
        console.log('✅ [Migration] 添加 qr_code_version 字段成功')
      } else {
        console.log('ℹ️ [Migration] qr_code_version 字段已存在，跳过')
      }

      // 2. 检查 is_legacy_v1 字段是否已存在
      const [legacyColumns] = await queryInterface.sequelize.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'consumption_records' 
         AND COLUMN_NAME = 'is_legacy_v1'`,
        { transaction }
      )

      if (legacyColumns.length === 0) {
        // 添加 is_legacy_v1 标记字段
        await queryInterface.addColumn(
          'consumption_records',
          'is_legacy_v1',
          {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: '是否为 v1 历史遗留数据（v1 永久码重复使用风险记录）'
          },
          { transaction }
        )
        console.log('✅ [Migration] 添加 is_legacy_v1 字段成功')
      } else {
        console.log('ℹ️ [Migration] is_legacy_v1 字段已存在，跳过')
      }

      // 3. 更新现有 v1 永久码记录
      const [updateResult] = await queryInterface.sequelize.query(
        `UPDATE consumption_records 
         SET qr_code_version = 'v1', is_legacy_v1 = TRUE 
         WHERE qr_code LIKE 'QR_%' AND qr_code NOT LIKE 'QRV2_%'`,
        { transaction }
      )
      console.log(`✅ [Migration] 标记 ${updateResult.affectedRows || 0} 条 v1 永久码记录`)

      // 4. 更新现有 v2 动态码记录
      const [updateV2Result] = await queryInterface.sequelize.query(
        `UPDATE consumption_records 
         SET qr_code_version = 'v2', is_legacy_v1 = FALSE 
         WHERE qr_code LIKE 'QRV2_%'`,
        { transaction }
      )
      console.log(`✅ [Migration] 标记 ${updateV2Result.affectedRows || 0} 条 v2 动态码记录`)

      // 5. 添加索引以便按版本筛选
      const [existingIndexes] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM consumption_records WHERE Key_name = 'idx_consumption_qr_version'`,
        { transaction }
      )

      if (existingIndexes.length === 0) {
        await queryInterface.addIndex('consumption_records', ['qr_code_version'], {
          name: 'idx_consumption_qr_version',
          transaction
        })
        console.log('✅ [Migration] 添加 qr_code_version 索引成功')
      }

      await transaction.commit()
      console.log('🎉 [Migration] 迁移 20260112190000-mark-v1-qrcode-as-legacy 成功提交')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ [Migration] 迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('📝 [Migration] 开始回滚 v1 标记...')

      // 删除索引
      try {
        await queryInterface.removeIndex('consumption_records', 'idx_consumption_qr_version', {
          transaction
        })
      } catch (e) {
        console.log('ℹ️ [Migration] 索引可能不存在，跳过删除')
      }

      // 删除字段
      try {
        await queryInterface.removeColumn('consumption_records', 'is_legacy_v1', { transaction })
        console.log('✅ [Migration] 删除 is_legacy_v1 字段')
      } catch (e) {
        console.log('ℹ️ [Migration] is_legacy_v1 字段可能不存在')
      }

      try {
        await queryInterface.removeColumn('consumption_records', 'qr_code_version', { transaction })
        console.log('✅ [Migration] 删除 qr_code_version 字段')
      } catch (e) {
        console.log('ℹ️ [Migration] qr_code_version 字段可能不存在')
      }

      await transaction.commit()
      console.log('🎉 [Migration] 回滚成功')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ [Migration] 回滚失败:', error.message)
      throw error
    }
  }
}
