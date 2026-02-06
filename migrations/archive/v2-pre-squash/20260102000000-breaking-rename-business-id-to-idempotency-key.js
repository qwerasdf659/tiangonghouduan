/**
 * 餐厅积分抽奖系统 - 数据库迁移（破坏性升级）
 *
 * 迁移内容：统一将业务表的 business_id 字段重命名为 idempotency_key
 *
 * 破坏性变更（业界标准形态 - 2026-01-02）：
 * - 所有业务表统一使用 idempotency_key 字段名
 * - 消除系统中 business_id 概念（业务单号除外）
 * - 保持 NOT NULL + UNIQUE 约束
 *
 * 影响的表（共 7 张）：
 * 1. consumption_records - 消费记录
 * 2. exchange_records - 兑换订单
 * 3. market_listings - 市场挂牌
 * 4. trade_orders - 交易订单
 * 5. trade_records - 交易流水
 * 6. lottery_draws - 抽奖记录
 * 7. admin_operation_logs - 管理操作日志
 *
 * 创建时间：2026年01月02日
 * 方案类型：破坏性重构 - 字段重命名
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：将 business_id 重命名为 idempotency_key
   */
  async up(queryInterface, Sequelize) {
    console.log('开始迁移：统一将 business_id 重命名为 idempotency_key（业界标准形态）...')

    // 需要重命名的表列表
    const tables = [
      {
        name: 'consumption_records',
        oldIndexName: 'uk_consumption_records_business_id',
        newIndexName: 'uk_consumption_records_idempotency_key'
      },
      {
        name: 'exchange_records',
        oldIndexName: 'idx_business_id_unique',
        newIndexName: 'uk_exchange_records_idempotency_key'
      },
      {
        name: 'market_listings',
        oldIndexName: 'uk_market_listings_business_id',
        newIndexName: 'uk_market_listings_idempotency_key'
      },
      {
        name: 'trade_orders',
        oldIndexName: 'business_id',
        newIndexName: 'uk_trade_orders_idempotency_key',
        // trade_orders 有两个重复索引需要处理
        duplicateIndex: 'idx_trade_orders_business_id'
      },
      {
        name: 'trade_records',
        oldIndexName: 'uk_trade_records_business_id',
        newIndexName: 'uk_trade_records_idempotency_key'
      },
      {
        name: 'lottery_draws',
        oldIndexName: 'uk_lottery_draws_business_id',
        newIndexName: 'uk_lottery_draws_idempotency_key'
      },
      {
        name: 'admin_operation_logs',
        oldIndexName: 'business_id',
        newIndexName: 'uk_admin_operation_logs_idempotency_key'
      }
    ]

    for (const table of tables) {
      console.log(`\n=== 处理表: ${table.name} ===`)

      // 1. 检查 business_id 字段是否存在
      const [columns] = await queryInterface.sequelize.query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = '${table.name}'
          AND COLUMN_NAME = 'business_id'
      `)

      if (columns.length === 0) {
        console.log(`  ⚠️ 表 ${table.name} 没有 business_id 字段，跳过`)
        continue
      }

      // 2. 删除重复索引（如果存在）
      if (table.duplicateIndex) {
        const [dupIndex] = await queryInterface.sequelize.query(`
          SHOW INDEX FROM ${table.name}
          WHERE Key_name = '${table.duplicateIndex}'
        `)
        if (dupIndex.length > 0) {
          await queryInterface.removeIndex(table.name, table.duplicateIndex)
          console.log(`  ✅ 已删除重复索引: ${table.duplicateIndex}`)
        }
      }

      // 3. 删除旧索引
      const [oldIndex] = await queryInterface.sequelize.query(`
        SHOW INDEX FROM ${table.name}
        WHERE Key_name = '${table.oldIndexName}'
      `)
      if (oldIndex.length > 0) {
        await queryInterface.removeIndex(table.name, table.oldIndexName)
        console.log(`  ✅ 已删除旧索引: ${table.oldIndexName}`)
      }

      // 4. 重命名字段
      await queryInterface.renameColumn(table.name, 'business_id', 'idempotency_key')
      console.log(`  ✅ 已重命名字段: business_id -> idempotency_key`)

      // 5. 添加新的唯一索引
      await queryInterface.addIndex(table.name, {
        fields: ['idempotency_key'],
        unique: true,
        name: table.newIndexName
      })
      console.log(`  ✅ 已创建新索引: ${table.newIndexName}`)
    }

    // 特殊处理：market_listings 的联合唯一索引
    console.log('\n=== 处理 market_listings 联合索引 ===')
    const [mlCompositeIndex] = await queryInterface.sequelize.query(`
      SHOW INDEX FROM market_listings
      WHERE Key_name = 'uk_market_listings_seller_business'
    `)
    if (mlCompositeIndex.length > 0) {
      await queryInterface.removeIndex('market_listings', 'uk_market_listings_seller_business')
      console.log('  ✅ 已删除旧联合索引: uk_market_listings_seller_business')

      await queryInterface.addIndex('market_listings', {
        fields: ['seller_user_id', 'idempotency_key'],
        unique: true,
        name: 'uk_market_listings_seller_idempotency'
      })
      console.log('  ✅ 已创建新联合索引: uk_market_listings_seller_idempotency')
    }

    // 验证最终结果
    console.log('\n=== 验证迁移结果 ===')
    for (const table of tables) {
      const [newCol] = await queryInterface.sequelize.query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = '${table.name}'
          AND COLUMN_NAME = 'idempotency_key'
      `)

      const [oldCol] = await queryInterface.sequelize.query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = '${table.name}'
          AND COLUMN_NAME = 'business_id'
      `)

      if (newCol.length > 0 && oldCol.length === 0) {
        console.log(`  ✅ ${table.name}: idempotency_key 存在, business_id 已删除`)
      } else {
        console.log(`  ❌ ${table.name}: 迁移验证失败`)
      }
    }

    console.log('\n✅ 业界标准形态字段重命名迁移完成')
  },

  /**
   * 回滚迁移：将 idempotency_key 重命名回 business_id
   */
  async down(queryInterface, Sequelize) {
    console.log('回滚迁移：将 idempotency_key 重命名回 business_id...')

    const tables = [
      {
        name: 'consumption_records',
        oldIndexName: 'uk_consumption_records_idempotency_key',
        newIndexName: 'uk_consumption_records_business_id'
      },
      {
        name: 'exchange_records',
        oldIndexName: 'uk_exchange_records_idempotency_key',
        newIndexName: 'idx_business_id_unique'
      },
      {
        name: 'market_listings',
        oldIndexName: 'uk_market_listings_idempotency_key',
        newIndexName: 'uk_market_listings_business_id'
      },
      {
        name: 'trade_orders',
        oldIndexName: 'uk_trade_orders_idempotency_key',
        newIndexName: 'business_id'
      },
      {
        name: 'trade_records',
        oldIndexName: 'uk_trade_records_idempotency_key',
        newIndexName: 'uk_trade_records_business_id'
      },
      {
        name: 'lottery_draws',
        oldIndexName: 'uk_lottery_draws_idempotency_key',
        newIndexName: 'uk_lottery_draws_business_id'
      },
      {
        name: 'admin_operation_logs',
        oldIndexName: 'uk_admin_operation_logs_idempotency_key',
        newIndexName: 'business_id'
      }
    ]

    for (const table of tables) {
      console.log(`\n=== 回滚表: ${table.name} ===`)

      // 检查 idempotency_key 字段是否存在
      const [columns] = await queryInterface.sequelize.query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = '${table.name}'
          AND COLUMN_NAME = 'idempotency_key'
      `)

      if (columns.length === 0) {
        console.log(`  ⚠️ 表 ${table.name} 没有 idempotency_key 字段，跳过`)
        continue
      }

      // 删除新索引
      const [newIndex] = await queryInterface.sequelize.query(`
        SHOW INDEX FROM ${table.name}
        WHERE Key_name = '${table.oldIndexName}'
      `)
      if (newIndex.length > 0) {
        await queryInterface.removeIndex(table.name, table.oldIndexName)
        console.log(`  ✅ 已删除索引: ${table.oldIndexName}`)
      }

      // 重命名字段回 business_id
      await queryInterface.renameColumn(table.name, 'idempotency_key', 'business_id')
      console.log(`  ✅ 已重命名字段: idempotency_key -> business_id`)

      // 添加旧索引
      await queryInterface.addIndex(table.name, {
        fields: ['business_id'],
        unique: true,
        name: table.newIndexName
      })
      console.log(`  ✅ 已创建索引: ${table.newIndexName}`)
    }

    // 恢复 market_listings 联合索引
    console.log('\n=== 恢复 market_listings 联合索引 ===')
    const [mlCompositeIndex] = await queryInterface.sequelize.query(`
      SHOW INDEX FROM market_listings
      WHERE Key_name = 'uk_market_listings_seller_idempotency'
    `)
    if (mlCompositeIndex.length > 0) {
      await queryInterface.removeIndex('market_listings', 'uk_market_listings_seller_idempotency')
      await queryInterface.addIndex('market_listings', {
        fields: ['seller_user_id', 'business_id'],
        unique: true,
        name: 'uk_market_listings_seller_business'
      })
      console.log('  ✅ 已恢复联合索引: uk_market_listings_seller_business')
    }

    console.log('\n✅ 回滚完成')
  }
}
