/**
 * 餐厅积分抽奖系统 V4.0 - 数据库迁移
 *
 * 迁移名称：创建用户材料余额表 user_material_balances
 * 迁移类型：create-table（创建表）
 * 版本号：v4.5.0-material-system
 * 创建时间：2025-12-15 16:56:21 (北京时间)
 *
 * 变更说明：
 * 1. 创建用户材料余额表，记录每个用户在每种材料上的余额（按行扩展）
 * 2. 支持部分扣减（与背包模式的主要区别）
 * 3. 支持事务性操作（增加/扣减材料余额）
 * 4. 支持行级锁（FOR UPDATE）防止并发问题
 *
 * 业务场景：
 * - 材料余额管理：用户可查询自己的材料余额
 * - 材料合成/分解：通过材料余额的增减实现
 * - 兑换市场支付：从材料余额扣减（替代背包SUM value模式）
 * - 抽奖发放材料：增加用户材料余额
 *
 * 依赖关系：
 * - 依赖 users 表（user_id 外键）
 * - 依赖 material_asset_types 表（asset_code 外键）
 *
 * 影响范围：
 * - 创建新表 user_material_balances
 * - 创建主键索引 balance_id
 * - 创建唯一索引 (user_id, asset_code)
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
  async up (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('开始创建 user_material_balances 表...')

      /*
       * ========================================
       * 第1步：检查表是否已存在（幂等性保护）
       * ========================================
       */
      const tableExists = await queryInterface.tableExists('user_material_balances', { transaction })
      if (tableExists) {
        console.log('表 user_material_balances 已存在，跳过创建')
        await transaction.commit()
        return
      }

      /*
       * ========================================
       * 第2步：创建 user_material_balances 表
       * ========================================
       */
      await queryInterface.createTable('user_material_balances', {
        // 主键：余额ID（自增）
        balance_id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
          comment: '余额ID（主键，自增）'
        },

        // 用户ID（外键关联users表）
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '用户ID（关联users.user_id）'
        },

        // 资产代码（外键关联material_asset_types表）
        asset_code: {
          type: Sequelize.STRING(32),
          allowNull: false,
          comment: '资产代码（关联material_asset_types.asset_code），如：red_shard、red_crystal'
        },

        // 余额（正整数，支持部分扣减）
        balance: {
          type: Sequelize.BIGINT,
          allowNull: false,
          defaultValue: 0,
          comment: '余额（正整数，支持部分扣减）。余额为0时不删除记录，保留历史'
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
      }, {
        transaction,
        comment: '用户材料余额表（记录每个用户在每种材料上的余额，支持部分扣减和行级锁）',
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        engine: 'InnoDB'
      })

      console.log('✓ user_material_balances 表创建成功')

      /*
       * ========================================
       * 第3步：创建索引
       * ========================================
       */
      // 唯一索引：(user_id, asset_code) - 同一用户同一资产只有一行余额
      await queryInterface.addIndex('user_material_balances', ['user_id', 'asset_code'], {
        name: 'uk_user_asset',
        unique: true,
        transaction
      })
      console.log('✓ 唯一索引 (user_id, asset_code) 创建成功')

      // 索引：user_id - 用于按用户查询余额
      await queryInterface.addIndex('user_material_balances', ['user_id'], {
        name: 'idx_user_id',
        transaction
      })
      console.log('✓ 索引 user_id 创建成功')

      // 索引：asset_code - 用于按资产类型统计
      await queryInterface.addIndex('user_material_balances', ['asset_code'], {
        name: 'idx_asset_code',
        transaction
      })
      console.log('✓ 索引 asset_code 创建成功')

      /*
       * ========================================
       * 第4步：创建外键约束
       * ========================================
       */
      // 外键：user_id -> users.user_id
      await queryInterface.addConstraint('user_material_balances', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_user_material_balances_user_id',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT', // 保护：不允许删除有材料余额的用户
        onUpdate: 'CASCADE',
        transaction
      })
      console.log('✓ 外键约束 user_id -> users.user_id 创建成功')

      // 外键：asset_code -> material_asset_types.asset_code
      await queryInterface.addConstraint('user_material_balances', {
        fields: ['asset_code'],
        type: 'foreign key',
        name: 'fk_user_material_balances_asset_code',
        references: {
          table: 'material_asset_types',
          field: 'asset_code'
        },
        onDelete: 'RESTRICT', // 保护：不允许删除有余额记录的材料类型
        onUpdate: 'CASCADE',
        transaction
      })
      console.log('✓ 外键约束 asset_code -> material_asset_types.asset_code 创建成功')

      await transaction.commit()
      console.log('✅ user_material_balances 表创建完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 创建 user_material_balances 表失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移（down方向）
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize实例
   * @returns {Promise<void>} Promise对象
   */
  async down (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('开始回滚：删除 user_material_balances 表...')

      // 检查表是否存在
      const tableExists = await queryInterface.tableExists('user_material_balances', { transaction })
      if (!tableExists) {
        console.log('表 user_material_balances 不存在，跳过删除')
        await transaction.commit()
        return
      }

      // 删除外键约束
      await queryInterface.removeConstraint('user_material_balances', 'fk_user_material_balances_asset_code', { transaction })
      console.log('✓ 外键约束 asset_code 删除成功')

      await queryInterface.removeConstraint('user_material_balances', 'fk_user_material_balances_user_id', { transaction })
      console.log('✓ 外键约束 user_id 删除成功')

      // 删除表
      await queryInterface.dropTable('user_material_balances', { transaction })
      console.log('✓ user_material_balances 表删除成功')

      await transaction.commit()
      console.log('✅ user_material_balances 表回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚 user_material_balances 表失败:', error.message)
      throw error
    }
  }
}
