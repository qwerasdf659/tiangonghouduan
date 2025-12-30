/**
 * 回滚已删除迁移的数据库变更
 *
 * 背景：
 * - 已删除的迁移文件：
 *   1. 20251109235500-add-delivery-method-to-exchange-records.js
 *   2. 20251109235900-add-user-exchange-time-index-to-exchange-records.js
 * - 这些迁移已在之前执行，在数据库中创建了字段和索引
 * - 迁移文件已删除，但数据库变更仍然存在
 * - 需要手动回滚这些变更
 *
 * 回滚内容：
 * 1. 删除 exchange_records.delivery_method 字段
 * 2. 删除 idx_user_exchange_time 索引
 *
 * 注意：
 * - 这是一次性脚本，回滚完成后不需要再次执行
 * - 会先检查字段/索引是否存在，避免重复回滚
 * - 使用事务确保原子性
 */

const { Sequelize } = require('sequelize')
require('dotenv').config()

/**
 * 回滚已删除迁移创建的数据库字段和索引
 * @async
 * @function rollbackDeletedMigrations
 * @returns {Promise<void>} 无返回值，回滚成功后输出日志
 * @throws {Error} 数据库连接失败或回滚操作失败时抛出错误
 * @description
 * 该函数会检查并删除以下数据库变更：
 * 1. exchange_records表的delivery_method字段
 * 2. exchange_records表的idx_user_exchange_time索引
 * 操作使用事务确保原子性，如果任何一步失败则全部回滚
 */
async function rollbackDeletedMigrations() {
  // 🔴 复用主 sequelize 实例（单一配置源）
  const { sequelize } = require('../config/database')

  const transaction = await sequelize.transaction()

  try {
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    console.log('📝 开始回滚已删除迁移的数据库变更...\n')

    /*
     * ========================================
     * 1. 回滚 delivery_method 字段
     * ========================================
     */
    console.log('🔍 检查 delivery_method 字段是否存在...')
    const [deliveryMethodExists] = await sequelize.query(
      `
      SELECT COUNT(*) as count
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = '${process.env.DB_NAME || 'restaurant_points_dev'}'
      AND TABLE_NAME = 'exchange_records'
      AND COLUMN_NAME = 'delivery_method'
    `,
      { transaction }
    )

    if (deliveryMethodExists[0].count > 0) {
      console.log('   ✅ delivery_method 字段存在，准备删除...')

      // 先删除相关的 ENUM 类型约束
      await sequelize.query(
        `
        ALTER TABLE exchange_records
        DROP COLUMN delivery_method
      `,
        { transaction }
      )

      console.log('   ✅ delivery_method 字段已删除\n')
    } else {
      console.log('   ⏭️  delivery_method 字段不存在，跳过\n')
    }

    /*
     * ========================================
     * 2. 回滚 idx_user_exchange_time 索引
     * ========================================
     */
    console.log('🔍 检查 idx_user_exchange_time 索引是否存在...')
    const [indexExists] = await sequelize.query(
      `
      SELECT COUNT(*) as count
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = '${process.env.DB_NAME || 'restaurant_points_dev'}'
      AND TABLE_NAME = 'exchange_records'
      AND INDEX_NAME = 'idx_user_exchange_time'
    `,
      { transaction }
    )

    if (indexExists[0].count > 0) {
      console.log('   ✅ idx_user_exchange_time 索引存在，准备删除...')

      await sequelize.query(
        `
        DROP INDEX idx_user_exchange_time ON exchange_records
      `,
        { transaction }
      )

      console.log('   ✅ idx_user_exchange_time 索引已删除\n')
    } else {
      console.log('   ⏭️  idx_user_exchange_time 索引不存在，跳过\n')
    }

    // 提交事务
    await transaction.commit()

    console.log('✅ 回滚完成！\n')
    console.log('📊 回滚总结：')
    console.log(
      '   - delivery_method 字段：',
      deliveryMethodExists[0].count > 0 ? '已删除' : '不存在'
    )
    console.log(
      '   - idx_user_exchange_time 索引：',
      indexExists[0].count > 0 ? '已删除' : '不存在'
    )
    console.log('\n🎯 说明：')
    console.log('   - exchange_records 表保留，用于查询历史订单数据')
    console.log('   - 新兑换功能使用 exchange_market_records 表')
    console.log('   - 已删除迁移创建的字段和索引已清理')
  } catch (error) {
    await transaction.rollback()
    console.error('\n❌ 回滚失败:', error.message)
    console.error('   错误详情:', error)
    throw error
  } finally {
    await sequelize.close()
    console.log('\n✅ 数据库连接已关闭')
  }
}

// 执行回滚
rollbackDeletedMigrations().catch(error => {
  console.error('❌ 脚本执行失败:', error)
  process.exit(1)
})
