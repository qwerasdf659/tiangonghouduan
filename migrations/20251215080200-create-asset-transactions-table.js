/**
 * 迁移文件：创建asset_transactions表（资产流水表）
 *
 * 业务背景：
 * - 记录所有资产变动流水（DIAMOND和材料资产）
 * - 支持幂等性控制（business_id + business_type唯一约束）
 * - 用于对账、审计和资产历史追溯
 *
 * 表结构设计：
 * - delta_amount使用BIGINT（可以为负数，表示扣减）
 * - business_id + business_type组合唯一索引（幂等性保证）
 * - meta字段存储业务扩展信息（JSON格式）
 *
 * 幂等性设计：
 * - 同一business_id + business_type只能创建一条记录
 * - 防止网络重试导致重复扣款/入账
 * - 类似积分系统的幂等性保护机制
 *
 * 命名规范（snake_case）：
 * - 表名：asset_transactions
 * - 主键：transaction_id
 * - 外键：user_id（关联users.user_id）
 * - 时间字段：created_at
 *
 * 创建时间：2025-12-15
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：创建asset_transactions表
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize对象
   * @returns {Promise<void>}
   */
  async up (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 创建asset_transactions表
      await queryInterface.createTable(
        'asset_transactions',
        {
          // 主键ID（Transaction ID - 流水唯一标识）
          transaction_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '流水ID（主键）'
          },

          // 用户ID（User ID - 流水所属用户）
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '用户ID（流水所属用户）',
            references: {
              model: 'users',
              key: 'user_id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT' // 用户删除时保护流水数据
          },

          // 资产代码（Asset Code - 资产类型标识）
          asset_code: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment:
              '资产代码（Asset Code - 资产类型标识）：DIAMOND-钻石资产, red_shard-碎红水晶, 等'
          },

          // 变动金额（Delta Amount - 资产变动数量）
          delta_amount: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment:
              '变动金额（Delta Amount - 资产变动数量，正数表示增加，负数表示扣减，单位：1个资产单位）'
          },

          // 变动后余额（Balance After - 变动后的资产余额）
          balance_after: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '变动后余额（Balance After - 本次变动后的资产余额，用于快速查询和对账）'
          },

          // 业务唯一标识（Business ID - 幂等性控制）
          business_id: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment:
              '业务唯一标识（Business ID - 业务层传入的幂等键，如market_purchase_buyer_xxx, exchange_xxx, material_convert_xxx，与business_type组合确保幂等性）'
          },

          // 业务类型（Business Type - 业务场景分类）
          business_type: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment:
              '业务类型（Business Type - 业务场景分类）：market_purchase_buyer_debit-市场购买买家扣减, market_purchase_seller_credit-市场购买卖家入账, market_purchase_platform_fee_credit-市场购买平台手续费, exchange_debit-兑换扣减, material_convert_debit-材料转换扣减, material_convert_credit-材料转换入账'
          },

          // 扩展信息（Meta - JSON格式存储业务扩展信息）
          meta: {
            type: Sequelize.JSON,
            allowNull: true,
            comment:
              '扩展信息（Meta - JSON格式存储业务扩展信息）：如order_no, item_id, conversion_rule等，用于业务追溯和审计'
          },

          // 时间戳字段
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间（北京时间，数据库内部存储UTC）'
          }
        },
        {
          transaction,
          comment: '资产流水表（Asset Transactions）- 记录所有资产变动流水，支持幂等性控制和审计追溯'
        }
      )

      // 创建唯一索引：business_id + business_type（幂等性保证）
      await queryInterface.addIndex('asset_transactions', ['business_id', 'business_type'], {
        unique: true,
        name: 'uk_business_idempotency',
        transaction,
        comment: '唯一索引：业务ID + 业务类型（幂等性保证，防止重复扣款/入账）'
      })

      // 创建索引：user_id + asset_code + created_at（按用户和资产类型查询流水）
      await queryInterface.addIndex('asset_transactions', ['user_id', 'asset_code', 'created_at'], {
        name: 'idx_user_asset_time',
        transaction,
        comment: '索引：用户ID + 资产代码 + 创建时间（用于查询用户的资产流水历史）'
      })

      // 创建索引：business_type + created_at（按业务类型统计）
      await queryInterface.addIndex('asset_transactions', ['business_type', 'created_at'], {
        name: 'idx_business_type_time',
        transaction,
        comment: '索引：业务类型 + 创建时间（用于按业务场景统计分析）'
      })

      // 创建索引：asset_code + created_at（按资产类型统计）
      await queryInterface.addIndex('asset_transactions', ['asset_code', 'created_at'], {
        name: 'idx_asset_code_time',
        transaction,
        comment: '索引：资产代码 + 创建时间（用于按资产类型统计分析）'
      })

      await transaction.commit()
      console.log('✅ 成功创建asset_transactions表（资产流水表）')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：删除asset_transactions表
   *
   * 注意：
   * - 回滚前会检查表中是否有数据
   * - 如果有数据，拒绝回滚，需要先备份数据
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize对象
   * @returns {Promise<void>}
   */
  async down (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 检查表中是否有数据
      const [results] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM asset_transactions',
        { transaction }
      )

      const count = results[0].count

      if (count > 0) {
        throw new Error(
          `无法回滚：asset_transactions表中存在${count}条记录。` +
          '请先备份数据，然后再执行回滚。'
        )
      }

      // 删除表
      await queryInterface.dropTable('asset_transactions', { transaction })

      await transaction.commit()
      console.log('✅ 成功删除asset_transactions表')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
