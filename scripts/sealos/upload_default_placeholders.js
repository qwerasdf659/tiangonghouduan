#!/usr/bin/env node
/**
 * 上传默认占位图到 Sealos 对象存储
 *
 * @description
 *   生成并上传默认占位图到 Sealos 的 defaults/ 目录
 *   这些占位图用于业务场景中图片缺失时的默认显示
 *
 * @architecture 架构决策（2026-01-08）
 *   - 占位图目录：defaults/
 *   - 图片格式：PNG（支持透明背景）
 *   - 尺寸：各业务场景使用适合的尺寸
 *   - 访问策略：public-read
 *
 * @usage
 *   # 生成并上传所有占位图
 *   node scripts/sealos/upload-default-placeholders.js
 *
 *   # 检查占位图是否存在（不上传）
 *   node scripts/sealos/upload-default-placeholders.js --check-only
 *
 * P1-9：已改造为通过 ServiceManager 获取服务（snake_case key）
 * 服务键：'sealos_storage'
 *
 * @version 1.1.0
 * @date 2026-01-09
 */

require('dotenv').config()

const sharp = require('sharp')

/*
 * P1-9：SealosStorageService 通过 ServiceManager 获取
 * 服务键：'sealos_storage'（snake_case）
 * 注意：该脚本需要在 main() 中异步获取服务
 */
let SealosStorageService = null

/**
 * P1-9：初始化 ServiceManager 并获取 SealosStorageService
 * @returns {Promise<Object>} SealosStorageService 实例
 */
async function initializeSealosService() {
  try {
    // 直接实例化 SealosStorageService（避免 ServiceManager 封装问题）
    const SealosStorageServiceClass = require('../../services/sealosStorage')
    SealosStorageService = new SealosStorageServiceClass()
    console.log('✅ SealosStorageService 直接初始化成功')
    return SealosStorageService
  } catch (error) {
    console.error('❌ SealosStorageService 初始化失败:', error.message)
    throw error
  }
}

/**
 * 默认占位图配置
 * 包含每种业务类型的占位图规格
 */
const PLACEHOLDER_CONFIG = {
  prize: {
    filename: 'prize-placeholder.png',
    width: 400,
    height: 400,
    background: '#e0e0e0', // 浅灰色背景
    text: '奖品图片',
    textColor: '#666666'
  },
  product: {
    filename: 'product-placeholder.png',
    width: 400,
    height: 400,
    background: '#f5f5f5',
    text: '商品图片',
    textColor: '#888888'
  },
  avatar: {
    filename: 'avatar-placeholder.png',
    width: 200,
    height: 200,
    background: '#d4d4d4',
    text: '头像',
    textColor: '#555555'
  },
  banner: {
    filename: 'banner-placeholder.png',
    width: 750,
    height: 300,
    background: '#cccccc',
    text: '横幅图片',
    textColor: '#777777'
  },
  default: {
    filename: 'placeholder.png',
    width: 300,
    height: 300,
    background: '#dddddd',
    text: '默认图片',
    textColor: '#666666'
  }
}

/**
 * 生成占位图 Buffer
 *
 * @param {Object} config - 占位图配置
 * @returns {Promise<Buffer>} PNG 图片 Buffer
 */
async function generatePlaceholder(config) {
  const { width, height, background, text } = config

  // 创建 SVG 作为占位图内容（包含文字）
  const svgContent = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${background}"/>
      <text 
        x="50%" 
        y="50%" 
        font-family="Arial, sans-serif" 
        font-size="${Math.min(width, height) / 10}px" 
        fill="${config.textColor}" 
        text-anchor="middle" 
        dominant-baseline="middle"
      >${text}</text>
      <rect 
        x="2" y="2" 
        width="${width - 4}" height="${height - 4}" 
        fill="none" 
        stroke="#aaaaaa" 
        stroke-width="2" 
        stroke-dasharray="10,5"
      />
    </svg>
  `

  // 使用 sharp 将 SVG 转换为 PNG
  const buffer = await sharp(Buffer.from(svgContent)).png({ compressionLevel: 8 }).toBuffer()

  return buffer
}

/**
 * 上传单个占位图到 Sealos
 *
 * @param {Object} storageService - SealosStorageService 实例
 * @param {string} type - 占位图类型
 * @param {Object} config - 占位图配置
 * @returns {Promise<Object>} 上传结果
 */
async function uploadPlaceholder(storageService, type, config) {
  console.log(`\n📷 正在生成并上传: ${type} (${config.filename})`)

  try {
    // 1. 生成占位图
    const buffer = await generatePlaceholder(config)
    console.log(`   ✅ 生成成功：${buffer.length} bytes`)

    // 2. 上传到 Sealos（直接使用 S3 SDK 上传固定文件名）
    const objectKey = `defaults/${config.filename}`
    await storageService.s3
      .upload({
        Bucket: storageService.config.bucket,
        Key: objectKey,
        Body: buffer,
        ContentType: 'image/png',
        ACL: 'public-read',
        CacheControl: 'max-age=31536000' // 缓存1年
      })
      .promise()

    console.log(`   ✅ 上传成功：${objectKey}`)

    return {
      type,
      filename: config.filename,
      objectKey,
      size: buffer.length,
      success: true
    }
  } catch (error) {
    console.error(`   ❌ 上传失败：${error.message}`)
    return {
      type,
      filename: config.filename,
      success: false,
      error: error.message
    }
  }
}

/**
 * 检查占位图是否已存在
 *
 * @param {Object} storageService - SealosStorageService 实例
 * @param {string} type - 占位图类型
 * @param {Object} config - 占位图配置
 * @returns {Promise<Object>} 检查结果
 */
async function checkPlaceholder(storageService, type, config) {
  const objectKey = `defaults/${config.filename}`
  console.log(`\n🔍 检查: ${objectKey}`)

  try {
    // 使用 S3 headObject 检查对象是否存在
    await storageService.s3
      .headObject({
        Bucket: storageService.config.bucket,
        Key: objectKey
      })
      .promise()

    console.log(`   ✅ 存在`)
    return { type, filename: config.filename, objectKey, exists: true }
  } catch (error) {
    if (error.code === 'NotFound' || error.statusCode === 404) {
      console.log(`   ⚠️ 不存在`)
      return { type, filename: config.filename, objectKey, exists: false }
    }
    console.log(`   ❓ 检查失败：${error.message}`)
    return { type, filename: config.filename, objectKey, exists: false, error: error.message }
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('═'.repeat(60))
  console.log('🖼️ 默认占位图上传工具')
  console.log('═'.repeat(60))

  // 解析命令行参数
  const checkOnly = process.argv.includes('--check-only')

  if (checkOnly) {
    console.log('模式：仅检查占位图是否存在（不上传）')
  } else {
    console.log('模式：生成并上传占位图')
  }

  // 检查环境变量
  const requiredEnvVars = [
    'SEALOS_ENDPOINT',
    'SEALOS_BUCKET',
    'SEALOS_ACCESS_KEY',
    'SEALOS_SECRET_KEY'
  ]
  const missingVars = requiredEnvVars.filter(v => !process.env[v])

  if (missingVars.length > 0) {
    console.error(`\n❌ 缺少必需的环境变量：${missingVars.join(', ')}`)
    console.error('请检查 .env 文件配置')
    process.exit(1)
  }

  // P1-9：通过 ServiceManager 获取 Sealos 存储服务
  const storageService = await initializeSealosService()

  console.log(`\nSealos 配置：`)
  console.log(`  Endpoint: ${process.env.SEALOS_ENDPOINT}`)
  console.log(`  Bucket: ${process.env.SEALOS_BUCKET}`)

  // 处理每种占位图
  const results = []

  for (const [type, config] of Object.entries(PLACEHOLDER_CONFIG)) {
    if (checkOnly) {
      const result = await checkPlaceholder(storageService, type, config)
      results.push(result)
    } else {
      const result = await uploadPlaceholder(storageService, type, config)
      results.push(result)
    }
  }

  // 输出汇总
  console.log('\n' + '═'.repeat(60))
  console.log('📊 执行结果汇总')
  console.log('═'.repeat(60))

  if (checkOnly) {
    const existCount = results.filter(r => r.exists).length
    const missingCount = results.filter(r => !r.exists).length
    console.log(`存在: ${existCount}，缺失: ${missingCount}`)

    if (missingCount > 0) {
      console.log('\n缺失的占位图：')
      results
        .filter(r => !r.exists)
        .forEach(r => {
          console.log(`  - ${r.objectKey}`)
        })
      console.log('\n运行以下命令上传：')
      console.log('  node scripts/sealos/upload-default-placeholders.js')
    }
  } else {
    const successCount = results.filter(r => r.success).length
    const failedCount = results.filter(r => !r.success).length
    console.log(`成功: ${successCount}，失败: ${failedCount}`)

    if (failedCount > 0) {
      console.log('\n失败的上传：')
      results
        .filter(r => !r.success)
        .forEach(r => {
          console.log(`  - ${r.filename}: ${r.error}`)
        })
    }

    // 输出公网访问 URL
    console.log('\n📌 占位图公网访问 URL：')
    results
      .filter(r => r.success)
      .forEach(r => {
        const url = `${process.env.SEALOS_ENDPOINT}/${process.env.SEALOS_BUCKET}/${r.objectKey}`
        console.log(`  ${r.type}: ${url}`)
      })
  }

  console.log('\n' + '═'.repeat(60))

  // 退出码
  const hasError = results.some(r => (checkOnly ? false : !r.success))
  process.exit(hasError ? 1 : 0)
}

// 执行
main().catch(error => {
  console.error('执行失败:', error)
  process.exit(1)
})
