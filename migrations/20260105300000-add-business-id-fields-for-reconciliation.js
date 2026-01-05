/**
 * 迁移文件：添加 business_id 业务唯一键字段（事务边界治理 P1-4）
 *
 * 治理决策（2026-01-05 拍板）：
 * - idempotency_key：请求级幂等（防止同一请求重复提交）
 * - business_id：业务级幂等（防止同一业务操作从不同请求重复执行）
 *
 * 业务场景示例：
 * - 用户连续点击两次"下单"，idempotency_key 相同，第二次被拦截 ✅
 * - 用户刷新页面后重新下单，idempotency_key 不同，但 business_id 相同，第二次被拦截 ✅
 *
 * 变更内容：
 * 1. lottery_draws 添加 business_id（业务唯一键）
 * 2. consumption_records 添加 business_id（业务唯一键）
 * 3. exchange_records 添加 business_id（业务唯一键）
 * 4. trade_orders 添加 business_id（业务唯一键）
 *
 * @since 2026-01-05
 * @see docs/事务边界治理现状核查报告.md 建议9.1
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('📝 开始迁移：添加 business_id 业务唯一键字段')

    // ==================== 1. lottery_draws.business_id ====================
    console.log('\n[1/4] 处理 lottery_draws.business_id...')

    const [lotteryBizIdExists] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'lottery_draws'
        AND COLUMN_NAME = 'business_id'
    `)

    if (lotteryBizIdExists.length === 0) {
      await queryInterface.addColumn('lottery_draws', 'business_id', {
        type: Sequelize.STRING(150),
        allowNull: true, // 暂时允许 NULL（历史数据需要回填）
        comment: '业务唯一键（格式：lottery_draw_{user_id}_{session_id}_{draw_index}）',
        after: 'idempotency_key'
      })
      console.log('✅ 添加 lottery_draws.business_id 字段成功')

      // 添加唯一索引
      await queryInterface.addIndex('lottery_draws', ['business_id'], {
        name: 'uk_lottery_draws_business_id',
        unique: true
      })
      console.log('✅ 创建 uk_lottery_draws_business_id 唯一索引成功')
    } else {
      console.log('⏭️ lottery_draws.business_id 已存在，跳过')
    }

    // ==================== 2. consumption_records.business_id ====================
    console.log('\n[2/4] 处理 consumption_records.business_id...')

    const [consumptionBizIdExists] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'consumption_records'
        AND COLUMN_NAME = 'business_id'
    `)

    if (consumptionBizIdExists.length === 0) {
      await queryInterface.addColumn('consumption_records', 'business_id', {
        type: Sequelize.STRING(150),
        allowNull: true, // 暂时允许 NULL（历史数据需要回填）
        comment: '业务唯一键（格式：consumption_{merchant_id}_{timestamp}_{random}）',
        after: 'idempotency_key'
      })
      console.log('✅ 添加 consumption_records.business_id 字段成功')

      // 添加唯一索引
      await queryInterface.addIndex('consumption_records', ['business_id'], {
        name: 'uk_consumption_records_business_id',
        unique: true
      })
      console.log('✅ 创建 uk_consumption_records_business_id 唯一索引成功')
    } else {
      console.log('⏭️ consumption_records.business_id 已存在，跳过')
    }

    // ==================== 3. exchange_records.business_id ====================
    console.log('\n[3/4] 处理 exchange_records.business_id...')

    const [exchangeBizIdExists] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'exchange_records'
        AND COLUMN_NAME = 'business_id'
    `)

    if (exchangeBizIdExists.length === 0) {
      await queryInterface.addColumn('exchange_records', 'business_id', {
        type: Sequelize.STRING(150),
        allowNull: true, // 暂时允许 NULL（历史数据需要回填）
        comment: '业务唯一键（格式：exchange_{user_id}_{item_id}_{timestamp}）',
        after: 'idempotency_key'
      })
      console.log('✅ 添加 exchange_records.business_id 字段成功')

      // 添加唯一索引
      await queryInterface.addIndex('exchange_records', ['business_id'], {
        name: 'uk_exchange_records_business_id',
        unique: true
      })
      console.log('✅ 创建 uk_exchange_records_business_id 唯一索引成功')
    } else {
      console.log('⏭️ exchange_records.business_id 已存在，跳过')
    }

    // ==================== 4. trade_orders.business_id ====================
    console.log('\n[4/4] 处理 trade_orders.business_id...')

    const [tradeBizIdExists] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'trade_orders'
        AND COLUMN_NAME = 'business_id'
    `)

    if (tradeBizIdExists.length === 0) {
      await queryInterface.addColumn('trade_orders', 'business_id', {
        type: Sequelize.STRING(150),
        allowNull: true, // 暂时允许 NULL（历史数据需要回填）
        comment: '业务唯一键（格式：trade_order_{buyer_id}_{listing_id}_{timestamp}）',
        after: 'idempotency_key'
      })
      console.log('✅ 添加 trade_orders.business_id 字段成功')

      // 添加唯一索引
      await queryInterface.addIndex('trade_orders', ['business_id'], {
        name: 'uk_trade_orders_business_id',
        unique: true
      })
      console.log('✅ 创建 uk_trade_orders_business_id 唯一索引成功')
    } else {
      console.log('⏭️ trade_orders.business_id 已存在，跳过')
    }

    // ==================== 验证结果 ====================
    console.log('\n📊 验证迁移结果...')

    const tables = ['lottery_draws', 'consumption_records', 'exchange_records', 'trade_orders']
    for (const table of tables) {
      const [result] = await queryInterface.sequelize.query(`
        SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = '${table}'
          AND COLUMN_NAME = 'business_id'
      `)

      if (result.length > 0) {
        console.log(`  ✅ ${table}.business_id: 存在`)
      } else {
        console.log(`  ❌ ${table}.business_id: 缺失`)
      }
    }

    console.log('\n✅ 迁移完成：business_id 业务唯一键字段已添加')
    console.log('📌 下一步：使用 BusinessIdGenerator 生成并回填业务唯一键')
  },

  down: async (queryInterface, _Sequelize) => {
    console.log('🔄 开始回滚：移除 business_id 业务唯一键字段')

    const tables = [
      { name: 'lottery_draws', indexName: 'uk_lottery_draws_business_id' },
      { name: 'consumption_records', indexName: 'uk_consumption_records_business_id' },
      { name: 'exchange_records', indexName: 'uk_exchange_records_business_id' },
      { name: 'trade_orders', indexName: 'uk_trade_orders_business_id' }
    ]

    for (const table of tables) {
      // 检查并移除索引
      const [indexExists] = await queryInterface.sequelize.query(`
        SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = '${table.name}'
          AND INDEX_NAME = '${table.indexName}'
      `)
      if (indexExists.length > 0) {
        await queryInterface.removeIndex(table.name, table.indexName)
        console.log(`✅ 移除索引 ${table.indexName}`)
      }

      // 检查并移除字段
      const [columnExists] = await queryInterface.sequelize.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = '${table.name}'
          AND COLUMN_NAME = 'business_id'
      `)
      if (columnExists.length > 0) {
        await queryInterface.removeColumn(table.name, 'business_id')
        console.log(`✅ 移除字段 ${table.name}.business_id`)
      }
    }

    console.log('✅ 回滚完成')
  }
}
