/**
 * 数据库迁移：删除 asset_transactions.user_id 字段
 *
 * 背景：
 * - 业务已完全迁移到 account_id 体系
 * - 所有 460 条记录都已有 account_id 值
 * - user_id 字段及其外键、索引不再需要
 *
 * 执行操作：
 * 1. 删除外键约束 fk_asset_transactions_user_id
 * 2. 删除索引 idx_user_asset_time
 * 3. 删除 user_id 字段
 *
 * 回滚操作：
 * 1. 重新添加 user_id 字段
 * 2. 重新创建索引 idx_user_asset_time
 * 3. 重新添加外键约束 fk_asset_transactions_user_id
 * 4. 通过 accounts 表关联恢复 user_id 数据
 *
 * 创建时间：2025-12-22
 */

'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🔄 开始删除 asset_transactions.user_id 字段...')

    // 检查字段是否存在
    const [columns] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'restaurant_points_dev' 
        AND TABLE_NAME = 'asset_transactions' 
        AND COLUMN_NAME = 'user_id'
    `)

    if (columns.length === 0) {
      console.log('⚠️ user_id 字段不存在，跳过迁移')
      return
    }

    // 1. 删除外键约束（如果存在）
    const [foreignKeys] = await queryInterface.sequelize.query(`
      SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
      WHERE TABLE_SCHEMA = 'restaurant_points_dev' 
        AND TABLE_NAME = 'asset_transactions' 
        AND COLUMN_NAME = 'user_id'
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `)

    for (const fk of foreignKeys) {
      try {
        await queryInterface.removeConstraint('asset_transactions', fk.CONSTRAINT_NAME)
        console.log(`✓ 删除外键约束: ${fk.CONSTRAINT_NAME}`)
      } catch (error) {
        console.log(`⚠️ 删除外键约束 ${fk.CONSTRAINT_NAME} 失败（可能已不存在）:`, error.message)
      }
    }

    // 2. 删除索引（如果存在）
    const [indexes] = await queryInterface.sequelize.query(`
      SHOW INDEX FROM asset_transactions WHERE Column_name = 'user_id'
    `)

    const indexNames = [...new Set(indexes.map(idx => idx.Key_name))]
    for (const indexName of indexNames) {
      try {
        await queryInterface.removeIndex('asset_transactions', indexName)
        console.log(`✓ 删除索引: ${indexName}`)
      } catch (error) {
        console.log(`⚠️ 删除索引 ${indexName} 失败（可能已不存在）:`, error.message)
      }
    }

    // 3. 删除 user_id 字段
    await queryInterface.removeColumn('asset_transactions', 'user_id')
    console.log('✓ 删除字段: user_id')

    // 验证删除结果
    const [verifyColumns] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'restaurant_points_dev' 
        AND TABLE_NAME = 'asset_transactions' 
        AND COLUMN_NAME = 'user_id'
    `)

    if (verifyColumns.length === 0) {
      console.log('✅ asset_transactions.user_id 字段删除成功')
    } else {
      throw new Error('验证失败：user_id 字段仍然存在')
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('🔄 开始恢复 asset_transactions.user_id 字段...')

    // 1. 添加 user_id 字段
    await queryInterface.addColumn('asset_transactions', 'user_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: '用户ID（恢复字段）：关联users.user_id'
    })
    console.log('✓ 恢复字段: user_id')

    // 2. 通过 accounts 表关联恢复 user_id 数据
    await queryInterface.sequelize.query(`
      UPDATE asset_transactions at
      INNER JOIN accounts a ON at.account_id = a.account_id
      SET at.user_id = a.user_id
      WHERE a.user_id IS NOT NULL
    `)
    console.log('✓ 通过 accounts 表恢复 user_id 数据')

    // 3. 创建索引
    await queryInterface.addIndex('asset_transactions', ['user_id', 'asset_code', 'created_at'], {
      name: 'idx_user_asset_time',
      comment: '索引：用户ID + 资产代码 + 创建时间（用于查询用户的资产流水历史）'
    })
    console.log('✓ 恢复索引: idx_user_asset_time')

    // 4. 添加外键约束
    await queryInterface.addConstraint('asset_transactions', {
      fields: ['user_id'],
      type: 'foreign key',
      name: 'fk_asset_transactions_user_id',
      references: {
        table: 'users',
        field: 'user_id'
      },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    })
    console.log('✓ 恢复外键约束: fk_asset_transactions_user_id')

    console.log('✅ asset_transactions.user_id 字段恢复成功')
  }
}
