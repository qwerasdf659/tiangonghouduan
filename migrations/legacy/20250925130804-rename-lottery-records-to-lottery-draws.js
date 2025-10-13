'use strict'

/**
 * 数据库迁移：将 lottery_draws 表重命名为 lottery_draws
 * 目的：统一数据库表名与模型名，消除硬编码映射
 * 创建时间：2025年09月25日
 *
 * 重要说明：
 * - 此迁移会重命名表，保持所有数据完整
 * - 外键约束会自动重新创建
 * - 索引会自动迁移
 */

module.exports = {
  async up (queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始迁移：lottery_draws → lottery_draws')

      // 1. 检查源表是否存在
      const tableExists = await queryInterface.describeTable('lottery_draws')
      if (!tableExists) {
        throw new Error('源表 lottery_draws 不存在')
      }

      // 2. 检查目标表是否已存在
      try {
        await queryInterface.describeTable('lottery_draws')
        console.log('⚠️ 目标表 lottery_draws 已存在，跳过迁移')
        await transaction.rollback()
        return
      } catch (error) {
        // 目标表不存在，继续迁移
      }

      // 3. 获取数据量统计
      const [countResult] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM lottery_draws',
        { transaction }
      )
      const recordCount = countResult[0].count
      console.log(`📊 准备迁移 ${recordCount} 条记录`)

      // 4. 执行表重命名
      await queryInterface.sequelize.query(
        'RENAME TABLE lottery_draws TO lottery_draws',
        { transaction }
      )

      console.log('✅ 表重命名完成')

      // 5. 验证迁移结果
      const newTableExists = await queryInterface.describeTable('lottery_draws')
      if (!newTableExists) {
        throw new Error('迁移失败：新表 lottery_draws 不存在')
      }

      // 6. 验证数据完整性
      const [newCountResult] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM lottery_draws',
        { transaction }
      )
      const newRecordCount = newCountResult[0].count

      if (newRecordCount !== recordCount) {
        throw new Error(`数据丢失：原始 ${recordCount} 条 → 迁移后 ${newRecordCount} 条`)
      }

      console.log(`✅ 数据完整性验证通过：${newRecordCount} 条记录`)

      // 7. 检查外键约束状态
      const [constraints] = await queryInterface.sequelize.query(`
        SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
        FROM information_schema.KEY_COLUMN_USAGE 
        WHERE TABLE_SCHEMA = '${queryInterface.sequelize.config.database}' 
        AND TABLE_NAME = 'lottery_draws'
        AND REFERENCED_TABLE_NAME IS NOT NULL
      `, { transaction })

      console.log(`✅ 外键约束检查：${constraints.length} 个约束已迁移`)
      constraints.forEach(constraint => {
        console.log(`   - ${constraint.COLUMN_NAME} → ${constraint.REFERENCED_TABLE_NAME}.${constraint.REFERENCED_COLUMN_NAME}`)
      })

      await transaction.commit()
      console.log('🎉 迁移成功完成：lottery_draws → lottery_draws')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  async down (queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始回滚：lottery_draws → lottery_draws')

      // 1. 检查当前表是否存在
      const tableExists = await queryInterface.describeTable('lottery_draws')
      if (!tableExists) {
        console.log('⚠️ 表 lottery_draws 不存在，无需回滚')
        await transaction.rollback()
        return
      }

      // 2. 检查目标表是否已存在
      try {
        await queryInterface.describeTable('lottery_draws')
        console.log('⚠️ 目标表 lottery_draws 已存在，跳过回滚')
        await transaction.rollback()
        return
      } catch (error) {
        // 目标表不存在，继续回滚
      }

      // 3. 获取数据量统计
      const [countResult] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM lottery_draws',
        { transaction }
      )
      const recordCount = countResult[0].count
      console.log(`📊 准备回滚 ${recordCount} 条记录`)

      // 4. 执行表重命名回滚
      await queryInterface.sequelize.query(
        'RENAME TABLE lottery_draws TO lottery_draws',
        { transaction }
      )

      console.log('✅ 表回滚重命名完成')

      // 5. 验证回滚结果
      const [newCountResult] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM lottery_draws',
        { transaction }
      )
      const newRecordCount = newCountResult[0].count

      if (newRecordCount !== recordCount) {
        throw new Error(`回滚数据丢失：原始 ${recordCount} 条 → 回滚后 ${newRecordCount} 条`)
      }

      console.log(`✅ 回滚数据完整性验证通过：${newRecordCount} 条记录`)

      await transaction.commit()
      console.log('🎉 回滚成功完成：lottery_draws → lottery_draws')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
