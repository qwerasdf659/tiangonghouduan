#!/usr/bin/env node
/**
 * PII_HASH_SECRET 密钥生成工具
 *
 * @description 生成符合安全要求的 PII_HASH_SECRET 密钥
 * @version 1.0.0
 * @date 2026-01-05
 *
 * 用途：
 * - 为 PII 数据（如手机号）生成 HMAC-SHA256 哈希所需的密钥
 * - 符合决策6B/24/25的安全要求
 *
 * 安全要求：
 * - 开发环境：至少 32 字符
 * - 生产环境：至少 64 字符
 * - 必须独立于 JWT_SECRET、JWT_REFRESH_SECRET、ENCRYPTION_KEY
 *
 * 使用方法：
 *   node scripts/generate-pii-hash-secret.js [--prod]
 *
 * 选项：
 *   --prod  生成 64 字符密钥（生产环境）
 *   默认    生成 32 字符密钥（开发环境）
 */

const crypto = require('crypto')

/**
 * 生成安全随机密钥
 *
 * @param {number} length - 密钥长度（字节数，最终为 hex 字符串的一半）
 * @returns {string} 十六进制密钥字符串
 */
function generateSecretKey(length) {
  return crypto.randomBytes(length).toString('hex')
}

/**
 * 验证密钥强度
 *
 * @param {string} key - 待验证的密钥
 * @param {boolean} isProduction - 是否为生产环境
 * @returns {Object} 验证结果
 */
function validateKeyStrength(key, isProduction) {
  const minLength = isProduction ? 64 : 32
  const issues = []

  if (key.length < minLength) {
    issues.push(`密钥长度不足：${key.length} < ${minLength}`)
  }

  // 检查是否为弱密钥
  const weakPatterns = ['CHANGE_ME', 'your_', 'test_', 'dev_', 'password', '123456', 'admin']

  for (const pattern of weakPatterns) {
    if (key.toLowerCase().includes(pattern.toLowerCase())) {
      issues.push(`密钥包含弱模式：${pattern}`)
    }
  }

  return {
    valid: issues.length === 0,
    issues
  }
}

/**
 * 主函数
 */
function main() {
  const args = process.argv.slice(2)
  const isProduction = args.includes('--prod') || args.includes('--production')
  const showHelp = args.includes('--help') || args.includes('-h')

  if (showHelp) {
    console.log(`
PII_HASH_SECRET 密钥生成工具

用法：
  node scripts/generate-pii-hash-secret.js [选项]

选项：
  --prod, --production  生成 64 字符密钥（生产环境）
  --help, -h            显示此帮助信息

示例：
  # 生成开发环境密钥（32字符）
  node scripts/generate-pii-hash-secret.js

  # 生成生产环境密钥（64字符）
  node scripts/generate-pii-hash-secret.js --prod

输出结果可直接复制到 .env 文件中使用。
    `)
    return
  }

  // 生成密钥
  const byteLength = isProduction ? 32 : 16 // hex 字符串长度 = 字节数 * 2
  const secret = generateSecretKey(byteLength)

  // 验证密钥
  const validation = validateKeyStrength(secret, isProduction)

  // 输出结果
  console.log('')
  console.log('='.repeat(60))
  console.log(' PII_HASH_SECRET 密钥生成工具')
  console.log('='.repeat(60))
  console.log('')
  console.log(`环境：${isProduction ? '生产环境 (Production)' : '开发环境 (Development)'}`)
  console.log(`长度：${secret.length} 字符`)
  console.log('')
  console.log('-'.repeat(60))
  console.log('生成的密钥：')
  console.log('-'.repeat(60))
  console.log('')
  console.log(`PII_HASH_SECRET=${secret}`)
  console.log('')
  console.log('-'.repeat(60))

  if (validation.valid) {
    console.log('验证结果：通过')
  } else {
    console.log('验证结果：不通过')
    validation.issues.forEach(issue => {
      console.log(`  - ${issue}`)
    })
  }

  console.log('')
  console.log('使用说明：')
  console.log('1. 将上面的 PII_HASH_SECRET=xxx 复制到 .env 文件')
  console.log('2. 确保此密钥与 JWT_SECRET、JWT_REFRESH_SECRET、ENCRYPTION_KEY 不同')
  console.log('3. 生产环境部署前请使用 --prod 参数重新生成更长的密钥')
  console.log('')
  console.log('='.repeat(60))
}

// 执行主函数
main()
