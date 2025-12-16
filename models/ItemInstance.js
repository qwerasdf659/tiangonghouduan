/**
 * 物品实例模型（Item Instance Model）
 *
 * Phase 3 - P3-1：物品实例真相模型
 *
 * 业务场景：
 * - 不可叠加物品的所有权真相（装备、卡牌、兑换券、二手商品等）
 * - 支持物品实例状态机（available/locked/transferred/used/expired）
 * - 支持并发控制（locked_by_order_id/locked_at）
 *
 * 硬约束（来自文档）：
 * - **单一真相**：物品所有权只能来自 item_instances 表
 * - **状态机**：available→locked→transferred/used/expired
 * - **锁超时**：15分钟（locked_at 超时自动解锁）
 *
 * 表名（snake_case）：item_instances
 * 主键命名：item_instance_id
 * 创建时间：2025-12-15
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * ItemInstance 类定义（物品实例模型）
 */
class ItemInstance extends Model {
  /**
   * 模型关联定义
   *
   * @param {Object} models - 所有模型的映射对象
   * @returns {void} 无返回值
   */
  static associate(models) {
    // 物品实例属于某个用户（所有权真相）
    ItemInstance.belongsTo(models.User, {
      foreignKey: 'owner_user_id',
      as: 'owner',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    })
  }

  /**
   * 检查物品是否可用（未锁定且状态为available）
   *
   * @returns {boolean} 是否可用 - true表示可用，false表示不可用
   */
  isAvailable() {
    return this.status === 'available' && !this.locked_by_order_id
  }

  /**
   * 检查锁定是否超时（15分钟）
   *
   * @returns {boolean} 是否超时 - true表示超时，false表示未超时
   */
  isLockTimeout() {
    if (!this.locked_at) return false

    const now = new Date()
    const lockTime = new Date(this.locked_at)
    const diffMinutes = (now - lockTime) / 1000 / 60

    return diffMinutes > 15 // 15分钟超时
  }

  /**
   * 锁定物品（用于订单下单）
   *
   * @param {string} orderId - 订单ID
   * @param {Object} options - 选项参数
   * @param {Sequelize.Transaction} options.transaction - 事务对象
   * @returns {Promise<void>} 无返回值
   */
  async lock(orderId, options = {}) {
    if (this.locked_by_order_id && !this.isLockTimeout()) {
      throw new Error(`物品已被订单 ${this.locked_by_order_id} 锁定`)
    }

    await this.update(
      {
        status: 'locked',
        locked_by_order_id: orderId,
        locked_at: new Date()
      },
      options
    )
  }

  /**
   * 解锁物品（用于订单取消/超时）
   *
   * @param {Object} options - 选项参数
   * @param {Sequelize.Transaction} options.transaction - 事务对象
   * @returns {Promise<void>} 无返回值
   */
  async unlock(options = {}) {
    await this.update(
      {
        status: 'available',
        locked_by_order_id: null,
        locked_at: null
      },
      options
    )
  }

  /**
   * 转移所有权（用于交易成交）
   *
   * @param {number} newOwnerId - 新所有者用户ID
   * @param {Object} options - 选项参数
   * @param {Sequelize.Transaction} options.transaction - 事务对象
   * @returns {Promise<void>} 无返回值
   */
  async transferOwnership(newOwnerId, options = {}) {
    await this.update(
      {
        owner_user_id: newOwnerId,
        status: 'transferred',
        locked_by_order_id: null,
        locked_at: null
      },
      options
    )
  }

  /**
   * 标记为已使用（用于兑换/核销）
   *
   * @param {Object} options - 选项参数
   * @param {Sequelize.Transaction} options.transaction - 事务对象
   * @returns {Promise<void>} 无返回值
   */
  async markAsUsed(options = {}) {
    await this.update(
      {
        status: 'used'
      },
      options
    )
  }

  /**
   * 标记为已过期
   *
   * @param {Object} options - 选项参数
   * @param {Sequelize.Transaction} options.transaction - 事务对象
   * @returns {Promise<void>} 无返回值
   */
  async markAsExpired(options = {}) {
    await this.update(
      {
        status: 'expired'
      },
      options
    )
  }
}

module.exports = sequelize => {
  ItemInstance.init(
    {
      // 主键ID（Item Instance ID）
      item_instance_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '物品实例ID（自增主键）'
      },

      // 所有者用户ID（Owner User ID - 所有权真相）
      owner_user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '所有者用户ID（所有权真相，关联 users.user_id）'
      },

      // 物品类型（Item Type）
      item_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '物品类型（如 voucher/product/service/equipment/card）'
      },

      // 物品模板ID（Item Template ID）
      item_template_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '物品模板ID（可选，关联物品模板表或奖品表）'
      },

      // 物品状态（Item Status - 状态机）
      status: {
        type: DataTypes.ENUM('available', 'locked', 'transferred', 'used', 'expired'),
        allowNull: false,
        defaultValue: 'available',
        comment:
          '物品状态（available=可用/locked=锁定中/transferred=已转移/used=已使用/expired=已过期）'
      },

      // 物品元数据（Item Metadata - JSON）
      meta: {
        type: DataTypes.JSON,
        allowNull: true,
        comment:
          '物品元数据（JSON格式，包含：name/description/icon/value/attributes/serial_number等）',
        /**
         * Getter方法：返回物品元数据
         *
         * @returns {Object} 物品元数据对象
         */
        get() {
          const value = this.getDataValue('meta')
          return value || {}
        }
      },

      // 锁定订单ID（Locked By Order ID - 并发控制）
      locked_by_order_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '锁定此物品的订单ID（并发控制，防止重复购买）'
      },

      // 锁定时间（Locked At - 超时解锁）
      locked_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '锁定时间（用于超时解锁，默认15分钟超时）'
      },

      // 创建时间（Created At）
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '创建时间（北京时间存储）'
      },

      // 更新时间（Updated At）
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '更新时间（北京时间存储）'
      }
    },
    {
      sequelize,
      modelName: 'ItemInstance',
      tableName: 'item_instances',
      timestamps: true,
      underscored: true,
      comment: '物品实例表（不可叠加物品所有权真相）',

      // 索引定义
      indexes: [
        {
          name: 'idx_item_instances_owner_user_id',
          fields: ['owner_user_id']
        },
        {
          name: 'idx_item_instances_status',
          fields: ['status']
        },
        {
          name: 'idx_item_instances_type_template',
          fields: ['item_type', 'item_template_id']
        },
        {
          name: 'idx_item_instances_locked_by_order',
          fields: ['locked_by_order_id']
        }
      ]
    }
  )

  return ItemInstance
}
