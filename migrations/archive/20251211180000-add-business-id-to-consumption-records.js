/**
 * 迁移文件：为consumption_records表添加business_id字段
 *
 * 目的：实现消费记录的永久幂等控制，符合P0-3规范要求
 *
 * 变更内容：
 * - 在consumption_records表添加business_id字段（VARCHAR(100)，可为空，有索引）
 *
 * 业务场景：
 * 1. 防止重复提交创建多条消费记录
 * 2. 通过business_id实现永久幂等保护
 * 3. 支持业务操作追溯（通过business_id查询原始记录）
 *
 * 幂等规则：
 * - business_id格式: `consumption_${userId}_${merchantId}_${timestamp}`
 * - 同一business_id只能创建一条记录
 * - 重复提交返回已有记录（幂等）
 *
 * 技术规范参考：规范 P0-3（所有资产变动必须有business_id幂等控制）
 *
 * 创建时间：2025-12-11
 * 使用模型：Claude Sonnet 4.5
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：添加business_id字段
   */
  up: async (queryInterface, Sequelize) => {
    console.log('📝 开始迁移：为consumption_records表添加business_id字段')

    // 步骤1：检查字段是否已存在
    const [columns] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'consumption_records'
        AND COLUMN_NAME = 'business_id'
    `)

    if (columns.length > 0) {
      console.log('✅ business_id字段已存在，跳过迁移')
      return
    }

    // 步骤2：添加business_id字段
    console.log('正在添加business_id字段...')
    await queryInterface.addColumn('consumption_records', 'business_id', {
      type: Sequelize.STRING(100),
      allowNull: true, // 允许为空，兼容历史数据
      comment: '业务关联ID，用于幂等控制（格式：consumption_${userId}_${merchantId}_${timestamp}）',
      after: 'qr_code' // 放在qr_code字段后面
    })

    console.log('✅ 成功添加business_id字段')

    // 步骤3：为business_id字段添加索引（提高查询性能）
    console.log('正在为business_id字段创建索引...')

    // 先检查索引是否已存在
    const [indexes] = await queryInterface.sequelize.query(`
      SELECT INDEX_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'consumption_records'
        AND INDEX_NAME = 'idx_consumption_business_id'
    `)

    if (indexes.length === 0) {
      await queryInterface.addIndex('consumption_records', ['business_id'], {
        name: 'idx_consumption_business_id',
        comment: '业务ID索引，用于幂等查询'
      })
      console.log('✅ 成功创建business_id索引')
    } else {
      console.log('✅ business_id索引已存在，跳过创建')
    }

    // 步骤4：验证修改
    const [verifyColumns] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_COMMENT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'consumption_records'
        AND COLUMN_NAME = 'business_id'
    `)

    if (verifyColumns.length > 0) {
      const column = verifyColumns[0]
      console.log('修改后的字段信息:', {
        name: column.COLUMN_NAME,
        type: column.COLUMN_TYPE,
        nullable: column.IS_NULLABLE,
        comment: column.COLUMN_COMMENT
      })
      console.log('✅ 验证通过：business_id字段已成功添加')
    } else {
      throw new Error('验证失败：business_id字段未正确添加')
    }

    // 步骤5：验证索引
    const [verifyIndexes] = await queryInterface.sequelize.query(`
      SELECT INDEX_NAME, COLUMN_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'consumption_records'
        AND INDEX_NAME = 'idx_consumption_business_id'
    `)

    if (verifyIndexes.length > 0) {
      console.log('✅ 验证通过：business_id索引已成功创建')
    } else {
      throw new Error('验证失败：business_id索引未正确创建')
    }

    console.log('✅ 迁移完成')
  },

  /**
   * 回滚迁移：移除business_id字段和索引
   */
  down: async (queryInterface, Sequelize) => {
    console.log('🔄 开始回滚：移除consumption_records表的business_id字段')

    // 步骤1：检查是否有使用business_id的记录
    const [records] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as count
      FROM consumption_records
      WHERE business_id IS NOT NULL
    `)

    const count = records[0].count

    if (count > 0) {
      console.warn(
        `⚠️ 警告：存在${count}条包含business_id的消费记录。` +
          '回滚后这些记录的business_id信息将丢失。'
      )
    }

    // 步骤2：移除索引
    console.log('正在移除business_id索引...')

    const [indexes] = await queryInterface.sequelize.query(`
      SELECT INDEX_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'consumption_records'
        AND INDEX_NAME = 'idx_consumption_business_id'
    `)

    if (indexes.length > 0) {
      await queryInterface.removeIndex('consumption_records', 'idx_consumption_business_id')
      console.log('✅ 成功移除business_id索引')
    } else {
      console.log('✅ business_id索引不存在，跳过移除')
    }

    // 步骤3：移除business_id字段
    console.log('正在移除business_id字段...')

    const [columns] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'consumption_records'
        AND COLUMN_NAME = 'business_id'
    `)

    if (columns.length > 0) {
      await queryInterface.removeColumn('consumption_records', 'business_id')
      console.log('✅ 成功移除business_id字段')
    } else {
      console.log('✅ business_id字段不存在，跳过移除')
    }

    // 步骤4：验证回滚
    const [verifyColumns] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'consumption_records'
        AND COLUMN_NAME = 'business_id'
    `)

    if (verifyColumns.length === 0) {
      console.log('✅ 验证通过：business_id字段已成功移除')
    } else {
      throw new Error('验证失败：business_id字段未正确移除')
    }

    console.log('✅ 回滚完成')
  }
}
