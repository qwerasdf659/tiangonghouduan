/**
 * 实时统计数据模型
 * 用于存储和管理系统实时统计数据，支持分时段数据聚合
 * 深度集成v3.0分离式架构，支持高性能统计查询和实时数据展示
 * 创建时间：2025年08月19日
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const AnalyticsRealtimeStats = sequelize.define(
    'AnalyticsRealtimeStats',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '统计ID'
      },

      stat_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '统计键(user_active_count/page_views_count等)',
        validate: {
          notEmpty: true,
          len: [1, 100]
        }
      },

      stat_type: {
        type: DataTypes.ENUM('counter', 'gauge', 'histogram'),
        allowNull: false,
        comment: '统计类型',
        validate: {
          isIn: {
            args: [['counter', 'gauge', 'histogram']],
            msg: '统计类型必须是counter、gauge或histogram'
          }
        }
      },

      stat_data: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '统计数据',
        validate: {
          isValidStatData (value) {
            if (typeof value !== 'object' || value === null) {
              throw new Error('stat_data必须是有效的JSON对象')
            }

            // 验证必需字段
            if (typeof value.value === 'undefined') {
              throw new Error('stat_data必须包含value字段')
            }

            // 根据统计类型验证数据结构
            if (this.stat_type === 'counter' && typeof value.value !== 'number') {
              throw new Error('counter类型的value必须是数字')
            }

            if (this.stat_type === 'gauge' && typeof value.value !== 'number') {
              throw new Error('gauge类型的value必须是数字')
            }

            if (this.stat_type === 'histogram' && !Array.isArray(value.buckets)) {
              throw new Error('histogram类型必须包含buckets数组')
            }
          }
        }
      },

      time_bucket: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: '时间桶(hour/day/week)',
        validate: {
          isIn: {
            args: [['minute', 'hour', 'day', 'week', 'month']],
            msg: '时间桶必须是minute、hour、day、week或month'
          }
        }
      },

      bucket_time: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '桶时间',
        validate: {
          isDate: true
        }
      },

      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '创建时间'
      },

      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '更新时间'
      }
    },
    {
      tableName: 'analytics_realtime_stats',
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: 'uk_analytics_stats_stat_bucket',
          fields: ['stat_key', 'time_bucket', 'bucket_time'],
          unique: true
        },
        {
          name: 'idx_analytics_stats_bucket_time',
          fields: ['time_bucket', 'bucket_time']
        },
        {
          name: 'idx_analytics_stats_stat_type',
          fields: ['stat_type']
        }
      ],
      comment: '实时统计数据表'
    }
  )

  /**
   * 🔥 增量更新统计数据
   * @param {string} statKey - 统计键
   * @param {string} statType - 统计类型
   * @param {Object} statData - 统计数据
   * @param {string} timeBucket - 时间桶
   * @param {Date} bucketTime - 桶时间
   * @param {Object} transaction - 数据库事务
   * @returns {Promise<Object>} 更新结果
   */
  AnalyticsRealtimeStats.incrementStat = async function (
    statKey,
    statType,
    statData,
    timeBucket,
    bucketTime,
    transaction = null
  ) {
    const options = {
      where: {
        stat_key: statKey,
        time_bucket: timeBucket,
        bucket_time: bucketTime
      }
    }

    if (transaction) {
      options.transaction = transaction
    }

    // 查找现有记录
    const existingStat = await this.findOne(options)

    if (existingStat) {
      // 更新现有记录
      const currentData = existingStat.stat_data || {}
      let newData

      switch (statType) {
      case 'counter':
        newData = {
          ...currentData,
          value: (currentData.value || 0) + (statData.value || 1),
          last_updated: new Date()
        }
        break

      case 'gauge':
        newData = {
          ...currentData,
          value: statData.value,
          previous_value: currentData.value,
          last_updated: new Date()
        }
        break

      case 'histogram':
        newData = {
          ...currentData,
          buckets: this.mergeHistogramBuckets(currentData.buckets || [], statData.buckets || []),
          total_count: (currentData.total_count || 0) + (statData.count || 1),
          last_updated: new Date()
        }
        break

      default:
        newData = { ...currentData, ...statData, last_updated: new Date() }
      }

      await existingStat.update(
        { stat_data: newData, updated_at: new Date() },
        transaction ? { transaction } : {}
      )

      return existingStat
    } else {
      // 创建新记录
      const createData = {
        stat_key: statKey,
        stat_type: statType,
        stat_data: {
          ...statData,
          created_at: new Date(),
          last_updated: new Date()
        },
        time_bucket: timeBucket,
        bucket_time: bucketTime,
        created_at: new Date(),
        updated_at: new Date()
      }

      return await this.create(createData, transaction ? { transaction } : {})
    }
  }

  /**
   * 🔥 获取统计数据时间序列
   * @param {string} statKey - 统计键
   * @param {string} timeBucket - 时间桶
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 时间序列数据
   */
  AnalyticsRealtimeStats.getTimeSeries = async function (statKey, timeBucket, options = {}) {
    const { startTime, endTime, limit = 100, order = 'ASC' } = options

    const whereClause = {
      stat_key: statKey,
      time_bucket: timeBucket
    }

    if (startTime && endTime) {
      whereClause.bucket_time = {
        [sequelize.Sequelize.Op.between]: [startTime, endTime]
      }
    } else if (startTime) {
      whereClause.bucket_time = {
        [sequelize.Sequelize.Op.gte]: startTime
      }
    } else if (endTime) {
      whereClause.bucket_time = {
        [sequelize.Sequelize.Op.lte]: endTime
      }
    }

    return await this.findAll({
      where: whereClause,
      order: [['bucket_time', order]],
      limit,
      raw: true
    })
  }

  /**
   * 🔥 获取最新统计数据
   * @param {Array} statKeys - 统计键数组
   * @param {string} timeBucket - 时间桶
   * @returns {Promise<Object>} 最新统计数据
   */
  AnalyticsRealtimeStats.getLatestStats = async function (statKeys, timeBucket = 'hour') {
    const whereClause = {
      stat_key: {
        [sequelize.Sequelize.Op.in]: statKeys
      },
      time_bucket: timeBucket
    }

    const stats = await this.findAll({
      where: whereClause,
      attributes: [
        'stat_key',
        'stat_type',
        'stat_data',
        [sequelize.fn('MAX', sequelize.col('bucket_time')), 'latest_bucket_time']
      ],
      group: ['stat_key', 'stat_type'],
      raw: true
    })

    // 转换为键值对格式
    const result = {}
    stats.forEach(stat => {
      result[stat.stat_key] = {
        type: stat.stat_type,
        data: stat.stat_data,
        latest_time: stat.latest_bucket_time
      }
    })

    return result
  }

  /**
   * 🔥 聚合统计数据
   * @param {string} statKey - 统计键
   * @param {string} fromBucket - 源时间桶
   * @param {string} toBucket - 目标时间桶
   * @param {Date} targetTime - 目标时间
   * @returns {Promise<Object>} 聚合结果
   */
  AnalyticsRealtimeStats.aggregateStats = async function (
    statKey,
    fromBucket,
    toBucket,
    targetTime
  ) {
    const timeRange = this.getAggregationTimeRange(fromBucket, toBucket, targetTime)

    const sourceStats = await this.findAll({
      where: {
        stat_key: statKey,
        time_bucket: fromBucket,
        bucket_time: {
          [sequelize.Sequelize.Op.between]: [timeRange.start, timeRange.end]
        }
      },
      order: [['bucket_time', 'ASC']],
      raw: true
    })

    if (sourceStats.length === 0) {
      return null
    }

    // 根据统计类型进行聚合
    const firstStat = sourceStats[0]
    let aggregatedData

    switch (firstStat.stat_type) {
    case 'counter':
      aggregatedData = {
        value: sourceStats.reduce((sum, stat) => sum + (stat.stat_data.value || 0), 0),
        count: sourceStats.length,
        min: Math.min(...sourceStats.map(s => s.stat_data.value || 0)),
        max: Math.max(...sourceStats.map(s => s.stat_data.value || 0))
      }
      break

    case 'gauge': {
      const values = sourceStats.map(s => s.stat_data.value || 0)
      aggregatedData = {
        value: values[values.length - 1], // 最后一个值
        avg: values.reduce((sum, val) => sum + val, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        count: values.length
      }
      break
    }

    case 'histogram':
      aggregatedData = {
        buckets: sourceStats.reduce((merged, stat) => {
          return this.mergeHistogramBuckets(merged, stat.stat_data.buckets || [])
        }, []),
        total_count: sourceStats.reduce((sum, stat) => sum + (stat.stat_data.total_count || 0), 0)
      }
      break

    default:
      aggregatedData = { aggregated_from: sourceStats.length }
    }

    // 创建或更新聚合记录
    return await this.incrementStat(
      statKey,
      firstStat.stat_type,
      aggregatedData,
      toBucket,
      targetTime
    )
  }

  /**
   * 🔥 批量更新统计数据
   * @param {Array} statsData - 统计数据数组
   * @param {Object} transaction - 数据库事务
   * @returns {Promise<Array>} 更新结果
   */
  AnalyticsRealtimeStats.bulkUpdateStats = async function (statsData, transaction = null) {
    const results = []

    for (const statData of statsData) {
      const result = await this.incrementStat(
        statData.stat_key,
        statData.stat_type,
        statData.stat_data,
        statData.time_bucket,
        statData.bucket_time,
        transaction
      )
      results.push(result)
    }

    return results
  }

  /**
   * 🔥 清理过期统计数据
   * @param {Object} options - 清理选项
   * @returns {Promise<number>} 删除的记录数
   */
  AnalyticsRealtimeStats.cleanupOldStats = async function (options = {}) {
    const { timeBucket = 'hour', daysAgo = 30, batchSize = 1000 } = options

    const cutoffDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)

    const deletedCount = await this.destroy({
      where: {
        time_bucket: timeBucket,
        bucket_time: {
          [sequelize.Sequelize.Op.lt]: cutoffDate
        }
      },
      limit: batchSize
    })

    return deletedCount
  }

  /**
   * 🔥 获取统计概览
   * @param {Object} options - 查询选项
   * @returns {Promise<Object>} 统计概览
   */
  AnalyticsRealtimeStats.getStatsOverview = async function (options = {}) {
    const { timeBucket = 'hour', hours = 24 } = options
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000)

    const overview = await this.findAll({
      attributes: [
        'stat_key',
        'stat_type',
        [sequelize.fn('COUNT', sequelize.col('id')), 'record_count'],
        [sequelize.fn('MIN', sequelize.col('bucket_time')), 'earliest_time'],
        [sequelize.fn('MAX', sequelize.col('bucket_time')), 'latest_time']
      ],
      where: {
        time_bucket: timeBucket,
        bucket_time: {
          [sequelize.Sequelize.Op.gte]: startTime
        }
      },
      group: ['stat_key', 'stat_type'],
      raw: true
    })

    return overview
  }

  /**
   * 🔥 合并直方图桶数据（私有方法）
   * @private
   */
  AnalyticsRealtimeStats.mergeHistogramBuckets = function (buckets1, buckets2) {
    const merged = {}

    // 合并第一个直方图的桶
    buckets1.forEach(bucket => {
      merged[bucket.range] = bucket.count || 0
    })

    // 合并第二个直方图的桶
    buckets2.forEach(bucket => {
      merged[bucket.range] = (merged[bucket.range] || 0) + (bucket.count || 0)
    })

    // 转换回数组格式
    return Object.keys(merged).map(range => ({
      range,
      count: merged[range]
    }))
  }

  /**
   * 🔥 获取聚合时间范围（私有方法）
   * @private
   */
  AnalyticsRealtimeStats.getAggregationTimeRange = function (fromBucket, toBucket, targetTime) {
    const target = new Date(targetTime)

    switch (toBucket) {
    case 'hour':
      return {
        start: new Date(
          target.getFullYear(),
          target.getMonth(),
          target.getDate(),
          target.getHours()
        ),
        end: new Date(
          target.getFullYear(),
          target.getMonth(),
          target.getDate(),
          target.getHours() + 1
        )
      }

    case 'day':
      return {
        start: new Date(target.getFullYear(), target.getMonth(), target.getDate()),
        end: new Date(target.getFullYear(), target.getMonth(), target.getDate() + 1)
      }

    case 'week': {
      const startOfWeek = new Date(target)
      startOfWeek.setDate(target.getDate() - target.getDay())
      startOfWeek.setHours(0, 0, 0, 0)
      const endOfWeek = new Date(startOfWeek)
      endOfWeek.setDate(startOfWeek.getDate() + 7)
      return { start: startOfWeek, end: endOfWeek }
    }

    case 'month':
      return {
        start: new Date(target.getFullYear(), target.getMonth(), 1),
        end: new Date(target.getFullYear(), target.getMonth() + 1, 1)
      }

    default:
      // 默认按小时
      return {
        start: new Date(
          target.getFullYear(),
          target.getMonth(),
          target.getDate(),
          target.getHours()
        ),
        end: new Date(
          target.getFullYear(),
          target.getMonth(),
          target.getDate(),
          target.getHours() + 1
        )
      }
    }
  }

  return AnalyticsRealtimeStats
}
