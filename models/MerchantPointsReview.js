/**
 * 商家积分审核模型（MerchantPointsReview Model）
 *
 * 业务场景：商家扫码审核积分奖励发放
 *
 * 状态流转（2026-01-08 重构 - 奖励发放模式）：
 * - pending → approved：审核通过（直接发放积分奖励 + 预算积分）
 * - pending → rejected：审核拒绝（无积分操作，用户可重新提交）
 * - [已废弃] expired/cancelled：旧语义遗留状态，仅用于兼容历史数据
 *
 * 奖励发放约束：
 * - 每笔发放必须绑定 review_id
 * - idempotency_key 格式：{review_id}:reward / {review_id}:budget
 * - 流水表 business_type：merchant_review_reward / merchant_review_budget
 *
 * 拍板决策（2026-01-08 商业模式重构）：
 * - submitReview 只创建审核记录，不冻结积分
 * - approveReview 直接发放积分奖励（POINTS）+ 预算积分（BUDGET_POINTS）
 * - rejectReview 只更新状态，无积分操作
 * - 简化状态机：pending → approved / rejected
 * - 不再使用超时机制，expires_at 设为 NULL
 *
 * 表名（snake_case）：merchant_points_reviews
 * 主键命名：review_id（UUID格式）
 * 创建时间：2025-12-29
 * 最后更新：2026-01-08（资产语义重构：冻结→奖励发放）
 */

'use strict'

const { Model, DataTypes } = require('sequelize')
const { v4: uuidv4 } = require('uuid')

/**
 * MerchantPointsReview 类定义（商家积分审核模型）
 */
class MerchantPointsReview extends Model {
  /**
   * 模型关联定义
   *
   * @param {Object} models - 所有模型的映射对象
   * @returns {void} 无返回值
   */
  static associate(models) {
    // 审核单属于用户（申请审核的用户）
    MerchantPointsReview.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    })

    // 审核单属于商家（扫码审核的商家）
    MerchantPointsReview.belongsTo(models.User, {
      foreignKey: 'merchant_id',
      as: 'merchant',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    })
  }

  /**
   * @deprecated 2026-01-08 - 新语义不再使用超时机制
   * 检查审核是否已超时（仅用于历史数据兼容）
   *
   * @returns {boolean} 是否超时 - true表示超时，false表示未超时
   */
  isExpired() {
    if (!this.expires_at) return false
    return new Date() > new Date(this.expires_at)
  }

  /**
   * 检查审核是否可以被批准（2026-01-08 简化：仅检查 pending 状态）
   *
   * @returns {boolean} 是否可批准 - true表示可批准，false表示不可批准
   */
  canApprove() {
    return this.status === 'pending'
  }

  /**
   * 检查审核是否可以被拒绝（2026-01-08 简化：仅检查 pending 状态）
   *
   * @returns {boolean} 是否可拒绝 - true表示可拒绝，false表示不可拒绝
   */
  canReject() {
    return this.status === 'pending'
  }

  /**
   * @deprecated 2026-01-08 - 新语义不再使用客服处理流程
   * 检查审核是否需要客服处理（仅检查 rejected 状态，expired 已废弃）
   *
   * @returns {boolean} 是否需要客服处理
   */
  needsAdminHandle() {
    return this.status === 'rejected'
  }

  /**
   * 生成审核单ID
   *
   * @returns {string} UUID格式的审核单ID
   */
  static generateReviewId() {
    return `review_${uuidv4()}`
  }

  /**
   * 生成幂等键（2026-01-08 修复：移除 Date.now()，确保同一业务请求幂等键稳定）
   *
   * 幂等键设计原则：
   * - 相同的业务请求必须生成相同的幂等键
   * - 不同的业务请求必须生成不同的幂等键
   *
   * 业务场景：
   * - 同一商家对同一用户在同一天内提交相同金额的审核，视为同一请求
   * - 跨天提交视为不同请求（允许重新提交）
   *
   * @param {number} user_id - 用户ID
   * @param {number} merchant_id - 商家ID
   * @param {number} points_amount - 积分金额
   * @param {string} qr_code_data - 二维码数据（可选，如提供则作为唯一标识）
   * @returns {string} 幂等键
   */
  static generateIdempotencyKey(user_id, merchant_id, points_amount, qr_code_data = null) {
    // 如果提供了二维码数据，使用其哈希值作为唯一标识（每个二维码代表唯一交易）
    if (qr_code_data) {
      const crypto = require('crypto')
      const qrHash = crypto.createHash('md5').update(qr_code_data).digest('hex').substring(0, 16)
      return `merchant_review_${user_id}_${merchant_id}_${qrHash}`
    }

    // 无二维码数据时，使用日期窗口（同一天 + 同一用户 + 同一商家 + 同一金额 = 同一请求）
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
    return `merchant_review_${user_id}_${merchant_id}_${points_amount}_${today}`
  }

  /**
   * @deprecated 2026-01-08 - 新语义不再使用冻结机制
   * 生成冻结操作的幂等键（仅用于历史数据兼容）
   *
   * @param {string} review_id - 审核单ID
   * @returns {string} 冻结幂等键
   */
  static generateFreezeIdempotencyKey(review_id) {
    return `${review_id}:freeze`
  }

  /**
   * @deprecated 2026-01-08 - 新语义不再使用结算机制
   * 生成结算操作的幂等键（仅用于历史数据兼容）
   *
   * @param {string} review_id - 审核单ID
   * @returns {string} 结算幂等键
   */
  static generateSettleIdempotencyKey(review_id) {
    return `${review_id}:settle`
  }

  /**
   * @deprecated 2026-01-08 - 新语义不再使用解冻机制
   * 生成解冻操作的幂等键（仅用于历史数据兼容）
   *
   * @param {string} review_id - 审核单ID
   * @returns {string} 解冻幂等键
   */
  static generateUnfreezeIdempotencyKey(review_id) {
    return `${review_id}:unfreeze`
  }

  /**
   * 生成奖励发放操作的幂等键（2026-01-08 新增）
   *
   * @param {string} review_id - 审核单ID
   * @returns {string} 奖励幂等键
   */
  static generateRewardIdempotencyKey(review_id) {
    return `${review_id}:reward`
  }

  /**
   * 生成预算积分发放操作的幂等键（2026-01-08 新增）
   *
   * @param {string} review_id - 审核单ID
   * @returns {string} 预算幂等键
   */
  static generateBudgetIdempotencyKey(review_id) {
    return `${review_id}:budget`
  }

  /**
   * @deprecated 2026-01-08 - 新语义不再使用超时机制，expires_at 设为 NULL
   * 计算默认超时时间（仅用于历史数据兼容）
   *
   * @returns {Date} 超时时间（当前时间 + 24小时）
   */
  static calculateExpiresAt() {
    const now = new Date()
    return new Date(now.getTime() + 24 * 60 * 60 * 1000)
  }
}

/**
 * 模型初始化函数
 *
 * @param {Sequelize} sequelize - Sequelize实例
 * @param {DataTypes} _DataTypes - Sequelize数据类型（未使用）
 * @returns {Model} MerchantPointsReview模型
 */
module.exports = (sequelize, _DataTypes) => {
  MerchantPointsReview.init(
    {
      // 审核单ID（UUID格式）
      review_id: {
        type: DataTypes.STRING(100),
        primaryKey: true,
        allowNull: false,
        comment: '审核单ID（UUID格式）'
      },

      // 用户ID（申请审核的用户）
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID（申请审核的用户）'
      },

      // 商家ID（扫码审核的商家）
      merchant_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '商家ID（扫码审核的商家）'
      },

      // 审核积分金额
      points_amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '审核积分金额（冻结金额）'
      },

      // 审核状态（2026-01-08 简化：仅使用 pending/approved/rejected，移除 expired/cancelled）
      status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'pending',
        comment:
          '审核状态：pending=待审批/approved=已通过（已发放奖励）/rejected=已拒绝 | [已废弃] expired/cancelled 仅用于历史数据兼容'
      },

      // 审核超时时间（2026-01-08 已废弃：新语义不再使用超时机制）
      expires_at: {
        type: DataTypes.DATE,
        allowNull: true, // 允许 NULL（新语义设为 NULL）
        defaultValue: null,
        comment: '审核超时时间（已废弃，新语义设为 NULL）'
      },

      // 幂等键（防止重复提交）
      idempotency_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: '幂等键（防止重复提交审核）'
      },

      // 二维码数据
      qr_code_data: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '二维码数据（扫码时的原始数据）'
      },

      // 审核元数据（JSON格式）
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '审核元数据（商家信息、扫码时间、处理信息等）'
      }
    },
    {
      sequelize,
      modelName: 'MerchantPointsReview',
      tableName: 'merchant_points_reviews',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '商家积分审核表（扫码审核冻结积分）',

      // 查询作用域（2026-01-08 简化：移除 expired 相关逻辑）
      scopes: {
        // 待处理的审核（pending状态）
        pending: {
          where: { status: 'pending' }
        },

        // 需要客服处理的审核（仅 rejected 状态）
        needsHandle: {
          where: { status: 'rejected' }
        },

        // @deprecated 2026-01-08 - 超时机制已废弃，此 scope 保留仅用于兼容，实际不会匹配任何记录
        expired: {
          where: {
            status: 'pending',
            expires_at: {
              [sequelize.Sequelize.Op.lt]: new Date()
            }
          }
        },

        // 用户的审核记录
        byUser: user_id => ({
          where: { user_id }
        }),

        // 商家的审核记录
        byMerchant: merchant_id => ({
          where: { merchant_id }
        })
      }
    }
  )

  return MerchantPointsReview
}
