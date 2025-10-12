/**
 * 缩略图生成服务
 * 支持多种尺寸的缩略图生成，优化图片加载性能
 */

const sharp = require('sharp')
const path = require('path')
const fs = require('fs').promises
const { v4: uuidv4 } = require('uuid')

class ThumbnailService {
  constructor () {
    this.uploadsDir = path.join(__dirname, '../uploads')
    this.thumbnailsDir = path.join(this.uploadsDir, 'thumbnails')
    this.ensureDirectories()
  }

  // 确保目录存在
  async ensureDirectories () {
    try {
      await fs.access(this.thumbnailsDir)
    } catch {
      await fs.mkdir(this.thumbnailsDir, { recursive: true })
      console.log('✅ 创建缩略图目录:', this.thumbnailsDir)
    }
  }

  /**
   * 生成缩略图
   * @param {string} originalPath - 原始图片路径
   * @param {object} options - 生成选项
   * @returns {object} 缩略图路径对象
   */
  async generateThumbnails (originalPath, options = {}) {
    const {
      sizes = {
        small: { width: 150, height: 150 },
        medium: { width: 300, height: 300 },
        large: { width: 600, height: 600 }
      },
      quality = 80,
      format = 'jpeg'
    } = options

    // 构建完整的文件路径
    const fullPath = path.join(this.uploadsDir, originalPath)

    // 检查原始文件是否存在
    try {
      await fs.access(fullPath)
    } catch {
      throw new Error(`原始文件不存在: ${fullPath}`)
    }

    // 获取原始文件信息
    const ext = path.extname(originalPath)
    const basename = path.basename(originalPath, ext)
    const uniqueId = uuidv4().substring(0, 8)

    const thumbnails = {}

    try {
      // 为每个尺寸生成缩略图
      for (const [sizeName, dimensions] of Object.entries(sizes)) {
        const thumbnailFilename = `${basename}_${sizeName}_${uniqueId}.${format}`
        const thumbnailPath = path.join(this.thumbnailsDir, thumbnailFilename)
        const relativePath = `thumbnails/${thumbnailFilename}`

        await sharp(fullPath)
          .resize(dimensions.width, dimensions.height, {
            fit: 'cover', // 保持宽高比，裁剪多余部分
            position: 'center'
          })
          .jpeg({ quality })
          .toFile(thumbnailPath)

        thumbnails[sizeName] = relativePath
        console.log(`✅ 生成${sizeName}缩略图: ${relativePath}`)
      }

      return thumbnails
    } catch (error) {
      console.error('缩略图生成失败:', error)
      // 清理已生成的缩略图
      await this.cleanupThumbnails(thumbnails)
      throw error
    }
  }

  /**
   * 删除缩略图文件
   * @param {object} thumbnailPaths - 缩略图路径对象
   */
  async deleteThumbnails (thumbnailPaths) {
    if (!thumbnailPaths) return

    for (const [sizeName, relativePath] of Object.entries(thumbnailPaths)) {
      if (!relativePath) continue

      const fullPath = path.join(this.uploadsDir, relativePath)
      try {
        await fs.unlink(fullPath)
        console.log(`🗑️ 删除${sizeName}缩略图: ${relativePath}`)
      } catch (error) {
        console.warn(`⚠️ 删除缩略图失败: ${relativePath}`, error.message)
      }
    }
  }

  /**
   * 清理失败的缩略图
   * @param {object} thumbnails - 已生成的缩略图
   */
  async cleanupThumbnails (thumbnails) {
    for (const [, relativePath] of Object.entries(thumbnails)) {
      if (!relativePath) continue

      const fullPath = path.join(this.uploadsDir, relativePath)
      try {
        await fs.unlink(fullPath)
        console.log(`🧹 清理失败缩略图: ${relativePath}`)
      } catch (error) {
        // 忽略清理错误
      }
    }
  }

  /**
   * 检查是否为支持的图片格式
   * @param {string} mimeType - MIME类型
   * @returns {boolean}
   */
  isSupportedImageType (mimeType) {
    const supportedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/tiff',
      'image/bmp'
    ]
    return supportedTypes.includes(mimeType.toLowerCase())
  }

  /**
   * 批量生成缩略图（用于已存在的图片）
   * @param {Array} imagePaths - 图片路径数组
   * @returns {Array} 生成结果
   */
  async batchGenerateThumbnails (imagePaths) {
    const results = []

    for (const imagePath of imagePaths) {
      try {
        const thumbnails = await this.generateThumbnails(imagePath)
        results.push({
          originalPath: imagePath,
          thumbnails,
          success: true
        })
      } catch (error) {
        results.push({
          originalPath: imagePath,
          error: error.message,
          success: false
        })
      }
    }

    return results
  }

  /**
   * 获取缩略图统计信息
   * @returns {object} 统计信息
   */
  async getThumbnailStats () {
    try {
      const files = await fs.readdir(this.thumbnailsDir)
      const stats = await Promise.all(
        files.map(async (file) => {
          const filePath = path.join(this.thumbnailsDir, file)
          const stat = await fs.stat(filePath)
          return {
            name: file,
            size: stat.size,
            created: stat.birthtime
          }
        })
      )

      const totalSize = stats.reduce((sum, file) => sum + file.size, 0)

      return {
        totalFiles: files.length,
        totalSize,
        totalSizeFormatted: this.formatFileSize(totalSize),
        files: stats
      }
    } catch (error) {
      console.error('获取缩略图统计失败:', error)
      return {
        totalFiles: 0,
        totalSize: 0,
        totalSizeFormatted: '0 B',
        files: []
      }
    }
  }

  /**
   * 格式化文件大小
   * @param {number} bytes - 字节数
   * @returns {string} 格式化后的大小
   */
  formatFileSize (bytes) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }
}

// 🔥 导出单例实例（供路由层和模型直接调用）
const thumbnailServiceInstance = new ThumbnailService()

// 同时导出类（供ServiceManager需要自定义配置的场景）
module.exports = thumbnailServiceInstance
module.exports.ThumbnailService = ThumbnailService
