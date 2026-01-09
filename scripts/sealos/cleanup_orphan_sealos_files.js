/**
 * Sealos对象存储孤儿文件清理脚本
 *
 * 用途: 清理数据库记录已删除但Sealos中仍存在的孤儿文件
 * 场景: 清理旧拍照上传业务的图片文件（数据库记录已删除）
 *
 * @created 2025-10-30 18:30 北京时间
 */

require('dotenv').config()

/*
 * P1-9：sealosStorage 通过 ServiceManager 获取
 * 服务键：'sealos_storage'（snake_case）
 * 注意：在 cleanupOrphanFiles() 函数开始时动态获取服务
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
 * 需要清理的文件列表（从数据库迁移日志中提取）
 * 这些文件的数据库记录已在迁移中删除，但物理文件仍在Sealos中
 */
const ORPHAN_FILES = [
  /*
   * 格式: 'file_path' (从迁移前的数据库记录中提取)
   * 示例: 'mh3jkbis_34a12469-9874-434e-88bc-3e6601b92c48.jpg'
   */
  /*
   * ⚠️ 注意: 由于数据库记录已删除，需要从以下来源手动填写文件路径:
   * 1. 数据库备份文件
   * 2. 迁移执行前的数据导出
   * 3. Sealos对象存储控制台文件列表
   */
  // 📝 如果不确定哪些文件需要删除，建议先不执行清理
]

/**
 * 主清理函数
 */
async function cleanupOrphanFiles() {
  console.log('🧹 Sealos对象存储孤儿文件清理\n')

  // P1-9：初始化 SealosStorageService
  await initializeSealosStorage()

  if (ORPHAN_FILES.length === 0) {
    console.log('⚠️ 警告: 孤儿文件列表为空')
    console.log('📋 请先填写 ORPHAN_FILES 数组中的文件路径\n')
    console.log('💡 获取文件路径的方式:')
    console.log('   1. 从数据库备份文件中提取')
    console.log('   2. 从Sealos对象存储控制台查看')
    console.log('   3. 从迁移前的数据导出中获取\n')
    process.exit(0)
  }

  console.log(`📊 待清理文件数量: ${ORPHAN_FILES.length}\n`)

  let successCount = 0
  let failCount = 0
  const failedFiles = []

  // 逐个删除文件
  for (let i = 0; i < ORPHAN_FILES.length; i++) {
    const filePath = ORPHAN_FILES[i]
    console.log(`[${i + 1}/${ORPHAN_FILES.length}] 删除: ${filePath}`)

    try {
      // 调用Sealos存储服务删除文件
      await sealosStorage.deleteFile(filePath)
      console.log('   ✅ 成功删除\n')
      successCount++
    } catch (error) {
      console.error(`   ❌ 删除失败: ${error.message}\n`)
      failCount++
      failedFiles.push({ path: filePath, error: error.message })
    }
  }

  // 输出清理结果
  console.log('='.repeat(50))
  console.log('📊 清理结果统计:\n')
  console.log(`✅ 成功删除: ${successCount} 个文件`)
  console.log(`❌ 删除失败: ${failCount} 个文件`)
  console.log(`📋 总计: ${ORPHAN_FILES.length} 个文件\n`)

  if (failedFiles.length > 0) {
    console.log('⚠️ 删除失败的文件列表:')
    failedFiles.forEach((file, index) => {
      console.log(`${index + 1}. ${file.path}`)
      console.log(`   错误: ${file.error}\n`)
    })
  }

  console.log('='.repeat(50))
}

// 执行清理（需要用户确认）
const args = process.argv.slice(2)
const forceClean = args.includes('--force')

if (!forceClean) {
  console.log('⚠️  警告: 此操作将永久删除Sealos对象存储中的文件！')
  console.log('📋 请确认以下操作:')
  console.log('   1. 已填写 ORPHAN_FILES 数组')
  console.log('   2. 确认这些文件确实需要删除')
  console.log('   3. 已备份重要文件\n')
  console.log('💡 执行清理请运行: node scripts/cleanup-orphan-sealos-files.js --force\n')
  process.exit(0)
}

// 执行清理
cleanupOrphanFiles()
  .then(() => {
    console.log('✅ 清理完成')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ 清理失败:', error.message)
    process.exit(1)
  })
