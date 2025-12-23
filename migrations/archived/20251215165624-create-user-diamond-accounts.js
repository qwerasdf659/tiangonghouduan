/**
 * 餐厅积分抽奖系统 V4.0 - 数据库迁移
 *
 * 迁移名称：创建用户钻石账户表 user_diamond_accounts
 * 迁移类型：create-table（创建表）
 * 版本号：v4.5.0-material-system
 * 创建时间：2025-12-15 16:56:24 (北京时间)
 *
 * 变更说明：
 * 1. 创建用户钻石账户表，记录每个用户的钻石（DIAMOND）余额
 * 2. 钻石作为虚拟价值货币，用于交易市场的计价/结算/手续费
 * 3. 对齐积分账户模式（余额表+流水表），支持事务性操作和行级锁
 *
 * 业务场景：
 * - 材料分解钻石：碎红水晶分解为钻石（1:20）
 * - 交易市场结算：买卖双方钻石结算（未来扩展）
 * - 任务奖励：任务完成发放钻石（未来扩展）
 * - 充值获得：用户充值获得钻石（未来扩展）
 * - 管理员发放：运营补偿/活动发放/纠错（管理员调整）
 *
 * 依赖关系：
 * - 依赖 users 表（user_id 外键）
 *
 * 影响范围：
 * - 创建新表 user_diamond_accounts
 * - 创建主键索引 account_id
 * - 创建唯一索引 user_id
 * - 创建外键约束
 */

'use strict'

module.exports = {
  /**
   * 执行迁移（up方向）
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize实例
   * @returns {Promise<void>} Promise对象
   */
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('开始创建 user_diamond_accounts 表...')

      /*
       * ========================================
       * 第1步：检查表是否已存在（幂等性保护）
       * ========================================
       */
      const tableExists = await queryInterface.tableExists('user_diamond_accounts', { transaction })
      if (tableExists) {
        console.log('表 user_diamond_accounts 已存在，跳过创建')
        await transaction.commit()
        return
      }

      /*
       * ========================================
       * 第2步：创建 user_diamond_accounts 表
       * ========================================
       */
      await queryInterface.createTable(
        'user_diamond_accounts',
        {
          // 主键：账户ID（自增）
          account_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
            comment: '账户ID（主键，自增）'
          },

          // 用户ID（外键关联users表，唯一约束）
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            unique: true,
            comment: '用户ID（关联users.user_id，唯一约束：一个用户只有一个钻石账户）'
          },

          // 钻石余额（正整数）
          balance: {
            type: Sequelize.BIGINT,
            allowNull: false,
            defaultValue: 0,
            comment: '钻石余额（正整数）。余额为0时不删除记录，保留历史'
          },

          // 创建时间
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间（北京时间）'
          },

          // 更新时间
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
            comment: '更新时间（北京时间）'
          }
        },
        {
          transaction,
          comment: '用户钻石账户表（记录每个用户的钻石余额，钻石作为虚拟价值货币用于交易市场）',
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          engine: 'InnoDB'
        }
      )

      console.log('✓ user_diamond_accounts 表创建成功')

      /*
       * ========================================
       * 第3步：创建索引
       * ========================================
       */
      // 唯一索引：user_id - 一个用户只有一个钻石账户
      await queryInterface.addIndex('user_diamond_accounts', ['user_id'], {
        name: 'uk_user_id',
        unique: true,
        transaction
      })
      console.log('✓ 唯一索引 user_id 创建成功')

      // 索引：balance - 用于按余额范围查询（如：查询余额>0的用户）
      await queryInterface.addIndex('user_diamond_accounts', ['balance'], {
        name: 'idx_balance',
        transaction
      })
      console.log('✓ 索引 balance 创建成功')

      /*
       * ========================================
       * 第4步：创建外键约束
       * ========================================
       */
      // 外键：user_id -> users.user_id
      await queryInterface.addConstraint('user_diamond_accounts', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_user_diamond_accounts_user_id',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT', // 保护：不允许删除有钻石账户的用户
        onUpdate: 'CASCADE',
        transaction
      })
      console.log('✓ 外键约束 user_id -> users.user_id 创建成功')

      await transaction.commit()
      console.log('✅ user_diamond_accounts 表创建完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 创建 user_diamond_accounts 表失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移（down方向）
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize实例
   * @returns {Promise<void>} Promise对象
   */
  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('开始回滚：删除 user_diamond_accounts 表...')

      // 检查表是否存在
      const tableExists = await queryInterface.tableExists('user_diamond_accounts', { transaction })
      if (!tableExists) {
        console.log('表 user_diamond_accounts 不存在，跳过删除')
        await transaction.commit()
        return
      }

      // 删除外键约束
      await queryInterface.removeConstraint(
        'user_diamond_accounts',
        'fk_user_diamond_accounts_user_id',
        { transaction }
      )
      console.log('✓ 外键约束 user_id 删除成功')

      // 删除表
      await queryInterface.dropTable('user_diamond_accounts', { transaction })
      console.log('✓ user_diamond_accounts 表删除成功')

      await transaction.commit()
      console.log('✅ user_diamond_accounts 表回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚 user_diamond_accounts 表失败:', error.message)
      throw error
    }
  }
}
