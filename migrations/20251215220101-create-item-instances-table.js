/**
 * 物品实例表迁移（Item Instances Table）
 *
 * Phase 3 - P3-1：创建物品实例真相表
 *
 * 业务场景：
 * - 不可叠加物品的所有权真相（装备、卡牌、兑换券、二手商品等）
 * - 支持物品实例状态机（available/locked/transferred/used/expired）
 * - 支持物品元数据（属性/词条/序列号/详情等）
 *
 * 硬约束（来自文档）：
 * - **单一真相**：物品所有权只能来自 item_instances 表
 * - **状态机**：available→locked→transferred/used/expired
 * - **并发控制**：locked_by_order_id + locked_at 防止重复锁定
 * - **迁移策略**：从现有 user_inventory 迁移数据
 *
 * 表名（snake_case）：item_instances
 * 命名时间：2025-12-15 22:01:01
 */

'use strict'

module.exports = {
  /**
   * 创建物品实例表
   *
   * @param {Sequelize.QueryInterface} queryInterface - Sequelize查询接口
   * @param {Sequelize} Sequelize - Sequelize实例
   * @returns {Promise<void>} 无返回值
   */
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable(
      'item_instances',
      {
        // 主键ID（Item Instance ID）
        item_instance_id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true,
          comment: '物品实例ID（自增主键）'
        },

        // 所有者用户ID（Owner User ID - 所有权真相）
        owner_user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '所有者用户ID（所有权真相，关联 users.user_id）'
        },

        // 物品类型（Item Type）
        item_type: {
          type: Sequelize.STRING(50),
          allowNull: true,
          comment: '物品类型（如 voucher/product/service/equipment/card）'
        },

        // 物品模板ID（Item Template ID）
        item_template_id: {
          type: Sequelize.BIGINT,
          allowNull: true,
          comment: '物品模板ID（可选，关联物品模板表或奖品表）'
        },

        // 物品状态（Item Status - 状态机）
        status: {
          type: Sequelize.ENUM('available', 'locked', 'transferred', 'used', 'expired'),
          allowNull: false,
          defaultValue: 'available',
          comment:
            '物品状态（available=可用/locked=锁定中/transferred=已转移/used=已使用/expired=已过期）'
        },

        // 物品元数据（Item Metadata - JSON）
        meta: {
          type: Sequelize.JSON,
          allowNull: true,
          comment:
            '物品元数据（JSON格式，包含：name/description/icon/value/attributes/serial_number等）'
        },

        // 锁定订单ID（Locked By Order ID - 并发控制）
        locked_by_order_id: {
          type: Sequelize.STRING(100),
          allowNull: true,
          comment: '锁定此物品的订单ID（并发控制，防止重复购买）'
        },

        // 锁定时间（Locked At - 超时解锁）
        locked_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '锁定时间（用于超时解锁，默认15分钟超时）'
        },

        // 创建时间（Created At）
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          comment: '创建时间（北京时间存储）'
        },

        // 更新时间（Updated At）
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
          comment: '更新时间（北京时间存储）'
        }
      },
      {
        comment: '物品实例表（不可叠加物品所有权真相）',
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        engine: 'InnoDB'
      }
    )

    // 创建索引（Index Creation）
    await queryInterface.addIndex('item_instances', ['owner_user_id'], {
      name: 'idx_item_instances_owner_user_id',
      comment: '所有者用户ID索引（查询用户拥有的物品）'
    })

    await queryInterface.addIndex('item_instances', ['status'], {
      name: 'idx_item_instances_status',
      comment: '状态索引（查询可用/锁定/已使用物品）'
    })

    await queryInterface.addIndex('item_instances', ['item_type', 'item_template_id'], {
      name: 'idx_item_instances_type_template',
      comment: '物品类型+模板ID复合索引（查询特定类型物品）'
    })

    await queryInterface.addIndex('item_instances', ['locked_by_order_id'], {
      name: 'idx_item_instances_locked_by_order',
      comment: '锁定订单ID索引（查询被订单锁定的物品）'
    })

    // 添加外键约束（Foreign Key Constraints）
    await queryInterface.addConstraint('item_instances', {
      fields: ['owner_user_id'],
      type: 'foreign key',
      name: 'fk_item_instances_owner_user_id',
      references: {
        table: 'users',
        field: 'user_id'
      },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    })

    console.log('✅ 物品实例表（item_instances）创建成功')
  },

  /**
   * 回滚迁移（删除物品实例表）
   *
   * @param {Sequelize.QueryInterface} queryInterface - Sequelize查询接口
   * @param {Sequelize} Sequelize - Sequelize实例
   * @returns {Promise<void>} 无返回值
   */
  down: async (queryInterface, Sequelize) => {
    // 删除外键约束
    await queryInterface.removeConstraint('item_instances', 'fk_item_instances_owner_user_id')

    // 删除表
    await queryInterface.dropTable('item_instances')

    console.log('🔄 物品实例表（item_instances）已回滚删除')
  }
}
