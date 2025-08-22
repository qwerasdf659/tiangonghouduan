/**
 * 用户行为分析服务
 * 深度集成现有v3.0架构，复用数据库连接、缓存、事件总线
 * 支持批量行为数据处理、用户画像生成、智能推荐
 * 创建时间：2025年08月19日
 */

const { sequelize } = require('../models')
const redis = require('redis')
const eventBusService = require('./EventBusService')
const lodash = require('lodash')

class BehaviorAnalyticsService {
  constructor () {
    // 🔥 复用现有Redis配置 - 修复新版本Redis客户端语法
    this.redis = redis.createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379
      },
      password: process.env.REDIS_PASSWORD || undefined,
      database: parseInt(process.env.ANALYTICS_REDIS_DB || process.env.REDIS_DB) || 1
    })

    this.batchSize = parseInt(process.env.ANALYTICS_BATCH_SIZE) || 100
    this.cacheConfig = {
      shortTerm: parseInt(process.env.ANALYTICS_CACHE_TTL_SHORT) || 300, // 5分钟
      mediumTerm: parseInt(process.env.ANALYTICS_CACHE_TTL_MEDIUM) || 7200, // 2小时
      longTerm: 86400 // 24小时
    }

    // 🔥 Redis缓存键配置（避免与现有系统冲突）
    this.cacheKeys = {
      USER_PROFILE: 'analytics:profile:',
      USER_SEGMENTS: 'analytics:segments:',
      ENGAGEMENT_SCORE: 'analytics:engagement:',
      USER_RECOMMENDATIONS: 'analytics:rec:',
      HOT_RECOMMENDATIONS: 'analytics:rec:hot:',
      REALTIME_COUNTERS: 'analytics:counters:',
      USER_SESSION: 'analytics:session:',
      USER_BEHAVIOR_BUFFER: 'analytics:behavior:buffer:'
    }

    this.initializeRedis()
    console.log('✅ BehaviorAnalyticsService 初始化完成')
  }

  /**
   * 🔥 初始化Redis连接
   * @private
   */
  async initializeRedis () {
    try {
      await this.redis.connect()
      console.log('✅ Analytics Redis 连接成功')
    } catch (error) {
      console.error('❌ Analytics Redis 连接失败:', error)
      // 使用内存缓存作为降级方案
      this.memoryCache = new Map()
      console.log('⚠️ 使用内存缓存作为降级方案')
    }
  }

  /**
   * 🔥 批量处理用户行为数据
   * @param {number} userId - 用户ID
   * @param {Array} behaviors - 行为数据数组
   * @returns {Object} 处理结果
   */
  async processBehaviorsBatch (userId, behaviors) {
    try {
      // 1. 验证用户存在（利用现有User模型）
      const { User } = sequelize.models
      const user = await User.findByPk(userId)
      if (!user) {
        throw new Error(`用户 ${userId} 不存在`)
      }

      // 2. 数据清洗和预处理
      const cleanedBehaviors = this.cleanBehaviorData(behaviors)
      console.log(`📊 处理用户 ${userId} 的 ${cleanedBehaviors.length} 条行为数据`)

      // 3. 分批处理（避免大批量数据堵塞）
      const batches = lodash.chunk(cleanedBehaviors, this.batchSize)
      let processed = 0

      for (const batch of batches) {
        // 🔥 使用现有数据库事务
        await sequelize.transaction(async t => {
          const behaviorRecords = batch.map(behavior => ({
            user_id: userId,
            session_id: behavior.sessionId,
            event_type: behavior.eventType,
            event_data: behavior.eventData,
            page_path: behavior.eventData?.page || null,
            referrer_path: behavior.eventData?.referrer || null,
            device_info: behavior.deviceInfo || null,
            ip_address: this.maskIpAddress(behavior.ip),
            user_agent: this.maskUserAgent(behavior.userAgent),
            created_at: new Date(behavior.timestamp)
          }))

          // 🔥 批量插入到数据库
          const { AnalyticsBehavior } = sequelize.models
          await AnalyticsBehavior.bulkCreate(behaviorRecords, { transaction: t })
        })

        processed += batch.length
      }

      // 4. 异步更新实时统计（不阻塞主流程）
      this.updateRealtimeStats(userId, cleanedBehaviors).catch(err => {
        console.error('实时统计更新失败:', err)
      })

      // 5. 调度用户画像更新（异步）
      this.scheduleProfileUpdate(userId).catch(err => {
        console.error('用户画像更新调度失败:', err)
      })

      console.log(`✅ 成功处理用户 ${userId} 的 ${processed} 条行为数据`)
      return { processed, buffered: 0 }
    } catch (error) {
      console.error('行为数据处理失败:', error)
      throw error
    }
  }

  /**
   * 🔥 获取用户画像数据
   * @param {number} userId - 用户ID
   * @returns {Object} 用户画像
   */
  async getUserProfile (userId) {
    try {
      // 1. 尝试从缓存获取
      const cacheKey = `${this.cacheKeys.USER_PROFILE}${userId}`
      const cached = await this.getCacheData(cacheKey)

      if (cached) {
        console.log(`📊 从缓存获取用户 ${userId} 画像数据`)
        return JSON.parse(cached)
      }

      // 2. 从数据库查询
      const { AnalyticsUserProfile } = sequelize.models
      const profile = await AnalyticsUserProfile.findOne({
        where: { user_id: userId },
        include: [
          {
            model: sequelize.models.User,
            as: 'user',
            attributes: ['user_id', 'mobile', 'nickname', 'is_admin']
          }
        ]
      })

      if (!profile) {
        // 3. 如果没有画像，触发生成
        this.generateUserProfile(userId).catch(err => {
          console.error('用户画像生成失败:', err)
        })

        return {
          userId,
          status: 'generating',
          message: '正在生成用户画像，请稍后查询',
          basic_info: await this.getBasicUserInfo(userId)
        }
      }

      // 4. 缓存结果
      await this.setCacheData(cacheKey, JSON.stringify(profile), this.cacheConfig.mediumTerm)

      return profile
    } catch (error) {
      console.error('用户画像查询失败:', error)
      throw error
    }
  }

  /**
   * 🔥 生成个性化推荐
   * @param {number} userId - 用户ID
   * @param {string} type - 推荐类型
   * @param {number} limit - 推荐数量
   * @returns {Array} 推荐结果
   */
  async getPersonalizedRecommendations (userId, type = 'all', limit = 10) {
    try {
      // 1. 检查缓存推荐
      const cacheKey = `${this.cacheKeys.USER_RECOMMENDATIONS}${userId}:${type}`
      const cached = await this.getCacheData(cacheKey)

      if (cached) {
        const recommendations = JSON.parse(cached)
        console.log(`🎯 从缓存获取用户 ${userId} 推荐 (${type})`)
        return recommendations.slice(0, limit)
      }

      // 2. 获取用户画像
      const userProfile = await this.getUserProfile(userId)
      if (!userProfile || userProfile.status === 'generating') {
        console.log(`⚠️ 用户 ${userId} 暂无行为画像，使用默认推荐`)
        return await this.getDefaultRecommendations(type, limit)
      }

      // 3. 基于画像生成推荐
      const recommendations = await this.generateRecommendations(
        userId,
        userProfile,
        type,
        limit * 2 // 生成更多候选，便于筛选
      )

      // 4. 缓存推荐结果
      await this.setCacheData(cacheKey, JSON.stringify(recommendations), this.cacheConfig.shortTerm)

      // 5. 记录推荐生成事件
      await this.saveRecommendationRecord(userId, type, recommendations)

      console.log(`🎯 为用户 ${userId} 生成 ${recommendations.length} 个推荐 (${type})`)
      return recommendations.slice(0, limit)
    } catch (error) {
      console.error('个性化推荐生成失败:', error)
      // 降级到默认推荐
      return await this.getDefaultRecommendations(type, limit)
    }
  }

  /**
   * 🔥 记录推荐展示
   * @param {number} userId - 用户ID
   * @param {Array} recommendationIds - 推荐ID数组
   */
  async recordRecommendationShown (userId, recommendationIds) {
    try {
      const { AnalyticsRecommendation } = sequelize.models
      await AnalyticsRecommendation.recordShown(recommendationIds)

      // 触发事件总线通知
      eventBusService.emit('recommendation.shown', {
        userId,
        recommendationIds,
        timestamp: new Date().toISOString()
      })

      console.log(`📊 记录推荐展示: 用户${userId}, 推荐${recommendationIds.length}个`)
    } catch (error) {
      console.error('推荐展示记录失败:', error)
    }
  }

  /**
   * 🔥 记录推荐点击
   * @param {number} userId - 用户ID
   * @param {number} recommendationId - 推荐ID
   * @param {string} recType - 推荐类型
   * @param {number} conversionValue - 转化价值
   */
  async recordRecommendationClick (userId, recommendationId, recType, conversionValue = 0) {
    try {
      const { AnalyticsRecommendation } = sequelize.models
      await AnalyticsRecommendation.recordClick(recommendationId, conversionValue)

      // 触发事件总线通知
      eventBusService.emit('recommendation.clicked', {
        userId,
        recommendationId,
        recType,
        conversionValue,
        timestamp: new Date().toISOString()
      })

      console.log(`📊 记录推荐点击: 用户${userId} -> 推荐${recommendationId}`)
    } catch (error) {
      console.error('推荐点击记录失败:', error)
    }
  }

  /**
   * 🔥 获取管理员统计概览
   * @param {string} timeRange - 时间范围
   * @returns {Object} 统计概览数据
   */
  async getAdminOverview (timeRange = '7d') {
    try {
      const days = this.parseTimeRange(timeRange)
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

      // 并行获取各种统计数据
      const [userStats, behaviorStats, recommendationStats, engagementStats] = await Promise.all([
        this.getUserStats(startDate),
        this.getBehaviorStats(startDate),
        this.getRecommendationStats(startDate),
        this.getEngagementStats(startDate)
      ])

      return {
        timeRange,
        period: `${days}天`,
        users: userStats,
        behaviors: behaviorStats,
        recommendations: recommendationStats,
        engagement: engagementStats,
        generated_at: new Date().toISOString()
      }
    } catch (error) {
      console.error('管理员概览数据查询失败:', error)
      throw error
    }
  }

  /**
   * 🔥 更新用户画像
   * @param {number} userId - 用户ID
   */
  async updateUserProfile (userId) {
    try {
      console.log(`🔄 开始更新用户 ${userId} 的画像`)

      // 1. 获取用户行为数据
      const { AnalyticsBehavior } = sequelize.models
      const recentBehaviors = await AnalyticsBehavior.getUserBehaviors(
        userId,
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 最近30天
        new Date()
      )

      if (recentBehaviors.length === 0) {
        console.log(`⚠️ 用户 ${userId} 暂无行为数据，跳过画像更新`)
        return
      }

      // 2. 分析用户行为
      const behaviorSummary = this.analyzeBehaviorSummary(recentBehaviors)
      const preferences = this.analyzeUserPreferences(recentBehaviors)
      const activityPattern = this.analyzeActivityPattern(recentBehaviors)
      const engagementScore = this.calculateEngagementScore(recentBehaviors)
      const userSegments = this.determineUserSegments(behaviorSummary, preferences, engagementScore)
      const riskLevel = this.assessRiskLevel(recentBehaviors, engagementScore)

      // 3. 更新用户画像
      const { AnalyticsUserProfile } = sequelize.models
      const profileData = {
        behavior_summary: behaviorSummary,
        preferences,
        activity_pattern: activityPattern,
        engagement_score: engagementScore,
        user_segments: userSegments,
        risk_level: riskLevel,
        analysis_version: 'v1.0'
      }

      await AnalyticsUserProfile.updateUserProfile(userId, profileData)

      // 4. 清除相关缓存
      await this.clearUserCache(userId)

      console.log(`✅ 用户 ${userId} 画像更新完成，参与度评分: ${engagementScore}`)
    } catch (error) {
      console.error(`❌ 用户 ${userId} 画像更新失败:`, error)
      throw error
    }
  }

  /**
   * 🔥 调度用户画像更新（异步处理）
   * @param {number} userId - 用户ID
   * @private
   */
  async scheduleProfileUpdate (userId) {
    // 🔥 通过现有事件总线异步触发用户画像分析
    eventBusService.emit('user.behavior.updated', {
      userId,
      timestamp: new Date().toISOString(),
      action: 'schedule_profile_update'
    })
  }

  /**
   * 🔥 数据清洗和预处理
   * @param {Array} behaviors - 行为数据
   * @returns {Array} 清洗后的数据
   * @private
   */
  cleanBehaviorData (behaviors) {
    return behaviors
      .filter(behavior => {
        // 基础字段验证
        return (
          behavior.eventType &&
          behavior.eventData &&
          typeof behavior.eventData === 'object' &&
          behavior.sessionId
        )
      })
      .map(behavior => {
        // 数据标准化
        return {
          ...behavior,
          eventType: behavior.eventType.toLowerCase(),
          timestamp: behavior.timestamp || Date.now(),
          eventData: this.sanitizeEventData(behavior.eventData)
        }
      })
  }

  /**
   * 🔥 事件数据清理
   * @param {Object} eventData - 事件数据
   * @returns {Object} 清理后的数据
   * @private
   */
  sanitizeEventData (eventData) {
    // 移除敏感信息，保留分析所需数据
    const sanitized = { ...eventData }

    // 移除可能的敏感字段
    delete sanitized.password
    delete sanitized.token
    delete sanitized.sessionToken
    delete sanitized.authToken
    delete sanitized.apiKey

    return sanitized
  }

  /**
   * 🔥 IP地址脱敏处理
   * @param {string} ip - IP地址
   * @returns {string} 脱敏后的IP
   * @private
   */
  maskIpAddress (ip) {
    if (!ip) return null
    const parts = ip.split('.')
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.***.**`
    }
    return ip.substring(0, ip.length / 2) + '***'
  }

  /**
   * 🔥 User Agent脱敏处理
   * @param {string} userAgent - User Agent
   * @returns {string} 脱敏后的User Agent
   * @private
   */
  maskUserAgent (userAgent) {
    if (!userAgent) return null
    // 保留浏览器类型，移除详细版本信息
    return userAgent.replace(/(\d+\.){2,}\d+/g, 'x.x.x')
  }

  /**
   * 🔥 缓存操作方法
   * @private
   */
  async getCacheData (key) {
    try {
      if (this.redis && this.redis.isOpen) {
        return await this.redis.get(key)
      } else if (this.memoryCache) {
        const item = this.memoryCache.get(key)
        if (item && item.expires > Date.now()) {
          return item.value
        }
        this.memoryCache.delete(key)
      }
      return null
    } catch (error) {
      console.error('缓存获取失败:', error)
      return null
    }
  }

  async setCacheData (key, value, ttl) {
    try {
      if (this.redis && this.redis.isOpen) {
        await this.redis.setEx(key, ttl, value)
      } else if (this.memoryCache) {
        this.memoryCache.set(key, {
          value,
          expires: Date.now() + ttl * 1000
        })
      }
    } catch (error) {
      console.error('缓存设置失败:', error)
    }
  }

  async clearUserCache (userId) {
    const keys = [
      `${this.cacheKeys.USER_PROFILE}${userId}`,
      `${this.cacheKeys.USER_SEGMENTS}${userId}`,
      `${this.cacheKeys.ENGAGEMENT_SCORE}${userId}`
    ]

    for (const key of keys) {
      try {
        if (this.redis && this.redis.isOpen) {
          await this.redis.del(key)
        } else if (this.memoryCache) {
          this.memoryCache.delete(key)
        }
      } catch (error) {
        console.error(`清除缓存失败 ${key}:`, error)
      }
    }
  }

  /**
   * 🔥 其他辅助方法（简化实现）
   * @private
   */
  async getBasicUserInfo (userId) {
    const { User } = sequelize.models
    const user = await User.findByPk(userId, {
      attributes: ['user_id', 'mobile', 'nickname', 'is_admin']
    })
    return user || { user_id: userId }
  }

  async getDefaultRecommendations (type, limit) {
    // 简化实现：返回热门推荐
    return Array.from({ length: Math.min(limit, 5) }, (_, i) => ({
      id: `default_${type}_${i + 1}`,
      type,
      score: 0.5,
      reason: '热门推荐'
    }))
  }

  parseTimeRange (timeRange) {
    const match = timeRange.match(/(\d+)([dh])/)
    if (match) {
      const value = parseInt(match[1])
      const unit = match[2]
      return unit === 'h' ? value / 24 : value
    }
    return 7 // 默认7天
  }

  // 其他分析方法的简化实现
  analyzeBehaviorSummary (behaviors) {
    return {
      total_events: behaviors.length,
      unique_sessions: new Set(behaviors.map(b => b.session_id)).size,
      event_types: behaviors.reduce((acc, b) => {
        acc[b.event_type] = (acc[b.event_type] || 0) + 1
        return acc
      }, {})
    }
  }

  analyzeUserPreferences (behaviors) {
    // 简化实现
    return { analyzed: true, behaviors_count: behaviors.length }
  }

  analyzeActivityPattern (behaviors) {
    // 简化实现
    return { analyzed: true, behaviors_count: behaviors.length }
  }

  calculateEngagementScore (behaviors) {
    // 简化实现：基于行为数量计算
    return Math.min(behaviors.length * 2, 100)
  }

  determineUserSegments (behaviorSummary, preferences, engagementScore) {
    const segments = []
    if (engagementScore > 70) segments.push('high_engagement')
    if (engagementScore < 30) segments.push('low_engagement')
    return segments
  }

  assessRiskLevel (behaviors, engagementScore) {
    return engagementScore > 50 ? 'low' : 'medium'
  }

  // 统计方法的简化实现
  async getUserStats () {
    return { total: 0, active: 0 }
  }

  async getBehaviorStats () {
    return { total: 0 }
  }

  async getRecommendationStats () {
    return { total: 0, clicked: 0 }
  }

  async getEngagementStats () {
    return { average: 0 }
  }

  async updateRealtimeStats () {
    /* 简化实现 */
  }

  async generateRecommendations () {
    return []
  }

  async saveRecommendationRecord () {
    /* 简化实现 */
  }

  async generateUserProfile (userId) {
    setTimeout(() => this.updateUserProfile(userId), 5000)
  }
}

// 🔥 导出单例服务（与现有服务保持一致）
module.exports = new BehaviorAnalyticsService()
