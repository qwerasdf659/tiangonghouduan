/**
 * 告警静默规则模型（AlertSilenceRule）
 *
 * 业务场景：
 * - 管理告警静默规则，用于抑制特定时间段或条件下的重复告警
 * - 支持按告警类型、级别、时间范围进行静默配置
 * - 运营后台告警中心的静默管理功能
 *
 * 关联需求：
 * - 《运营后台优化 - 后端需求文档》DB-2
 *
 * 创建时间：2026-02-03
 * @version 1.0.0
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  /**
   * 告警级别常量定义（Alert Level Constants）
   * 用于静默规则的告警级别匹配
   */
  const ALERT_LEVEL = {
    CRITICAL: 'critical', // 紧急告警
    WARNING: 'warning', // 警告告警
    INFO: 'info', // 信息告警
    ALL: 'all' // 所有级别
  }

  /**
   * 告警类型常量定义（Alert Type Constants）
   * 与 RiskAlert 模型的告警类型保持一致
   */
  const ALERT_TYPE = {
    RISK: 'risk', // 风控告警
    LOTTERY: 'lottery', // 抽奖告警
    SYSTEM: 'system', // 系统告警
    BUDGET: 'budget', // 预算告警
    USER: 'user' // 用户行为告警
  }

  const AlertSilenceRule = sequelize.define(
    'AlertSilenceRule',
    {
      alert_silence_rule_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '静默规则主键ID'
      },

      rule_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '规则名称（如：节假日静默、夜间静默）'
      },

      alert_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '告警类型（如：risk、lottery、system）'
      },

      alert_level: {
        type: DataTypes.ENUM(
          ALERT_LEVEL.CRITICAL,
          ALERT_LEVEL.WARNING,
          ALERT_LEVEL.INFO,
          ALERT_LEVEL.ALL
        ),
        defaultValue: ALERT_LEVEL.ALL,
        comment: '静默的告警级别（critical/warning/info/all）'
      },

      condition_json: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '静默条件JSON（如：{ user_id: [1,2], keyword: "测试" }）'
      },

      start_time: {
        type: DataTypes.TIME,
        allowNull: true,
        comment: '每日静默开始时间（如：22:00:00）'
      },

      end_time: {
        type: DataTypes.TIME,
        allowNull: true,
        comment: '每日静默结束时间（如：08:00:00）'
      },

      effective_start_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        comment: '规则生效开始日期'
      },

      effective_end_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        comment: '规则生效结束日期'
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: '是否启用'
      },

      created_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '创建人用户ID'
      },

      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '最后修改人用户ID'
      }
    },
    {
      tableName: 'alert_silence_rules',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      indexes: [
        {
          fields: ['alert_type', 'is_active'],
          name: 'idx_alert_silence_type_active'
        }
      ],
      comment: '告警静默规则表（运营后台优化 DB-2）'
    }
  )

  // 定义关联关系
  AlertSilenceRule.associate = function (models) {
    // 规则由管理员创建
    AlertSilenceRule.belongsTo(models.User, {
      foreignKey: 'created_by',
      as: 'creator'
    })

    // 规则可能被管理员修改
    AlertSilenceRule.belongsTo(models.User, {
      foreignKey: 'updated_by',
      as: 'updater'
    })
  }

  /**
   * 检查告警是否被静默
   *
   * @param {string} alertType - 告警类型
   * @param {string} alertLevel - 告警级别
   * @param {Date} checkTime - 检查时间（默认当前时间）
   * @returns {Promise<boolean>} 是否被静默
   */
  AlertSilenceRule.isAlertSilenced = async function (
    alertType,
    alertLevel,
    checkTime = new Date()
  ) {
    const currentTime = checkTime.toTimeString().slice(0, 8) // HH:MM:SS
    const currentDate = checkTime.toISOString().slice(0, 10) // YYYY-MM-DD

    const rules = await this.findAll({
      where: {
        is_active: true,
        alert_type: alertType
      }
    })

    for (const rule of rules) {
      // 检查告警级别匹配
      if (rule.alert_level !== ALERT_LEVEL.ALL && rule.alert_level !== alertLevel) {
        continue
      }

      // 检查日期范围
      if (rule.effective_start_date && currentDate < rule.effective_start_date) {
        continue
      }
      if (rule.effective_end_date && currentDate > rule.effective_end_date) {
        continue
      }

      // 检查时间范围
      if (rule.start_time && rule.end_time) {
        // 处理跨午夜的时间范围（如 22:00 - 08:00）
        if (rule.start_time > rule.end_time) {
          // 跨午夜
          if (currentTime >= rule.start_time || currentTime <= rule.end_time) {
            return true
          }
        } else {
          // 不跨午夜
          if (currentTime >= rule.start_time && currentTime <= rule.end_time) {
            return true
          }
        }
      } else {
        // 没有时间限制，全天静默
        return true
      }
    }

    return false
  }

  /**
   * 获取活跃的静默规则
   *
   * @param {string} alertType - 告警类型（可选）
   * @returns {Promise<Array>} 活跃规则列表
   */
  AlertSilenceRule.getActiveRules = function (alertType = null) {
    const where = { is_active: true }
    if (alertType) {
      where.alert_type = alertType
    }

    return this.findAll({
      where,
      order: [['created_at', 'DESC']]
    })
  }

  // 导出常量
  AlertSilenceRule.ALERT_LEVEL = ALERT_LEVEL
  AlertSilenceRule.ALERT_TYPE = ALERT_TYPE

  return AlertSilenceRule
}
