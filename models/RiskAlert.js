/**
 * 餐厅积分抽奖系统 V4 - 风控告警模型（RiskAlert）
 *
 * 功能说明：
 * - 记录商家域风控告警事件
 * - 支持频次阻断、金额告警、关联告警等风控场景
 * - 供管理员后台查看和复核
 *
 * 业务场景（来自商家员工域权限体系升级方案 AC5）：
 * - AC5.1: 频次限制（硬阻断）- 单员工60秒内最多10次提交
 * - AC5.2: 金额告警（软提醒）- 单笔消费>5000 或 累计>2万/天
 * - AC5.3: 关联告警（软提醒）- 同一用户10分钟内被不同门店录入
 *
 * 数据库表名：risk_alerts
 * 主键：alert_id（INTEGER，自增）
 *
 * 创建时间：2026-01-12
 * 依据文档：docs/商家员工域权限体系升级方案.md
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 告警类型枚举
 */
const ALERT_TYPES = {
  FREQUENCY_LIMIT: 'frequency_limit', // 频次超限
  AMOUNT_LIMIT: 'amount_limit', // 金额超限
  DUPLICATE_USER: 'duplicate_user', // 用户被多店录入
  SUSPICIOUS_PATTERN: 'suspicious_pattern' // 可疑模式
}

/**
 * 严重程度枚举
 */
const SEVERITY_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
}

/**
 * 告警状态枚举
 */
const ALERT_STATUS = {
  PENDING: 'pending', // 待处理
  REVIEWED: 'reviewed', // 已复核
  IGNORED: 'ignored' // 已忽略
}

/**
 * 告警类型描述映射
 */
const ALERT_TYPE_DESCRIPTIONS = {
  [ALERT_TYPES.FREQUENCY_LIMIT]: '提交频次超限',
  [ALERT_TYPES.AMOUNT_LIMIT]: '消费金额告警',
  [ALERT_TYPES.DUPLICATE_USER]: '用户被多店录入',
  [ALERT_TYPES.SUSPICIOUS_PATTERN]: '可疑操作模式'
}

/**
 * RiskAlert 模型初始化函数
 *
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Object} RiskAlert 模型
 */
module.exports = sequelize => {
  const RiskAlert = sequelize.define(
    'RiskAlert',
    {
      risk_alert_id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        comment: '告警ID（主键）'
      },
      alert_type: {
        type: DataTypes.ENUM(...Object.values(ALERT_TYPES)),
        allowNull: false,
        comment: '告警类型'
      },
      severity: {
        type: DataTypes.ENUM(...Object.values(SEVERITY_LEVELS)),
        allowNull: false,
        defaultValue: SEVERITY_LEVELS.MEDIUM,
        comment: '严重程度'
      },
      operator_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '操作员ID（触发告警的员工）'
      },
      store_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '门店ID'
      },
      target_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '目标用户ID（被录入消费的用户）'
      },
      related_record_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '关联消费记录ID'
      },
      rule_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '触发的规则名称'
      },
      rule_threshold: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '规则阈值'
      },
      actual_value: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '实际值'
      },
      alert_message: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: '告警消息'
      },
      is_blocked: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否阻断提交'
      },
      status: {
        type: DataTypes.ENUM(...Object.values(ALERT_STATUS)),
        allowNull: false,
        defaultValue: ALERT_STATUS.PENDING,
        comment: '状态'
      },
      reviewed_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '复核人ID'
      },
      review_notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '复核备注'
      },
      reviewed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '复核时间'
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '创建时间'
      }
    },
    {
      tableName: 'risk_alerts',
      timestamps: false,
      comment: '风控告警表'
    }
  )

  /**
   * 定义模型关联
   *
   * @param {Object} models - 所有模型集合
   * @returns {void}
   */
  RiskAlert.associate = function (models) {
    // 关联操作员（员工）
    RiskAlert.belongsTo(models.User, {
      foreignKey: 'operator_id',
      as: 'operator'
    })

    // 关联门店
    if (models.Store) {
      RiskAlert.belongsTo(models.Store, {
        foreignKey: 'store_id',
        as: 'store'
      })
    }

    // 关联目标用户
    RiskAlert.belongsTo(models.User, {
      foreignKey: 'target_user_id',
      as: 'targetUser'
    })

    // 关联复核人
    RiskAlert.belongsTo(models.User, {
      foreignKey: 'reviewed_by',
      as: 'reviewer'
    })

    // 关联消费记录
    if (models.ConsumptionRecord) {
      RiskAlert.belongsTo(models.ConsumptionRecord, {
        foreignKey: 'related_record_id',
        as: 'relatedRecord'
      })
    }
  }

  /*
   * =================================================================
   * 静态方法
   * =================================================================
   */

  /**
   * 创建频次告警（硬阻断）
   *
   * @param {Object} params - 参数
   * @param {number} params.operator_id - 操作员ID
   * @param {number} params.store_id - 门店ID
   * @param {number} params.count - 实际提交次数
   * @param {number} params.limit - 限制次数
   * @param {number} params.window_seconds - 时间窗口（秒）
   * @param {Object} options - Sequelize 选项
   * @returns {Promise<Object>} 创建的告警记录
   */
  RiskAlert.createFrequencyAlert = async function (params, options = {}) {
    const { operator_id, store_id, count, limit, window_seconds } = params

    return await RiskAlert.create(
      {
        alert_type: ALERT_TYPES.FREQUENCY_LIMIT,
        severity: SEVERITY_LEVELS.HIGH,
        operator_id,
        store_id,
        rule_name: 'frequency_limit',
        rule_threshold: `${limit}次/${window_seconds}秒`,
        actual_value: `${count}次/${window_seconds}秒`,
        alert_message: `操作员(ID:${operator_id})在${window_seconds}秒内提交${count}次，超过限制${limit}次，操作已阻断`,
        is_blocked: true,
        status: ALERT_STATUS.PENDING,
        created_at: BeijingTimeHelper.nowDate()
      },
      options
    )
  }

  /**
   * 创建金额告警（软提醒）
   *
   * @param {Object} params - 参数
   * @param {number} params.operator_id - 操作员ID
   * @param {number} params.store_id - 门店ID
   * @param {number} params.target_user_id - 目标用户ID
   * @param {number} params.related_record_id - 关联消费记录ID
   * @param {number} params.amount - 消费金额
   * @param {string} params.alert_type - 告警类型（single/daily）
   * @param {number} params.threshold - 阈值
   * @param {Object} options - Sequelize 选项
   * @returns {Promise<Object>} 创建的告警记录
   */
  RiskAlert.createAmountAlert = async function (params, options = {}) {
    const {
      operator_id,
      store_id,
      target_user_id,
      related_record_id,
      amount,
      alert_type,
      threshold
    } = params

    const ruleName = alert_type === 'single' ? 'single_amount_limit' : 'daily_amount_limit'
    const ruleThreshold = alert_type === 'single' ? `${threshold}元/笔` : `${threshold}元/天`
    const actualValue = alert_type === 'single' ? `${amount}元` : `累计${amount}元`
    const message =
      alert_type === 'single'
        ? `单笔消费${amount}元超过阈值${threshold}元（仅告警不阻断）`
        : `当日累计消费${amount}元超过阈值${threshold}元（仅告警不阻断）`

    return await RiskAlert.create(
      {
        alert_type: ALERT_TYPES.AMOUNT_LIMIT,
        severity: SEVERITY_LEVELS.MEDIUM,
        operator_id,
        store_id,
        target_user_id,
        related_record_id,
        rule_name: ruleName,
        rule_threshold: ruleThreshold,
        actual_value: actualValue,
        alert_message: message,
        is_blocked: false,
        status: ALERT_STATUS.PENDING,
        created_at: BeijingTimeHelper.nowDate()
      },
      options
    )
  }

  /**
   * 创建关联告警（软提醒）- 用户被多店录入
   *
   * @param {Object} params - 参数
   * @param {number} params.target_user_id - 目标用户ID
   * @param {number} params.current_store_id - 当前门店ID
   * @param {number} params.operator_id - 操作员ID
   * @param {number} params.related_record_id - 关联消费记录ID
   * @param {number} params.store_count - 门店数量
   * @param {number} params.window_minutes - 时间窗口（分钟）
   * @param {Object} options - Sequelize 选项
   * @returns {Promise<Object>} 创建的告警记录
   */
  RiskAlert.createDuplicateUserAlert = async function (params, options = {}) {
    const {
      target_user_id,
      current_store_id,
      operator_id,
      related_record_id,
      store_count,
      window_minutes
    } = params

    return await RiskAlert.create(
      {
        alert_type: ALERT_TYPES.DUPLICATE_USER,
        severity: SEVERITY_LEVELS.HIGH,
        operator_id,
        store_id: current_store_id,
        target_user_id,
        related_record_id,
        rule_name: 'duplicate_user_check',
        rule_threshold: `2个门店/${window_minutes}分钟`,
        actual_value: `${store_count}个门店/${window_minutes}分钟`,
        alert_message: `用户(ID:${target_user_id})在${window_minutes}分钟内被${store_count}个不同门店录入消费，请核实`,
        is_blocked: false,
        status: ALERT_STATUS.PENDING,
        created_at: BeijingTimeHelper.nowDate()
      },
      options
    )
  }

  /**
   * 复核告警
   *
   * @param {number} alertId - 告警ID
   * @param {Object} params - 参数
   * @param {number} params.reviewed_by - 复核人ID
   * @param {string} params.status - 新状态（reviewed/ignored）
   * @param {string} params.review_notes - 复核备注
   * @param {Object} options - Sequelize 选项
   * @returns {Promise<Object>} 更新后的告警记录
   */
  RiskAlert.reviewAlert = async function (alertId, params, options = {}) {
    const { reviewed_by, status, review_notes } = params

    const alert = await RiskAlert.findByPk(alertId, options)
    if (!alert) {
      throw new Error(`告警记录不存在: ${alertId}`)
    }

    if (alert.status !== ALERT_STATUS.PENDING) {
      throw new Error(`告警已处理，状态: ${alert.status}`)
    }

    await alert.update(
      {
        status,
        reviewed_by,
        review_notes,
        reviewed_at: BeijingTimeHelper.nowDate()
      },
      options
    )

    return alert
  }

  /**
   * 查询待处理告警
   *
   * @param {Object} filters - 过滤条件
   * @param {string} filters.alert_type - 告警类型
   * @param {string} filters.severity - 严重程度
   * @param {number} filters.store_id - 门店ID
   * @param {number} filters.operator_id - 操作员ID
   * @param {Object} pagination - 分页参数
   * @param {Object} options - Sequelize 选项
   * @returns {Promise<Object>} 查询结果
   */
  RiskAlert.getPendingAlerts = async function (filters = {}, pagination = {}, options = {}) {
    const { alert_type, severity, store_id, operator_id } = filters
    const { page = 1, page_size = 20 } = pagination

    const where = { status: ALERT_STATUS.PENDING }
    if (alert_type) where.alert_type = alert_type
    if (severity) where.severity = severity
    if (store_id) where.store_id = store_id
    if (operator_id) where.operator_id = operator_id

    const { count, rows } = await RiskAlert.findAndCountAll({
      where,
      order: [
        ['severity', 'DESC'],
        ['created_at', 'DESC']
      ],
      limit: page_size,
      offset: (page - 1) * page_size,
      ...options
    })

    return {
      total: count,
      page,
      page_size,
      total_pages: Math.ceil(count / page_size),
      items: rows
    }
  }

  // 导出枚举
  RiskAlert.ALERT_TYPES = ALERT_TYPES
  RiskAlert.SEVERITY_LEVELS = SEVERITY_LEVELS
  RiskAlert.ALERT_STATUS = ALERT_STATUS
  RiskAlert.ALERT_TYPE_DESCRIPTIONS = ALERT_TYPE_DESCRIPTIONS

  return RiskAlert
}
