/**
 * 餐厅积分抽奖系统 V4.2 - 兑换订单模型（RedemptionOrder）
 *
 * 业务场景：管理核销码生成和核销流程
 *
 * 核心功能：
 * 1. 核销码哈希存储（SHA-256，不存明文）
 * 2. 订单状态管理（pending → fulfilled/expired/cancelled）
 * 3. 过期时间控制（30天TTL）
 * 4. 关联物品实例和核销人
 *
 * 状态流转：
 * - pending（待核销）→ fulfilled（已核销）：核销成功
 * - pending（待核销）→ expired（已过期）：超过30天
 * - pending（待核销）→ cancelled（已取消）：用户/管理员取消
 *
 * 数据库表名：redemption_orders
 * 主键：order_id（UUID）
 * 唯一键：code_hash（SHA-256哈希）
 *
 * 创建时间：2025-12-17
 * 使用模型：Claude Sonnet 4.5
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

module.exports = sequelize => {
  const RedemptionOrder = sequelize.define(
    'RedemptionOrder',
    {
      // 主键 - 订单ID
      order_id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
        comment: '订单ID（Order ID）：UUID格式的唯一订单标识符'
      },

      // 核销码哈希 - 只存储SHA-256哈希，不存明文
      code_hash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        comment: '核销码哈希（Code Hash）：12位Base32核销码的SHA-256哈希值，用于验证核销码'
      },

      // 关联物品实例
      item_instance_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '物品实例ID（Item Instance ID）：关联的物品实例',
        references: {
          model: 'item_instances',
          key: 'item_instance_id'
        }
      },

      // 核销人用户ID
      redeemer_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '核销用户ID（Redeemer User ID）：执行核销操作的用户，核销前为NULL',
        references: {
          model: 'users',
          key: 'user_id'
        }
      },

      // 订单状态
      status: {
        type: DataTypes.ENUM('pending', 'fulfilled', 'cancelled', 'expired'),
        allowNull: false,
        defaultValue: 'pending',
        comment:
          '订单状态（Status）：pending-待核销 | fulfilled-已核销 | cancelled-已取消 | expired-已过期'
      },

      // 过期时间
      expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '过期时间（Expires At）：核销码过期时间，创建后30天'
      },

      // 核销时间
      fulfilled_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '核销时间（Fulfilled At）：实际核销时间'
      }
    },
    {
      tableName: 'redemption_orders',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment: '兑换订单表：管理核销码生成和核销流程'
    }
  )

  /**
   * 定义模型关联关系
   * @param {Object} models - Sequelize模型对象集合
   * @returns {void}
   */
  RedemptionOrder.associate = models => {
    // 关联物品实例
    RedemptionOrder.belongsTo(models.ItemInstance, {
      foreignKey: 'item_instance_id',
      as: 'item_instance',
      comment: '关联的物品实例'
    })

    // 关联核销用户
    RedemptionOrder.belongsTo(models.User, {
      foreignKey: 'redeemer_user_id',
      as: 'redeemer',
      comment: '核销操作的用户'
    })
  }

  /**
   * 实例方法：检查订单是否已过期
   *
   * @returns {boolean} true-已过期，false-未过期
   */
  RedemptionOrder.prototype.isExpired = function () {
    if (!this.expires_at) return false
    return BeijingTimeHelper.isExpired(this.expires_at)
  }

  /**
   * 实例方法：检查订单是否可核销
   *
   * @returns {boolean} true-可核销，false-不可核销
   */
  RedemptionOrder.prototype.canFulfill = function () {
    return this.status === 'pending' && !this.isExpired()
  }

  /**
   * 实例方法：核销订单
   *
   * @param {number} redeemer_user_id - 核销用户ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象
   * @returns {Promise<RedemptionOrder>} 更新后的订单
   */
  RedemptionOrder.prototype.fulfill = async function (redeemer_user_id, options = {}) {
    const { transaction = null } = options

    if (!this.canFulfill()) {
      throw new Error('订单不可核销')
    }

    return await this.update(
      {
        status: 'fulfilled',
        redeemer_user_id,
        fulfilled_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )
  }

  return RedemptionOrder
}
