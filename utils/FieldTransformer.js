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
      user_id: 'userId',
      total_points: 'totalPoints',
      is_admin: 'isAdmin',
      avatar_url: 'avatarUrl',
      last_login: 'lastLogin',
      phone_number: 'phoneNumber',
      created_at: 'createdAt',
      updated_at: 'updatedAt',
      prize_id: 'prizeId',
      prize_name: 'prizeName',
      prize_type: 'prizeType',
      prize_value: 'prizeValue',
      total_draws: 'totalDraws',
      total_cost: 'totalCost',
      draw_type: 'drawType',
      cost_points: 'costPoints',
      win_rate: 'winRate',
      batch_id: 'batchId',
      upload_id: 'uploadId',
      image_url: 'imageUrl',
      file_size: 'fileSize',
      original_filename: 'originalFilename',
      uploaded_at: 'uploadedAt',
      reviewed_at: 'reviewedAt',
      points_awarded: 'pointsAwarded',
      review_reason: 'reviewReason',
      commodity_id: 'commodityId',
      exchange_points: 'exchangePoints',
      sort_order: 'sortOrder',
      is_hot: 'isHot',
      sales_count: 'salesCount',
      page_size: 'pageSize',
      total_pages: 'totalPages',
      access_token: 'accessToken',
      refresh_token: 'refreshToken',
      expires_in: 'expiresIn',
      user_info: 'userInfo',
      is_background: 'isBackground',
      // 🔧 修复登录接口2002错误：添加验证码字段映射
      verification_code: 'code' // 将前端的code字段映射为后端的verification_code字段
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
