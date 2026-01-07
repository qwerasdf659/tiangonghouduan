/**
 * 图片 URL 辅助工具
 *
 * 🎯 架构决策（2026-01-08 拍板）：
 * - 数据库统一存储对象 key（如 prizes/xxx.jpg）
 * - API 层通过此工具生成完整 URL
 * - 支持 CDN 域名切换、URL 参数化缩略图
 *
 * 使用场景：
 * - API 响应时将数据库中的对象 key 转换为公网 URL
 * - 前端预览图片时获取完整访问地址
 * - 批量处理图片 URL 转换
 *
 * @module ImageUrlHelper
 */

/**
 * 获取图片公网访问 URL
 *
 * @param {string} objectKey - 对象 key（如 prizes/xxx.jpg 或 popup-banners/xxx.jpg）
 * @param {Object} options - URL 选项
 * @param {number} options.width - 缩略图宽度（依赖 CDN 支持）
 * @param {number} options.height - 缩略图高度（依赖 CDN 支持）
 * @param {string} options.fit - 缩放模式 cover/contain/fill
 * @returns {string|null} 完整公网访问 URL
 *
 * @example
 * // 基础用法
 * getImageUrl('prizes/abc123.jpg')
 * // 返回: https://cdn.example.com/bucket/prizes/abc123.jpg
 *
 * @example
 * // 带缩略图参数
 * getImageUrl('prizes/abc123.jpg', { width: 300, height: 300, fit: 'cover' })
 * // 返回: https://cdn.example.com/bucket/prizes/abc123.jpg?width=300&height=300&fit=cover
 */
function getImageUrl(objectKey, options = {}) {
  if (!objectKey) {
    return null
  }

  // 如果已经是完整 URL，直接返回（兼容历史数据）
  if (objectKey.startsWith('http://') || objectKey.startsWith('https://')) {
    return objectKey
  }

  // 如果是本地路径格式（/开头），尝试转换（兼容历史数据）
  if (objectKey.startsWith('/')) {
    // 移除开头的斜杠，转换为对象 key 格式
    objectKey = objectKey.substring(1)
  }

  // CDN 域名（优先）或 Sealos 公网端点
  const cdnDomain = process.env.CDN_DOMAIN || process.env.SEALOS_ENDPOINT
  const bucket = process.env.SEALOS_BUCKET

  if (!cdnDomain || !bucket) {
    console.warn('❌ ImageUrlHelper: 缺少 CDN_DOMAIN/SEALOS_ENDPOINT 或 SEALOS_BUCKET 环境变量')
    return null
  }

  // 基础 URL：CDN 域名 + bucket + 对象 key
  let url = `${cdnDomain}/${bucket}/${objectKey}`

  // URL 参数化缩略图（如果提供了尺寸参数）
  if (options.width || options.height) {
    const params = new URLSearchParams()
    if (options.width) params.append('width', options.width)
    if (options.height) params.append('height', options.height)
    if (options.fit) params.append('fit', options.fit)
    url = `${url}?${params.toString()}`
  }

  return url
}

/**
 * 批量生成图片公网访问 URL
 *
 * @param {string[]} objectKeys - 对象 key 数组
 * @param {Object} options - URL 选项（同 getImageUrl）
 * @returns {Object} key 到 URL 的映射 { objectKey: publicUrl }
 *
 * @example
 * getImageUrls(['prizes/a.jpg', 'prizes/b.jpg'])
 * // 返回: { 'prizes/a.jpg': 'https://...', 'prizes/b.jpg': 'https://...' }
 */
function getImageUrls(objectKeys, options = {}) {
  const result = {}
  if (!Array.isArray(objectKeys)) return result

  objectKeys.forEach(key => {
    result[key] = getImageUrl(key, options)
  })
  return result
}

/**
 * 获取默认图片 URL
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
 * 生成缩略图 URL（常用尺寸快捷方法）
 *
 * @param {string} objectKey - 对象 key
 * @param {string} size - 尺寸类型 small/medium/large/original
 * @returns {string|null} 缩略图 URL
 */
function getThumbnailUrl(objectKey, size = 'medium') {
  const sizeConfig = {
    small: { width: 150, height: 150, fit: 'cover' },
    medium: { width: 300, height: 300, fit: 'cover' },
    large: { width: 600, height: 600, fit: 'cover' },
    original: {} // 原图，无参数
  }

  const options = sizeConfig[size] || sizeConfig.medium
  return getImageUrl(objectKey, options)
}

/**
 * 转换数据库记录中的图片字段为 URL
 *
 * 用于 API 响应时批量转换记录中的图片字段
 *
 * @param {Object|Array} data - 单个记录或记录数组
 * @param {string[]} imageFields - 需要转换的图片字段名数组
 * @param {Object} options - URL 选项
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
function transformImageFields(data, imageFields = ['image_url'], options = {}) {
  if (!data) return data

  const transform = record => {
    if (!record || typeof record !== 'object') return record

    const result = { ...record }
    imageFields.forEach(field => {
      if (result[field]) {
        // 保留原始 key，添加转换后的 URL 字段
        result[`${field}_key`] = result[field]
        result[field] = getImageUrl(result[field], options)
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
 */
function isValidObjectKey(objectKey) {
  if (!objectKey || typeof objectKey !== 'string') return false

  // 不应该是完整 URL
  if (objectKey.startsWith('http://') || objectKey.startsWith('https://')) return false

  // 不应该以斜杠开头（本地路径格式）
  if (objectKey.startsWith('/')) return false

  // 应该包含文件扩展名
  const hasExtension = /\.[a-zA-Z0-9]+$/.test(objectKey)

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
