/**
 * 商家积分审核模型（MerchantPointsReview Model）
 *
 * 业务场景：商家扫码审核冻结积分
 *
 * 状态流转：
 * - pending → approved：审核通过（从冻结结算，真正扣款）
 * - pending → rejected：审核拒绝（积分仍冻结，需客服处理）
 * - pending → expired：审核超时（积分仍冻结，需客服处理）
 * - rejected/expired → cancelled：客服处理完成
 *
 * 冻结归属约束：
 * - 每笔冻结必须绑定 review_id
 * - idempotency_key 格式：{review_id}:freeze
 * - 流水表 business_type：merchant_review_freeze/merchant_review_settle 等
 *
 * 拍板决策（商业模式核心）：
 * - 只要没审核通过就不可以增加到可用积分中
 * - 冻结会无限期存在，接受用户资产长期不可用
 * - 审核拒绝/超时：积分不退回，需客服手工处理
 *
 * 表名（snake_case）：merchant_points_reviews
 * 主键命名：review_id（UUID格式）
 * 创建时间：2025-12-29
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
   * 检查审核是否已超时
   *
   * @returns {boolean} 是否超时 - true表示超时，false表示未超时
   */
  isExpired() {
    if (!this.expires_at) return false
    return new Date() > new Date(this.expires_at)
  }

  /**
   * 检查审核是否可以被批准
   *
   * @returns {boolean} 是否可批准 - true表示可批准，false表示不可批准
   */
  canApprove() {
    return this.status === 'pending' && !this.isExpired()
  }

  /**
   * 检查审核是否可以被拒绝
   *
   * @returns {boolean} 是否可拒绝 - true表示可拒绝，false表示不可拒绝
   */
  canReject() {
    return this.status === 'pending'
  }

  /**
   * 检查审核是否需要客服处理
   *
   * @returns {boolean} 是否需要客服处理
   */
  needsAdminHandle() {
    return ['rejected', 'expired'].includes(this.status)
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
   * 生成幂等键
   *
   * @param {number} user_id - 用户ID
   * @param {number} merchant_id - 商家ID
   * @param {number} points_amount - 积分金额
   * @returns {string} 幂等键
   */
  static generateIdempotencyKey(user_id, merchant_id, points_amount) {
    const timestamp = Date.now()
    return `merchant_review_${user_id}_${merchant_id}_${points_amount}_${timestamp}`
  }

  /**
   * 生成冻结操作的幂等键
   *
   * @param {string} review_id - 审核单ID
   * @returns {string} 冻结幂等键
   */
  static generateFreezeIdempotencyKey(review_id) {
    return `${review_id}:freeze`
  }

  /**
   * 生成结算操作的幂等键
   *
   * @param {string} review_id - 审核单ID
   * @returns {string} 结算幂等键
   */
  static generateSettleIdempotencyKey(review_id) {
    return `${review_id}:settle`
  }

  /**
   * 生成解冻操作的幂等键
   *
   * @param {string} review_id - 审核单ID
   * @returns {string} 解冻幂等键
   */
  static generateUnfreezeIdempotencyKey(review_id) {
    return `${review_id}:unfreeze`
  }

  /**
   * 计算默认超时时间（24小时后）
   *
   * @returns {Date} 超时时间
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

      // 审核状态
      status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected', 'expired', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
        comment:
          '审核状态：pending=审核中/approved=审核通过/rejected=审核拒绝/expired=审核超时/cancelled=已取消'
      },

      // 审核超时时间
      expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '审核超时时间（超时后需客服处理）'
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

      // 查询作用域
      scopes: {
        // 待处理的审核（pending状态）
        pending: {
          where: { status: 'pending' }
        },

        // 需要客服处理的审核（rejected/expired状态）
        needsHandle: {
          where: {
            status: ['rejected', 'expired']
          }
        },

        // 已超时的审核
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
