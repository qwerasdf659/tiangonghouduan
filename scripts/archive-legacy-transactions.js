#!/usr/bin/env node

/**
 * @file 旧材料和钻石流水归档脚本（Phase 4）
 * @description 将旧的材料流水和钻石流水归档到历史表或导出到备份文件
 *
 * 使用方法：
 * 1. 仅统计（不执行归档）：node scripts/archive-legacy-transactions.js --dry-run
 * 2. 归档到历史表：node scripts/archive-legacy-transactions.js --mode=archive
 * 3. 导出到文件：node scripts/archive-legacy-transactions.js --mode=export --output=./backups/legacy_transactions_2025.json
 *
 * 参数说明：
 * --dry-run: 仅统计数据，不执行实际归档
 * --mode: 归档模式，archive（归档到历史表）或 export（导出到文件）
 * --output: 导出文件路径（mode=export时必填）
 * --before-date: 归档指定日期之前的数据（格式：YYYY-MM-DD），默认不限制
 * --batch-size: 批量处理数量，默认 1000
 */

const path = require('path')
const fs = require('fs').promises
require('dotenv').config()

const { sequelize } = require('../models')

// 简化日志输出，不依赖Logger模块
const logger = {
  info: (msg, data) => console.log(`[INFO] ${msg}`, data || ''),
  error: (msg, data) => console.error(`[ERROR] ${msg}`, data || '')
}

// 简化时间处理，不依赖BeijingTimeHelper
const formatTime = date => {
  return new Date(date).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
}

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    dryRun: false,
    mode: 'archive', // archive 或 export
    output: null,
    beforeDate: null,
    batchSize: 1000
  }

  args.forEach(arg => {
    if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg.startsWith('--mode=')) {
      options.mode = arg.split('=')[1]
    } else if (arg.startsWith('--output=')) {
      options.output = arg.split('=')[1]
    } else if (arg.startsWith('--before-date=')) {
      options.beforeDate = arg.split('=')[1]
    } else if (arg.startsWith('--batch-size=')) {
      options.batchSize = parseInt(arg.split('=')[1])
    }
  })

  return options
}

// 验证参数
function validateOptions(options) {
  if (!['archive', 'export'].includes(options.mode)) {
    throw new Error('--mode 必须是 archive 或 export')
  }

  if (options.mode === 'export' && !options.output) {
    throw new Error('--mode=export 时必须指定 --output 参数')
  }

  if (options.beforeDate && !/^\d{4}-\d{2}-\d{2}$/.test(options.beforeDate)) {
    throw new Error('--before-date 格式必须是 YYYY-MM-DD')
  }

  if (options.batchSize < 1 || options.batchSize > 10000) {
    throw new Error('--batch-size 必须在 1-10000 之间')
  }
}

// 统计旧流水数据
async function statisticsLegacyTransactions(beforeDate) {
  const stats = {
    material_transactions: 0,
    diamond_transactions: 0,
    earliest_material: null,
    latest_material: null,
    earliest_diamond: null,
    latest_diamond: null
  }

  // 构建查询条件
  const whereClause = beforeDate ? { created_at: { [sequelize.Sequelize.Op.lt]: beforeDate } } : {}

  // 统计材料流水
  const [materialStats] = await sequelize.query(
    `
    SELECT 
      COUNT(*) as total,
      MIN(created_at) as earliest,
      MAX(created_at) as latest
    FROM material_transactions
    ${beforeDate ? 'WHERE created_at < :beforeDate' : ''}
  `,
    {
      replacements: { beforeDate },
      type: sequelize.QueryTypes.SELECT
    }
  )

  stats.material_transactions = parseInt(materialStats.total)
  stats.earliest_material = materialStats.earliest
  stats.latest_material = materialStats.latest

  // 统计钻石流水
  const [diamondStats] = await sequelize.query(
    `
    SELECT 
      COUNT(*) as total,
      MIN(created_at) as earliest,
      MAX(created_at) as latest
    FROM diamond_transactions
    ${beforeDate ? 'WHERE created_at < :beforeDate' : ''}
  `,
    {
      replacements: { beforeDate },
      type: sequelize.QueryTypes.SELECT
    }
  )

  stats.diamond_transactions = parseInt(diamondStats.total)
  stats.earliest_diamond = diamondStats.earliest
  stats.latest_diamond = diamondStats.latest

  return stats
}

// 归档到历史表
async function archiveToHistoryTables(beforeDate, batchSize) {
  logger.info('开始归档到历史表...', { beforeDate, batchSize })

  const transaction = await sequelize.transaction()

  try {
    // 1. 创建历史表（如果不存在）
    await sequelize.query(
      `
      CREATE TABLE IF NOT EXISTS material_transactions_history LIKE material_transactions
    `,
      { transaction }
    )

    await sequelize.query(
      `
      CREATE TABLE IF NOT EXISTS diamond_transactions_history LIKE diamond_transactions
    `,
      { transaction }
    )

    logger.info('历史表已准备完成')

    // 2. 归档材料流水
    const materialWhereClause = beforeDate ? `WHERE created_at < '${beforeDate}'` : ''
    const [materialResult] = await sequelize.query(
      `
      INSERT INTO material_transactions_history
      SELECT * FROM material_transactions
      ${materialWhereClause}
      LIMIT ${batchSize}
    `,
      { transaction }
    )

    const materialArchived = materialResult.affectedRows || 0
    logger.info(`材料流水归档完成`, { archived: materialArchived })

    // 3. 归档钻石流水
    const diamondWhereClause = beforeDate ? `WHERE created_at < '${beforeDate}'` : ''
    const [diamondResult] = await sequelize.query(
      `
      INSERT INTO diamond_transactions_history
      SELECT * FROM diamond_transactions
      ${diamondWhereClause}
      LIMIT ${batchSize}
    `,
      { transaction }
    )

    const diamondArchived = diamondResult.affectedRows || 0
    logger.info(`钻石流水归档完成`, { archived: diamondArchived })

    // 4. 删除已归档的数据（可选，根据业务需求决定）
    // 注意：由于表已设置为只读，此步骤会失败，需要在归档前临时授予权限
    // await sequelize.query(`
    //   DELETE FROM material_transactions ${materialWhereClause} LIMIT ${batchSize}
    // `, { transaction })
    // await sequelize.query(`
    //   DELETE FROM diamond_transactions ${diamondWhereClause} LIMIT ${batchSize}
    // `, { transaction })

    await transaction.commit()

    return {
      material_archived: materialArchived,
      diamond_archived: diamondArchived
    }
  } catch (error) {
    await transaction.rollback()
    throw error
  }
}

// 导出到文件
async function exportToFile(beforeDate, outputPath, batchSize) {
  logger.info('开始导出到文件...', { beforeDate, outputPath, batchSize })

  // 构建查询条件
  const materialWhereClause = beforeDate ? `WHERE created_at < '${beforeDate}'` : ''
  const diamondWhereClause = beforeDate ? `WHERE created_at < '${beforeDate}'` : ''

  // 查询材料流水
  const materialTransactions = await sequelize.query(
    `
    SELECT * FROM material_transactions
    ${materialWhereClause}
    ORDER BY created_at ASC
    LIMIT ${batchSize}
  `,
    {
      type: sequelize.QueryTypes.SELECT
    }
  )

  // 查询钻石流水
  const diamondTransactions = await sequelize.query(
    `
    SELECT * FROM diamond_transactions
    ${diamondWhereClause}
    ORDER BY created_at ASC
    LIMIT ${batchSize}
  `,
    {
      type: sequelize.QueryTypes.SELECT
    }
  )

  // 构建导出数据
  const exportData = {
    export_info: {
      exported_at: formatTime(new Date()),
      before_date: beforeDate || '全部数据',
      batch_size: batchSize,
      total_material_transactions: materialTransactions.length,
      total_diamond_transactions: diamondTransactions.length
    },
    material_transactions: materialTransactions,
    diamond_transactions: diamondTransactions
  }

  // 确保输出目录存在
  const outputDir = path.dirname(outputPath)
  await fs.mkdir(outputDir, { recursive: true })

  // 写入文件
  await fs.writeFile(outputPath, JSON.stringify(exportData, null, 2), 'utf8')

  logger.info('导出到文件完成', {
    outputPath,
    material_count: materialTransactions.length,
    diamond_count: diamondTransactions.length
  })

  return {
    material_exported: materialTransactions.length,
    diamond_exported: diamondTransactions.length,
    output_path: outputPath
  }
}

// 主函数
async function main() {
  try {
    const options = parseArgs()

    logger.info('========================================')
    logger.info('旧材料和钻石流水归档脚本（Phase 4）')
    logger.info('========================================')
    logger.info('执行参数:', options)

    // 验证参数
    validateOptions(options)

    // 1. 统计数据
    logger.info('正在统计旧流水数据...')
    const stats = await statisticsLegacyTransactions(options.beforeDate)

    logger.info('========================================')
    logger.info('旧流水数据统计结果:')
    logger.info('========================================')
    logger.info(`📊 材料流水总数: ${stats.material_transactions}`)
    if (stats.earliest_material) {
      logger.info(`   最早记录: ${formatTime(stats.earliest_material)}`)
      logger.info(`   最晚记录: ${formatTime(stats.latest_material)}`)
    }
    logger.info(`📊 钻石流水总数: ${stats.diamond_transactions}`)
    if (stats.earliest_diamond) {
      logger.info(`   最早记录: ${formatTime(stats.earliest_diamond)}`)
      logger.info(`   最晚记录: ${formatTime(stats.latest_diamond)}`)
    }
    logger.info('========================================')

    // 2. 如果是dry-run，则只统计不执行
    if (options.dryRun) {
      logger.info('✅ Dry-run 模式，仅统计数据，不执行归档操作')
      process.exit(0)
    }

    // 3. 执行归档或导出
    if (stats.material_transactions === 0 && stats.diamond_transactions === 0) {
      logger.info('⚠️ 没有需要归档的数据')
      process.exit(0)
    }

    let result
    if (options.mode === 'archive') {
      logger.info('⚠️ 注意: 归档到历史表模式需要数据库写权限')
      logger.info('⚠️ 由于旧表已设置为只读，此操作可能失败')
      logger.info('⚠️ 请确保在执行归档前临时授予写权限或使用 export 模式')
      result = await archiveToHistoryTables(options.beforeDate, options.batchSize)

      logger.info('========================================')
      logger.info('归档到历史表完成:')
      logger.info(`✅ 材料流水归档: ${result.material_archived} 条`)
      logger.info(`✅ 钻石流水归档: ${result.diamond_archived} 条`)
      logger.info('========================================')
    } else if (options.mode === 'export') {
      result = await exportToFile(options.beforeDate, options.output, options.batchSize)

      logger.info('========================================')
      logger.info('导出到文件完成:')
      logger.info(`✅ 材料流水导出: ${result.material_exported} 条`)
      logger.info(`✅ 钻石流水导出: ${result.diamond_exported} 条`)
      logger.info(`✅ 输出文件: ${result.output_path}`)
      logger.info('========================================')
    }

    logger.info('✅ 历史流水归档任务完成')
    process.exit(0)
  } catch (error) {
    logger.error('❌ 归档脚本执行失败', {
      error: error.message,
      stack: error.stack
    })
    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

// 执行主函数
if (require.main === module) {
  main()
}

module.exports = { statisticsLegacyTransactions, archiveToHistoryTables, exportToFile }
