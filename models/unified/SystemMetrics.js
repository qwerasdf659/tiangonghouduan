/**
 * 系统指标监控模型
 * @description 记录统一决策引擎的性能指标和运行状态
 * @version 4.0.0
 * @date 2025-09-10 16:49:01 北京时间
 */

const { DataTypes } = require('sequelize')
const { v4: uuidv4 } = require('uuid')

module.exports = sequelize => {
  const SystemMetrics = sequelize.define(
    'SystemMetrics',
    {
      // 指标记录唯一ID
      metric_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: () => uuidv4(),
        comment: '指标记录唯一标识符'
      },

      // 指标基础信息
      metric_type: {
        type: DataTypes.ENUM(
          'performance',
          'business',
          'error_rate',
          'throughput',
          'cache_hit_rate',
          'database_performance',
          'engine_health',
          'user_experience'
        ),
        allowNull: false,
        comment: '指标类型'
      },

      metric_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '指标名称'
      },

      metric_category: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '指标分类'
      },

      // 指标值
      metric_value: {
        type: DataTypes.DECIMAL(15, 6),
        allowNull: false,
        comment: '指标数值'
      },

      metric_unit: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: '指标单位：ms, percentage, count, MB等'
      },

      // 阈值和告警
      threshold_warning: {
        type: DataTypes.DECIMAL(15, 6),
        allowNull: true,
        comment: '警告阈值'
      },

      threshold_critical: {
        type: DataTypes.DECIMAL(15, 6),
        allowNull: true,
        comment: '严重阈值'
      },

      alert_triggered: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: '是否触发告警'
      },

      alert_level: {
        type: DataTypes.ENUM('normal', 'warning', 'critical'),
        defaultValue: 'normal',
        comment: '告警级别'
      },

      // 时间维度
      measurement_time: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '测量时间'
      },

      time_window: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: '时间窗口：1min, 5min, 1hour等'
      },

      // 业务维度
      campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '关联活动ID（如适用）'
      },

      user_segment: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '用户分群：new_user, vip, normal等'
      },

      // 详细数据
      metric_details: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '指标详细数据：分项统计、趋势数据等'
      },

      aggregation_method: {
        type: DataTypes.ENUM('avg', 'sum', 'count', 'min', 'max', 'p95', 'p99'),
        defaultValue: 'avg',
        comment: '聚合方法'
      },

      sample_size: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '样本大小'
      },

      // 系统版本信息
      engine_version: {
        type: DataTypes.STRING(20),
        defaultValue: '4.0.0',
        comment: '引擎版本'
      },

      system_environment: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: '系统环境：production, staging, development'
      },

      // 性能基准对比
      baseline_value: {
        type: DataTypes.DECIMAL(15, 6),
        allowNull: true,
        comment: '基准值'
      },

      improvement_percentage: {
        type: DataTypes.DECIMAL(8, 4),
        allowNull: true,
        comment: '相比基准的改进百分比'
      },

      // 数据质量
      is_valid: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: '数据是否有效'
      },

      validation_errors: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '数据验证错误'
      },

      // 时间戳
      created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        comment: '记录创建时间'
      }
    },
    {
      tableName: 'unified_system_metrics',
      timestamps: false,
      indexes: [
        {
          name: 'idx_metric_type_time',
          fields: ['metric_type', 'measurement_time']
        },
        {
          name: 'idx_metric_name_time',
          fields: ['metric_name', 'measurement_time']
        },
        {
          name: 'idx_alert_level_time',
          fields: ['alert_level', 'measurement_time']
        },
        {
          name: 'idx_campaign_metrics',
          fields: ['campaign_id', 'metric_type', 'measurement_time']
        },
        {
          name: 'idx_performance_trend',
          fields: ['metric_name', 'metric_value', 'measurement_time']
        },
        {
          name: 'idx_system_health',
          fields: ['engine_version', 'alert_triggered', 'measurement_time']
        }
      ],
      comment: '统一决策引擎系统指标监控表'
    }
  )

  // 静态方法 - 记录性能指标
  SystemMetrics.recordPerformanceMetric = async function (metricName, value, details = {}) {
    return await this.create({
      metric_type: 'performance',
      metric_name: metricName,
      metric_value: value,
      metric_unit: details.unit || 'ms',
      metric_details: details,
      measurement_time: new Date()
    })
  }

  // 静态方法 - 记录业务指标
  SystemMetrics.recordBusinessMetric = async function (
    metricName,
    value,
    campaignId = null,
    details = {}
  ) {
    return await this.create({
      metric_type: 'business',
      metric_name: metricName,
      metric_value: value,
      campaign_id: campaignId,
      metric_details: details,
      measurement_time: new Date()
    })
  }

  // 静态方法 - 检查告警阈值
  SystemMetrics.checkAlerts = async function (metricType, _timeWindow = '5min') {
    const { Op } = require('sequelize')
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)

    return await this.findAll({
      where: {
        metric_type: metricType,
        measurement_time: {
          [Op.gte]: fiveMinutesAgo
        },
        alert_triggered: true
      },
      order: [['measurement_time', 'DESC']]
    })
  }

  return SystemMetrics
}
