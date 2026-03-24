/**
 * 📋 批量操作日志模型 - 幂等性控制与操作审计核心组件
 *
 * 业务职责：
 * - 记录所有批量操作的执行状态和结果
 * - 提供幂等性保障（通过唯一幂等键）
 * - 支持操作重试和状态追踪
 * - 审计链路：通过 batch_operation_log_id 关联到业务表
 *
 * 技术决策（阶段C核心基础设施）：
 * - 采用美团幂等性方案：独立幂等表 + Redis/MySQL 双重校验
 * - 支持"部分成功"模式：单条操作独立事务，逐条处理
 */

'use strict'

const { Model, DataTypes, Op } = require('sequelize')

/**
 * 批量操作日志模型
 * 业务场景：批量赠送、批量核销、批量状态切换、批量预算调整等
 */
class BatchOperationLog extends Model {
  /**
   * 模型关联定义
   * @param {Object} models - 所有模型的引用
   * @returns {void}
   */
  static associate(models) {
    // 多对一：操作人（管理员）
    BatchOperationLog.belongsTo(models.User, {
      foreignKey: 'operator_id',
      targetKey: 'user_id',
      as: 'operator',
      onDelete: 'RESTRICT',
      comment: '执行批量操作的管理员'
    })
  }

  // ==================== 操作类型常量 ====================
  /**
   * 批量操作类型枚举
   * @readonly
   */
  static get OPERATION_TYPES() {
    return {
      QUOTA_GRANT_BATCH: 'quota_grant_batch', // B6: 批量赠送抽奖次数
      PRESET_BATCH: 'preset_batch', // B7: 批量设置干预规则
      REDEMPTION_VERIFY_BATCH: 'redemption_verify_batch', // B8: 批量核销确认
      CAMPAIGN_STATUS_BATCH: 'campaign_status_batch', // B9: 批量活动状态切换
      BUDGET_ADJUST_BATCH: 'budget_adjust_batch' // B10: 批量预算调整
    }
  }

  /**
   * 操作类型显示名称映射
   * @readonly
   */
  static get OPERATION_TYPE_NAMES() {
    return {
      quota_grant_batch: '批量赠送抽奖次数',
      preset_batch: '批量设置干预规则',
      redemption_verify_batch: '批量核销确认',
      campaign_status_batch: '批量活动状态切换',
      budget_adjust_batch: '批量预算调整'
    }
  }

  // ==================== 状态常量 ====================
  /**
   * 批量操作状态枚举
   * @readonly
   */
  static get STATUS() {
    return {
      PROCESSING: 'processing', // 处理中
      PARTIAL_SUCCESS: 'partial_success', // 部分成功
      COMPLETED: 'completed', // 全部成功
      FAILED: 'failed' // 全部失败
    }
  }

  /**
   * 状态显示名称映射
   * @readonly
   */
  static get STATUS_NAMES() {
    return {
      processing: '处理中',
      partial_success: '部分成功',
      completed: '全部成功',
      failed: '全部失败'
    }
  }

  // ==================== 实例方法 ====================

  /**
   * 获取操作类型显示名称
   * @returns {string} 操作类型中文名称
   */
  getOperationTypeName() {
    return BatchOperationLog.OPERATION_TYPE_NAMES[this.operation_type] || '未知操作'
  }

  /**
   * 获取状态显示名称
   * @returns {string} 状态中文名称
   */
  getStatusDisplayName() {
    return BatchOperationLog.STATUS_NAMES[this.status] || '未知状态'
  }

  /**
   * 判断操作是否已完成（无论成功/失败）
   * @returns {boolean} 是否已完成
   */
  isFinished() {
    return ['partial_success', 'completed', 'failed'].includes(this.status)
  }

  /**
   * 判断操作是否处理中
   * @returns {boolean} 是否处理中
   */
  isProcessing() {
    return this.status === 'processing'
  }

  /**
   * 判断操作是否全部成功
   * @returns {boolean} 是否全部成功
   */
  isAllSuccess() {
    return this.status === 'completed'
  }

  /**
   * 计算成功率
   * @returns {number} 成功率百分比（0-100）
   */
  getSuccessRate() {
    if (this.total_count === 0) return 0
    return Math.round((this.success_count / this.total_count) * 100)
  }

  /**
   * 获取失败项列表
   * @returns {Array} 失败项数组
   */
  getFailedItems() {
    if (!this.result_summary || !this.result_summary.failed_items) {
      return []
    }
    return this.result_summary.failed_items
  }

  /**
   * 获取成功项列表
   * @returns {Array} 成功项数组
   */
  getSuccessItems() {
    if (!this.result_summary || !this.result_summary.success_items) {
      return []
    }
    return this.result_summary.success_items
  }

  /**
   * 更新操作进度
   * @param {number} success_count - 成功数量
   * @param {number} fail_count - 失败数量
   * @param {Object} result_summary - 结果摘要
   * @param {Object} options - Sequelize 选项（如 transaction）
   * @returns {Promise<BatchOperationLog>} 更新后的实例
   */
  async updateProgress(success_count, fail_count, result_summary = null, options = {}) {
    const BeijingTimeHelper = require('../utils/timeHelper')
    const updateData = {
      success_count,
      fail_count
    }

    if (result_summary) {
      updateData.result_summary = result_summary
    }

    // 根据进度自动计算最终状态
    const total_processed = success_count + fail_count
    if (total_processed >= this.total_count) {
      // 所有项目已处理完成
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
   * 标记操作失败
   * @param {string} error_message - 错误信息
   * @param {Object} options - Sequelize 选项（如 transaction）
   * @returns {Promise<BatchOperationLog>} 更新后的实例
   */
  async markAsFailed(error_message, options = {}) {
    const BeijingTimeHelper = require('../utils/timeHelper')
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

  // ==================== 静态方法 ====================

  /**
   * 生成幂等键
   * @param {string} operation_type - 操作类型
   * @param {number} operator_id - 操作人ID
   * @param {string} content_hash - 内容哈希（可选，用于区分不同内容的同类操作）
   * @returns {string} 幂等键
   */
  static generateIdempotencyKey(operation_type, operator_id, content_hash = '') {
    const timestamp = Date.now()
    const hash = content_hash || require('crypto').randomBytes(4).toString('hex')
    return `${operation_type}:${operator_id}:${timestamp}:${hash}`
  }

  /**
   * 检查幂等键是否存在（防重复提交）
   * @param {string} idempotency_key - 幂等键
   * @param {Object} options - Sequelize 选项
   * @returns {Promise<BatchOperationLog|null>} 存在则返回记录，否则返回 null
   */
  static async checkIdempotencyKey(idempotency_key, options = {}) {
    return await BatchOperationLog.findOne({
      where: { idempotency_key },
      ...options
    })
  }

  /**
   * 查询操作人的近期操作（用于限流检查）
   * @param {number} operator_id - 操作人ID
   * @param {string} operation_type - 操作类型
   * @param {number} seconds - 时间范围（秒）
   * @returns {Promise<Array>} 操作记录列表
   */
  static async getRecentOperations(operator_id, operation_type, seconds = 60) {
    const cutoffTime = new Date(Date.now() - seconds * 1000)

    return await BatchOperationLog.findAll({
      where: {
        operator_id,
        operation_type,
        created_at: { [Op.gte]: cutoffTime }
      },
      order: [['created_at', 'DESC']]
    })
  }

  /**
   * 查询处理中的操作（用于并发检查）
   * @param {number} operator_id - 操作人ID
   * @returns {Promise<Array>} 处理中的操作列表
   */
  static async getProcessingOperations(operator_id) {
    return await BatchOperationLog.findAll({
      where: {
        operator_id,
        status: 'processing'
      }
    })
  }

  /**
   * 创建批量操作日志
   * @param {Object} data - 操作数据
   * @param {string} data.operation_type - 操作类型
   * @param {number} data.operator_id - 操作人ID
   * @param {number} data.total_count - 总操作数量
   * @param {Object} data.operation_params - 操作参数
   * @param {string} data.idempotency_key - 幂等键（可选，不传则自动生成）
   * @param {Object} options - Sequelize 选项（如 transaction）
   * @returns {Promise<BatchOperationLog>} 创建的记录
   */
  static async createOperation(data, options = {}) {
    const { operation_type, operator_id, total_count, operation_params, idempotency_key } = data

    const key =
      idempotency_key || BatchOperationLog.generateIdempotencyKey(operation_type, operator_id)

    return await BatchOperationLog.create(
      {
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
}

/**
 * 模型初始化配置
 * @param {Sequelize} sequelize - Sequelize 实例
 * @returns {BatchOperationLog} 初始化后的模型
 */
BatchOperationLog.initModel = sequelize => {
  BatchOperationLog.init(
    {
      // ==================== 主键 ====================
      batch_operation_log_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '批量操作日志ID（主键，自增）'
      },

      // ==================== 幂等性控制 ====================
      idempotency_key: {
        type: DataTypes.STRING(128),
        allowNull: false,
        unique: true,
        comment: '幂等键（格式：{operation_type}:{operator_id}:{timestamp}:{hash}）- 防止重复提交'
      },

      // ==================== 操作类型 ====================
      operation_type: {
        type: DataTypes.ENUM(
          'quota_grant_batch',
          'preset_batch',
          'redemption_verify_batch',
          'campaign_status_batch',
          'budget_adjust_batch'
        ),
        allowNull: false,
        comment:
          '操作类型：quota_grant_batch=批量赠送抽奖次数 | preset_batch=批量设置干预规则 | redemption_verify_batch=批量核销确认 | campaign_status_batch=批量活动状态切换 | budget_adjust_batch=批量预算调整'
      },

      // ==================== 操作状态 ====================
      status: {
        type: DataTypes.ENUM('processing', 'partial_success', 'completed', 'failed'),
        allowNull: false,
        defaultValue: 'processing',
        comment:
          '操作状态：processing=处理中 | partial_success=部分成功 | completed=全部成功 | failed=全部失败'
      },

      // ==================== 统计计数 ====================
      total_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '总操作数量'
      },

      success_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '成功数量'
      },

      fail_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '失败数量'
      },

      // ==================== 操作参数与结果 ====================
      operation_params: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '操作参数JSON（存储原始请求参数，便于重试和审计）'
      },

      result_summary: {
        type: DataTypes.JSON,
        allowNull: true,
        comment:
          '结果摘要JSON（格式：{success_items: [{id, result}], failed_items: [{id, error}]}）'
      },

      // ==================== 操作人 ====================
      operator_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '操作人ID（外键，关联 users.user_id）',
        references: {
          model: 'users',
          key: 'user_id'
        },
        onDelete: 'RESTRICT'
      },

      // ==================== 时间戳 ====================
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '创建时间（北京时间）'
      },

      completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '完成时间（北京时间）- 操作完成（无论成功/失败）时记录'
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
      modelName: 'BatchOperationLog',
      tableName: 'batch_operation_logs',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '批量操作日志表 - 幂等性控制与操作审计（阶段C核心基础设施）',

      // 索引定义
      indexes: [
        {
          name: 'idx_batch_ops_idempotency_key',
          unique: true,
          fields: ['idempotency_key'],
          comment: '幂等键唯一索引 - 确保同一操作不重复执行'
        },
        {
          name: 'idx_batch_ops_operator_created',
          fields: ['operator_id', 'created_at'],
          comment: '操作人+时间索引 - 查询用户操作历史'
        },
        {
          name: 'idx_batch_ops_status',
          fields: ['status'],
          comment: '状态索引 - 支持按状态筛选（如查询失败任务用于重试）'
        },
        {
          name: 'idx_batch_ops_type_status',
          fields: ['operation_type', 'status'],
          comment: '操作类型+状态索引 - 支持按类型和状态统计'
        },
        {
          name: 'idx_batch_ops_created_at',
          fields: ['created_at'],
          comment: '创建时间索引 - 支持时间范围查询和历史数据清理'
        }
      ],

      // 查询范围定义（Sequelize Scope）
      scopes: {
        // 处理中的操作
        processing: {
          where: { status: 'processing' }
        },
        // 已完成的操作
        completed: {
          where: { status: 'completed' }
        },
        // 部分成功的操作
        partialSuccess: {
          where: { status: 'partial_success' }
        },
        // 失败的操作
        failed: {
          where: { status: 'failed' }
        },
        /**
         * 指定操作人的操作范围
         * @param {number} operator_id - 操作人ID
         * @returns {Object} Sequelize 查询条件
         */
        byOperator(operator_id) {
          return {
            where: { operator_id }
          }
        },
        /**
         * 指定操作类型的范围
         * @param {string} operation_type - 操作类型
         * @returns {Object} Sequelize 查询条件
         */
        byType(operation_type) {
          return {
            where: { operation_type }
          }
        }
      }
    }
  )

  return BatchOperationLog
}

module.exports = BatchOperationLog
