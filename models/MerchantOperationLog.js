/**
 * 餐厅积分抽奖系统 V4 - 商家操作审计日志模型（MerchantOperationLog）
 *
 * 功能说明：
 * - 独立的商家域审计日志（与 AdminOperationLog 分离）
 * - 记录商家员工的敏感操作（扫码获取用户信息、提交消费记录等）
 * - 支持按门店/员工/时间范围/操作类型筛选
 * - 支持 request_id 全链路追踪
 *
 * 业务场景：
 * - AC4.1: 新建 merchant_operation_logs 表
 * - AC4.2: 消费提交/扫码拿用户信息时，记录审计日志
 * - AC4.3: 后端提供商家操作日志查询 API，支持筛选
 * - AC4.4: 审计日志保留 180 天
 *
 * 设计模式：
 * - 不可修改：审计日志只能创建，不能修改或删除
 * - 完整记录：记录操作相关的完整上下文
 * - 多维索引：支持按操作员、门店、操作类型等多维度查询
 *
 * 数据库表名：merchant_operation_logs
 * 主键：merchant_log_id（BIGINT，自增）
 *
 * 创建时间：2026-01-12
 * 依据文档：docs/商家员工域权限体系升级方案.md
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 商家操作类型枚举定义
 *
 * @type {Object}
 */
const MERCHANT_OPERATION_TYPES = {
  SCAN_USER: 'scan_user', // 扫码获取用户信息
  SUBMIT_CONSUMPTION: 'submit_consumption', // 提交消费记录
  VIEW_CONSUMPTION_LIST: 'view_consumption_list', // 查看消费记录列表
  VIEW_CONSUMPTION_DETAIL: 'view_consumption_detail', // 查看消费记录详情
  STAFF_LOGIN: 'staff_login', // 员工登录
  STAFF_LOGOUT: 'staff_logout', // 员工登出
  STAFF_ADD: 'staff_add', // 员工入职
  STAFF_TRANSFER: 'staff_transfer', // 员工调店
  STAFF_DISABLE: 'staff_disable', // 员工禁用
  STAFF_ENABLE: 'staff_enable' // 员工启用
}

/**
 * 操作类型描述映射
 *
 * @type {Object}
 */
const OPERATION_TYPE_DESCRIPTIONS = {
  scan_user: '扫码获取用户信息',
  submit_consumption: '提交消费记录',
  view_consumption_list: '查看消费记录列表',
  view_consumption_detail: '查看消费记录详情',
  staff_login: '员工登录',
  staff_logout: '员工登出',
  staff_add: '员工入职',
  staff_transfer: '员工调店',
  staff_disable: '员工禁用',
  staff_enable: '员工启用'
}

/**
 * 操作动作枚举定义
 *
 * @type {Object}
 */
const MERCHANT_ACTIONS = {
  CREATE: 'create', // 创建
  READ: 'read', // 读取
  SCAN: 'scan', // 扫码
  UPDATE: 'update' // 更新
}

/**
 * 操作结果枚举定义
 *
 * @type {Object}
 */
const OPERATION_RESULTS = {
  SUCCESS: 'success', // 成功
  FAILED: 'failed', // 失败
  BLOCKED: 'blocked' // 被风控阻断
}

module.exports = sequelize => {
  const MerchantOperationLog = sequelize.define(
    'MerchantOperationLog',
    {
      // 主键
      merchant_log_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '商家操作日志ID'
      },

      // 操作员信息
      operator_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '操作员ID（商家员工 user_id）',
        references: {
          model: 'users',
          key: 'user_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      // 门店信息
      store_id: {
        type: DataTypes.INTEGER,
        allowNull: true, // 员工禁用等跨门店操作可为空
        comment: '门店ID（操作发生的门店，员工禁用等跨门店操作可为空）',
        references: {
          model: 'stores',
          key: 'store_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      // 操作类型（商家域专用）
      operation_type: {
        type: DataTypes.ENUM(
          'scan_user',
          'submit_consumption',
          'view_consumption_list',
          'view_consumption_detail',
          'staff_login',
          'staff_logout',
          'staff_add',
          'staff_transfer',
          'staff_disable',
          'staff_enable'
        ),
        allowNull: false,
        comment: '操作类型（商家域专用枚举）'
      },

      // 操作动作
      action: {
        type: DataTypes.ENUM('create', 'read', 'scan', 'update'),
        allowNull: false,
        defaultValue: 'create',
        comment: '操作动作'
      },

      // 目标用户信息（被扫码的用户）
      target_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '目标用户ID（被扫码/被录入消费的用户，可为空）',
        references: {
          model: 'users',
          key: 'user_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },

      // 关联的消费记录
      related_record_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '关联的消费记录ID（如适用）',
        references: {
          model: 'consumption_records',
          key: 'record_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },

      // 消费金额（仅 submit_consumption 时有值）
      consumption_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '消费金额（仅提交消费记录时有值）',
        /**
         * 获取消费金额，将DECIMAL转换为浮点数
         * @returns {number|null} 消费金额（元）或null
         */
        get() {
          const value = this.getDataValue('consumption_amount')
          return value ? parseFloat(value) : null
        }
      },

      // 操作结果
      result: {
        type: DataTypes.ENUM('success', 'failed', 'blocked'),
        allowNull: false,
        defaultValue: 'success',
        comment: '操作结果'
      },

      // 错误信息（失败时记录）
      error_message: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '错误信息（失败时记录）'
      },

      // 安全信息
      ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true,
        comment: 'IP地址（支持 IPv4 和 IPv6）'
      },

      user_agent: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '用户代理字符串（User-Agent）'
      },

      // 请求追踪
      request_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '请求ID（用于全链路追踪）'
      },

      // 幂等键（关联业务操作）
      idempotency_key: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '幂等键（关联业务操作，如消费提交的幂等键）'
      },

      // 扩展数据
      extra_data: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '扩展数据（JSON 格式，存储其他上下文信息）'
      },

      // 时间字段
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        comment: '操作时间',
        /**
         * 获取北京时间格式的操作时间
         * @returns {string} 北京时间格式的日期字符串
         */
        get() {
          return BeijingTimeHelper.formatChinese(this.getDataValue('created_at'))
        }
      }
    },
    {
      sequelize,
      modelName: 'MerchantOperationLog',
      tableName: 'merchant_operation_logs',
      timestamps: false, // 只有 created_at，没有 updated_at（审计日志不可修改）
      underscored: true,
      comment: '商家操作审计日志表（商家员工域权限体系升级 - 2026-01-12）',

      indexes: [
        {
          name: 'idx_merchant_logs_operator',
          fields: ['operator_id'],
          comment: '操作员索引'
        },
        {
          name: 'idx_merchant_logs_store',
          fields: ['store_id'],
          comment: '门店索引'
        },
        {
          name: 'idx_merchant_logs_operation_type',
          fields: ['operation_type'],
          comment: '操作类型索引'
        },
        {
          name: 'idx_merchant_logs_target_user',
          fields: ['target_user_id'],
          comment: '目标用户索引'
        },
        {
          name: 'idx_merchant_logs_related_record',
          fields: ['related_record_id'],
          comment: '关联消费记录索引'
        },
        {
          name: 'idx_merchant_logs_result',
          fields: ['result'],
          comment: '操作结果索引'
        },
        {
          name: 'idx_merchant_logs_created_at',
          fields: ['created_at'],
          comment: '创建时间索引'
        },
        {
          name: 'idx_merchant_logs_request_id',
          fields: ['request_id'],
          comment: '请求ID索引'
        },
        {
          name: 'idx_merchant_logs_idempotency_key',
          fields: ['idempotency_key'],
          comment: '幂等键索引'
        },
        {
          name: 'idx_merchant_logs_store_operator_time',
          fields: ['store_id', 'operator_id', 'created_at'],
          comment: '门店+操作员+时间复合索引'
        },
        {
          name: 'idx_merchant_logs_store_type_time',
          fields: ['store_id', 'operation_type', 'created_at'],
          comment: '门店+操作类型+时间复合索引'
        }
      ],

      scopes: {
        /**
         * 按门店筛选
         *
         * @param {number} storeId - 门店ID
         * @returns {Object} 查询条件
         */
        byStore(storeId) {
          return {
            where: { store_id: storeId }
          }
        },

        /**
         * 按操作员筛选
         *
         * @param {number} operatorId - 操作员ID
         * @returns {Object} 查询条件
         */
        byOperator(operatorId) {
          return {
            where: { operator_id: operatorId }
          }
        },

        /**
         * 按操作类型筛选
         *
         * @param {string} operationType - 操作类型
         * @returns {Object} 查询条件
         */
        byOperationType(operationType) {
          return {
            where: { operation_type: operationType }
          }
        },

        /**
         * 按操作结果筛选
         *
         * @param {string} result - 操作结果
         * @returns {Object} 查询条件
         */
        byResult(result) {
          return {
            where: { result }
          }
        },

        // 成功的操作
        successful: {
          where: { result: 'success' }
        },

        // 失败的操作
        failed: {
          where: { result: 'failed' }
        },

        // 被阻断的操作
        blocked: {
          where: { result: 'blocked' }
        }
      },

      hooks: {
        beforeCreate: record => {
          record.created_at = BeijingTimeHelper.createDatabaseTime()
        }
      }
    }
  )

  /**
   * 实例方法：获取操作类型描述
   *
   * @returns {string} 操作类型的中文描述
   */
  MerchantOperationLog.prototype.getOperationTypeDescription = function () {
    return OPERATION_TYPE_DESCRIPTIONS[this.operation_type] || this.operation_type
  }

  /**
   * 实例方法：获取操作动作描述
   *
   * @returns {string} 操作动作的中文描述
   */
  MerchantOperationLog.prototype.getActionDescription = function () {
    const actionMap = {
      create: '创建',
      read: '读取',
      scan: '扫码',
      update: '更新'
    }
    return actionMap[this.action] || this.action
  }

  /**
   * 实例方法：获取操作结果描述
   *
   * @returns {string} 操作结果的中文描述
   */
  MerchantOperationLog.prototype.getResultDescription = function () {
    const resultMap = {
      success: '成功',
      failed: '失败',
      blocked: '被风控阻断'
    }
    return resultMap[this.result] || this.result
  }

  /**
   * 实例方法：格式化为 API 响应
   *
   * @returns {Object} API 响应格式的日志数据
   */
  MerchantOperationLog.prototype.toAPIResponse = function () {
    return {
      id: this.merchant_log_id,
      operator_id: this.operator_id,
      store_id: this.store_id,
      operation_type: this.operation_type,
      operation_type_name: this.getOperationTypeDescription(),
      action: this.action,
      action_name: this.getActionDescription(),
      target_user_id: this.target_user_id,
      related_record_id: this.related_record_id,
      consumption_amount: this.consumption_amount ? parseFloat(this.consumption_amount) : null,
      result: this.result,
      result_name: this.getResultDescription(),
      error_message: this.error_message,
      ip_address: this.ip_address,
      request_id: this.request_id,
      created_at: BeijingTimeHelper.formatForAPI(this.getDataValue('created_at'))
    }
  }

  /**
   * 关联关系定义
   *
   * @param {Object} models - Sequelize 所有模型的集合对象
   * @returns {void}
   */
  MerchantOperationLog.associate = function (models) {
    // 关联操作员（用户）
    MerchantOperationLog.belongsTo(models.User, {
      foreignKey: 'operator_id',
      as: 'operator',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })

    // 关联门店
    MerchantOperationLog.belongsTo(models.Store, {
      foreignKey: 'store_id',
      as: 'store',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })

    // 关联目标用户
    MerchantOperationLog.belongsTo(models.User, {
      foreignKey: 'target_user_id',
      as: 'targetUser',
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    })

    // 关联消费记录
    MerchantOperationLog.belongsTo(models.ConsumptionRecord, {
      foreignKey: 'related_record_id',
      as: 'consumptionRecord',
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    })
  }

  /**
   * 类方法：创建审计日志
   *
   * @param {Object} data - 审计日志数据
   * @param {number} data.operator_id - 操作员ID
   * @param {number} data.store_id - 门店ID
   * @param {string} data.operation_type - 操作类型
   * @param {string} [data.action='create'] - 操作动作
   * @param {number} [data.target_user_id] - 目标用户ID
   * @param {number} [data.related_record_id] - 关联消费记录ID
   * @param {number} [data.consumption_amount] - 消费金额
   * @param {string} [data.result='success'] - 操作结果
   * @param {string} [data.error_message] - 错误信息
   * @param {string} [data.ip_address] - IP地址
   * @param {string} [data.user_agent] - User-Agent
   * @param {string} [data.request_id] - 请求ID
   * @param {string} [data.idempotency_key] - 幂等键
   * @param {Object} [data.extra_data] - 扩展数据
   * @param {Object} [options={}] - Sequelize 选项（如 transaction）
   * @returns {Promise<MerchantOperationLog>} 创建的审计日志实例
   */
  MerchantOperationLog.createLog = async function (data, options = {}) {
    return await MerchantOperationLog.create(
      {
        operator_id: data.operator_id,
        store_id: data.store_id,
        operation_type: data.operation_type,
        action: data.action || 'create',
        target_user_id: data.target_user_id || null,
        related_record_id: data.related_record_id || null,
        consumption_amount: data.consumption_amount || null,
        result: data.result || 'success',
        error_message: data.error_message || null,
        ip_address: data.ip_address || null,
        user_agent: data.user_agent || null,
        request_id: data.request_id || null,
        idempotency_key: data.idempotency_key || null,
        extra_data: data.extra_data || null,
        created_at: BeijingTimeHelper.createDatabaseTime()
      },
      options
    )
  }

  return MerchantOperationLog
}

// 导出枚举常量
module.exports.MERCHANT_OPERATION_TYPES = MERCHANT_OPERATION_TYPES
module.exports.OPERATION_TYPE_DESCRIPTIONS = OPERATION_TYPE_DESCRIPTIONS
module.exports.MERCHANT_ACTIONS = MERCHANT_ACTIONS
module.exports.OPERATION_RESULTS = OPERATION_RESULTS
