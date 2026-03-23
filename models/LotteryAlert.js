/**
 * 📋 抽奖告警模型 - 运营监控核心组件
 *
 * 业务职责：
 * - 记录抽奖系统的实时告警信息
 * - 支持多种告警类型（中奖率、预算、库存、用户、系统）
 * - 提供告警状态流转（激活→确认→已解决）
 *
 * 设计决策（来源：决策6）：
 * - 独立于商家风控的 risk_alerts 表
 * - 专用于抽奖系统，包含 lottery_campaign_id、阈值偏差等专用字段
 * - 职责分离，便于独立演进
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 抽奖告警模型
 * 业务场景：运营监控、异常检测、系统健康状态
 */
class LotteryAlert extends Model {
  /**
   * 模型关联定义
   * @param {Object} models - 所有模型的引用
   * @returns {void}
   */
  static associate(models) {
    // 多对一：告警属于某个活动
    LotteryAlert.belongsTo(models.LotteryCampaign, {
      foreignKey: 'lottery_campaign_id',
      targetKey: 'lottery_campaign_id',
      as: 'campaign',
      onDelete: 'CASCADE',
      comment: '关联的抽奖活动'
    })

    // 多对一：处理人（可选）
    LotteryAlert.belongsTo(models.User, {
      foreignKey: 'resolved_by',
      targetKey: 'user_id',
      as: 'resolver',
      onDelete: 'SET NULL',
      comment: '处理该告警的管理员'
    })
  }

  /**
   * 获取告警类型显示名称
   * @returns {string} 告警类型中文名称
   */
  getAlertTypeName() {
    const typeNames = {
      win_rate: '中奖率异常',
      budget: '预算告警',
      inventory: '库存告警',
      user: '用户异常',
      system: '系统告警'
    }
    return typeNames[this.alert_type] || '未知类型'
  }

  /**
   * 获取严重程度显示名称
   * @returns {string} 严重程度中文名称
   */
  getSeverityDisplayName() {
    const severityNames = {
      info: '提示',
      warning: '警告',
      danger: '严重'
    }
    return severityNames[this.severity] || '未知级别'
  }

  /**
   * 获取状态显示名称
   * @returns {string} 状态中文名称
   */
  getStatusDisplayName() {
    const statusNames = {
      active: '待处理',
      acknowledged: '已确认',
      resolved: '已解决'
    }
    return statusNames[this.status] || '未知状态'
  }

  /**
   * 计算阈值偏差百分比
   * @returns {number|null} 偏差百分比（如 15.5 表示偏差15.5%）
   */
  getDeviationPercentage() {
    if (this.threshold_value === null || this.actual_value === null) {
      return null
    }
    if (this.threshold_value === 0) {
      return this.actual_value === 0 ? 0 : 100
    }
    return Math.abs(((this.actual_value - this.threshold_value) / this.threshold_value) * 100)
  }

  /**
   * 判断告警是否已解决
   * @returns {boolean} 是否已解决
   */
  isResolved() {
    return this.status === 'resolved'
  }

  /**
   * 判断告警是否需要紧急处理
   * @returns {boolean} 是否需要紧急处理
   */
  isUrgent() {
    return this.severity === 'danger' && this.status === 'active'
  }

  /**
   * 确认告警
   * @param {number} operator_id - 操作人ID
   * @returns {Promise<LotteryAlert>} 更新后的告警实例
   */
  async acknowledge(operator_id) {
    return await this.update({
      status: 'acknowledged',
      resolved_by: operator_id
    })
  }

  /**
   * 解决告警
   * @param {number} operator_id - 操作人ID
   * @param {string} notes - 处理备注
   * @returns {Promise<LotteryAlert>} 更新后的告警实例
   */
  async resolve(operator_id, notes = '') {
    const BeijingTimeHelper = require('../utils/timeHelper')
    return await this.update({
      status: 'resolved',
      resolved_at: BeijingTimeHelper.createBeijingTime(),
      resolved_by: operator_id,
      resolve_notes: notes
    })
  }
}

/**
 * 模型初始化配置
 * @param {Sequelize} sequelize - Sequelize实例
 * @returns {LotteryAlert} 初始化后的模型
 */
LotteryAlert.initModel = sequelize => {
  LotteryAlert.init(
    {
      // ==================== 主键 ====================
      lottery_alert_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '告警ID（主键，自增）'
      },

      // ==================== 业务关联 ====================
      lottery_campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '关联的抽奖活动ID（外键）',
        references: {
          model: 'lottery_campaigns',
          key: 'lottery_campaign_id'
        },
        onDelete: 'CASCADE'
      },

      /*
       * ==================== 告警基础信息 ====================
       * 2026-02-20：ENUM → VARCHAR(50)，支持策略模拟的 simulation_bound 告警类型
       */
      alert_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment:
          '告警类型：win_rate=中奖率异常 | budget=预算告警 | inventory=库存告警 | user=用户异常 | system=系统告警'
      },

      severity: {
        type: DataTypes.ENUM('info', 'warning', 'danger'),
        allowNull: false,
        comment: '告警严重程度：info=提示 | warning=警告 | danger=严重'
      },

      status: {
        type: DataTypes.ENUM('active', 'acknowledged', 'resolved'),
        allowNull: false,
        defaultValue: 'active',
        comment: '告警状态：active=待处理 | acknowledged=已确认 | resolved=已解决'
      },

      // ==================== 告警详情 ====================
      rule_code: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '规则代码（如 RULE_001、WIN_RATE_HIGH）'
      },

      threshold_value: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: true,
        comment: '阈值（规则定义的期望值）',
        /**
         * 获取阈值，将DECIMAL转换为浮点数
         * @returns {number|null} 阈值或null
         */
        get() {
          const value = this.getDataValue('threshold_value')
          return value ? parseFloat(value) : null
        }
      },

      actual_value: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: true,
        comment: '实际值（触发告警时的实际数值）',
        /**
         * 获取实际值，将DECIMAL转换为浮点数
         * @returns {number|null} 实际值或null
         */
        get() {
          const value = this.getDataValue('actual_value')
          return value ? parseFloat(value) : null
        }
      },

      message: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '告警消息（人类可读的描述）'
      },

      // ==================== 处理信息 ====================
      resolved_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '解决时间（北京时间）'
      },

      resolved_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '处理人ID（外键，关联 users.user_id）',
        references: {
          model: 'users',
          key: 'user_id'
        },
        onDelete: 'SET NULL'
      },

      resolve_notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '处理备注'
      },

      // ==================== 时间戳 ====================
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '创建时间（北京时间）'
      },

      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '更新时间（北京时间）'
      }
    },
    {
      sequelize,
      modelName: 'LotteryAlert',
      tableName: 'lottery_alerts',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '抽奖系统告警表 - 运营监控专用（独立于商家风控的 risk_alerts）',

      // 索引定义
      indexes: [
        {
          name: 'idx_campaign_status',
          fields: ['lottery_campaign_id', 'status'],
          comment: '按活动和状态查询告警'
        },
        {
          name: 'idx_status_created',
          fields: ['status', 'created_at'],
          comment: '按状态和时间查询告警'
        },
        {
          name: 'idx_alert_type',
          fields: ['alert_type'],
          comment: '按告警类型查询'
        },
        {
          name: 'idx_severity',
          fields: ['severity'],
          comment: '按严重程度查询'
        }
      ],

      // 查询范围定义（Sequelize Scope）
      scopes: {
        // 活动告警（待处理）
        active: {
          where: { status: 'active' }
        },
        // 已解决的告警
        resolved: {
          where: { status: 'resolved' }
        },
        // 严重告警
        danger: {
          where: { severity: 'danger' }
        },
        /**
         * 指定活动的告警范围
         * @param {number} lottery_campaign_id - 抽奖活动ID
         * @returns {Object} Sequelize查询条件
         */
        byCampaign(lottery_campaign_id) {
          return {
            where: { lottery_campaign_id }
          }
        },
        /**
         * 指定类型的告警范围
         * @param {string} alert_type - 告警类型
         * @returns {Object} Sequelize查询条件
         */
        byType(alert_type) {
          return {
            where: { alert_type }
          }
        }
      }
    }
  )

  return LotteryAlert
}

module.exports = LotteryAlert
