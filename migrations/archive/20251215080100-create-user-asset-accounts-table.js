/**
 * 迁移文件：创建user_asset_accounts表（统一资产账户表）
 *
 * 业务背景：
 * - 交易市场从积分结算迁移到DIAMOND资产结算
 * - 兑换市场从虚拟价值支付迁移到材料资产扣减
 * - 需要统一的资产底座来管理DIAMOND和材料资产
 *
 * 表结构设计：
 * - 采用user_id + asset_code的组合唯一索引
 * - DIAMOND和所有材料都使用同一套账本（通过asset_code区分）
 * - available_amount使用BIGINT避免浮点精度问题
 *
 * 命名规范（snake_case）：
 * - 表名：user_asset_accounts
 * - 主键：asset_account_id
 * - 外键：user_id（关联users.user_id）
 * - 时间字段：created_at, updated_at
 *
 * 创建时间：2025-12-15
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：创建user_asset_accounts表
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize对象
   * @returns {Promise<void>}
   */
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 创建user_asset_accounts表
      await queryInterface.createTable(
        'user_asset_accounts',
        {
          // 主键ID（Asset Account ID - 资产账户唯一标识）
          asset_account_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '资产账户ID（主键）'
          },

          // 用户ID（User ID - 账户所有者）
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '用户ID（账户所有者）',
            references: {
              model: 'users',
              key: 'user_id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT' // 用户删除时保护资产账户数据
          },

          // 资产代码（Asset Code - 资产类型标识）
          asset_code: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment:
              '资产代码（Asset Code - 资产类型标识）：DIAMOND-钻石资产（交易市场结算币种）, red_shard-碎红水晶（材料资产）, 可扩展其他材料'
          },

          // 可用余额（Available Amount - 可使用的资产数量）
          available_amount: {
            type: Sequelize.BIGINT,
            allowNull: false,
            defaultValue: 0,
            comment:
              '可用余额（Available Amount - 可使用的资产数量，单位：1个资产单位，使用BIGINT避免浮点精度问题，默认0）'
          },

          // 时间戳字段
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间（北京时间，数据库内部存储UTC）'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
            comment: '更新时间（北京时间，数据库内部存储UTC）'
          }
        },
        {
          transaction,
          comment: '统一资产账户表（User Asset Accounts）- 管理用户的DIAMOND和材料资产余额'
        }
      )

      // 创建唯一索引：user_id + asset_code（一个用户对每种资产只有一个账户）
      await queryInterface.addIndex('user_asset_accounts', ['user_id', 'asset_code'], {
        unique: true,
        name: 'uk_user_asset',
        transaction,
        comment: '唯一索引：用户ID + 资产代码（确保一个用户对每种资产只有一个账户）'
      })

      // 创建索引：asset_code（按资产类型查询）
      await queryInterface.addIndex('user_asset_accounts', ['asset_code'], {
        name: 'idx_asset_code',
        transaction,
        comment: '索引：资产代码（用于按资产类型统计和查询）'
      })

      // 创建索引：user_id（按用户查询所有资产）
      await queryInterface.addIndex('user_asset_accounts', ['user_id'], {
        name: 'idx_user_id',
        transaction,
        comment: '索引：用户ID（用于查询用户的所有资产账户）'
      })

      await transaction.commit()
      console.log('✅ 成功创建user_asset_accounts表（统一资产账户表）')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：删除user_asset_accounts表
   *
   * 注意：
   * - 回滚前会检查表中是否有数据
   * - 如果有数据，拒绝回滚，需要先备份数据
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize对象
   * @returns {Promise<void>}
   */
  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 检查表中是否有数据
      const [results] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM user_asset_accounts',
        { transaction }
      )

      const count = results[0].count

      if (count > 0) {
        throw new Error(
          `无法回滚：user_asset_accounts表中存在${count}条记录。` + '请先备份数据，然后再执行回滚。'
        )
      }

      // 删除表
      await queryInterface.dropTable('user_asset_accounts', { transaction })

      await transaction.commit()
      console.log('✅ 成功删除user_asset_accounts表')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
