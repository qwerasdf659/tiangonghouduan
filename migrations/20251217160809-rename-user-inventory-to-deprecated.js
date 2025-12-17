/**
 * 迁移: 将user_inventory表重命名为废弃状态
 *
 * 目标: 标记user_inventory表为已废弃，数据已迁移到双轨系统
 *
 * 背景:
 * - 数据已完整迁移到 item_instances 和 account_asset_balances
 * - 原表保留作为历史备份，30天后可删除
 *
 * 影响:
 * - user_inventory表 → _deprecated_user_inventory_20251217
 * - 所有依赖user_inventory的代码需要切换到新架构
 *
 * 回滚: 恢复表名（但不建议，数据已迁移）
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableName = 'user_inventory'
    const deprecatedName = `_deprecated_user_inventory_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`

    console.log(`🔄 开始重命名表: ${tableName} → ${deprecatedName}`)

    try {
      // 检查原表是否存在
      const [tables] = await queryInterface.sequelize.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = '${tableName}'
      `)

      if (tables.length === 0) {
        console.log(`⚠️ 表 ${tableName} 不存在，跳过迁移`)
        return
      }

      // 检查数据记录数
      const [[{ count }]] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM ${tableName}
      `)
      console.log(`📊 ${tableName} 表共有 ${count} 条记录`)

      // 重命名表
      await queryInterface.renameTable(tableName, deprecatedName)

      console.log(`✅ 表重命名成功: ${tableName} → ${deprecatedName}`)
      console.log(`📝 原表数据已保留在 ${deprecatedName}，30天后可删除`)
      console.log(`🎯 新架构使用: item_instances + account_asset_balances`)
    } catch (error) {
      console.error(`❌ 迁移失败: ${error.message}`)
      throw error
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableName = 'user_inventory'
    const deprecatedName = `_deprecated_user_inventory_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`

    console.log(`🔄 回滚: 恢复表名 ${deprecatedName} → ${tableName}`)

    try {
      // 检查废弃表是否存在
      const [tables] = await queryInterface.sequelize.query(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME LIKE '_deprecated_user_inventory_%'
      `)

      if (tables.length === 0) {
        console.log(`⚠️ 未找到废弃的user_inventory表`)
        return
      }

      const actualDeprecatedName = tables[0].TABLE_NAME

      // 恢复表名
      await queryInterface.renameTable(actualDeprecatedName, tableName)

      console.log(`✅ 表名已恢复: ${actualDeprecatedName} → ${tableName}`)
      console.log(`⚠️ 警告: 此操作仅恢复表名，数据可能不完整`)
    } catch (error) {
      console.error(`❌ 回滚失败: ${error.message}`)
      throw error
    }
  }
}
