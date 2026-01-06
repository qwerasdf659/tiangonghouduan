#!/usr/bin/env node
/**
 * 手机号 Hash 查询工具（决策24）
 *
 * @description 用于运维排查场景，根据手机号查询其 Redis 缓存 Key
 * @version 1.0.0
 * @date 2026-01-05
 *
 * 用途：
 * - 排查用户缓存问题
 * - 验证 PII Hash 算法一致性
 * - 运维调试时查找特定用户的缓存 Key
 *
 * 安全措施：
 * - 不输出完整手机号到日志
 * - 需要 PII_HASH_SECRET 环境变量
 * - 仅供运维人员本地使用
 *
 * 使用方法：
 *   node scripts/toolkit/mobile-hash-lookup.js <手机号>
 *   node scripts/toolkit/mobile-hash-lookup.js <手机号> --check-redis
 *
 * 选项：
 *   --check-redis  检查 Redis 中是否存在该 Key
 *   --help, -h     显示帮助信息
 */

require('dotenv').config()
const crypto = require('crypto')

/**
 * 手机号 HMAC-SHA256 Hash（与 BusinessCacheHelper 保持一致）
 *
 * @param {string} mobile - 用户手机号
 * @param {string} secret - PII Hash 密钥
 * @returns {string} 64字符 hex 字符串
 */
function hashMobile(mobile, secret) {
  return crypto.createHmac('sha256', secret).update(mobile).digest('hex')
}

/**
 * 环境归一化（与 BusinessCacheHelper 保持一致）
 */
const ENV_MAP = {
  development: 'dev',
  dev: 'dev',
  local: 'dev',
  staging: 'staging',
  test: 'staging',
  uat: 'staging',
  production: 'prod',
  prod: 'prod'
}

function normalizeEnv(env) {
  return ENV_MAP[env] || 'dev'
}

/**
 * 构建用户缓存 Key（与 BusinessCacheHelper 保持一致）
 *
 * @param {string} mobileHash - 手机号 Hash
 * @returns {string} Redis Key
 */
function buildUserMobileKey(mobileHash) {
  const env = normalizeEnv(process.env.NODE_ENV)
  return `app:v4:${env}:api:user:mobile_hash:${mobileHash}`
}

/**
 * 检查 Redis 中是否存在该 Key
 *
 * @param {string} key - Redis Key
 * @returns {Promise<Object|null>} 缓存数据或 null
 */
async function checkRedisKey(key) {
  try {
    const { getRawClient } = require('../../utils/UnifiedRedisClient')
    const redis = getRawClient()

    const exists = await redis.exists(key)
    if (!exists) {
      return { exists: false, data: null, ttl: -1 }
    }

    const data = await redis.get(key)
    const ttl = await redis.ttl(key)

    return {
      exists: true,
      data: data ? JSON.parse(data) : null,
      ttl
    }
  } catch (error) {
    return { exists: false, error: error.message }
  }
}

/**
 * 脱敏手机号
 *
 * @param {string} mobile - 手机号
 * @returns {string} 脱敏后的手机号
 */
function maskMobile(mobile) {
  if (!mobile || mobile.length < 7) return '***'
  return mobile.substring(0, 3) + '****' + mobile.substring(7)
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2)
  const showHelp = args.includes('--help') || args.includes('-h')
  const checkRedis = args.includes('--check-redis')

  if (showHelp) {
    console.log(`
手机号 Hash 查询工具（决策24）

用法：
  node scripts/toolkit/mobile-hash-lookup.js <手机号> [选项]

选项：
  --check-redis   检查 Redis 中是否存在该 Key 及其 TTL
  --help, -h      显示此帮助信息

示例：
  # 仅查看 Hash 值和 Key
  node scripts/toolkit/mobile-hash-lookup.js 13612227930

  # 查看 Hash 并检查 Redis 缓存状态
  node scripts/toolkit/mobile-hash-lookup.js 13612227930 --check-redis

输出信息：
  - 手机号 Hash 值（64字符 hex）
  - 完整 Redis Key（含命名空间前缀）
  - 可选：Redis 缓存状态（是否存在、TTL）

安全说明：
  - 此工具不会在日志中输出完整手机号
  - 需要 PII_HASH_SECRET 环境变量
  - 仅供运维人员本地使用
    `)
    return
  }

  // 提取手机号参数
  const mobile = args.find(arg => !arg.startsWith('--'))

  if (!mobile) {
    console.error('错误：请提供手机号参数')
    console.error('用法：node scripts/toolkit/mobile-hash-lookup.js <手机号>')
    process.exit(1)
  }

  // 验证手机号格式
  if (!/^1[3-9]\d{9}$/.test(mobile)) {
    console.error('错误：手机号格式不正确（应为11位中国大陆手机号）')
    process.exit(1)
  }

  // 检查 PII_HASH_SECRET
  const secret = process.env.PII_HASH_SECRET
  if (!secret) {
    console.error('错误：PII_HASH_SECRET 环境变量未配置')
    console.error('请在 .env 文件中配置 PII_HASH_SECRET')
    console.error('可使用 node scripts/generate-pii-hash-secret.js 生成')
    process.exit(1)
  }

  console.log('')
  console.log('='.repeat(60))
  console.log(' 手机号 Hash 查询工具')
  console.log('='.repeat(60))
  console.log('')
  console.log(`手机号（脱敏）：${maskMobile(mobile)}`)
  console.log(
    `当前环境：${process.env.NODE_ENV || 'development'} → ${normalizeEnv(process.env.NODE_ENV)}`
  )
  console.log('')

  // 计算 Hash
  const mobileHash = hashMobile(mobile, secret)
  const redisKey = buildUserMobileKey(mobileHash)

  console.log('-'.repeat(60))
  console.log('Hash 结果：')
  console.log('-'.repeat(60))
  console.log(`HMAC-SHA256 Hash: ${mobileHash}`)
  console.log(`Redis Key: ${redisKey}`)
  console.log('')

  // 可选：检查 Redis 缓存
  if (checkRedis) {
    console.log('-'.repeat(60))
    console.log('Redis 缓存状态：')
    console.log('-'.repeat(60))

    const result = await checkRedisKey(redisKey)

    if (result.error) {
      console.log(`状态：检查失败`)
      console.log(`错误：${result.error}`)
    } else if (result.exists) {
      console.log(`状态：存在`)
      console.log(`TTL：${result.ttl} 秒`)
      console.log(`数据：`)
      // 输出时隐藏敏感字段
      if (result.data) {
        const safeData = { ...result.data }
        if (safeData.mobile) {
          safeData.mobile = maskMobile(safeData.mobile)
        }
        console.log(JSON.stringify(safeData, null, 2))
      } else {
        console.log('  (无数据)')
      }
    } else {
      console.log(`状态：不存在（未缓存或已过期）`)
    }
    console.log('')

    // 关闭 Redis 连接
    try {
      const { getRawClient } = require('../../utils/UnifiedRedisClient')
      const redis = getRawClient()
      await redis.quit()
    } catch (e) {
      // 忽略关闭错误
    }
  }

  console.log('='.repeat(60))
  console.log('')
}

// 执行主函数
main().catch(error => {
  console.error('执行错误:', error.message)
  process.exit(1)
})
