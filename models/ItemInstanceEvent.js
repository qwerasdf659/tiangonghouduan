'use strict'

/**
 * ItemInstanceEvent 模型 - 物品实例事件（事件溯源）
 *
 * 业务场景：
 * - 记录物品实例的所有变更事件（铸造/锁定/解锁/转移/使用/过期/销毁）
 * - 支持物品所有权和状态的完整审计追踪
 * - 支持业务幂等（business_type + idempotency_key 唯一约束）
 *
 * 事件类型（event_type）：
 * - mint：物品铸造（抽奖获得、活动发放）
 * - lock：物品锁定（挂牌、下单）
 * - unlock：物品解锁（撤单、取消、超时）
 * - transfer：物品转移（交易成交、赠送）
 * - use：物品使用（兑换核销）
 * - expire：物品过期（有效期到期）
 * - destroy：物品销毁（管理员回收）
 *
 * 数据库表名：item_instance_events
 * 主键：event_id（BIGINT，自增）
 * 外键：item_instance_id → item_instances.item_instance_id（RESTRICT删除，CASCADE更新）
 *
 * 创建时间：2025-12-28
 * 更新时间：2026-01-02 - 业界标准形态：business_id → idempotency_key
 * 基于文档：统一资产域架构设计方案.md
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const ItemInstanceEvent = sequelize.define(
    'ItemInstanceEvent',
    {
      // ==================== 主键 ====================
      event_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '事件ID（主键，自增）'
      },

      // ==================== 关联实例 ====================
      item_instance_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '物品实例ID（关联 item_instances.item_instance_id）',
        references: {
          model: 'item_instances',
          key: 'item_instance_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
      },

      // ==================== 事件类型 ====================
      event_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '事件类型（mint/lock/unlock/transfer/use/expire/destroy）'
      },

      // ==================== 操作者信息 ====================
      operator_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '操作者用户ID（可为 NULL，系统操作时）'
      },
      operator_type: {
        type: DataTypes.ENUM('user', 'admin', 'system'),
        allowNull: false,
        defaultValue: 'user',
        comment: '操作者类型（user/admin/system）'
      },

      // ==================== 变更前后状态 ====================
      status_before: {
        type: DataTypes.ENUM('available', 'locked', 'transferred', 'used', 'expired'),
        allowNull: true,
        comment: '变更前状态'
      },
      status_after: {
        type: DataTypes.ENUM('available', 'locked', 'transferred', 'used', 'expired'),
        allowNull: true,
        comment: '变更后状态'
      },
      owner_before: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '变更前所有者'
      },
      owner_after: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '变更后所有者'
      },

      // ==================== 业务关联（幂等） ====================
      business_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '业务类型（lottery_reward/market_transfer/redemption_use/admin_adjust）'
      },
      idempotency_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        field: 'idempotency_key',
        comment: '幂等键（业界标准命名）：派生自父级幂等键，用于事件去重（NOT NULL - 文档4.2要求）'
      },

      // ==================== 扩展信息 ====================
      meta: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '事件元数据（订单信息/转让原因/核销信息等）',
        /**
         * Getter方法：返回事件元数据
         *
         * @returns {Object} 事件元数据对象
         */
        get() {
          const value = this.getDataValue('meta')
          return value || {}
        }
      }
    },
    {
      tableName: 'item_instance_events',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false, // 事件表不需要 updated_at
      underscored: true,
      indexes: [
        {
          name: 'idx_item_instance_events_instance_time',
          fields: ['item_instance_id', 'created_at']
        },
        {
          name: 'idx_item_instance_events_type_time',
          fields: ['event_type', 'created_at']
        },
        {
          name: 'idx_item_instance_events_operator_time',
          fields: ['operator_user_id', 'created_at']
        },
        {
          name: 'idx_item_instance_events_business',
          fields: ['business_type', 'idempotency_key']
        },
        {
          // 文档4.2建议：联合唯一索引 (item_instance_id, idempotency_key)
          name: 'uk_item_instance_events_instance_idempotency',
          fields: ['item_instance_id', 'idempotency_key'],
          unique: true
        }
      ],
      comment: '物品实例事件表（记录所有物品变更事件）'
    }
  )

  /**
   * 定义关联关系
   *
   * @param {Object} models - 模型对象集合
   * @returns {void} 无返回值
   */
  ItemInstanceEvent.associate = function (models) {
    // 关联物品实例
    ItemInstanceEvent.belongsTo(models.ItemInstance, {
      foreignKey: 'item_instance_id',
      as: 'item_instance',
      comment: '关联物品实例'
    })

    // 关联操作者（用户）
    ItemInstanceEvent.belongsTo(models.User, {
      foreignKey: 'operator_user_id',
      as: 'operator',
      comment: '关联操作者'
    })
  }

  /**
   * 静态方法：记录物品事件
   *
   * @param {Object} params - 参数对象
   * @param {number} params.item_instance_id - 物品实例ID
   * @param {string} params.event_type - 事件类型
   * @param {string} params.idempotency_key - 幂等键（必填 - 文档4.2要求）
   * @param {number|null} params.operator_user_id - 操作者用户ID
   * @param {string} params.operator_type - 操作者类型（user/admin/system）
   * @param {string|null} params.status_before - 变更前状态
   * @param {string|null} params.status_after - 变更后状态
   * @param {number|null} params.owner_before - 变更前所有者
   * @param {number|null} params.owner_after - 变更后所有者
   * @param {string|null} params.business_type - 业务类型
   * @param {Object|null} params.meta - 事件元数据
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 事务对象
   * @returns {Promise<ItemInstanceEvent>} 创建的事件记录
   * @throws {Error} 如果缺少必填参数 idempotency_key
   */
  ItemInstanceEvent.recordEvent = async function (params, options = {}) {
    const { transaction } = options

    // 业界标准形态：idempotency_key 必填（文档4.2要求）
    if (!params.idempotency_key) {
      throw new Error('ItemInstanceEvent.recordEvent: idempotency_key 是必填参数（文档4.2要求）')
    }

    return await ItemInstanceEvent.create(
      {
        item_instance_id: params.item_instance_id,
        event_type: params.event_type,
        operator_user_id: params.operator_user_id || null,
        operator_type: params.operator_type || 'system',
        status_before: params.status_before || null,
        status_after: params.status_after || null,
        owner_before: params.owner_before || null,
        owner_after: params.owner_after || null,
        business_type: params.business_type || null,
        idempotency_key: params.idempotency_key,
        meta: params.meta || null
      },
      { transaction }
    )
  }

  /**
   * 静态方法：获取物品的事件历史
   *
   * @param {number} item_instance_id - 物品实例ID
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 事务对象
   * @param {number} options.limit - 返回数量限制
   * @returns {Promise<Array<ItemInstanceEvent>>} 事件历史列表
   */
  ItemInstanceEvent.getEventHistory = async function (item_instance_id, options = {}) {
    const { transaction, limit = 100 } = options

    return await ItemInstanceEvent.findAll({
      where: { item_instance_id },
      order: [['created_at', 'DESC']],
      limit,
      transaction
    })
  }

  return ItemInstanceEvent
}
