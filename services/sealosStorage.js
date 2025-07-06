/**
 * Sealos对象存储服务
 * 基于AWS S3 SDK实现，兼容Sealos对象存储API
 */

const AWS = require('aws-sdk');
const crypto = require('crypto');
const path = require('path');

class SealosStorageService {
  constructor() {
    // 🔴 使用用户提供的真实Sealos配置 - 强制使用正确桶名
    this.config = {
      endpoint: process.env.SEALOS_ENDPOINT || 'https://objectstorageapi.bja.sealos.run',
      bucket: 'br0za7uc-tiangong', // 强制使用正确的桶名
      accessKeyId: process.env.SEALOS_ACCESS_KEY || 'br0za7uc',
      secretAccessKey: process.env.SEALOS_SECRET_KEY || 'skxg8mk5gqfhf9xz'
    };

    // 初始化S3客户端
    this.s3 = new AWS.S3({
      endpoint: this.config.endpoint,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      region: process.env.SEALOS_REGION || 'bja',
      s3ForcePathStyle: true, // Sealos需要path-style访问
      signatureVersion: 'v4'
    });

    console.log(`🔗 Sealos存储初始化完成:`, {
      endpoint: this.config.endpoint,
      bucket: this.config.bucket,
      accessKey: this.config.accessKeyId
    });
  }

  /**
   * 🔴 上传图片文件
   * @param {Buffer} fileBuffer - 文件缓冲区
   * @param {string} originalName - 原始文件名
   * @param {string} folder - 存储文件夹 (默认: photos)
   * @returns {Promise<string>} 文件访问URL
   */
  async uploadImage(fileBuffer, originalName, folder = 'photos') {
    try {
      // 生成唯一文件名
      const timestamp = Date.now();
      const hash = crypto.randomBytes(8).toString('hex');
      const ext = path.extname(originalName) || '.jpg';
      const fileName = `${folder}/${timestamp}_${hash}${ext}`;

      // 检测文件类型
      const contentType = this.getContentType(ext);

      // 上传参数
      const uploadParams = {
        Bucket: this.config.bucket,
        Key: fileName,
        Body: fileBuffer,
        ContentType: contentType,
        ACL: 'public-read', // 设置为公共可读
        CacheControl: 'max-age=31536000' // 缓存1年
      };

      console.log(`📤 开始上传文件: ${fileName}`);

      // 执行上传
      const result = await this.s3.upload(uploadParams).promise();
      
      console.log(`✅ 文件上传成功: ${result.Location}`);
      
      return result.Location;
    } catch (error) {
      console.error('❌ Sealos文件上传失败:', error);
      throw new Error(`文件上传失败: ${error.message}`);
    }
  }

  /**
   * 🔴 批量上传文件
   * @param {Array} files - 文件数组 [{buffer, name}, ...]
   * @param {string} folder - 存储文件夹
   * @returns {Promise<Array>} 上传结果数组
   */
  async uploadMultipleImages(files, folder = 'photos') {
    try {
      const uploadPromises = files.map(file => 
        this.uploadImage(file.buffer, file.name, folder)
      );
      
      const results = await Promise.all(uploadPromises);
      console.log(`✅ 批量上传完成，共${results.length}个文件`);
      
      return results;
    } catch (error) {
      console.error('❌ 批量上传失败:', error);
      throw error;
    }
  }

  /**
   * 🔴 删除文件
   * @param {string} fileKey - 文件Key或完整URL
   * @returns {Promise<boolean>} 删除结果
   */
  async deleteFile(fileKey) {
    try {
      // 如果是完整URL，提取Key
      if (fileKey.startsWith('http')) {
        const url = new URL(fileKey);
        fileKey = url.pathname.substring(1); // 移除开头的/
      }

      const deleteParams = {
        Bucket: this.config.bucket,
        Key: fileKey
      };

      await this.s3.deleteObject(deleteParams).promise();
      console.log(`🗑️ 文件删除成功: ${fileKey}`);
      
      return true;
    } catch (error) {
      console.error('❌ 文件删除失败:', error);
      return false;
    }
  }

  /**
   * 🔴 获取文件临时访问URL
   * @param {string} fileKey - 文件Key
   * @param {number} expiresIn - 过期时间（秒，默认1小时）
   * @returns {Promise<string>} 临时访问URL
   */
  async getSignedUrl(fileKey, expiresIn = 3600) {
    try {
      const params = {
        Bucket: this.config.bucket,
        Key: fileKey,
        Expires: expiresIn
      };

      const url = await this.s3.getSignedUrlPromise('getObject', params);
      return url;
    } catch (error) {
      console.error('❌ 获取临时URL失败:', error);
      throw error;
    }
  }

  /**
   * 🔴 检查文件是否存在
   * @param {string} fileKey - 文件Key
   * @returns {Promise<boolean>} 文件是否存在
   */
  async fileExists(fileKey) {
    try {
      await this.s3.headObject({
        Bucket: this.config.bucket,
        Key: fileKey
      }).promise();
      
      return true;
    } catch (error) {
      if (error.code === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * 🔴 获取文件元数据
   * @param {string} fileKey - 文件Key
   * @returns {Promise<Object>} 文件元数据
   */
  async getFileMetadata(fileKey) {
    try {
      const result = await this.s3.headObject({
        Bucket: this.config.bucket,
        Key: fileKey
      }).promise();

      return {
        size: result.ContentLength,
        type: result.ContentType,
        lastModified: result.LastModified,
        etag: result.ETag
      };
    } catch (error) {
      console.error('❌ 获取文件元数据失败:', error);
      throw error;
    }
  }

  /**
   * 🔴 列出文件夹中的文件
   * @param {string} prefix - 文件夹前缀
   * @param {number} maxKeys - 最大返回数量
   * @returns {Promise<Array>} 文件列表
   */
  async listFiles(prefix = '', maxKeys = 1000) {
    try {
      const params = {
        Bucket: this.config.bucket,
        Prefix: prefix,
        MaxKeys: maxKeys
      };

      const result = await this.s3.listObjectsV2(params).promise();
      
      return result.Contents.map(item => ({
        key: item.Key,
        size: item.Size,
        lastModified: item.LastModified,
        etag: item.ETag
      }));
    } catch (error) {
      console.error('❌ 列出文件失败:', error);
      throw error;
    }
  }

  /**
   * 压缩图片（可选实现）
   * @param {Buffer} imageBuffer - 图片缓冲区
   * @param {Object} options - 压缩选项
   * @returns {Promise<Buffer>} 压缩后的图片
   */
  async compressImage(imageBuffer, options = {}) {
    // 这里可以集成图片压缩库如sharp
    // 暂时返回原图
    return imageBuffer;
  }

  /**
   * 根据文件扩展名获取Content-Type
   * @param {string} ext - 文件扩展名
   * @returns {string} Content-Type
   */
  getContentType(ext) {
    const contentTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.json': 'application/json'
    };

    return contentTypes[ext.toLowerCase()] || 'application/octet-stream';
  }

  /**
   * 🔴 测试连接
   * @returns {Promise<boolean>} 连接测试结果
   */
  async testConnection() {
    try {
      // 尝试列出存储桶内容
      await this.s3.listObjectsV2({
        Bucket: this.config.bucket,
        MaxKeys: 1
      }).promise();

      console.log('✅ Sealos存储连接测试成功');
      return true;
    } catch (error) {
      console.error('❌ Sealos存储连接测试失败:', error);
      return false;
    }
  }

  /**
   * 🔴 获取存储统计信息
   * @returns {Promise<Object>} 存储统计
   */
  async getStorageStats() {
    try {
      const files = await this.listFiles();
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      
      return {
        fileCount: files.length,
        totalSize: totalSize,
        totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2)
      };
    } catch (error) {
      console.error('❌ 获取存储统计失败:', error);
      throw error;
    }
  }
}

// 导出单例
const sealosStorage = new SealosStorageService();

module.exports = sealosStorage; 