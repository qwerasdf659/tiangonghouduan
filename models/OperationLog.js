/**
 * 统一操作日志模型（OperationLog）—— 单表 operation_logs + operator_type 多态（拍板 10，2026-07-11）
 *
 * 📋 三域合并说明（原 admin_operation_logs / merchant_operation_logs / batch_operation_logs 三表合并）：
 * - operator_type='admin'    管理员单笔操作审计（只增不改，含前后数据对比 / 风险等级 / 回滚支持）
 * - operator_type='merchant' 商家员工操作日志（扫码/录入消费/员工管理，含门店维度与风控结果）
 * - operator_type='batch'    管理员批量任务日志（有状态流转 processing→completed，含成功/失败计数）
 *
 * 字段归属：
 * - 公共脊柱列：operator_type / operator_id / operation_type / action / target_type / target_id /
 *   status / ip_address / user_agent / request_id / idempotency_key / created_at
 * - 管理员审计列（admin 域专用，高频筛选需索引故保留实体列）：before_data / after_data /
 *   changed_fields / reason / is_reversible / reversal_data / is_reversed / reversed_at /
 *   reversed_by / risk_level / requires_approval / approval_status / affected_users /
 *   affected_amount / rollback_deadline
 * - 批量任务列（batch 域专用，进度更新需原子写故保留实体列）：total_count / success_count /
 *   fail_count / operation_params / result_summary / completed_at
 * - detail JSON：低频展示型域专有字段（merchant 域：consumption_record_id / consumption_amount /
 *   error_message / extra_data；admin 域：target_type_raw）
 *
 * status 统一状态列（按域取值，应用层校验）：
 * - admin 域固定 'success'（审计的都是已发生的操作）
 * - merchant 域：success / failed / blocked（原 result 列语义）
 * - batch 域：processing / partial_success / completed / failed（任务生命周期）
 *
 * ⚠️ 与 ContentReviewRecord（内容审核记录）的区别：
 * - OperationLog = 操作日志 = 追溯"谁在什么时候做了什么" = admin/merchant 域只增不改
 * - ContentReviewRecord = 内容审核 = 业务流程状态流转（pending→approved/rejected）
 *
 * ENUM来源：
 * - admin 域操作类型：constants/AuditOperationTypes.js（统一枚举定义）
 * - merchant / batch 域操作类型：本文件导出的域常量
 */

'use strict'

const { DataTypes, Op } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')
const { getOperationTypeDescription } = require('../constants/AuditOperationTypes')

/**
 * 日志域枚举（operator_type 多态字段取值）
 * @type {Object}
 */
const OPERATOR_TYPES = {
  ADMIN: 'admin', // 管理员单笔操作审计
  MERCHANT: 'merchant', // 商家员工操作日志
  BATCH: 'batch' // 管理员批量任务日志
}

/**
 * 商家域操作类型枚举
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
 * 商家域操作类型中文描述
 * @type {Object}
 */
const MERCHANT_OPERATION_TYPE_DESCRIPTIONS = {
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
 * 商家域操作动作枚举
 * @type {Object}
 */
const MERCHANT_ACTIONS = {
  CREATE: 'create', // 创建
  READ: 'read', // 读取
  SCAN: 'scan', // 扫码
  UPDATE: 'update' // 更新
}

/**
 * 商家域操作结果枚举（statuses 的 merchant 域合法子集）
 * @type {Object}
 */
const MERCHANT_STATUSES = {
  SUCCESS: 'success', // 成功
  FAILED: 'failed', // 失败
  BLOCKED: 'blocked' // 被风控阻断
}

/**
 * 批量任务域操作类型枚举
 * @type {Object}
 */
const BATCH_OPERATION_TYPES = {
  QUOTA_GRANT_BATCH: 'quota_grant_batch', // B6: 批量赠送抽奖次数
  PRESET_BATCH: 'preset_batch', // B7: 批量设置干预规则
  REDEMPTION_VERIFY_BATCH: 'redemption_verify_batch', // B8: 批量核销确认
  CAMPAIGN_STATUS_BATCH: 'campaign_status_batch', // B9: 批量活动状态切换
  BUDGET_ADJUST_BATCH: 'budget_adjust_batch' // B10: 批量预算调整
}

/**
 * 批量任务域操作类型中文名
 * @type {Object}
 */
const BATCH_OPERATION_TYPE_NAMES = {
  quota_grant_batch: '批量赠送抽奖次数',
  preset_batch: '批量设置干预规则',
  redemption_verify_batch: '批量核销确认',
  campaign_status_batch: '批量活动状态切换',
  budget_adjust_batch: '批量预算调整'
}

/**
 * 批量任务域状态枚举（statuses 的 batch 域合法子集）
 * @type {Object}
 */
const BATCH_STATUSES = {
  PROCESSING: 'processing', // 处理中
  PARTIAL_SUCCESS: 'partial_success', // 部分成功
  COMPLETED: 'completed', // 全部成功
  FAILED: 'failed' // 全部失败
}

/**
 * 批量任务域状态中文名
 * @type {Object}
 */
const BATCH_STATUS_NAMES = {
  processing: '处理中',
  partial_success: '部分成功',
  completed: '全部成功',
  failed: '全部失败'
}

module.exports = sequelize => {
  const OperationLog = sequelize.define(
    'OperationLog',
    {
      // ==================== 主键 ====================
      operation_log_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '操作日志ID（主键，自增）',
        /**
         * BIGINT 在 JSON 序列化时默认输出字符串，与项目「字段级 getter 转数字」约定一致，
         * 此处统一转为数字输出（日志量级远低于 Number.MAX_SAFE_INTEGER，无精度风险）
         * @returns {number|null} 数字形式的主键
         */
        get() {
          const raw = this.getDataValue('operation_log_id')
          return raw == null ? raw : Number(raw)
        }
      },

      // ==================== 多态域标识 ====================
      operator_type: {
        type: DataTypes.ENUM('admin', 'merchant', 'batch'),
        allowNull: false,
        comment: '日志域：admin=管理员单笔操作审计 | merchant=商家员工操作 | batch=管理员批量任务'
      },

      // ==================== 公共脊柱列 ====================
      operator_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '操作员ID（管理员/商家员工 user_id）',
        references: {
          model: 'users',
          key: 'user_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT' // 不允许删除有操作日志的用户（审计追溯保护）
      },

      store_id: {
        type: DataTypes.INTEGER,
        allowNull: true, // merchant 域使用（员工禁用等跨门店操作可为空）；admin/batch 域为 NULL
        comment: '门店ID（merchant 域：操作发生的门店；admin/batch 域为 NULL）',
        references: {
          model: 'stores',
          key: 'store_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      operation_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment:
          '操作类型（admin 域见 constants/AuditOperationTypes.js；merchant/batch 域见本模型导出常量，值校验在应用层）',
        validate: {
          notEmpty: true,
          len: [1, 50]
        }
      },

      action: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment:
          '操作动作（admin: create/update/delete/approve/...；merchant: create/read/scan/update；batch 域为 NULL）'
      },

      target_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment:
          '目标对象类型（统一 snake_case 资源码，如 user/account_asset_balance；merchant 域目标用户固定 user）'
      },

      target_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '目标对象ID（与 target_type 配套；batch 域为 NULL）'
      },

      status: {
        type: DataTypes.ENUM(
          'success',
          'failed',
          'blocked',
          'processing',
          'partial_success',
          'completed'
        ),
        allowNull: false,
        defaultValue: 'success',
        comment:
          '统一状态：admin 域固定 success；merchant 域 success/failed/blocked；batch 域 processing/partial_success/completed/failed'
      },

      // ==================== 管理员审计列（admin 域） ====================
      before_data: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '操作前数据（JSON，admin 域完整记录变更前状态）'
      },
      after_data: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '操作后数据（JSON，admin 域完整记录变更后状态）'
      },
      changed_fields: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '变更字段列表（格式: [{field, old_value, new_value}]）'
      },
      reason: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '操作原因/备注'
      },

      is_reversible: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否可回滚（admin 域部分操作支持一键回滚）'
      },
      reversal_data: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '回滚所需数据（执行回滚操作的完整数据）'
      },
      is_reversed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否已回滚'
      },
      reversed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '回滚执行时间'
      },
      reversed_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '回滚操作者ID'
      },
      risk_level: {
        type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
        allowNull: false,
        defaultValue: 'low',
        comment: '操作风险等级（admin 域）'
      },
      requires_approval: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否需要二次审批（高风险操作）'
      },
      approval_status: {
        type: DataTypes.ENUM('not_required', 'pending', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'not_required',
        comment: '审批状态（admin 域）'
      },
      affected_users: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
        comment: '影响用户数（评估操作影响范围）'
      },
      affected_amount: {
        type: DataTypes.BIGINT,
        allowNull: true,
        defaultValue: 0,
        comment: '影响金额/积分数（分为单位，评估财务影响）'
      },
      rollback_deadline: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '回滚截止时间（超时后不可回滚，与 is_reversible 配合）'
      },

      // ==================== 批量任务列（batch 域） ====================
      total_count: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '批量任务总操作数量（batch 域）'
      },
      success_count: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
        comment: '批量任务成功数量（batch 域）'
      },
      fail_count: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
        comment: '批量任务失败数量（batch 域）'
      },
      operation_params: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '批量任务参数JSON（原始请求参数，便于重试和审计）'
      },
      result_summary: {
        type: DataTypes.JSON,
        allowNull: true,
        comment:
          '批量任务结果摘要JSON（{success_items: [{id, result}], failed_items: [{id, error}]}）'
      },
      completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '批量任务完成时间（无论成功/失败）'
      },

      // ==================== 安全与追踪信息 ====================
      ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true,
        comment: 'IP地址（支持IPv4和IPv6）'
      },
      user_agent: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '用户代理字符串（浏览器信息）'
      },
      request_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '请求ID（全链路追踪）'
      },
      idempotency_key: {
        type: DataTypes.STRING(128),
        allowNull: true, // merchant 域读操作日志可为空；admin/batch 域写入路径应用层强制必填
        comment: '幂等键（全局唯一，admin/batch 域必填，用于关联业务操作与防重复提交）'
      },

      // ==================== 域专有低频字段 ====================
      detail: {
        type: DataTypes.JSON,
        allowNull: true,
        comment:
          '域专有展示字段JSON（merchant: consumption_record_id/consumption_amount/error_message/extra_data；admin: target_type_raw）'
      },

      // ==================== 时间戳 ====================
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        comment: '操作时间'
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        comment: '更新时间（仅 batch 域任务进度更新会变化，admin/merchant 域等于创建时间）'
      }
    },
    {
      sequelize,
      modelName: 'OperationLog',
      tableName: 'operation_logs',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment: '统一操作日志表（admin/merchant/batch 三域合并，operator_type 多态）',

      indexes: [
        { name: 'uk_operation_logs_idempotency_key', unique: true, fields: ['idempotency_key'] },
        { name: 'idx_operation_logs_domain_created', fields: ['operator_type', 'created_at'] },
        { name: 'idx_operation_logs_operator_created', fields: ['operator_id', 'created_at'] },
        { name: 'idx_operation_logs_operation_type', fields: ['operation_type'] },
        { name: 'idx_operation_logs_target', fields: ['target_type', 'target_id'] },
        { name: 'idx_operation_logs_store_created', fields: ['store_id', 'created_at'] },
        { name: 'idx_operation_logs_domain_status', fields: ['operator_type', 'status'] },
        { name: 'idx_operation_logs_risk_level', fields: ['risk_level'] },
        { name: 'idx_operation_logs_reversible', fields: ['is_reversible', 'is_reversed'] },
        { name: 'idx_operation_logs_request_id', fields: ['request_id'] },
        { name: 'idx_operation_logs_ip', fields: ['ip_address'] }
      ],

      scopes: {
        /** 管理员单笔操作审计域 */
        admin: { where: { operator_type: 'admin' } },
        /** 商家员工操作域 */
        merchant: { where: { operator_type: 'merchant' } },
        /** 管理员批量任务域 */
        batch: { where: { operator_type: 'batch' } }
      }
    }
  )

  // ==================== 实例方法（按 operator_type 分发） ====================

  /**
   * 获取操作类型中文描述（按域分发到对应枚举表）
   * @returns {string} 操作类型中文描述
   */
  OperationLog.prototype.getOperationTypeDescription = function () {
    if (this.operator_type === OPERATOR_TYPES.MERCHANT) {
      return MERCHANT_OPERATION_TYPE_DESCRIPTIONS[this.operation_type] || this.operation_type
    }
    if (this.operator_type === OPERATOR_TYPES.BATCH) {
      return BATCH_OPERATION_TYPE_NAMES[this.operation_type] || this.operation_type
    }
    // admin 域走统一枚举定义（constants/AuditOperationTypes.js 单一真相源）
    return getOperationTypeDescription(this.operation_type)
  }

  /**
   * 获取操作动作中文描述
   * @returns {string} 操作动作中文描述
   */
  OperationLog.prototype.getActionDescription = function () {
    const actionMap = {
      create: '创建',
      read: '读取',
      scan: '扫码',
      update: '修改',
      delete: '删除',
      approve: '审核通过',
      reject: '审核拒绝',
      freeze: '冻结',
      unfreeze: '解冻',
      assign: '分配',
      remove: '移除'
    }
    return actionMap[this.action] || this.action
  }

  /**
   * 获取状态中文描述（按域分发）
   * @returns {string} 状态中文描述
   */
  OperationLog.prototype.getStatusDescription = function () {
    const statusMap = {
      success: '成功',
      failed: '失败',
      blocked: '被风控阻断',
      processing: '处理中',
      partial_success: '部分成功',
      completed: '全部成功'
    }
    // batch 域的 failed 语义为「全部失败」，其余域为「失败」
    if (this.operator_type === OPERATOR_TYPES.BATCH && this.status === 'failed') {
      return BATCH_STATUS_NAMES.failed
    }
    return statusMap[this.status] || this.status
  }

  /**
   * 格式化变更字段（admin 域展示用）
   * @returns {string} 格式化后的变更字段描述（field: old_value → new_value）
   */
  OperationLog.prototype.formatChangedFields = function () {
    if (!this.changed_fields || this.changed_fields.length === 0) {
      return '无变更'
    }
    return this.changed_fields
      .map(change => {
        return `${change.field}: ${JSON.stringify(change.old_value)} → ${JSON.stringify(change.new_value)}`
      })
      .join('; ')
  }

  /**
   * 获取完整的审计描述（admin 域展示用）
   * @returns {string} 完整描述（操作类型 - 操作动作: 目标对象 (变更内容)）
   */
  OperationLog.prototype.getFullDescription = function () {
    const operationType = this.getOperationTypeDescription()
    const action = this.getActionDescription()
    const changes = this.formatChangedFields()
    return `${operationType} - ${action}: ${this.target_type}#${this.target_id} (${changes})`
  }

  // ---------- batch 域实例方法（任务生命周期） ----------

  /**
   * 判断批量任务是否已完成（无论成功/失败）
   * @returns {boolean} 是否已完成
   */
  OperationLog.prototype.isFinished = function () {
    return ['partial_success', 'completed', 'failed'].includes(this.status)
  }

  /**
   * 判断批量任务是否处理中
   * @returns {boolean} 是否处理中
   */
  OperationLog.prototype.isProcessing = function () {
    return this.status === 'processing'
  }

  /**
   * 判断批量任务是否全部成功
   * @returns {boolean} 是否全部成功
   */
  OperationLog.prototype.isAllSuccess = function () {
    return this.status === 'completed'
  }

  /**
   * 计算批量任务成功率
   * @returns {number} 成功率百分比（0-100）
   */
  OperationLog.prototype.getSuccessRate = function () {
    if (!this.total_count) return 0
    return Math.round((this.success_count / this.total_count) * 100)
  }

  /**
   * 获取批量任务失败项列表
   * @returns {Array} 失败项数组
   */
  OperationLog.prototype.getFailedItems = function () {
    if (!this.result_summary || !this.result_summary.failed_items) {
      return []
    }
    return this.result_summary.failed_items
  }

  /**
   * 获取批量任务成功项列表
   * @returns {Array} 成功项数组
   */
  OperationLog.prototype.getSuccessItems = function () {
    if (!this.result_summary || !this.result_summary.success_items) {
      return []
    }
    return this.result_summary.success_items
  }

  /**
   * 更新批量任务进度（batch 域）
   * @param {number} success_count - 成功数量
   * @param {number} fail_count - 失败数量
   * @param {Object} [result_summary] - 结果摘要
   * @param {Object} [options] - Sequelize 选项（如 transaction）
   * @returns {Promise<OperationLog>} 更新后的实例
   */
  OperationLog.prototype.updateProgress = async function (
    success_count,
    fail_count,
    result_summary = null,
    options = {}
  ) {
    const updateData = { success_count, fail_count }
    if (result_summary) {
      updateData.result_summary = result_summary
    }
    // 根据进度自动计算最终状态
    const total_processed = success_count + fail_count
    if (total_processed >= this.total_count) {
      if (fail_count === 0) {
        updateData.status = 'completed'
      } else if (success_count === 0) {
        updateData.status = 'failed'
      } else {
        updateData.status = 'partial_success'
      }
      updateData.completed_at = BeijingTimeHelper.createBeijingTime()
    }
    return await this.update(updateData, options)
  }

  /**
   * 标记批量任务失败（batch 域）
   * @param {string} error_message - 错误信息
   * @param {Object} [options] - Sequelize 选项（如 transaction）
   * @returns {Promise<OperationLog>} 更新后的实例
   */
  OperationLog.prototype.markAsFailed = async function (error_message, options = {}) {
    return await this.update(
      {
        status: 'failed',
        fail_count: this.total_count,
        result_summary: {
          error: error_message,
          failed_items: [],
          success_items: []
        },
        completed_at: BeijingTimeHelper.createBeijingTime()
      },
      options
    )
  }

  // ==================== 类方法 ====================

  /**
   * 比较两个对象并生成 changed_fields（admin 域审计用）
   *
   * 空值安全：支持 beforeObj/afterObj 为 null/undefined 的场景
   *
   * @param {Object|null} beforeObj - 变更前的对象数据（可为null）
   * @param {Object|null} afterObj - 变更后的对象数据（可为null）
   * @param {Array<string>|null} fieldList - 需要比较的字段列表，null则比较所有字段
   * @returns {Array<Object>} 变更字段数组 [{field, old_value, new_value}, ...]
   */
  OperationLog.compareObjects = function (beforeObj, afterObj, fieldList = null) {
    const changedFields = []
    if (!beforeObj && !afterObj) {
      return changedFields
    }
    // 确定要比较的字段列表（优先级：显式指定 > afterObj的字段 > beforeObj的字段）
    let fieldsToCompare
    if (fieldList) {
      fieldsToCompare = fieldList
    } else if (afterObj && typeof afterObj === 'object') {
      fieldsToCompare = Object.keys(afterObj)
    } else if (beforeObj && typeof beforeObj === 'object') {
      fieldsToCompare = Object.keys(beforeObj)
    } else {
      return changedFields
    }

    fieldsToCompare.forEach(field => {
      const oldValue = beforeObj ? beforeObj[field] : null
      const newValue = afterObj ? afterObj[field] : null
      // 深度比较（处理JSON字段）
      const oldStr = JSON.stringify(oldValue)
      const newStr = JSON.stringify(newValue)
      if (oldStr !== newStr) {
        changedFields.push({ field, old_value: oldValue, new_value: newValue })
      }
    })

    return changedFields
  }

  /**
   * 生成幂等键（batch 域）
   * @param {string} operation_type - 操作类型
   * @param {number} operator_id - 操作人ID
   * @param {string} [content_hash] - 内容哈希（可选，区分不同内容的同类操作）
   * @returns {string} 幂等键（格式：{operation_type}:{operator_id}:{timestamp}:{hash}）
   */
  OperationLog.generateIdempotencyKey = function (operation_type, operator_id, content_hash = '') {
    const timestamp = Date.now()
    const hash = content_hash || require('crypto').randomBytes(4).toString('hex')
    return `${operation_type}:${operator_id}:${timestamp}:${hash}`
  }

  /**
   * 检查幂等键是否存在（batch 域防重复提交）
   * @param {string} idempotency_key - 幂等键
   * @param {Object} [options] - Sequelize 选项
   * @returns {Promise<OperationLog|null>} 存在则返回记录，否则返回 null
   */
  OperationLog.checkIdempotencyKey = async function (idempotency_key, options = {}) {
    return await OperationLog.findOne({
      where: { operator_type: OPERATOR_TYPES.BATCH, idempotency_key },
      ...options
    })
  }

  /**
   * 查询操作人的近期批量操作（batch 域限流检查）
   * @param {number} operator_id - 操作人ID
   * @param {string} operation_type - 操作类型
   * @param {number} [seconds=60] - 时间范围（秒）
   * @returns {Promise<Array>} 操作记录列表
   */
  OperationLog.getRecentOperations = async function (operator_id, operation_type, seconds = 60) {
    const cutoffTime = new Date(Date.now() - seconds * 1000)
    return await OperationLog.findAll({
      where: {
        operator_type: OPERATOR_TYPES.BATCH,
        operator_id,
        operation_type,
        created_at: { [Op.gte]: cutoffTime }
      },
      order: [['created_at', 'DESC']]
    })
  }

  /**
   * 查询处理中的批量操作（batch 域并发检查）
   * @param {number} operator_id - 操作人ID
   * @returns {Promise<Array>} 处理中的操作列表
   */
  OperationLog.getProcessingOperations = async function (operator_id) {
    return await OperationLog.findAll({
      where: {
        operator_type: OPERATOR_TYPES.BATCH,
        operator_id,
        status: 'processing'
      }
    })
  }

  /**
   * 创建批量任务日志（batch 域）
   * @param {Object} data - 操作数据
   * @param {string} data.operation_type - 操作类型
   * @param {number} data.operator_id - 操作人ID
   * @param {number} data.total_count - 总操作数量
   * @param {Object} data.operation_params - 操作参数
   * @param {string} [data.idempotency_key] - 幂等键（不传则自动生成）
   * @param {Object} [options] - Sequelize 选项（如 transaction）
   * @returns {Promise<OperationLog>} 创建的记录
   */
  OperationLog.createBatchOperation = async function (data, options = {}) {
    const { operation_type, operator_id, total_count, operation_params, idempotency_key } = data
    const key = idempotency_key || OperationLog.generateIdempotencyKey(operation_type, operator_id)
    return await OperationLog.create(
      {
        operator_type: OPERATOR_TYPES.BATCH,
        idempotency_key: key,
        operation_type,
        status: 'processing',
        total_count,
        success_count: 0,
        fail_count: 0,
        operation_params,
        operator_id
      },
      options
    )
  }

  /**
   * 创建商家操作日志（merchant 域）
   * @param {Object} data - 日志数据
   * @param {number} data.operator_id - 操作员ID（商家员工 user_id）
   * @param {number} [data.store_id] - 门店ID（跨门店操作可为空）
   * @param {string} data.operation_type - 操作类型（见 MERCHANT_OPERATION_TYPES）
   * @param {string} [data.action='create'] - 操作动作（create/read/scan/update）
   * @param {number} [data.target_user_id] - 目标用户ID（被扫码/被录入消费的用户）
   * @param {number} [data.consumption_record_id] - 关联的消费记录ID（入 detail JSON）
   * @param {number} [data.consumption_amount] - 消费金额（入 detail JSON）
   * @param {string} [data.status='success'] - 操作结果（success/failed/blocked）
   * @param {string} [data.error_message] - 错误信息（入 detail JSON）
   * @param {string} [data.ip_address] - IP地址
   * @param {string} [data.user_agent] - User-Agent
   * @param {string} [data.request_id] - 请求ID（全链路追踪）
   * @param {string} [data.idempotency_key] - 幂等键
   * @param {Object} [data.extra_data] - 扩展数据（入 detail JSON）
   * @param {Object} [options] - Sequelize 选项（如 transaction）
   * @returns {Promise<OperationLog>} 创建的日志实例
   */
  OperationLog.createMerchantLog = async function (data, options = {}) {
    // 域专有低频字段收敛进 detail JSON（有值才写，避免空对象噪音）
    const detail = {}
    if (data.consumption_record_id != null) {
      detail.consumption_record_id = data.consumption_record_id
    }
    if (data.consumption_amount != null) detail.consumption_amount = data.consumption_amount
    if (data.error_message != null) detail.error_message = data.error_message
    if (data.extra_data != null) detail.extra_data = data.extra_data

    return await OperationLog.create(
      {
        operator_type: OPERATOR_TYPES.MERCHANT,
        operator_id: data.operator_id,
        store_id: data.store_id || null,
        operation_type: data.operation_type,
        action: data.action || 'create',
        target_type: data.target_user_id != null ? 'user' : null,
        target_id: data.target_user_id != null ? data.target_user_id : null,
        status: data.status || 'success',
        ip_address: data.ip_address || null,
        user_agent: data.user_agent || null,
        request_id: data.request_id || null,
        idempotency_key: data.idempotency_key || null,
        detail: Object.keys(detail).length > 0 ? detail : null
      },
      options
    )
  }

  // ==================== 域常量挂载为模型静态属性（路由层经 req.app.locals.models 取用，不直接 require 模型文件） ====================
  OperationLog.OPERATOR_TYPES = OPERATOR_TYPES
  OperationLog.MERCHANT_OPERATION_TYPES = MERCHANT_OPERATION_TYPES
  OperationLog.MERCHANT_OPERATION_TYPE_DESCRIPTIONS = MERCHANT_OPERATION_TYPE_DESCRIPTIONS
  OperationLog.MERCHANT_ACTIONS = MERCHANT_ACTIONS
  OperationLog.MERCHANT_STATUSES = MERCHANT_STATUSES
  OperationLog.BATCH_OPERATION_TYPES = BATCH_OPERATION_TYPES
  OperationLog.BATCH_OPERATION_TYPE_NAMES = BATCH_OPERATION_TYPE_NAMES
  OperationLog.BATCH_STATUSES = BATCH_STATUSES
  OperationLog.BATCH_STATUS_NAMES = BATCH_STATUS_NAMES

  /**
   * 关联关系定义
   * @param {Object} models - Sequelize所有模型的集合对象
   * @returns {void}
   */
  OperationLog.associate = function (models) {
    // 关联操作员（用户）
    OperationLog.belongsTo(models.User, {
      foreignKey: 'operator_id',
      as: 'operator',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })
    // 关联门店（merchant 域）
    OperationLog.belongsTo(models.Store, {
      foreignKey: 'store_id',
      as: 'store',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })
    /*
     * 注：target_type/target_id 为多态目标，不定义静态关联；
     * 需要目标对象详情时由服务层按 target_type 批量查询（避免多态关联的脆弱魔法）
     */
  }

  return OperationLog
}

// 导出域常量（服务层与路由层通过模型统一取用，禁止散落魔法字符串）
module.exports.OPERATOR_TYPES = OPERATOR_TYPES
module.exports.MERCHANT_OPERATION_TYPES = MERCHANT_OPERATION_TYPES
module.exports.MERCHANT_OPERATION_TYPE_DESCRIPTIONS = MERCHANT_OPERATION_TYPE_DESCRIPTIONS
module.exports.MERCHANT_ACTIONS = MERCHANT_ACTIONS
module.exports.MERCHANT_STATUSES = MERCHANT_STATUSES
module.exports.BATCH_OPERATION_TYPES = BATCH_OPERATION_TYPES
module.exports.BATCH_OPERATION_TYPE_NAMES = BATCH_OPERATION_TYPE_NAMES
module.exports.BATCH_STATUSES = BATCH_STATUSES
module.exports.BATCH_STATUS_NAMES = BATCH_STATUS_NAMES
