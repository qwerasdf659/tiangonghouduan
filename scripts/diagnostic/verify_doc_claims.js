/**
 * 验证文档声称内容是否与真实数据库一致
 * 用于验证 docs/慢查询与索引优化诊断报告-2026-01-02.md
 */

require('dotenv').config()
const { Sequelize, QueryTypes } = require('sequelize')

const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  dialect: 'mysql',
  logging: false
})

async function verifyAll() {
  const report = {
    timestamp: new Date().toISOString(),
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    sections: {}
  }

  try {
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 1. 验证 MySQL 配置现状
    console.log('='.repeat(60))
    console.log('【1】MySQL 配置现状验证')
    console.log('='.repeat(60))

    const configVars = await sequelize.query(
      `
      SHOW VARIABLES WHERE Variable_name IN (
        'slow_query_log', 'long_query_time', 'log_queries_not_using_indexes',
        'performance_schema', 'time_zone', 'system_time_zone', 'version'
      )
    `,
      { type: QueryTypes.SELECT }
    )

    const configMap = {}
    configVars.forEach(row => {
      configMap[row.Variable_name] = row.Value
    })

    console.log('\n当前 MySQL 配置:')
    console.log(JSON.stringify(configMap, null, 2))

    // 对比文档声称
    const docClaims = {
      slow_query_log: 'OFF',
      long_query_time: '10.000000',
      log_queries_not_using_indexes: 'OFF',
      performance_schema: 'OFF'
    }

    console.log('\n文档声称 vs 实际值:')
    for (const [key, docValue] of Object.entries(docClaims)) {
      const actualValue = configMap[key]
      const match = actualValue === docValue
      console.log(
        `  ${key}: 文档="${docValue}" 实际="${actualValue}" ${match ? '✅' : '❌ 不一致'}`
      )
    }

    report.sections.mysqlConfig = { docClaims, actual: configMap }

    // 2. 验证全局统计
    console.log('\n' + '='.repeat(60))
    console.log('【2】全局统计验证')
    console.log('='.repeat(60))

    const globalStats = await sequelize.query(
      `
      SHOW GLOBAL STATUS WHERE Variable_name IN ('Slow_queries', 'Questions', 'Queries')
    `,
      { type: QueryTypes.SELECT }
    )

    const statsMap = {}
    globalStats.forEach(row => {
      statsMap[row.Variable_name] = row.Value
    })

    console.log('\n当前全局统计:')
    console.log(JSON.stringify(statsMap, null, 2))

    report.sections.globalStats = statsMap

    // 3. 验证表记录数
    console.log('\n' + '='.repeat(60))
    console.log('【3】表记录数验证')
    console.log('='.repeat(60))

    const tables = [
      'users',
      'lottery_draws',
      'lottery_prizes',
      'item_instances',
      'redemption_orders',
      'asset_transactions',
      'account_asset_balances',
      'admin_operation_logs',
      'roles',
      'user_roles',
      'market_listings',
      'trade_orders'
    ]

    const docTableCounts = {
      users: 22,
      lottery_draws: 2840,
      lottery_prizes: 9,
      item_instances: 1150,
      redemption_orders: 373,
      asset_transactions: 175,
      account_asset_balances: 11,
      admin_operation_logs: 1002,
      roles: 6,
      user_roles: 13,
      market_listings: 1,
      trade_orders: 0
    }

    console.log('\n表记录数 (文档声称 vs 实际):')
    const tableCounts = {}
    for (const table of tables) {
      try {
        const [result] = await sequelize.query(`SELECT COUNT(*) as cnt FROM ${table}`, {
          type: QueryTypes.SELECT
        })
        const actualCount = parseInt(result.cnt)
        const docCount = docTableCounts[table]
        tableCounts[table] = actualCount
        const match = actualCount === docCount
        const diff = actualCount - docCount
        console.log(
          `  ${table}: 文档=${docCount} 实际=${actualCount} ${match ? '✅' : `❌ 差异=${diff > 0 ? '+' : ''}${diff}`}`
        )
      } catch (e) {
        console.log(`  ${table}: ❌ 查询失败 - ${e.message}`)
        tableCounts[table] = 'ERROR'
      }
    }

    report.sections.tableCounts = { docClaims: docTableCounts, actual: tableCounts }

    // 4. 验证索引现状
    console.log('\n' + '='.repeat(60))
    console.log('【4】索引现状验证')
    console.log('='.repeat(60))

    // 4.1 roles 表索引 - 文档声称有 8 个索引（6 个冗余）
    console.log('\n【4.1】roles 表索引:')
    const rolesIndexes = await sequelize.query(
      `
      SELECT INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as columns
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'roles'
      GROUP BY INDEX_NAME, NON_UNIQUE
      ORDER BY INDEX_NAME
    `,
      { replacements: [process.env.DB_NAME], type: QueryTypes.SELECT }
    )

    console.log('  实际索引列表:')
    rolesIndexes.forEach(idx => {
      console.log(`    - ${idx.INDEX_NAME} (unique=${idx.NON_UNIQUE === 0}) -> [${idx.columns}]`)
    })
    console.log(`  索引总数: ${rolesIndexes.length} (文档声称: 8 个, 其中 6 个冗余)`)

    // 检查 role_name 列有多少个索引
    const roleNameIndexes = rolesIndexes.filter(idx => idx.columns === 'role_name')
    const roleUuidIndexes = rolesIndexes.filter(idx => idx.columns === 'role_uuid')
    console.log(`  role_name 列索引数: ${roleNameIndexes.length} (文档声称: 4 个)`)
    console.log(`  role_uuid 列索引数: ${roleUuidIndexes.length} (文档声称: 4 个)`)

    report.sections.rolesIndexes = { count: rolesIndexes.length, indexes: rolesIndexes }

    // 4.2 admin_operation_logs 表索引
    console.log('\n【4.2】admin_operation_logs 表索引:')
    const adminLogsIndexes = await sequelize.query(
      `
      SELECT INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as columns
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'admin_operation_logs'
      GROUP BY INDEX_NAME, NON_UNIQUE
      ORDER BY INDEX_NAME
    `,
      { replacements: [process.env.DB_NAME], type: QueryTypes.SELECT }
    )

    console.log('  实际索引列表:')
    adminLogsIndexes.forEach(idx => {
      console.log(`    - ${idx.INDEX_NAME} (unique=${idx.NON_UNIQUE === 0}) -> [${idx.columns}]`)
    })

    const idempotencyKeyIndexes = adminLogsIndexes.filter(idx => idx.columns === 'idempotency_key')
    console.log(`  idempotency_key 列索引数: ${idempotencyKeyIndexes.length} (文档声称: 3 个)`)

    report.sections.adminLogsIndexes = { count: adminLogsIndexes.length, indexes: adminLogsIndexes }

    // 4.3 asset_transactions 表索引
    console.log('\n【4.3】asset_transactions 表索引:')
    const assetTxIndexes = await sequelize.query(
      `
      SELECT INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as columns
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'asset_transactions'
      GROUP BY INDEX_NAME, NON_UNIQUE
      ORDER BY INDEX_NAME
    `,
      { replacements: [process.env.DB_NAME], type: QueryTypes.SELECT }
    )

    console.log('  实际索引列表:')
    assetTxIndexes.forEach(idx => {
      console.log(`    - ${idx.INDEX_NAME} (unique=${idx.NON_UNIQUE === 0}) -> [${idx.columns}]`)
    })

    const assetIdempotencyIndexes = assetTxIndexes.filter(idx => idx.columns === 'idempotency_key')
    console.log(`  idempotency_key 列索引数: ${assetIdempotencyIndexes.length} (文档声称: 2 个)`)

    report.sections.assetTxIndexes = { count: assetTxIndexes.length, indexes: assetTxIndexes }

    // 4.4 item_instances 表索引
    console.log('\n【4.4】item_instances 表索引:')
    const itemInstancesIndexes = await sequelize.query(
      `
      SELECT INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as columns
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'item_instances'
      GROUP BY INDEX_NAME, NON_UNIQUE
      ORDER BY INDEX_NAME
    `,
      { replacements: [process.env.DB_NAME], type: QueryTypes.SELECT }
    )

    console.log('  实际索引列表:')
    itemInstancesIndexes.forEach(idx => {
      console.log(`    - ${idx.INDEX_NAME} (unique=${idx.NON_UNIQUE === 0}) -> [${idx.columns}]`)
    })

    // 检查是否存在文档声称要新增的复合索引
    const hasOwnerStatusCreated = itemInstancesIndexes.some(
      idx =>
        idx.columns.includes('owner_user_id') &&
        idx.columns.includes('status') &&
        idx.columns.includes('created_at')
    )
    console.log(
      `  是否存在 (owner_user_id, status, created_at) 复合索引: ${hasOwnerStatusCreated ? '✅ 已存在' : '❌ 不存在 (文档声称需要新增)'}`
    )

    report.sections.itemInstancesIndexes = {
      count: itemInstancesIndexes.length,
      indexes: itemInstancesIndexes,
      hasOwnerStatusCreated
    }

    // 4.5 lottery_draws 表索引
    console.log('\n【4.5】lottery_draws 表索引:')
    const lotteryDrawsIndexes = await sequelize.query(
      `
      SELECT INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as columns
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'lottery_draws'
      GROUP BY INDEX_NAME, NON_UNIQUE
      ORDER BY INDEX_NAME
    `,
      { replacements: [process.env.DB_NAME], type: QueryTypes.SELECT }
    )

    console.log('  实际索引列表:')
    lotteryDrawsIndexes.forEach(idx => {
      console.log(`    - ${idx.INDEX_NAME} (unique=${idx.NON_UNIQUE === 0}) -> [${idx.columns}]`)
    })

    // 检查是否存在文档声称要新增的复合索引
    const hasUserRewardCreated = lotteryDrawsIndexes.some(
      idx =>
        idx.columns.includes('user_id') &&
        idx.columns.includes('reward_tier') &&
        idx.columns.includes('created_at')
    )
    console.log(
      `  是否存在 (user_id, reward_tier, created_at) 复合索引: ${hasUserRewardCreated ? '✅ 已存在' : '❌ 不存在 (文档声称需要新增)'}`
    )

    report.sections.lotteryDrawsIndexes = {
      count: lotteryDrawsIndexes.length,
      indexes: lotteryDrawsIndexes,
      hasUserRewardCreated
    }

    // 4.6 redemption_orders 表索引
    console.log('\n【4.6】redemption_orders 表索引:')
    const redemptionOrdersIndexes = await sequelize.query(
      `
      SELECT INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as columns
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'redemption_orders'
      GROUP BY INDEX_NAME, NON_UNIQUE
      ORDER BY INDEX_NAME
    `,
      { replacements: [process.env.DB_NAME], type: QueryTypes.SELECT }
    )

    console.log('  实际索引列表:')
    redemptionOrdersIndexes.forEach(idx => {
      console.log(`    - ${idx.INDEX_NAME} (unique=${idx.NON_UNIQUE === 0}) -> [${idx.columns}]`)
    })

    // 检查是否存在文档声称要新增的复合索引
    const hasItemStatus = redemptionOrdersIndexes.some(
      idx => idx.columns.includes('item_instance_id') && idx.columns.includes('status')
    )
    console.log(
      `  是否存在 (item_instance_id, status) 复合索引: ${hasItemStatus ? '✅ 已存在' : '❌ 不存在 (文档声称需要新增)'}`
    )

    report.sections.redemptionOrdersIndexes = {
      count: redemptionOrdersIndexes.length,
      indexes: redemptionOrdersIndexes,
      hasItemStatus
    }

    // 5. 验证 EXPLAIN 执行计划
    console.log('\n' + '='.repeat(60))
    console.log('【5】EXPLAIN 执行计划验证')
    console.log('='.repeat(60))

    // 5.1 背包查询
    console.log('\n【5.1】背包查询 EXPLAIN:')
    try {
      const explainBackpack = await sequelize.query(
        `
        EXPLAIN SELECT * FROM item_instances
        WHERE owner_user_id = 31 AND status = 'available'
        ORDER BY created_at DESC
      `,
        { type: QueryTypes.SELECT }
      )
      console.log('  ' + JSON.stringify(explainBackpack[0], null, 2).replace(/\n/g, '\n  '))
      console.log(`  使用索引: ${explainBackpack[0].key || '无'}`)
      console.log(
        `  是否有 filesort: ${explainBackpack[0].Extra?.includes('filesort') ? '❌ 是 (需要优化)' : '✅ 否'}`
      )
      report.sections.explainBackpack = explainBackpack[0]
    } catch (e) {
      console.log(`  ❌ 查询失败: ${e.message}`)
    }

    // 5.2 抽奖统计查询
    console.log('\n【5.2】抽奖统计查询 EXPLAIN:')
    try {
      const explainLottery = await sequelize.query(
        `
        EXPLAIN SELECT * FROM lottery_draws
        WHERE user_id = 31 AND reward_tier = 'low'
        ORDER BY created_at DESC LIMIT 1
      `,
        { type: QueryTypes.SELECT }
      )
      console.log('  ' + JSON.stringify(explainLottery[0], null, 2).replace(/\n/g, '\n  '))
      console.log(`  使用索引: ${explainLottery[0].key || '无'}`)
      console.log(
        `  是否有 filesort: ${explainLottery[0].Extra?.includes('filesort') ? '❌ 是 (需要优化)' : '✅ 否'}`
      )
      report.sections.explainLottery = explainLottery[0]
    } catch (e) {
      console.log(`  ❌ 查询失败: ${e.message}`)
    }

    // 5.3 核销码查询
    console.log('\n【5.3】核销码查询 EXPLAIN:')
    try {
      const explainRedemption = await sequelize.query(
        `
        EXPLAIN SELECT item_instance_id FROM redemption_orders
        WHERE item_instance_id IN (1, 2, 3, 4, 5) AND status = 'pending'
      `,
        { type: QueryTypes.SELECT }
      )
      console.log('  ' + JSON.stringify(explainRedemption[0], null, 2).replace(/\n/g, '\n  '))
      console.log(`  使用索引: ${explainRedemption[0].key || '无'}`)
      console.log(`  过滤比例: ${explainRedemption[0].filtered}% (100% 为最优)`)
      report.sections.explainRedemption = explainRedemption[0]
    } catch (e) {
      console.log(`  ❌ 查询失败: ${e.message}`)
    }

    // 6. 检查是否已有 migration 文件
    console.log('\n' + '='.repeat(60))
    console.log('【6】Migration 文件检查')
    console.log('='.repeat(60))

    const fs = require('fs')
    const path = require('path')
    const migrationsDir = path.join(__dirname, '../../migrations')

    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir)
      const indexMigrations = files.filter(
        f => f.includes('index') || f.includes('composite') || f.includes('cleanup')
      )
      console.log(`\n  迁移目录: ${migrationsDir}`)
      console.log(`  总迁移文件数: ${files.length}`)
      console.log(`  索引相关迁移文件:`)
      if (indexMigrations.length > 0) {
        indexMigrations.forEach(f => console.log(`    - ${f}`))
      } else {
        console.log(`    (无)`)
      }
      report.sections.migrations = { total: files.length, indexRelated: indexMigrations }
    } else {
      console.log(`  ❌ 迁移目录不存在: ${migrationsDir}`)
    }

    // 7. 总结
    console.log('\n' + '='.repeat(60))
    console.log('【总结】文档声称验证结果')
    console.log('='.repeat(60))

    const summary = {
      mysqlConfigMatch:
        configMap.slow_query_log === 'OFF' && configMap.performance_schema === 'OFF',
      tableCountsMatch: Object.keys(docTableCounts).every(
        t => tableCounts[t] === docTableCounts[t]
      ),
      rolesRedundantIndexes: roleNameIndexes.length >= 2 || roleUuidIndexes.length >= 2,
      adminLogsRedundantIndexes: idempotencyKeyIndexes.length >= 2,
      assetTxRedundantIndexes: assetIdempotencyIndexes.length >= 2,
      missingBackpackIndex: !hasOwnerStatusCreated,
      missingLotteryIndex: !hasUserRewardCreated,
      missingRedemptionIndex: !hasItemStatus
    }

    console.log('\n文档核心声称验证:')
    console.log(
      `  1. MySQL 慢查询日志/performance_schema 关闭: ${summary.mysqlConfigMatch ? '✅ 属实' : '❌ 不符'}`
    )
    console.log(
      `  2. 表记录数与文档一致: ${summary.tableCountsMatch ? '✅ 属实' : '❌ 有差异 (数据已变化)'}`
    )
    console.log(
      `  3. roles 表存在冗余索引: ${summary.rolesRedundantIndexes ? '✅ 属实' : '❌ 不符'}`
    )
    console.log(
      `  4. admin_operation_logs 存在冗余索引: ${summary.adminLogsRedundantIndexes ? '✅ 属实' : '❌ 不符'}`
    )
    console.log(
      `  5. asset_transactions 存在冗余索引: ${summary.assetTxRedundantIndexes ? '✅ 属实' : '❌ 不符'}`
    )
    console.log(
      `  6. 缺少背包查询复合索引: ${summary.missingBackpackIndex ? '✅ 属实 (确实缺少)' : '❌ 不符 (索引已存在)'}`
    )
    console.log(
      `  7. 缺少抽奖统计复合索引: ${summary.missingLotteryIndex ? '✅ 属实 (确实缺少)' : '❌ 不符 (索引已存在)'}`
    )
    console.log(
      `  8. 缺少核销码复合索引: ${summary.missingRedemptionIndex ? '✅ 属实 (确实缺少)' : '❌ 不符 (索引已存在)'}`
    )

    report.summary = summary

    console.log('\n验证完成!')
  } catch (error) {
    console.error('❌ 验证过程出错:', error)
  } finally {
    await sequelize.close()
  }
}

verifyAll()
