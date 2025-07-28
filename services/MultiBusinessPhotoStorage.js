const SealosStorageService = require('./sealosStorage');
const { BusinessConfigs } = require('../models');
const crypto = require('crypto');
const path = require('path');

class MultiBusinessPhotoStorage extends SealosStorageService {
  constructor() {
    super(); // 继承现有Sealos配置
    
    // 业务配置缓存
    this.businessConfigCache = new Map();
    this.configCacheExpiry = 10 * 60 * 1000; // 10分钟配置缓存
    
    // 路径生成缓存
    this.pathCache = new Map();
    this.userShardCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5分钟路径缓存
    this.maxCacheSize = 1000;
    
    // 初始化默认配置
    this.initializeConfigs();
  }
  
  /**
   * 初始化业务配置
   */
  async initializeConfigs() {
    try {
      // 确保数据库中有默认配置
      if (BusinessConfigs && BusinessConfigs.initializeDefaultConfigs) {
        await BusinessConfigs.initializeDefaultConfigs();
        console.log('✅ 业务配置初始化完成');
      }
    } catch (error) {
      console.error('❌ 业务配置初始化失败:', error.message);
      // 使用内置默认配置作为降级方案
      this.loadFallbackConfigs();
    }
  }
  
  /**
   * 加载降级配置
   */
  loadFallbackConfigs() {
    const fallbackConfigs = {
      lottery: {
        hotDays: 30,
        standardDays: 365,
        archiveDays: 1095,
        categories: ['prizes', 'wheels', 'results', 'banners'],
        maxFileSize: 10 * 1024 * 1024,
        allowedTypes: ['jpg', 'jpeg', 'png', 'webp']
      },
      exchange: {
        hotDays: 60,
        standardDays: 730,
        archiveDays: 2190,
        categories: ['products', 'categories', 'promotions'],
        maxFileSize: 15 * 1024 * 1024,
        allowedTypes: ['jpg', 'jpeg', 'png', 'webp']
      },
      trade: {
        hotDays: 45,
        standardDays: 545,
        archiveDays: 1825,
        categories: ['items', 'banners', 'transactions'],
        maxFileSize: 12 * 1024 * 1024,
        allowedTypes: ['jpg', 'jpeg', 'png', 'webp']
      },
      uploads: {
        hotDays: 7,
        standardDays: 1095,
        archiveDays: 2190,
        categories: ['pending_review', 'approved', 'rejected', 'processing'],
        maxFileSize: 20 * 1024 * 1024,
        allowedTypes: ['jpg', 'jpeg', 'png', 'webp']
      }
    };
    
    Object.entries(fallbackConfigs).forEach(([businessType, config]) => {
      this.businessConfigCache.set(businessType, {
        config,
        timestamp: Date.now()
      });
    });
  }
  
  /**
   * 获取业务配置
   * @param {string} businessType - 业务类型
   * @returns {Promise<object>} 业务配置
   */
  async getBusinessConfig(businessType) {
    // 检查缓存
    const cached = this.businessConfigCache.get(businessType);
    if (cached && (Date.now() - cached.timestamp) < this.configCacheExpiry) {
      return cached.config;
    }
    
    try {
      // 从数据库获取配置
      let dbConfig;
      if (BusinessConfigs && BusinessConfigs.getBusinessConfig) {
        dbConfig = await BusinessConfigs.getBusinessConfig(businessType);
      }
      
      let config;
      if (dbConfig) {
        // 转换数据库配置格式
        config = {
          hotDays: dbConfig.storage_policy?.hotDays || 30,
          standardDays: dbConfig.storage_policy?.standardDays || 365,
          archiveDays: dbConfig.storage_policy?.archiveDays || 1095,
          categories: dbConfig.file_rules?.categories || [],
          maxFileSize: dbConfig.file_rules?.maxFileSize || 10485760,
          allowedTypes: dbConfig.file_rules?.allowedTypes || ['jpg', 'jpeg', 'png', 'webp']
        };
      } else {
        // 使用内置默认配置
        config = this.getFallbackConfig(businessType);
      }
      
      // 更新缓存
      this.businessConfigCache.set(businessType, {
        config,
        timestamp: Date.now()
      });
      
      return config;
    } catch (error) {
      console.error(`❌ 获取业务配置失败：${businessType}`, error.message);
      return this.getFallbackConfig(businessType);
    }
  }
  
  /**
   * 获取降级配置
   */
  getFallbackConfig(businessType) {
    const cached = this.businessConfigCache.get(businessType);
    if (cached) {
      return cached.config;
    }
    
    // 返回基础默认配置
    return {
      hotDays: 30,
      standardDays: 365,
      archiveDays: 1095,
      categories: ['default'],
      maxFileSize: 10485760,
      allowedTypes: ['jpg', 'jpeg', 'png', 'webp']
    };
  }
  
  /**
   * 生成智能存储路径 - 核心方法
   * @param {string} businessType - 业务类型 (lottery/exchange/trade/uploads)
   * @param {string} category - 分类 (prizes/products/items/pending_review等)
   * @param {string|number} contextId - 上下文ID (用户ID/奖品ID/商品ID等)
   * @param {object} options - 配置选项
   * @returns {Promise<string>} 存储路径
   */
  async generateStoragePath(businessType, category, contextId, options = {}) {
    const {
      uploadTime = Date.now(),
      isActive = false,
      priority = 'normal',
      originalName = 'unknown.jpg'
    } = options;
    
    const startTime = Date.now();
    
    try {
      // 1. 输入验证
      this.validateInputs(businessType, category, contextId);
      
      // 2. 检查缓存
      const cacheKey = this.getCacheKey(businessType, category, contextId, options);
      if (this.pathCache.has(cacheKey)) {
        const cached = this.pathCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheExpiry) {
          console.log(`🔄 使用缓存路径: ${cached.path}`);
          return cached.path;
        }
      }
      
      // 3. 智能选择存储层级
      const storageLayer = await this.selectStorageLayer(businessType, category, {
        uploadTime,
        isActive,
        priority
      });
      
      // 4. 生成完整文件路径
      const filePath = this.buildFilePath(storageLayer, businessType, category, contextId, options);
      
      // 5. 缓存结果
      this.setCache(cacheKey, filePath);
      
      const duration = Date.now() - startTime;
      console.log(`✅ 生成存储路径: ${filePath} (层级: ${storageLayer}, 耗时: ${duration}ms)`);
      return filePath;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ 生成存储路径失败: ${error.message}, 耗时: ${duration}ms`);
      throw error;
    }
  }
  
  /**
   * 智能存储层选择算法
   * @param {string} businessType - 业务类型
   * @param {string} category - 分类
   * @param {object} options - 选项
   * @returns {Promise<string>} 存储层级
   */
  async selectStorageLayer(businessType, category, options) {
    const { uploadTime, isActive, priority } = options;
    const config = await this.getBusinessConfig(businessType);
    
    // 高优先级数据直接使用热存储
    if (priority === 'high' || isActive === true) {
      return 'hot';
    }
    
    // 基于时间的智能判断
    const fileAge = (Date.now() - uploadTime) / (1000 * 60 * 60 * 24);
    
    // 业务特定逻辑
    if (businessType === 'uploads' && category === 'pending_review') {
      return 'hot'; // 待审核图片需要快速访问
    }
    
    if (businessType === 'lottery' && category === 'prizes' && isActive) {
      return 'hot'; // 当前活动奖品
    }
    
    if (businessType === 'exchange' && category === 'products' && isActive) {
      return 'hot'; // 热门商品
    }
    
    // 基于文件年龄判断存储层级
    if (fileAge <= config.hotDays) return 'hot';
    if (fileAge <= config.standardDays) return 'standard';
    return 'archive';
  }
  
  /**
   * 构建完整文件路径
   * @param {string} storageLayer - 存储层级
   * @param {string} businessType - 业务类型
   * @param {string} category - 分类
   * @param {string|number} contextId - 上下文ID
   * @param {object} options - 选项
   * @returns {string} 文件路径
   */
  buildFilePath(storageLayer, businessType, category, contextId, options) {
    const { uploadTime, originalName } = options;
    const fileName = this.generateFileName(businessType, contextId, uploadTime, originalName);
    
    switch (storageLayer) {
      case 'hot':
        return `hot/${businessType}/${category}/${fileName}`;
      
      case 'standard':
        if (businessType === 'uploads') {
          // 用户上传使用分片存储
          const userShard = this.getUserShard(contextId);
          const datePath = this.getDatePath(uploadTime);
          return `standard/users/${userShard}/u${contextId}/${datePath}/${fileName}`;
        } else {
          // 业务图片使用业务分类存储
          return `standard/${businessType}/${category}/${fileName}`;
        }
      
      case 'archive':
        const year = new Date(uploadTime).getFullYear();
        const month = (new Date(uploadTime).getMonth() + 1).toString().padStart(2, '0');
        return `archive/${year}/${month}/${businessType}/${category}/${fileName}`;
      
      default:
        throw new Error(`未知存储层级: ${storageLayer}`);
    }
  }
  
  /**
   * 用户分片计算 (每1万用户一个分片)
   * @param {number} userId - 用户ID
   * @returns {string} 分片标识
   */
  getUserShard(userId) {
    const cacheKey = `shard_${userId}`;
    if (this.userShardCache.has(cacheKey)) {
      return this.userShardCache.get(cacheKey);
    }
    
    const shardSize = 10000;
    const shardId = Math.floor(userId / shardSize);
    const start = shardId * shardSize;
    const end = start + shardSize - 1;
    const shard = `shard_${start.toString().padStart(6, '0')}-${end.toString().padStart(6, '0')}`;
    
    this.userShardCache.set(cacheKey, shard);
    return shard;
  }
  
  /**
   * 生成唯一文件名
   * @param {string} businessType - 业务类型
   * @param {string|number} contextId - 上下文ID
   * @param {number} timestamp - 时间戳
   * @param {string} originalName - 原始文件名
   * @returns {string} 文件名
   */
  generateFileName(businessType, contextId, timestamp, originalName) {
    const ext = originalName ? path.extname(originalName).toLowerCase() : '.jpg';
    const hash = crypto.randomBytes(4).toString('hex');
    const prefix = businessType.substr(0, 3).toUpperCase(); // 业务前缀
    const dateStr = new Date(timestamp).toISOString().slice(0, 10).replace(/-/g, '');
    return `${dateStr}_${prefix}_${contextId}_${hash}${ext}`;
  }
  
  /**
   * 生成缩略图路径
   * @param {string} originalPath - 原始路径
   * @param {string} size - 尺寸 (small/medium/large)
   * @returns {string} 缩略图路径
   */
  generateThumbnailPath(originalPath, size = 'medium') {
    const dir = path.dirname(originalPath);
    const name = path.basename(originalPath, path.extname(originalPath));
    const ext = path.extname(originalPath);
    return `${dir}/thumbnails/${size}/${name}_${size}${ext}`;
  }
  
  /**
   * 输入验证
   * @param {string} businessType - 业务类型
   * @param {string} category - 分类
   * @param {string|number} contextId - 上下文ID
   */
  async validateInputs(businessType, category, contextId) {
    const config = await this.getBusinessConfig(businessType);
    
    if (!config) {
      throw new Error(`不支持的业务类型: ${businessType}`);
    }
    
    if (config.categories.length > 0 && !config.categories.includes(category)) {
      console.warn(`⚠️ 业务${businessType}不包含预定义分类: ${category}，但允许继续处理`);
    }
    
    if (!contextId) {
      throw new Error('contextId不能为空');
    }
  }
  
  /**
   * 文件验证
   * @param {Buffer} fileBuffer - 文件缓冲区
   * @param {string} originalName - 原始文件名
   * @param {string} businessType - 业务类型
   * @returns {Promise<object>} 验证结果
   */
  async validateFile(fileBuffer, originalName, businessType) {
    const config = await this.getBusinessConfig(businessType);
    
    // 检查文件大小
    if (fileBuffer.length > config.maxFileSize) {
      throw new Error(`文件大小超限: ${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB > ${(config.maxFileSize / 1024 / 1024).toFixed(2)}MB`);
    }
    
    // 检查文件类型
    const ext = path.extname(originalName).toLowerCase().substring(1);
    if (!config.allowedTypes.includes(ext)) {
      throw new Error(`不支持的文件类型: ${ext}，支持的类型: ${config.allowedTypes.join(', ')}`);
    }
    
    return {
      isValid: true,
      fileSize: fileBuffer.length,
      fileType: ext,
      config: config
    };
  }
  
  /**
   * 缓存管理方法
   */
  getCacheKey(businessType, category, contextId, options) {
    const key = `${businessType}_${category}_${contextId}_${JSON.stringify(options)}`;
    return crypto.createHash('md5').update(key).digest('hex');
  }
  
  setCache(cacheKey, filePath) {
    // 限制缓存大小
    if (this.pathCache.size >= this.maxCacheSize) {
      const firstKey = this.pathCache.keys().next().value;
      this.pathCache.delete(firstKey);
    }
    
    this.pathCache.set(cacheKey, {
      path: filePath,
      timestamp: Date.now()
    });
  }
  
  getDatePath(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}/${month}/${day}`;
  }
  
  /**
   * 清理过期缓存
   */
  cleanExpiredCache() {
    const now = Date.now();
    let cleanedCount = 0;
    
    // 清理路径缓存
    for (const [key, value] of this.pathCache.entries()) {
      if (now - value.timestamp > this.cacheExpiry) {
        this.pathCache.delete(key);
        cleanedCount++;
      }
    }
    
    // 清理配置缓存
    for (const [key, value] of this.businessConfigCache.entries()) {
      if (now - value.timestamp > this.configCacheExpiry) {
        this.businessConfigCache.delete(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 清理过期缓存: ${cleanedCount}项`);
    }
  }
  
  /**
   * 获取缓存统计
   */
  getCacheStats() {
    return {
      pathCache: {
        size: this.pathCache.size,
        maxSize: this.maxCacheSize,
        usage: `${((this.pathCache.size / this.maxCacheSize) * 100).toFixed(1)}%`
      },
      configCache: {
        size: this.businessConfigCache.size,
        entries: Array.from(this.businessConfigCache.keys())
      },
      userShardCache: {
        size: this.userShardCache.size
      }
    };
  }
}

module.exports = MultiBusinessPhotoStorage; 