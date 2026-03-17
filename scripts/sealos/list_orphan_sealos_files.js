/**
 * Sealos对象存储孤儿文件识别脚本
 *
 * 用途: 对比数据库记录和Sealos存储，识别孤儿文件
 * @created 2025-10-30 18:30 北京时间
 */

require('dotenv').config()
const { Sequelize } = require('sequelize')
// 🔴 复用主 sequelize 实例（单一配置源）
const { sequelize } = require('../../config/database')

/*
 * P1-9：sealosStorage 通过 ServiceManager 获取
 * 服务键：'sealos_storage'（snake_case）
 * 注意：在 listSealosFiles() 等函数调用时动态获取服务
 */
let sealosStorage = null

/**
 * P1-9：初始化 ServiceManager 并获取 SealosStorageService
 * @returns {Promise<Object>} SealosStorageService 实例
 */
async function initializeSealosStorage() {
  if (sealosStorage) return sealosStorage
  try {
    const serviceManager = require('../../services/index')
    if (!serviceManager._initialized) {
      await serviceManager.initialize()
    }
    sealosStorage = serviceManager.getService('sealos_storage')
    console.log('✅ SealosStorageService 加载成功（P1-9 ServiceManager）')
    return sealosStorage
  } catch (error) {
    console.error('❌ SealosStorageService 加载失败:', error.message)
    throw error
  }
}

/**
 * 获取数据库中所有有效的媒体文件 object_key（media_files 表）
 */
async function getDatabaseFilePaths() {
  const [results] = await sequelize.query(
    'SELECT object_key FROM media_files WHERE status = \'active\''
  )
  // 收集 object_key 及其缩略图路径
  const paths = new Set(results.map(row => row.object_key))

  // 同时查询缩略图 keys
  const [thumbResults] = await sequelize.query(
    'SELECT thumbnail_keys FROM media_files WHERE status = \'active\' AND thumbnail_keys IS NOT NULL'
  )
  for (const row of thumbResults) {
    const keys = typeof row.thumbnail_keys === 'string' ? JSON.parse(row.thumbnail_keys) : row.thumbnail_keys
    if (keys) {
      Object.values(keys).forEach(k => { if (k) paths.add(k) })
    }
  }

  // 也包含占位图路径（从 .env 中读取）
  const placeholderKeys = [
    process.env.DEFAULT_PRIZE_PLACEHOLDER_KEY,
    process.env.DEFAULT_PRODUCT_PLACEHOLDER_KEY,
    process.env.DEFAULT_BANNER_PLACEHOLDER_KEY,
    process.env.DEFAULT_AVATAR_PLACEHOLDER_KEY,
    process.env.DEFAULT_PLACEHOLDER_KEY
  ].filter(Boolean)
  placeholderKeys.forEach(k => paths.add(k))

  return paths
}

/**
 * 列出Sealos中所有文件
 */
async function listSealosFiles() {
  try {
    // 获取S3客户端
    const s3 = sealosStorage.s3
    const bucket = process.env.SEALOS_BUCKET_NAME

    const params = {
      Bucket: bucket,
      Prefix: 'mh3' // 用户上传文件的前缀
    }

    const data = await s3.listObjectsV2(params).promise()
    return data.Contents || []
  } catch (error) {
    console.error('❌ 获取Sealos文件列表失败:', error.message)
    return []
  }
}

/**
 * 识别孤儿文件
 */
async function identifyOrphanFiles() {
  console.log('🔍 开始识别Sealos对象存储孤儿文件...\n')

  try {
    // P1-9：初始化 SealosStorageService
    await initializeSealosStorage()

    // 1. 连接数据库
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 2. 获取数据库中的文件路径
    console.log('📊 获取数据库文件记录...')
    const dbFilePaths = await getDatabaseFilePaths()
    console.log(`   数据库记录数: ${dbFilePaths.size}\n`)

    // 3. 获取Sealos中的文件列表
    console.log('☁️  获取Sealos文件列表...')
    const sealosFiles = await listSealosFiles()
    console.log(`   Sealos文件数: ${sealosFiles.length}\n`)

    // 4. 识别孤儿文件（在Sealos中存在但数据库中不存在）
    console.log('🔍 识别孤儿文件...\n')
    const orphanFiles = []

    sealosFiles.forEach(file => {
      const fileName = file.Key
      if (!dbFilePaths.has(fileName)) {
        orphanFiles.push({
          key: fileName,
          size: file.Size,
          lastModified: file.LastModified
        })
      }
    })

    // 5. 输出结果
    console.log('='.repeat(60))
    console.log('📊 孤儿文件识别结果:\n')
    console.log(`✅ 数据库记录: ${dbFilePaths.size} 个文件`)
    console.log(`☁️  Sealos存储: ${sealosFiles.length} 个文件`)
    console.log(`🗑️  孤儿文件: ${orphanFiles.length} 个文件\n`)

    if (orphanFiles.length > 0) {
      console.log('📋 孤儿文件列表:\n')

      let totalSize = 0
      orphanFiles.forEach((file, index) => {
        const sizeKB = (file.size / 1024).toFixed(2)
        totalSize += file.size
        console.log(`${index + 1}. ${file.key}`)
        console.log(`   大小: ${sizeKB} KB`)
        console.log(`   修改时间: ${file.lastModified}\n`)
      })

      console.log(`💾 孤儿文件总大小: ${(totalSize / 1024 / 1024).toFixed(2)} MB\n`)

      // 生成可复制的文件路径列表
      console.log('='.repeat(60))
      console.log('📝 可复制的文件路径列表（用于清理脚本）:\n')
      console.log('const ORPHAN_FILES = [')
      orphanFiles.forEach(file => {
        console.log(`  '${file.key}',`)
      })
      console.log(']\n')

      console.log('💡 使用方法:')
      console.log('   1. 复制上面的文件路径列表')
      console.log('   2. 粘贴到 scripts/cleanup-orphan-sealos-files.js 中的 ORPHAN_FILES 数组')
      console.log('   3. 运行: node scripts/cleanup-orphan-sealos-files.js --force\n')
    } else {
      console.log('✅ 未发现孤儿文件，Sealos存储状态良好\n')
    }

    console.log('='.repeat(60))

    await sequelize.close()
  } catch (error) {
    console.error('❌ 识别失败:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// 执行识别
identifyOrphanFiles()
  .then(() => {
    console.log('✅ 识别完成')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ 执行失败:', error)
    process.exit(1)
  })
