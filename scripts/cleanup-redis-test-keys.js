#!/usr/bin/env node
/**
 * Redis 测试 Key 清理脚本
 *
 * @description 清理 Redis 中的测试数据（test:* 前缀）
 * @version 1.0.0
 * @date 2026-01-05
 *
 * 用途：
 * - 清理单元测试/性能测试遗留的 Redis 数据
 * - 符合决策报告中的清理要求
 *
 * 使用方法：
 *   node scripts/cleanup-redis-test-keys.js [--dry-run]
 *
 * 选项：
 *   --dry-run  仅统计不删除（默认执行删除）
 */

require('dotenv').config()
const { getRawClient } = require('../utils/UnifiedRedisClient')

/**
 * 清理测试 Key
 *
 * @param {boolean} dryRun - 是否仅统计不删除
 */
async function cleanupTestKeys(dryRun = false) {
  const redis = getRawClient()

  console.log('')
  console.log('='.repeat(60))
  console.log(' Redis 测试 Key 清理脚本')
  console.log('='.repeat(60))
  console.log('')
  console.log(`模式：${dryRun ? '仅统计（dry-run）' : '执行删除'}`)
  console.log('')

  // 定义要清理的 key 模式
  const patternsToClean = [
    'test:*', // 测试数据
    'benchmark:*', // 性能测试数据
    'mock:*' // Mock 数据
  ]

  let totalDeleted = 0
  let totalFound = 0

  for (const pattern of patternsToClean) {
    console.log(`-`.repeat(60))
    console.log(`扫描模式：${pattern}`)

    try {
      // 使用 SCAN 命令安全遍历（避免 KEYS 阻塞）
      let cursor = '0'
      let keysFound = []

      do {
        const [newCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
        cursor = newCursor
        keysFound = keysFound.concat(keys)
      } while (cursor !== '0')

      const count = keysFound.length
      totalFound += count

      console.log(`  找到 ${count} 个 key`)

      if (count > 0 && !dryRun) {
        // 批量删除（每次100个）
        for (let i = 0; i < keysFound.length; i += 100) {
          const batch = keysFound.slice(i, i + 100)
          await redis.del(...batch)
        }
        totalDeleted += count
        console.log(`  已删除 ${count} 个 key`)
      }
    } catch (error) {
      console.error(`  错误：${error.message}`)
    }
  }

  console.log('')
  console.log('='.repeat(60))
  console.log(' 清理结果汇总')
  console.log('='.repeat(60))
  console.log(`总计找到：${totalFound} 个 key`)
  console.log(`总计删除：${dryRun ? '0（dry-run模式）' : totalDeleted} 个 key`)
  console.log('')

  // 关闭连接
  await redis.quit()
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const showHelp = args.includes('--help') || args.includes('-h')

  if (showHelp) {
    console.log(`
Redis 测试 Key 清理脚本

用法：
  node scripts/cleanup-redis-test-keys.js [选项]

选项：
  --dry-run   仅统计不删除
  --help, -h  显示此帮助信息

清理的 key 模式：
  - test:*      测试数据
  - benchmark:* 性能测试数据
  - mock:*      Mock 数据
    `)
    return
  }

  try {
    await cleanupTestKeys(dryRun)
  } catch (error) {
    console.error('清理失败:', error.message)
    process.exit(1)
  }
}

main()
