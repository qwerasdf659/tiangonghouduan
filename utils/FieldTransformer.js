/**
 * 餐厅积分系统专用字段转换工具
 * 适配技术栈：Express + Sequelize + MySQL + sealos
 * 创建时间：2025年07月28日
 */

const _ = require('lodash')

/**
 * 字段转换器核心类
 */
class FieldTransformer {
  constructor (options = {}) {
    this.options = {
      databaseFormat: 'snake_case',
      frontendFormat: 'camelCase',
      strictMode: process.env.NODE_ENV === 'production',
      logTransformations: process.env.NODE_ENV === 'development',
      preserveNullValues: true,
      preserveUndefinedValues: false,
      maxDepth: 10,
      skipKeys: ['_id', '__v', 'createdAt', 'updatedAt'],
      customRules: this.buildProjectRules(),
      ...options
    }

    this.stats = {
      totalTransformations: 0,
      dbToFrontendCount: 0,
      frontendToDbCount: 0,
      errors: 0,
      warnings: 0
    }

    this.performanceStats = {
      totalTime: 0,
      averageTime: 0,
      maxTime: 0,
      minTime: Infinity
    }
  }

  buildProjectRules () {
    return {
      // 用户相关字段
      user_id: 'userId',
      total_points: 'totalPoints',
      available_points: 'availablePoints',
      used_points: 'usedPoints',
      is_admin: 'isAdmin',
      avatar_url: 'avatarUrl',
      last_login: 'lastLogin',
      phone_number: 'phoneNumber',
      created_at: 'createdAt',
      updated_at: 'updatedAt',
      registration_date: 'registrationDate',
      login_count: 'loginCount',

      // 认证相关字段 - 🔧 完善认证字段映射
      verification_code: 'code', // 前端发送code，后端接收verification_code
      access_token: 'accessToken',
      refresh_token: 'refreshToken',
      expires_in: 'expiresIn',

      // 抽奖相关字段
      prize_id: 'prizeId',
      prize_name: 'prizeName',
      prize_type: 'prizeType',
      prize_value: 'prizeValue',
      total_draws: 'totalDraws',
      total_cost: 'totalCost',
      draw_type: 'drawType',
      draw_count: 'drawCount',
      cost_points: 'costPoints',
      user_timestamp: 'clientTimestamp',
      client_info: 'clientInfo',
      win_rate: 'winRate',

      // 交易相关字段 - 🔧 新增交易模块字段映射
      to_user_id: 'toUserId',
      from_user_id: 'fromUserId',
      trade_password: 'tradePassword',
      trade_id: 'tradeId',
      trade_type: 'tradeType',
      trade_status: 'tradeStatus',
      trade_amount: 'tradeAmount',
      trade_reason: 'tradeReason',
      transaction_id: 'transactionId',

      // 兑换相关字段 - 🔧 新增兑换模块字段映射
      product_id: 'productId',
      exchange_id: 'exchangeId',
      exchange_points: 'exchangePoints',
      exchange_status: 'exchangeStatus',
      exchange_type: 'exchangeType',
      exchange_reason: 'exchangeReason',
      commodity_id: 'commodityId',
      sort_order: 'sortOrder',
      is_hot: 'isHot',
      sales_count: 'salesCount',

      // 上传相关字段 - 🔧 新增上传模块字段映射
      upload_id: 'uploadId',
      batch_id: 'batchId',
      image_url: 'imageUrl',
      file_size: 'fileSize',
      file_name: 'fileName',
      original_filename: 'originalFilename',
      uploaded_at: 'uploadedAt',
      reviewed_at: 'reviewedAt',
      points_awarded: 'pointsAwarded',
      review_reason: 'reviewReason',
      review_status: 'reviewStatus',
      is_background: 'isBackground',

      // 资源相关字段 - 🔧 新增资源模块字段映射
      business_type: 'businessType',
      context_id: 'contextId',
      resource_id: 'resourceId',
      resource_type: 'resourceType',
      resource_url: 'resourceUrl',
      resource_size: 'resourceSize',
      storage_path: 'storagePath',
      is_active: 'isActive',
      priority_level: 'priorityLevel',
      category_name: 'categoryName',

      // 分页相关字段
      page_size: 'pageSize',
      page_number: 'pageNumber',
      total_pages: 'totalPages',
      total_count: 'totalCount',
      has_more: 'hasMore',

      // 积分记录相关字段 - 🔧 新增积分记录字段映射
      points_record_id: 'pointsRecordId',
      balance_after: 'balanceAfter',
      balance_before: 'balanceBefore',
      related_id: 'relatedId',
      operation_type: 'operationType',

      // 臻选空间相关字段 - 🔧 新增臻选空间字段映射
      premium_space_id: 'premiumSpaceId',
      unlock_time: 'unlockTime',
      expiry_time: 'expiryTime',
      is_unlocked: 'isUnlocked',
      unlock_cost_points: 'unlockCostPoints',
      required_cumulative_points: 'requiredCumulativePoints',
      unlock_duration_hours: 'unlockDurationHours',
      unlock_count: 'unlockCount',
      total_cost_points: 'totalCostPoints',
      last_unlock_client: 'lastUnlockClient',

      // 通用状态字段
      created_by: 'createdBy',
      updated_by: 'updatedBy',
      deleted_at: 'deletedAt',
      is_deleted: 'isDeleted',
      status_code: 'statusCode',
      error_code: 'errorCode',
      error_message: 'errorMessage',

      // 客户端信息字段
      user_info: 'userInfo',
      client_version: 'clientVersion',
      platform_info: 'platformInfo',
      device_info: 'deviceInfo'
    }
  }

  dbToFrontend (data, depth = 0) {
    if (depth === 0) {
      this.startPerformanceTimer()
    }

    try {
      const result = this._transformData(data, 'toFrontend', depth)

      if (depth === 0) {
        this.endPerformanceTimer()
        this.stats.dbToFrontendCount++
      }

      return result
    } catch (error) {
      this.stats.errors++
      if (this.options.logTransformations) {
        console.error('DB->Frontend转换失败:', error.message)
      }
      return data
    }
  }

  frontendToDb (data, depth = 0) {
    if (depth === 0) {
      this.startPerformanceTimer()
    }

    try {
      const result = this._transformData(data, 'toDb', depth)

      if (depth === 0) {
        this.endPerformanceTimer()
        this.stats.frontendToDbCount++
      }

      return result
    } catch (error) {
      this.stats.errors++
      if (this.options.logTransformations) {
        console.error('Frontend->DB转换失败:', error.message)
      }
      return data
    }
  }

  _transformData (data, direction, depth = 0) {
    if (depth > this.options.maxDepth) {
      console.warn(`达到最大递归深度 ${this.options.maxDepth}`)
      return data
    }

    if (data === null) return this.options.preserveNullValues ? null : data
    if (data === undefined) return this.options.preserveUndefinedValues ? undefined : data

    if (typeof data !== 'object') return data

    if (data instanceof Date || Buffer.isBuffer(data)) return data

    if (Array.isArray(data)) {
      return data.map(item => this._transformData(item, direction, depth + 1))
    }

    if (data.dataValues) {
      return this._transformData(data.dataValues, direction, depth)
    }

    const transformed = {}

    for (const [key, value] of Object.entries(data)) {
      if (this.options.skipKeys.includes(key)) {
        transformed[key] = value
        continue
      }

      const newKey = this._transformKey(key, direction)
      transformed[newKey] = this._transformData(value, direction, depth + 1)

      if (this.options.logTransformations && key !== newKey) {
        console.log(`字段转换: ${key} -> ${newKey}`)
        this.stats.totalTransformations++
      }
    }

    return transformed
  }

  _transformKey (key, direction) {
    if (direction === 'toFrontend') {
      return this.options.customRules[key] || _.camelCase(key)
    } else {
      const reverseKey = Object.keys(this.options.customRules).find(
        k => this.options.customRules[k] === key
      )
      return reverseKey || _.snakeCase(key)
    }
  }

  batchTransform (dataList, direction = 'toFrontend') {
    if (!Array.isArray(dataList)) {
      throw new Error('批量转换需要数组格式的数据')
    }

    const startTime = Date.now()

    const result = dataList.map(item => {
      try {
        return direction === 'toFrontend' ? this.dbToFrontend(item) : this.frontendToDb(item)
      } catch (error) {
        this.stats.errors++
        if (this.options.logTransformations) {
          console.error('批量转换错误:', error)
        }
        return item
      }
    })

    const duration = Date.now() - startTime
    if (this.options.logTransformations) {
      console.log(`批量转换完成: ${dataList.length}条记录, 耗时${duration}ms`)
    }

    return result
  }

  startPerformanceTimer () {
    this._startTime = Date.now()
  }

  endPerformanceTimer () {
    if (this._startTime) {
      const duration = Date.now() - this._startTime
      this.performanceStats.totalTime += duration
      this.performanceStats.averageTime =
        this.performanceStats.totalTime /
        (this.stats.dbToFrontendCount + this.stats.frontendToDbCount)
      this.performanceStats.maxTime = Math.max(this.performanceStats.maxTime, duration)
      this.performanceStats.minTime = Math.min(this.performanceStats.minTime, duration)
    }
  }

  getStats () {
    return {
      ...this.stats,
      performance: this.performanceStats,
      totalOperations: this.stats.dbToFrontendCount + this.stats.frontendToDbCount,
      successRate:
        this.stats.errors === 0
          ? 100
          : (
            ((this.stats.totalTransformations - this.stats.errors) /
                this.stats.totalTransformations) *
              100
          ).toFixed(2)
    }
  }

  resetStats () {
    this.stats = {
      totalTransformations: 0,
      dbToFrontendCount: 0,
      frontendToDbCount: 0,
      errors: 0,
      warnings: 0
    }
    this.performanceStats = {
      totalTime: 0,
      averageTime: 0,
      maxTime: 0,
      minTime: Infinity
    }
  }
}

module.exports = FieldTransformer
