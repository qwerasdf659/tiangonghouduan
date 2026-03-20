/**
 * Sealos对象存储孤儿文件清理脚本
 *
 * 用途: 自动检测并清理数据库中无引用的 Sealos 孤儿文件
 * 流程: 扫描 bucket 全部文件 → 对比 media_files 表 → 识别孤儿 → 物理删除
 *
 * 使用方式:
 *   node scripts/sealos/cleanup_orphan_sealos_files.js          # 仅列出孤儿文件（dry-run）
 *   node scripts/sealos/cleanup_orphan_sealos_files.js --force  # 执行物理删除
 *
 * @created 2025-10-30 18:30 北京时间
 * @updated 2026-03-19 — 改为自动检测模式，不再依赖手动填写 ORPHAN_FILES 数组
 */

require('dotenv').config()
const { sequelize } = require('../../config/database')

let sealosStorage = null

/**
 * 初始化 ServiceManager 并获取 SealosStorageService 实例
 * 注意：sealos_storage 在 ServiceManager 中注册的是类本身，需要 new 实例化
 * @returns {Promise<Object>} SealosStorageService 实例
 */
async function initializeSealosStorage() {
  if (sealosStorage) return sealosStorage
  const serviceManager = require('../../services/index')
  if (!serviceManager._initialized) {
    await serviceManager.initialize()
  }
  const SealosStorageServiceClass = serviceManager.getService('sealos_storage')
  sealosStorage = new SealosStorageServiceClass()
  console.log('SealosStorageService 实例化成功')
  return sealosStorage
}

/**
 * 获取数据库中所有有效的媒体文件路径（media_files 表 + 占位图）
 * @returns {Promise<Set<string>>} 数据库中有引用的 object_key 集合
 */
async function getDatabaseFilePaths() {
  // 查询所有非 deleted 状态的 object_key（包含 trashed，回收站文件不应被当作孤儿）
  const [results] = await sequelize.query(
    "SELECT object_key FROM media_files WHERE status IN ('active', 'archived', 'trashed')"
  )
  const paths = new Set(results.map(row => row.object_key))

  // 收集缩略图路径
  const [thumbResults] = await sequelize.query(
    "SELECT thumbnail_keys FROM media_files WHERE status IN ('active', 'archived', 'trashed') AND thumbnail_keys IS NOT NULL"
  )
  for (const row of thumbResults) {
    const keys = typeof row.thumbnail_keys === 'string' ? JSON.parse(row.thumbnail_keys) : row.thumbnail_keys
    if (keys) {
      Object.values(keys).forEach(k => { if (k) paths.add(k) })
    }
  }

  // 占位图路径（.env 配置的系统默认图片）
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
 * 列出 Sealos bucket 中所有文件
 * 使用 SealosStorageService.listFiles() 方法
 * @returns {Promise<Array>} 文件列表 [{key, size, lastModified, etag}]
 */
async function listAllSealosFiles() {
  return await sealosStorage.listFiles('', 10000)
}

/**
 * 主清理函数
 * @param {boolean} dryRun - true 仅列出，false 执行删除
 */
async function cleanupOrphanFiles(dryRun) {
  console.log(dryRun
    ? '=== Sealos 孤儿文件检测（dry-run，不执行删除）==='
    : '=== Sealos 孤儿文件清理（执行物理删除）==='
  )
  console.log('')

  await initializeSealosStorage()
  await sequelize.authenticate()
  console.log('数据库连接成功\n')

  // 1. 获取数据库中有引用的文件路径
  const dbFilePaths = await getDatabaseFilePaths()
  console.log(`数据库有效文件: ${dbFilePaths.size} 个`)

  // 2. 获取 Sealos bucket 全部文件
  const sealosFiles = await listAllSealosFiles()
  console.log(`Sealos 存储文件: ${sealosFiles.length} 个\n`)

  // 3. 识别孤儿文件
  const orphanFiles = sealosFiles.filter(file => !dbFilePaths.has(file.key))

  if (orphanFiles.length === 0) {
    console.log('未发现孤儿文件，Sealos 存储状态良好')
    await sequelize.close()
    return
  }

  // 4. 按文件夹分组展示
  const byFolder = {}
  let totalSize = 0
  for (const file of orphanFiles) {
    const folder = file.key.includes('/') ? file.key.split('/')[0] : '(root)'
    if (!byFolder[folder]) byFolder[folder] = []
    byFolder[folder].push(file)
    totalSize += file.size
  }

  console.log(`发现 ${orphanFiles.length} 个孤儿文件（${(totalSize / 1024).toFixed(1)} KB）:\n`)
  for (const [folder, files] of Object.entries(byFolder)) {
    const folderSize = files.reduce((sum, f) => sum + f.size, 0)
    console.log(`  ${folder}/ — ${files.length} 个文件（${(folderSize / 1024).toFixed(1)} KB）`)
    files.forEach(f => {
      console.log(`    - ${f.key}  (${(f.size / 1024).toFixed(1)} KB)`)
    })
  }
  console.log('')

  // 5. dry-run 模式仅展示，不删除
  if (dryRun) {
    console.log('以上为 dry-run 结果，如需执行删除请运行:')
    console.log('  node scripts/sealos/cleanup_orphan_sealos_files.js --force')
    await sequelize.close()
    return
  }

  // 6. 执行物理删除
  console.log('开始删除...\n')
  let successCount = 0
  let failCount = 0
  const failedFiles = []

  for (let i = 0; i < orphanFiles.length; i++) {
    const filePath = orphanFiles[i].key
    process.stdout.write(`[${i + 1}/${orphanFiles.length}] ${filePath} ... `)
    try {
      await sealosStorage.deleteFile(filePath)
      console.log('OK')
      successCount++
    } catch (error) {
      console.log(`FAIL: ${error.message}`)
      failCount++
      failedFiles.push({ path: filePath, error: error.message })
    }
  }

  // 7. 输出结果
  console.log('\n' + '='.repeat(50))
  console.log(`删除成功: ${successCount}`)
  console.log(`删除失败: ${failCount}`)
  console.log(`总计: ${orphanFiles.length}`)

  if (failedFiles.length > 0) {
    console.log('\n失败文件:')
    failedFiles.forEach(f => console.log(`  ${f.path} — ${f.error}`))
  }

  await sequelize.close()
}

// 入口
const forceClean = process.argv.includes('--force')
cleanupOrphanFiles(!forceClean)
  .then(() => process.exit(0))
  .catch(error => {
    console.error('执行失败:', error.message)
    process.exit(1)
  })
