'use strict'

/**
 * P0-5: 审计日志 target_type 命名统一迁移
 *
 * 迁移内容：
 * 1. 添加 target_type_raw 字段保留原始值
 * 2. 备份原始值到 target_type_raw
 * 3. 批量规范化 target_type 为标准 snake_case 资源码
 *
 * 迁移策略：直接停机 5-10 分钟（已拍板）
 *
 * 创建时间：2026-01-09
 * 版本：V4.5.0
 */

const { getLegacyMappings } = require('../constants/AuditTargetTypes')

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔧 开始执行：审计日志 target_type 命名统一迁移（P0-5）')

      // 1. 检查 target_type_raw 字段是否已存在
      console.log('📊 步骤1：检查 target_type_raw 字段...')
      const [columns] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM admin_operation_logs WHERE Field = 'target_type_raw'",
        { transaction }
      )

      if (columns.length > 0) {
        console.log('   ⏭️ target_type_raw 字段已存在，跳过添加')
      } else {
        console.log('📊 步骤1：添加 target_type_raw 字段...')
        await queryInterface.addColumn(
          'admin_operation_logs',
          'target_type_raw',
          {
            type: Sequelize.STRING(100),
            allowNull: true,
            comment: '原始 target_type 值（用于审计追溯）'
          },
          { transaction }
        )
        console.log('   ✅ target_type_raw 字段添加成功')
      }

      // 2. 备份原始值到 target_type_raw（仅更新为空的记录）
      console.log('📊 步骤2：备份原始值到 target_type_raw...')
      const [backupResult] = await queryInterface.sequelize.query(
        'UPDATE admin_operation_logs SET target_type_raw = target_type WHERE target_type_raw IS NULL',
        { transaction }
      )
      console.log(`   ✅ 备份完成，影响 ${backupResult.affectedRows || 0} 条记录`)

      // 3. 批量规范化 target_type
      console.log('📊 步骤3：批量规范化 target_type...')
      const mappings = getLegacyMappings()
      let totalUpdated = 0

      for (const [oldValue, newValue] of Object.entries(mappings)) {
        // 只更新需要转换的记录
        if (oldValue !== newValue) {
          const [updateResult] = await queryInterface.sequelize.query(
            'UPDATE admin_operation_logs SET target_type = :newValue WHERE target_type = :oldValue',
            {
              replacements: { oldValue, newValue },
              transaction
            }
          )
          const affected = updateResult.affectedRows || 0
          if (affected > 0) {
            console.log(`   ✅ ${oldValue} → ${newValue}: ${affected} 条`)
            totalUpdated += affected
          }
        }
      }
      console.log(`   ✅ 规范化完成，共更新 ${totalUpdated} 条记录`)

      // 4. 验证迁移结果
      console.log('📊 步骤4：验证迁移结果...')
      const validTargetTypes = [...new Set(Object.values(mappings))]
      const placeholders = validTargetTypes.map(() => '?').join(',')

      const [unmapped] = await queryInterface.sequelize.query(
        `SELECT DISTINCT target_type, COUNT(*) as count 
         FROM admin_operation_logs 
         WHERE target_type NOT IN (${placeholders})
         GROUP BY target_type`,
        {
          replacements: validTargetTypes,
          transaction
        }
      )

      if (unmapped.length > 0) {
        console.warn('   ⚠️ 发现未映射的 target_type:')
        unmapped.forEach(row => {
          console.warn(`      - ${row.target_type}: ${row.count} 条`)
        })
      } else {
        console.log('   ✅ 所有 target_type 已规范化')
      }

      // 5. 统计迁移后的数据分布
      console.log('📊 步骤5：统计迁移后的数据分布...')
      const [distribution] = await queryInterface.sequelize.query(
        `SELECT target_type, COUNT(*) as count 
         FROM admin_operation_logs 
         GROUP BY target_type 
         ORDER BY count DESC 
         LIMIT 15`,
        { transaction }
      )

      console.log('   迁移后 target_type 分布:')
      distribution.forEach(row => {
        console.log(`   - ${row.target_type}: ${row.count} 条`)
      })

      await transaction.commit()
      console.log('✅ 迁移完成：审计日志 target_type 命名统一（P0-5）')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('⚠️ 开始回滚：审计日志 target_type 命名统一迁移（P0-5）')

      // 1. 从 target_type_raw 恢复原始值
      console.log('📊 步骤1：从 target_type_raw 恢复原始值...')
      const [restoreResult] = await queryInterface.sequelize.query(
        'UPDATE admin_operation_logs SET target_type = target_type_raw WHERE target_type_raw IS NOT NULL',
        { transaction }
      )
      console.log(`   ✅ 恢复完成，影响 ${restoreResult.affectedRows || 0} 条记录`)

      // 2. 删除 target_type_raw 字段
      console.log('📊 步骤2：删除 target_type_raw 字段...')
      await queryInterface.removeColumn('admin_operation_logs', 'target_type_raw', { transaction })
      console.log('   ✅ target_type_raw 字段已删除')

      await transaction.commit()
      console.log('✅ 回滚完成：审计日志 target_type 命名统一迁移（P0-5）')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
