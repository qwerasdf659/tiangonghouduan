/**
 * API入口幂等请求模型 - ApiIdempotencyRequest
 * 用于记录每次API请求的处理状态和结果快照，实现"重试返回首次结果"
 *
 * 业务场景：
 * - 抽奖请求重试（返回首次抽奖结果，而非重新抽奖）
 * - 支付请求重试（防止重复扣费）
 * - 任何需要幂等性保证的POST/PUT/DELETE请求
 *
 * 设计理念（业界标准 - 入口幂等）：
 * - idempotency_key：客户端生成或服务端生成的唯一键
 * - request_hash：请求参数哈希，用于检测相同幂等键但参数不同的冲突
 * - response_snapshot：成功时保存响应结果，重试时直接返回
 *
 * 状态流转：
 * - processing：请求处理中，重复请求返回 409
 * - completed：处理完成，重复请求返回 response_snapshot
 * - failed：处理失败，允许重试（状态改回 processing）
 *
 * 命名规范（snake_case）：
 * - 表名：api_idempotency_requests
 * - 主键：request_id
 *
 * 创建时间：2025-12-26
 * 版本：1.0.0 - 业界标准幂等架构（方案B）
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * API入口幂等请求模型类
 * 职责：管理API请求的幂等性，实现"重试返回首次结果"
 * 设计模式：状态机模式
 */
class ApiIdempotencyRequest extends Model {
  /**
   * 静态关联定义
   *
   * @param {Object} models - Sequelize所有模型的集合对象
   * @returns {void} 无返回值，仅定义关联关系
   */
  static associate (models) {
    // 多对一：请求归属于用户
    ApiIdempotencyRequest.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
      comment: '关联用户信息（发起请求的用户）'
    })
  }

  /**
   * 处理状态常量定义
   */
  static STATUS = {
    PROCESSING: 'processing', // 处理中
    COMPLETED: 'completed', // 已完成
    FAILED: 'failed' // 失败
  }

  /**
   * 检查是否为已完成状态
   *
   * @returns {boolean} 是否已完成
   */
  isCompleted () {
    return this.status === ApiIdempotencyRequest.STATUS.COMPLETED
  }

  /**
   * 检查是否为处理中状态
   *
   * @returns {boolean} 是否处理中
   */
  isProcessing () {
    return this.status === ApiIdempotencyRequest.STATUS.PROCESSING
  }

  /**
   * 检查是否为失败状态
   *
   * @returns {boolean} 是否失败
   */
  isFailed () {
    return this.status === ApiIdempotencyRequest.STATUS.FAILED
  }
}

/**
 * 模型初始化
 *
 * @param {Sequelize} sequelize - Sequelize实例
 * @returns {ApiIdempotencyRequest} 初始化后的模型
 */
module.exports = sequelize => {
  ApiIdempotencyRequest.init(
    {
      // 主键ID（Request ID - 请求记录唯一标识）
      request_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '请求记录ID（主键）'
      },

      // 幂等键（Idempotency Key - 全局唯一）
      idempotency_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: '幂等键（客户端生成或服务端生成，全局唯一）'
      },

      // API路径（API Path）
      api_path: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: 'API路径（如 /api/v4/lottery/draw）'
      },

      // HTTP方法（HTTP Method）
      http_method: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'POST',
        comment: 'HTTP方法（POST/PUT/DELETE）'
      },

      // 请求参数哈希（Request Hash - 用于检测参数冲突）
      request_hash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: '请求参数哈希（用于检测参数冲突）'
      },

      // 请求参数快照（Request Params - 用于审计和冲突检测）
      request_params: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '请求参数快照（用于审计和冲突检测）'
      },

      // 用户ID（User ID）
      user_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '用户ID（关联 users.user_id）'
      },

      // 处理状态（Status - 状态机）
      status: {
        type: DataTypes.ENUM('processing', 'completed', 'failed'),
        allowNull: false,
        defaultValue: 'processing',
        comment: '处理状态：processing-处理中，completed-已完成，failed-失败'
      },

      // 业务事件ID（Business Event ID - 如 lottery_session_id）
      business_event_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '业务事件ID（如 lottery_session_id，用于关联业务记录）'
      },

      // 响应结果快照（Response Snapshot - 重试时直接返回）
      response_snapshot: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '响应结果快照（重试时直接返回）'
      },

      // 响应业务代码（Response Code）
      response_code: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '响应业务代码（如 DRAW_SUCCESS）'
      },

      // 请求完成时间（Completed At）
      completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '请求完成时间'
      },

      // 过期时间（Expires At - 24小时后可清理）
      expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '过期时间（24小时后可清理）'
      }
    },
    {
      sequelize,
      modelName: 'ApiIdempotencyRequest',
      tableName: 'api_idempotency_requests',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false, // 不需要 updated_at 字段
      underscored: true,
      comment: 'API入口幂等表 - 记录每次请求的处理状态和结果快照，实现重试返回首次结果',
      indexes: [
        // 用户ID + 创建时间索引（用于用户请求历史查询）
        {
          fields: ['user_id', 'created_at'],
          name: 'idx_user_created',
          comment: '索引：用户ID + 创建时间（用于用户请求历史查询）'
        },
        // 状态 + 过期时间索引（用于清理过期记录）
        {
          fields: ['status', 'expires_at'],
          name: 'idx_status_expires',
          comment: '索引：状态 + 过期时间（用于清理过期记录）'
        },
        // 业务事件ID索引（用于关联业务记录查询）
        {
          fields: ['business_event_id'],
          name: 'idx_business_event',
          comment: '索引：业务事件ID（用于关联业务记录查询）'
        }
      ]
    }
  )

  return ApiIdempotencyRequest
}
