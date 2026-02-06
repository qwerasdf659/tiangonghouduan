/**
 * 餐厅积分抽奖系统 V4.2 - 创建兑换订单表（redemption_orders）
 *
 * 业务背景：
 * - 替代 UserInventory.verification_code 明文存储方式
 * - 使用 12位Base32 + SHA-256 hash 存储核销码
 * - 支持 30天 TTL 过期管理
 *
 * 表设计：
 * - 主键：order_id (UUID)
 * - 核销码：code_hash (SHA-256，64位hex)
 * - 关联：item_instance_id (物品实例ID)
 * - 状态：pending/fulfilled/cancelled/expired
 *
 * 创建时间：2025-12-17
 * 迁移类型：create-table
 */

'use strict'

module.exports = {
  /**
   * 执行迁移 - 创建 redemption_orders 表
   */
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('开始创建 redemption_orders 表...')

      await queryInterface.createTable(
        'redemption_orders',
        {
          // 主键 - 订单ID (UUID格式)
          order_id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
            allowNull: false,
            comment: '订单ID（Order ID）：UUID格式的唯一订单标识符'
          },

          // 核销码哈希 - 只存储SHA-256哈希值，不存明文
          code_hash: {
            type: Sequelize.STRING(64),
            allowNull: false,
            unique: true,
            comment:
              '核销码哈希（Code Hash）：12位Base32核销码的SHA-256哈希值（64位hex字符串），用于验证核销码，不存储明文'
          },

          // 关联物品实例ID
          item_instance_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment:
              '物品实例ID（Item Instance ID）：关联的物品实例，外键指向 item_instances.item_instance_id',
            references: {
              model: 'item_instances',
              key: 'item_instance_id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT' // 有兑换订单的物品实例不能删除
          },

          // 核销人用户ID
          redeemer_user_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment:
              '核销用户ID（Redeemer User ID）：执行核销操作的用户ID，外键指向 users.user_id，核销前为NULL',
            references: {
              model: 'users',
              key: 'user_id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL' // 用户删除后核销记录保留但设为NULL
          },

          // 订单状态
          status: {
            type: Sequelize.ENUM('pending', 'fulfilled', 'cancelled', 'expired'),
            allowNull: false,
            defaultValue: 'pending',
            comment:
              '订单状态（Status）：pending-待核销 | fulfilled-已核销 | cancelled-已取消 | expired-已过期'
          },

          // 过期时间 - 创建后30天
          expires_at: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '过期时间（Expires At）：核销码过期时间，创建后30天，北京时间'
          },

          // 核销时间
          fulfilled_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '核销时间（Fulfilled At）：实际核销时间，北京时间'
          },

          // 创建时间
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间（Created At）：记录创建时间，北京时间'
          },

          // 更新时间
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
            comment: '更新时间（Updated At）：记录最后更新时间，北京时间'
          }
        },
        {
          transaction,
          comment:
            '兑换订单表（Redemption Orders）：管理核销码生成和核销流程，替代 UserInventory.verification_code'
        }
      )

      console.log('✅ 表创建成功')

      // 创建索引
      console.log('创建索引...')

      // 1. 核销码哈希唯一索引（已通过 unique: true 自动创建）

      // 2. 状态+过期时间复合索引（用于查询待核销和过期订单）
      await queryInterface.addIndex('redemption_orders', {
        fields: ['status', 'expires_at'],
        name: 'idx_status_expires',
        transaction
      })
      console.log('✅ 索引 idx_status_expires 创建成功')

      // 3. 物品实例ID索引（用于查询物品对应的兑换订单）
      await queryInterface.addIndex('redemption_orders', {
        fields: ['item_instance_id'],
        name: 'idx_item_instance',
        transaction
      })
      console.log('✅ 索引 idx_item_instance 创建成功')

      // 4. 核销人用户ID索引（用于查询用户核销记录）
      await queryInterface.addIndex('redemption_orders', {
        fields: ['redeemer_user_id'],
        name: 'idx_redeemer',
        transaction
      })
      console.log('✅ 索引 idx_redeemer 创建成功')

      await transaction.commit()
      console.log('✅ redemption_orders 表创建完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 创建 redemption_orders 表失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移 - 删除 redemption_orders 表
   */
  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('开始删除 redemption_orders 表...')

      // 删除表会自动删除所有索引和约束
      await queryInterface.dropTable('redemption_orders', { transaction })

      await transaction.commit()
      console.log('✅ redemption_orders 表删除完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 删除 redemption_orders 表失败:', error.message)
      throw error
    }
  }
}
