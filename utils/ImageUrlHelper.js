/**
 * 图片 URL 辅助工具
 *
 * @description
 *   🎯 架构决策（2026-01-08 最终拍板）：
 *   - 数据库统一存储对象 key（如 prizes/xxx.jpg）
 *   - API 层通过此工具生成完整 URL
 *   - 不使用 CDN，直连 Sealos 公网端点
 *   - 缩略图预生成，存储在 {folder}/thumbnails/{size}/ 目录
 *
 * @usage
 *   - API 响应时将数据库中的对象 key 转换为公网 URL
 *   - 前端预览图片时获取完整访问地址
 *   - 批量处理图片 URL 转换
 *
 * @module ImageUrlHelper
 * @version 2.0.0
 */

const path = require('path')

/**
 * 获取图片公网访问 URL
 *
 * @description
 *   架构决策（2026-01-08）：
 *   - 不使用 CDN，直连 Sealos 公网端点
 *   - 数据库仅存对象 key，API 层动态拼接完整 URL
 *
 * @param {string} objectKey - 对象 key（如 prizes/xxx.jpg 或 prizes/thumbnails/small/xxx.jpg）
 * @returns {string|null} 完整公网访问 URL
 *
 * @example
 * // 基础用法 - 原图
 * getImageUrl('prizes/20260108_abc123.jpg')
 * // 返回: https://objectstorageapi.xxx/bucket/prizes/20260108_abc123.jpg
 *
 * @example
 * // 预生成缩略图
 * getImageUrl('prizes/thumbnails/small/20260108_abc123.jpg')
 * // 返回: https://objectstorageapi.xxx/bucket/prizes/thumbnails/small/20260108_abc123.jpg
 */
function getImageUrl(objectKey) {
  if (!objectKey) {
    return null
  }

  /**
   * 🎯 架构决策（2026-01-08 拍板）：不兼容旧方案，只处理对象 key
   * 以下警告仅用于发现数据问题，生产中应修复数据源
   */
  if (objectKey.startsWith('http://') || objectKey.startsWith('https://')) {
    console.warn(
      `⚠️ ImageUrlHelper: 发现完整 URL，架构已拍板只存储对象 key。请检查数据: ${objectKey}`
    )
    return objectKey // 兼容性返回，但应修复数据源
  }

  if (objectKey.startsWith('/')) {
    console.warn(
      `⚠️ ImageUrlHelper: 发现本地路径格式，架构已拍板只存储对象 key。请检查数据: ${objectKey}`
    )
    objectKey = objectKey.substring(1) // 尝试转换，但应修复数据源
  }

  /**
   * 🎯 架构决策（2026-01-08 拍板）：不使用 CDN，直连 Sealos 公网端点
   * 环境变量：SEALOS_ENDPOINT（公网端点）、SEALOS_BUCKET（存储桶名）
   */
  const publicEndpoint = process.env.SEALOS_ENDPOINT
  const bucket = process.env.SEALOS_BUCKET

  if (!publicEndpoint || !bucket) {
    console.warn('❌ ImageUrlHelper: 缺少 SEALOS_ENDPOINT 或 SEALOS_BUCKET 环境变量')
    return null
  }

  return `${publicEndpoint}/${bucket}/${objectKey}`
}

/**
 * 批量生成图片公网访问 URL
 *
 * @param {string[]} objectKeys - 对象 key 数组
 * @returns {Object} key 到 URL 的映射 { objectKey: publicUrl }
 *
 * @example
 * getImageUrls(['prizes/a.jpg', 'prizes/b.jpg'])
 * // 返回: { 'prizes/a.jpg': 'https://...', 'prizes/b.jpg': 'https://...' }
 */
function getImageUrls(objectKeys) {
  const result = {}
  if (!Array.isArray(objectKeys)) return result

  objectKeys.forEach(key => {
    result[key] = getImageUrl(key)
  })
  return result
}

/**
 * 获取默认图片 URL
 *
 * @description
 *   默认占位图存储在 Sealos 的 defaults/ 目录下
 *   如果 Sealos 配置缺失，返回本地静态资源路径（fallback）
 *
 * @param {string} type - 图片类型（prize/product/avatar/banner）
 * @returns {string} 默认图片 URL
 */
function getDefaultImageUrl(type = 'default') {
  const defaultImages = {
    prize: 'defaults/prize-placeholder.png',
    product: 'defaults/product-placeholder.png',
    avatar: 'defaults/avatar-placeholder.png',
    banner: 'defaults/banner-placeholder.png',
    default: 'defaults/placeholder.png'
  }

  const key = defaultImages[type] || defaultImages.default
  return getImageUrl(key) || `/assets/images/${type}-placeholder.png`
}

/**
 * 生成预生成缩略图 URL
 *
 * @description
 *   架构决策（2026-01-08 最终拍板）：
 *   - 缩略图在上传时预生成（150/300/600px，cover-center）
 *   - 存储目录结构：{folder}/thumbnails/{size}/xxx.jpg
 *   - 不使用 URL 参数化缩略图
 *
 * @param {string} objectKey - 原图对象 key（如 prizes/20260108_abc123.jpg）
 * @param {string} size - 尺寸类型 small/medium/large/original
 * @returns {string|null} 预生成缩略图 URL
 *
 * @example
 * getThumbnailUrl('prizes/20260108_abc123.jpg', 'small')
 * // 返回: https://objectstorageapi.xxx/bucket/prizes/thumbnails/small/20260108_abc123.jpg
 */
function getThumbnailUrl(objectKey, size = 'medium') {
  if (!objectKey) return null

  // original 直接返回原图 URL
  if (size === 'original') {
    return getImageUrl(objectKey)
  }

  // 验证尺寸类型
  const validSizes = ['small', 'medium', 'large']
  if (!validSizes.includes(size)) {
    console.warn(`⚠️ ImageUrlHelper: 无效的缩略图尺寸 "${size}"，使用 "medium"`)
    size = 'medium'
  }

  /**
   * 构造预生成缩略图的对象 key
   * 目录结构：{folder}/thumbnails/{size}/xxx.jpg
   *
   * 例如：
   * - 原图 key: prizes/20260108_abc123.jpg
   * - 缩略图 key: prizes/thumbnails/small/20260108_abc123.jpg
   */
  const folder = path.dirname(objectKey) // 例如 'prizes'
  const filename = path.basename(objectKey) // 例如 '20260108_abc123.jpg'
  const thumbnailKey = `${folder}/thumbnails/${size}/${filename}`

  return getImageUrl(thumbnailKey)
}

/**
 * 转换数据库记录中的图片字段为 URL
 *
 * @description
 *   用于 API 响应时批量转换记录中的图片字段
 *   保留原始 key（添加 _key 后缀），方便调试
 *
 * @param {Object|Array} data - 单个记录或记录数组
 * @param {string[]} imageFields - 需要转换的图片字段名数组
 * @returns {Object|Array} 转换后的数据
 *
 * @example
 * // 转换单个记录
 * transformImageFields(banner, ['image_url'])
 *
 * @example
 * // 转换记录数组
 * transformImageFields(banners, ['image_url', 'thumbnail'])
 */
function transformImageFields(data, imageFields = ['image_url']) {
  if (!data) return data

  const transform = record => {
    if (!record || typeof record !== 'object') return record

    const result = { ...record }
    imageFields.forEach(field => {
      if (result[field]) {
        // 保留原始 key，添加转换后的 URL 字段
        result[`${field}_key`] = result[field]
        result[field] = getImageUrl(result[field])
      }
    })
    return result
  }

  if (Array.isArray(data)) {
    return data.map(transform)
  }

  return transform(data)
}

/**
 * 检查对象 key 格式是否有效
 *
 * @param {string} objectKey - 对象 key
 * @returns {boolean} 是否为有效格式
 *
 * @example
 * isValidObjectKey('prizes/20260108_abc123.jpg') // true
 * isValidObjectKey('prizes/thumbnails/small/20260108_abc123.jpg') // true
 * isValidObjectKey('https://example.com/img.jpg') // false
 * isValidObjectKey('/local/path/img.jpg') // false
 */
function isValidObjectKey(objectKey) {
  if (!objectKey || typeof objectKey !== 'string') return false

  // 不应该是完整 URL
  if (objectKey.startsWith('http://') || objectKey.startsWith('https://')) return false

  // 不应该以斜杠开头（本地路径格式）
  if (objectKey.startsWith('/')) return false

  // 应该包含文件扩展名（支持 .jpg .jpeg .png .gif .webp）
  const hasExtension = /\.(jpe?g|png|gif|webp)$/i.test(objectKey)

  // 应该包含文件夹路径
  const hasFolder = objectKey.includes('/')

  return hasExtension && hasFolder
}

module.exports = {
  getImageUrl,
  getImageUrls,
  getDefaultImageUrl,
  getThumbnailUrl,
  transformImageFields,
  isValidObjectKey
}
