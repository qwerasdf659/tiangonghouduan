// services/DeepUserProfilingService.js
const BehaviorAnalyticsService = require('./BehaviorAnalyticsService')
const EventBusService = require('./EventBusService')
const { Op } = require('sequelize')

/**
 * 深度用户画像服务
 * 基于现有BehaviorAnalyticsService和统计学方法实现用户分群分析
 * 无需重型ML框架，使用数学算法和聚类分析
 */
class DeepUserProfilingService {
  constructor () {
    this.models = require('../models')
    this.behavior = BehaviorAnalyticsService
    this.eventBus = EventBusService

    // 用户画像维度配置
    this.profilingDimensions = {
      behavioral: {
        name: '行为特征',
        weight: 0.35,
        features: ['activity_frequency', 'engagement_depth', 'session_duration', 'feature_usage']
      },
      consumption: {
        name: '消费特征',
        weight: 0.3,
        features: ['spending_amount', 'spending_frequency', 'price_sensitivity', 'payment_method']
      },
      social: {
        name: '社交特征',
        weight: 0.2,
        features: ['friend_count', 'interaction_frequency', 'sharing_behavior', 'community_participation']
      },
      temporal: {
        name: '时间特征',
        weight: 0.15,
        features: ['active_hours', 'day_preferences', 'seasonal_patterns', 'retention_period']
      }
    }

    // 用户分群配置
    this.userSegments = {
      power_user: {
        name: '超级用户',
        description: '高活跃度、高消费、强社交的核心用户',
        characteristics: {
          activity_score: { min: 0.8 },
          spending_level: ['high', 'vip'],
          social_engagement: { min: 0.7 },
          retention_days: { min: 30 }
        },
        strategies: {
          retention: 'vip_exclusive_benefits',
          engagement: 'advanced_features',
          monetization: 'premium_offerings'
        }
      },
      high_spender: {
        name: '高价值用户',
        description: '消费能力强但活跃度中等的用户',
        characteristics: {
          spending_level: ['high', 'vip'],
          activity_score: { min: 0.4, max: 0.8 },
          price_sensitivity: { max: 0.3 }
        },
        strategies: {
          retention: 'personalized_offers',
          engagement: 'convenience_features',
          monetization: 'bundled_packages'
        }
      },
      social_connector: {
        name: '社交达人',
        description: '社交活跃但消费中等的用户',
        characteristics: {
          social_engagement: { min: 0.6 },
          friend_count: { min: 10 },
          spending_level: ['low', 'medium'],
          sharing_frequency: { min: 0.5 }
        },
        strategies: {
          retention: 'social_features',
          engagement: 'community_events',
          monetization: 'social_incentives'
        }
      },
      casual_user: {
        name: '休闲用户',
        description: '低频使用但稳定留存的用户',
        characteristics: {
          activity_score: { min: 0.2, max: 0.5 },
          retention_days: { min: 7 },
          session_frequency: { max: 0.3 }
        },
        strategies: {
          retention: 'gentle_reminders',
          engagement: 'simple_features',
          monetization: 'low_commitment_offers'
        }
      },
      at_risk: {
        name: '流失风险用户',
        description: '活跃度下降的潜在流失用户',
        characteristics: {
          activity_trend: { trend: 'decreasing' },
          last_active_days: { min: 3, max: 14 },
          engagement_decline: { min: 0.3 }
        },
        strategies: {
          retention: 'win_back_campaigns',
          engagement: 'reactivation_incentives',
          monetization: 'retention_discounts'
        }
      },
      new_user: {
        name: '新手用户',
        description: '注册时间短，正在探索平台的用户',
        characteristics: {
          registration_days: { max: 14 },
          feature_exploration: { max: 0.5 },
          onboarding_completion: { max: 0.8 }
        },
        strategies: {
          retention: 'onboarding_optimization',
          engagement: 'guided_tutorials',
          monetization: 'starter_packages'
        }
      }
    }
  }

  /**
   * 生成用户深度画像
   */
  async generateUserProfile (userId) {
    try {
      // 获取用户基础信息
      const user = await this.models.User.findByPk(userId)
      if (!user) {
        throw new Error('用户不存在')
      }

      // 获取行为数据
      const behaviorData = await this.behavior.getUserBehaviorPattern(userId)

      // 计算各维度特征向量
      const featureVectors = await this.calculateFeatureVectors(userId, behaviorData)

      // 用户分群分析
      const segmentAnalysis = this.performUserSegmentation(featureVectors)

      // 消费预测
      const consumptionPrediction = this.predictUserConsumption(featureVectors, behaviorData)

      // 生命周期阶段分析
      const lifecycleStage = await this.analyzeUserLifecycle(userId, behaviorData)

      // 个性化推荐标签
      const personalizedTags = this.generatePersonalizedTags(featureVectors, segmentAnalysis)

      // 风险评估
      const riskAssessment = this.assessUserRisks(featureVectors, behaviorData)

      const profile = {
        userId,
        generatedAt: new Date().toISOString(),
        dimensions: {
          behavioral: featureVectors.behavioral,
          consumption: featureVectors.consumption,
          social: featureVectors.social,
          temporal: featureVectors.temporal
        },
        segmentation: segmentAnalysis,
        consumption_prediction: consumptionPrediction,
        lifecycle_stage: lifecycleStage,
        personalized_tags: personalizedTags,
        risk_assessment: riskAssessment,
        confidence_score: this.calculateConfidenceScore(featureVectors, behaviorData)
      }

      // 缓存用户画像
      await this.cacheUserProfile(userId, profile)

      // 发送事件
      await this.eventBus.emit('user_profile_generated', {
        userId,
        segment: segmentAnalysis.primary_segment,
        confidence: profile.confidence_score
      })

      return profile
    } catch (error) {
      console.error('生成用户画像失败:', error)
      throw error
    }
  }

  /**
   * 计算特征向量
   */
  async calculateFeatureVectors (userId, behaviorData) {
    // 行为特征向量
    const behavioral = await this.calculateBehavioralVector(userId, behaviorData)

    // 消费特征向量
    const consumption = await this.calculateConsumptionVector(userId)

    // 社交特征向量
    const social = await this.calculateSocialVector(userId)

    // 时间特征向量
    const temporal = await this.calculateTemporalVector(userId, behaviorData)

    return { behavioral, consumption, social, temporal }
  }

  /**
   * 计算行为特征向量
   */
  async calculateBehavioralVector (userId, behaviorData) {
    // 活跃度频率 (0-1)
    const activityFrequency = Math.min(1, (behaviorData.daily_active_days || 0) / 30)

    // 参与深度 (0-1)
    const engagementDepth = behaviorData.feature_usage_depth || 0.5

    // 会话持续时间 (标准化到0-1)
    const avgSessionDuration = behaviorData.avg_session_duration || 300 // 默认5分钟
    const sessionDuration = Math.min(1, avgSessionDuration / 1800) // 最大30分钟

    // 功能使用广度 (0-1)
    const featureUsage = (behaviorData.used_features_count || 1) / 20 // 假设总共20个功能

    return {
      activity_frequency: activityFrequency,
      engagement_depth: engagementDepth,
      session_duration: sessionDuration,
      feature_usage: featureUsage,
      composite_score: (activityFrequency * 0.3 + engagementDepth * 0.3 + sessionDuration * 0.2 + featureUsage * 0.2)
    }
  }

  /**
   * 计算消费特征向量
   */
  async calculateConsumptionVector (userId) {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

      // 获取消费数据
      const [totalSpent, transactionCount, avgTransactionValue] = await Promise.all([
        this.models.LotteryDraw.sum('points_cost', {
          where: {
            user_id: userId,
            created_at: { [Op.gte]: thirtyDaysAgo }
          }
        }),
        this.models.LotteryDraw.count({
          where: {
            user_id: userId,
            created_at: { [Op.gte]: thirtyDaysAgo }
          }
        }),
        this.models.LotteryDraw.findAll({
          where: {
            user_id: userId,
            created_at: { [Op.gte]: thirtyDaysAgo }
          },
          attributes: [
            [this.models.sequelize.fn('AVG', this.models.sequelize.col('points_cost')), 'avg_cost']
          ]
        })
      ])

      // 消费金额 (标准化到0-1，假设月消费5000积分为高消费)
      const spendingAmount = Math.min(1, (totalSpent || 0) / 5000)

      // 消费频率 (标准化到0-1，假设月消费30次为高频)
      const spendingFrequency = Math.min(1, transactionCount / 30)

      // 价格敏感度 (基于平均消费计算，0表示不敏感，1表示高度敏感)
      const avgCost = avgTransactionValue[0]?.dataValues?.avg_cost || 0
      const priceSensitivity = avgCost > 0 ? Math.max(0, 1 - avgCost / 200) : 0.5

      return {
        spending_amount: spendingAmount,
        spending_frequency: spendingFrequency,
        price_sensitivity: priceSensitivity,
        payment_method: 'points', // 简化处理
        composite_score: (spendingAmount * 0.4 + spendingFrequency * 0.4 + (1 - priceSensitivity) * 0.2)
      }
    } catch (error) {
      console.error('计算消费特征失败:', error)
      return {
        spending_amount: 0,
        spending_frequency: 0,
        price_sensitivity: 0.5,
        payment_method: 'points',
        composite_score: 0
      }
    }
  }

  /**
   * 计算社交特征向量
   */
  async calculateSocialVector (userId) {
    try {
      // 获取社交数据（如果有好友系统）
      const friendCount = await this.models.UserFriend?.count({
        where: { user_id: userId, relationship_type: 'friend' }
      }) || 0

      // 社交互动频率（基于行为数据估算）
      const interactionFrequency = Math.min(1, friendCount / 50) // 假设50个好友为高社交

      // 分享行为（简化处理）
      const sharingBehavior = Math.min(1, friendCount / 20)

      // 社区参与度（基于活跃度估算）
      const communityParticipation = Math.min(1, friendCount / 30)

      return {
        friend_count: Math.min(1, friendCount / 100), // 标准化
        interaction_frequency: interactionFrequency,
        sharing_behavior: sharingBehavior,
        community_participation: communityParticipation,
        composite_score: (interactionFrequency * 0.3 + sharingBehavior * 0.3 + communityParticipation * 0.4)
      }
    } catch (error) {
      console.error('计算社交特征失败:', error)
      return {
        friend_count: 0,
        interaction_frequency: 0,
        sharing_behavior: 0,
        community_participation: 0,
        composite_score: 0
      }
    }
  }

  /**
   * 计算时间特征向量
   */
  async calculateTemporalVector (userId, behaviorData) {
    const now = new Date()

    // 活跃时间段分析
    const activeHours = behaviorData.preferred_hours || [12, 18, 20] // 默认午餐晚餐时间
    const peakHourScore = activeHours.length / 24

    // 日期偏好
    const dayPreferences = behaviorData.preferred_days || [0, 6] // 默认周末
    const weekendPreference = dayPreferences.includes(0) || dayPreferences.includes(6) ? 1 : 0

    // 季节性模式（简化处理）
    const currentMonth = now.getMonth()
    const seasonalPattern = (currentMonth % 3) / 3 // 简单的季节性评分

    // 留存时间
    const user = await this.models.User.findByPk(userId)
    const registrationDays = user ? Math.floor((now - user.created_at) / (24 * 60 * 60 * 1000)) : 0
    const retentionPeriod = Math.min(1, registrationDays / 365) // 标准化到年

    return {
      active_hours: peakHourScore,
      day_preferences: weekendPreference,
      seasonal_patterns: seasonalPattern,
      retention_period: retentionPeriod,
      composite_score: (peakHourScore * 0.3 + weekendPreference * 0.2 + seasonalPattern * 0.2 + retentionPeriod * 0.3)
    }
  }

  /**
   * 执行用户分群
   */
  performUserSegmentation (featureVectors) {
    const segmentScores = {}

    // 计算每个分群的匹配度
    for (const [segmentKey, segmentConfig] of Object.entries(this.userSegments)) {
      segmentScores[segmentKey] = this.calculateSegmentScore(featureVectors, segmentConfig)
    }

    // 排序并选择最佳匹配
    const sortedSegments = Object.entries(segmentScores)
      .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)

    const primarySegment = sortedSegments[0]
    const secondarySegment = sortedSegments[1]

    return {
      primary_segment: {
        key: primarySegment[0],
        name: this.userSegments[primarySegment[0]].name,
        score: primarySegment[1],
        confidence: primarySegment[1] - (secondarySegment?.[1] || 0)
      },
      secondary_segment: secondarySegment
        ? {
          key: secondarySegment[0],
          name: this.userSegments[secondarySegment[0]].name,
          score: secondarySegment[1]
        }
        : null,
      all_scores: segmentScores
    }
  }

  /**
   * 计算分群匹配分数
   */
  calculateSegmentScore (featureVectors, segmentConfig) {
    const characteristics = segmentConfig.characteristics
    let totalScore = 0
    let totalWeight = 0

    // 遍历特征并计算匹配度
    for (const [feature, criteria] of Object.entries(characteristics)) {
      const featureValue = this.getFeatureValue(featureVectors, feature)
      const matchScore = this.calculateFeatureMatch(featureValue, criteria)

      totalScore += matchScore
      totalWeight += 1
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0
  }

  /**
   * 获取特征值
   */
  getFeatureValue (featureVectors, featureName) {
    // 映射特征名到实际数据
    const featureMapping = {
      activity_score: featureVectors.behavioral.composite_score,
      spending_level: this.categorizeSpendingLevel(featureVectors.consumption.composite_score),
      social_engagement: featureVectors.social.composite_score,
      retention_days: featureVectors.temporal.retention_period * 365,
      price_sensitivity: featureVectors.consumption.price_sensitivity,
      friend_count: featureVectors.social.friend_count * 100, // 反标准化
      sharing_frequency: featureVectors.social.sharing_behavior,
      session_frequency: featureVectors.behavioral.activity_frequency,
      last_active_days: 1, // 简化处理，假设最近活跃
      registration_days: featureVectors.temporal.retention_period * 365,
      feature_exploration: featureVectors.behavioral.feature_usage,
      onboarding_completion: 0.8 // 简化处理
    }

    return featureMapping[featureName] || 0
  }

  /**
   * 分类消费等级
   */
  categorizeSpendingLevel (score) {
    if (score < 0.25) return 'low'
    if (score < 0.5) return 'medium'
    if (score < 0.75) return 'high'
    return 'vip'
  }

  /**
   * 计算特征匹配度
   */
  calculateFeatureMatch (value, criteria) {
    if (Array.isArray(criteria)) {
      // 分类匹配
      return criteria.includes(value) ? 1 : 0
    } else if (typeof criteria === 'object') {
      // 数值范围匹配
      let score = 1

      if (criteria.min !== undefined && value < criteria.min) {
        score *= Math.max(0, 1 - (criteria.min - value) / criteria.min)
      }

      if (criteria.max !== undefined && value > criteria.max) {
        score *= Math.max(0, 1 - (value - criteria.max) / criteria.max)
      }

      return score
    }

    return value === criteria ? 1 : 0
  }

  /**
   * 预测用户消费
   */
  predictUserConsumption (featureVectors, _behaviorData) {
    const consumption = featureVectors.consumption
    const behavioral = featureVectors.behavioral

    // 基于历史数据的线性预测
    const currentMonthlySpending = consumption.spending_amount * 5000 // 反标准化
    const activityTrend = behavioral.composite_score
    const socialInfluence = featureVectors.social.composite_score

    // 简单的预测模型
    const growthFactor = 1 + (activityTrend * 0.3 + socialInfluence * 0.2 - 0.25)
    const predictedSpending = currentMonthlySpending * growthFactor

    return {
      current_monthly: Math.round(currentMonthlySpending),
      predicted_next_month: Math.round(predictedSpending),
      growth_rate: Math.round((growthFactor - 1) * 100),
      confidence: Math.min(1, behavioral.composite_score + consumption.composite_score) / 2,
      factors: {
        activity_influence: activityTrend * 0.3,
        social_influence: socialInfluence * 0.2,
        baseline_adjustment: -0.25
      }
    }
  }

  /**
   * 分析用户生命周期阶段
   */
  async analyzeUserLifecycle (userId, behaviorData) {
    const user = await this.models.User.findByPk(userId)
    const registrationDays = Math.floor((new Date() - user.created_at) / (24 * 60 * 60 * 1000))
    const activityScore = behaviorData.activity_score || 0.5

    // 生命周期阶段判断
    let stage, description, nextStage, recommendations

    if (registrationDays <= 7) {
      stage = 'new'
      description = '新用户探索期'
      nextStage = 'growing'
      recommendations = ['完善个人资料', '体验核心功能', '参与新手活动']
    } else if (registrationDays <= 30 && activityScore > 0.6) {
      stage = 'growing'
      description = '快速成长期'
      nextStage = 'mature'
      recommendations = ['增加社交互动', '探索高级功能', '参与社区活动']
    } else if (activityScore > 0.5) {
      stage = 'mature'
      description = '成熟活跃期'
      nextStage = 'advocate'
      recommendations = ['成为意见领袖', '邀请好友参与', '体验专属服务']
    } else if (activityScore > 0.2) {
      stage = 'declining'
      description = '活跃度下降期'
      nextStage = 'churned'
      recommendations = ['重新激活提醒', '个性化推荐', '特别优惠活动']
    } else {
      stage = 'dormant'
      description = '休眠期'
      nextStage = 'reactivated'
      recommendations = ['赢回活动', '新功能介绍', '限时特惠']
    }

    return {
      current_stage: stage,
      description,
      next_stage: nextStage,
      days_in_current_stage: this.calculateDaysInStage(registrationDays, stage),
      recommendations,
      transition_probability: this.calculateTransitionProbability(stage, activityScore)
    }
  }

  /**
   * 生成个性化标签
   */
  generatePersonalizedTags (featureVectors, segmentAnalysis) {
    const tags = []

    // 基于行为特征的标签
    const behavioral = featureVectors.behavioral
    if (behavioral.activity_frequency > 0.8) tags.push('高频用户')
    if (behavioral.engagement_depth > 0.7) tags.push('深度体验者')
    if (behavioral.session_duration > 0.6) tags.push('长时间使用者')

    // 基于消费特征的标签
    const consumption = featureVectors.consumption
    if (consumption.spending_amount > 0.7) tags.push('高价值客户')
    if (consumption.spending_frequency > 0.6) tags.push('频繁消费者')
    if (consumption.price_sensitivity < 0.3) tags.push('价格不敏感')

    // 基于社交特征的标签
    const social = featureVectors.social
    if (social.composite_score > 0.6) tags.push('社交活跃')
    if (social.friend_count > 0.5) tags.push('人脉广泛')

    // 基于分群的标签
    tags.push(segmentAnalysis.primary_segment.name)

    return tags.slice(0, 10) // 最多10个标签
  }

  /**
   * 评估用户风险
   */
  assessUserRisks (featureVectors, behaviorData) {
    const risks = []

    // 流失风险
    const churnRisk = this.calculateChurnRisk(featureVectors, behaviorData)
    if (churnRisk > 0.3) {
      risks.push({
        type: 'churn',
        level: churnRisk > 0.7 ? 'high' : 'medium',
        score: churnRisk,
        description: '用户可能即将流失'
      })
    }

    // 消费下降风险
    const spendingDeclineRisk = this.calculateSpendingDeclineRisk(featureVectors)
    if (spendingDeclineRisk > 0.4) {
      risks.push({
        type: 'spending_decline',
        level: spendingDeclineRisk > 0.6 ? 'high' : 'medium',
        score: spendingDeclineRisk,
        description: '消费金额可能下降'
      })
    }

    return risks
  }

  /**
   * 计算流失风险
   */
  calculateChurnRisk (featureVectors, behaviorData) {
    const activityScore = featureVectors.behavioral.composite_score
    const engagementTrend = behaviorData.engagement_trend || 0
    const lastActiveGap = behaviorData.last_active_gap || 1

    // 综合计算流失风险
    let churnRisk = 0

    // 活跃度过低
    if (activityScore < 0.3) churnRisk += 0.4

    // 参与度下降趋势
    if (engagementTrend < -0.2) churnRisk += 0.3

    // 长时间未活跃
    if (lastActiveGap > 7) churnRisk += 0.3

    return Math.min(1, churnRisk)
  }

  /**
   * 计算消费下降风险
   */
  calculateSpendingDeclineRisk (featureVectors) {
    const consumption = featureVectors.consumption
    const behavioral = featureVectors.behavioral

    let risk = 0

    // 消费频率下降
    if (consumption.spending_frequency < 0.3) risk += 0.3

    // 价格敏感度提高
    if (consumption.price_sensitivity > 0.7) risk += 0.2

    // 整体活跃度下降
    if (behavioral.composite_score < 0.4) risk += 0.2

    return Math.min(1, risk)
  }

  /**
   * 计算置信度分数
   */
  calculateConfidenceScore (featureVectors, behaviorData) {
    // 基于数据完整性和样本量计算置信度
    const dataCompleteness = this.calculateDataCompleteness(featureVectors, behaviorData)
    const sampleSize = behaviorData.data_points || 10
    const sampleScore = Math.min(1, sampleSize / 100) // 100个数据点为满分

    return (dataCompleteness * 0.7 + sampleScore * 0.3)
  }

  /**
   * 计算数据完整性
   */
  calculateDataCompleteness (featureVectors, _behaviorData) {
    const totalFeatures = Object.keys(featureVectors).length * 5 // 假设每个维度5个特征
    let availableFeatures = 0

    for (const dimension of Object.values(featureVectors)) {
      for (const value of Object.values(dimension)) {
        if (typeof value === 'number' && value > 0) {
          availableFeatures++
        }
      }
    }

    return availableFeatures / totalFeatures
  }

  /**
   * 缓存用户画像
   */
  async cacheUserProfile (userId, profile) {
    try {
      const redis = require('redis').createClient()
      await redis.connect()

      const cacheKey = `user_profile:${userId}`
      await redis.setex(cacheKey, 86400 * 7, JSON.stringify(profile)) // 7天缓存

      await redis.disconnect()
    } catch (error) {
      console.error('缓存用户画像失败:', error)
    }
  }

  /**
   * 获取缓存的用户画像
   */
  async getCachedUserProfile (userId) {
    try {
      const redis = require('redis').createClient()
      await redis.connect()

      const cacheKey = `user_profile:${userId}`
      const cached = await redis.get(cacheKey)

      await redis.disconnect()

      return cached ? JSON.parse(cached) : null
    } catch (error) {
      console.error('获取缓存用户画像失败:', error)
      return null
    }
  }

  /**
   * 批量用户分群分析
   */
  async performBatchSegmentation (userIds) {
    const results = []

    for (const userId of userIds) {
      try {
        const profile = await this.generateUserProfile(userId)
        results.push({
          userId,
          segment: profile.segmentation.primary_segment,
          confidence: profile.confidence_score
        })
      } catch (error) {
        console.error(`用户${userId}画像生成失败:`, error)
        results.push({
          userId,
          error: error.message
        })
      }
    }

    return results
  }

  // 辅助方法
  calculateDaysInStage (registrationDays, stage) {
    // 简化实现，返回估算天数
    switch (stage) {
    case 'new': return Math.min(7, registrationDays)
    case 'growing': return Math.min(23, Math.max(0, registrationDays - 7))
    default: return registrationDays - 30
    }
  }

  calculateTransitionProbability (stage, activityScore) {
    // 基于当前阶段和活跃度计算转换概率
    const stageFactors = {
      new: 0.8,
      growing: 0.6,
      mature: 0.4,
      declining: 0.2,
      dormant: 0.1
    }

    return Math.min(1, (stageFactors[stage] || 0.5) * activityScore)
  }
}

module.exports = new DeepUserProfilingService()
