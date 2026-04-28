/**
 * DIY 素材图片批量裁剪透明边距脚本
 *
 * 用途：对 diy_materials 表中所有已有素材图片执行 sharp.trim()，
 *       裁剪 PNG 透明边距后重新上传覆盖原图及缩略图。
 *       解决小程序端宝石镶嵌时因透明边距导致视觉偏小的问题。
 *
 * 执行方式：node scripts/sealos/batch_trim_diy_materials.js
 * 可选参数：--dry-run（仅检测不实际修改）
 *
 * @created 2026-04-29 北京时间
 */

'use strict'

require('dotenv').config()
const sharp = require('sharp')
const { sequelize } = require('../../config/database')

const DRY_RUN = process.argv.includes('--dry-run')

let sealosStorage = null

/**
 * 初始化 SealosStorageService 实例
 */
async function initializeSealosStorage() {
  if (sealosStorage) return sealosStorage
  const serviceManager = require('../../services/index')
  if (!serviceManager._initialized) {
    await serviceManager.initialize()
  }
  const SealosStorageServiceClass = serviceManager.getService('sealos_storage')
  sealosStorage = new SealosStorageServiceClass()
  console.log('[TRIM] SealosStorageService 实例化成功')
  return sealosStorage
}

/**
 * 主流程：遍历所有 DIY 素材，下载图片 → trim → 重新上传
 */
async function main() {
  console.log(`[TRIM] 开始批量裁剪 DIY 素材图片透明边距${DRY_RUN ? '（DRY-RUN 模式，不实际修改）' : ''}`)

  await initializeSealosStorage()

  // 查询所有有图片的 DIY 素材
  const [materials] = await sequelize.query(`
    SELECT m.diy_material_id, m.display_name, m.image_media_id,
           mf.object_key, mf.thumbnail_keys, mf.width, mf.height, mf.mime_type
    FROM diy_materials m
    JOIN media_files mf ON m.image_media_id = mf.media_id
    WHERE m.image_media_id IS NOT NULL
      AND mf.object_key IS NOT NULL
      AND (mf.mime_type = 'image/png' OR mf.mime_type = 'image/webp')
    ORDER BY m.diy_material_id ASC
  `)

  console.log(`[TRIM] 找到 ${materials.length} 个 PNG/WebP 素材需要处理`)

  let processed = 0
  let trimmed = 0
  let skipped = 0
  let errors = 0

  for (const mat of materials) {
    processed++
    const prefix = `[${processed}/${materials.length}] ${mat.display_name}(ID:${mat.diy_material_id})`

    try {
      // 1. 下载原图
      const { body: originalBuffer } = await sealosStorage.getImageBuffer(mat.object_key)
      const originalMeta = await sharp(originalBuffer).metadata()

      // 2. 执行 trim
      const trimResult = await sharp(originalBuffer)
        .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 30 })
        .toBuffer({ resolveWithObject: true })

      const trimmedMeta = trimResult.info
      const trimmedBuffer = trimResult.data

      // 3. 计算裁剪比例
      const widthReduction = ((originalMeta.width - trimmedMeta.width) / originalMeta.width * 100).toFixed(1)
      const heightReduction = ((originalMeta.height - trimmedMeta.height) / originalMeta.height * 100).toFixed(1)

      // 如果裁剪量小于 5%，跳过（已经很紧凑了）
      if (widthReduction < 5 && heightReduction < 5) {
        console.log(`${prefix} → 跳过（边距已很小：宽-${widthReduction}% 高-${heightReduction}%）`)
        skipped++
        continue
      }

      console.log(`${prefix} → ${originalMeta.width}x${originalMeta.height} → ${trimmedMeta.width}x${trimmedMeta.height}（宽-${widthReduction}% 高-${heightReduction}%）`)

      if (DRY_RUN) {
        trimmed++
        continue
      }

      // 4. 重新上传原图（覆盖原 object_key）
      await sealosStorage.s3.putObject({
        Bucket: sealosStorage.config.bucket,
        Key: mat.object_key,
        Body: trimmedBuffer,
        ContentType: mat.mime_type,
        ContentDisposition: 'inline',
        ACL: 'public-read',
        CacheControl: 'max-age=31536000'
      }).promise()

      // 5. 重新生成并上传缩略图
      const thumbnailKeys = typeof mat.thumbnail_keys === 'string'
        ? JSON.parse(mat.thumbnail_keys)
        : mat.thumbnail_keys

      if (thumbnailKeys) {
        const sizes = { small: 150, medium: 300, large: 600 }
        for (const [sizeName, maxDim] of Object.entries(sizes)) {
          const key = thumbnailKeys[sizeName]
          if (!key) continue

          const thumbBuffer = await sharp(trimmedBuffer)
            .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
            .png({ compressionLevel: 8 })
            .toBuffer()

          await sealosStorage.s3.putObject({
            Bucket: sealosStorage.config.bucket,
            Key: key,
            Body: thumbBuffer,
            ContentType: 'image/png',
            ContentDisposition: 'inline',
            ACL: 'public-read',
            CacheControl: 'max-age=31536000'
          }).promise()
        }
      }

      // 6. 更新 media_files 表的 width/height
      await sequelize.query(`
        UPDATE media_files SET width = ?, height = ? WHERE media_id = ?
      `, { replacements: [trimmedMeta.width, trimmedMeta.height, mat.image_media_id] })

      trimmed++
    } catch (err) {
      console.error(`${prefix} → 错误: ${err.message}`)
      errors++
    }
  }

  console.log('\n[TRIM] ========== 完成 ==========')
  console.log(`总计: ${materials.length} | 已裁剪: ${trimmed} | 跳过: ${skipped} | 错误: ${errors}`)

  if (DRY_RUN) {
    console.log('\n[TRIM] 这是 DRY-RUN 模式，未实际修改任何文件。去掉 --dry-run 参数执行实际裁剪。')
  }

  await sequelize.close()
  process.exit(errors > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('[TRIM] 致命错误:', err)
  process.exit(1)
})
