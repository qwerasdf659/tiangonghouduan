/**
 * 餐厅积分抽奖系统 V4.0 - 数据库迁移
 *
 * 迁移名称：创建材料流水表 material_transactions
 * 迁移类型：create-table（创建表）
 * 版本号：v4.5.0-material-system
 * 创建时间：2025-12-15 16:56:23 (北京时间)
 *
 * 变更说明：
 * 1. 创建材料流水表，记录所有材料的变动（获得、消耗、转换等）
 * 2. 支持幂等性控制（business_id唯一约束）
 * 3. 支持审计追溯（before/after余额、业务类型、业务ID）
 * 4. 支持反作弊（通过流水分析异常行为）
 *
 * 业务场景：
 * - 材料获得：抽奖发放材料（tx_type=earn, business_type=lottery_reward）
 * - 材料消耗：兑换市场扣减（tx_type=consume, business_type=exchange）
 * - 材料转换：合成/分解/逐级转换（tx_type=convert_in/convert_out, business_type=material_convert）
 * - 管理员调整：人工补偿/纠错（tx_type=admin_adjust, business_type=admin_adjust）
 *
 * 依赖关系：
 * - 依赖 users 表（user_id 外键）
 * - 依赖 material_asset_types 表（asset_code 外键）
 *
 * 影响范围：
 * - 创建新表 material_transactions
 * - 创建主键索引 tx_id
 * - 创建唯一索引 business_id
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
      console.log('开始创建 material_transactions 表...')

      /*
       * ========================================
       * 第1步：检查表是否已存在（幂等性保护）
       * ========================================
       */
      const tableExists = await queryInterface.tableExists('material_transactions', { transaction })
      if (tableExists) {
        console.log('表 material_transactions 已存在，跳过创建')
        await transaction.commit()
        return
      }

      /*
       * ========================================
       * 第2步：创建 material_transactions 表
       * ========================================
       */
      await queryInterface.createTable('material_transactions', {
        // 主键：流水ID（自增）
        tx_id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
          comment: '流水ID（主键，自增）'
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

        // 交易类型（统一正数，方向由tx_type决定）
        tx_type: {
          type: Sequelize.ENUM('earn', 'consume', 'convert_in', 'convert_out', 'admin_adjust'),
          allowNull: false,
          comment: '交易类型：earn（获得）、consume（消耗）、convert_in（转换收入）、convert_out（转换支出）、admin_adjust（管理员调整）'
        },

        // 金额（统一正数，方向由tx_type决定）
        amount: {
          type: Sequelize.BIGINT,
          allowNull: false,
          comment: '金额（统一正数，方向由tx_type决定）。earn/convert_in为收入，consume/convert_out为支出'
        },

        // 变更前余额（用于审计和对账）
        balance_before: {
          type: Sequelize.BIGINT,
          allowNull: false,
          comment: '变更前余额（用于审计和对账）'
        },

        // 变更后余额（用于审计和对账）
        balance_after: {
          type: Sequelize.BIGINT,
          allowNull: false,
          comment: '变更后余额（用于审计和对账）'
        },

        // 业务类型（用于分类统计和追溯）
        business_type: {
          type: Sequelize.STRING(50),
          allowNull: false,
          comment: '业务类型（用于分类统计和追溯），如：lottery_reward（抽奖发放）、exchange（兑换扣减）、material_convert（材料转换）、admin_adjust（管理员调整）'
        },

        // 业务ID（幂等键，必填，唯一约束）
        business_id: {
          type: Sequelize.STRING(150),
          allowNull: false,
          unique: true,
          comment: '业务ID（幂等键，必填，唯一约束），如：lottery_draw_{draw_id}_{asset_code}、exchange_{item_id}_{user_id}_{timestamp}、material_convert_{rule_id}_{user_id}_{timestamp}'
        },

        // 标题（用于前端展示和审计）
        title: {
          type: Sequelize.STRING(255),
          allowNull: true,
          comment: '标题（用于前端展示和审计），如：抽奖获得碎红水晶、兑换商品消耗完整红水晶、合成完整红水晶'
        },

        // 元数据（JSON格式，可选，用于记录详细信息）
        meta: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '元数据（JSON格式，可选），可记录：rule_id（转换规则ID）、from_amount/to_amount（比例快照）、order_id（订单ID）、draw_id（抽奖ID）等'
        },

        // 创建时间（交易时间）
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          comment: '创建时间（交易时间，北京时间）'
        }
      }, {
        transaction,
        comment: '材料流水表（记录所有材料的变动，用于审计、对账和反作弊）',
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        engine: 'InnoDB'
      })

      console.log('✓ material_transactions 表创建成功')

      /*
       * ========================================
       * 第3步：创建索引
       * ========================================
       */
      // 唯一索引：business_id - 幂等性保护
      await queryInterface.addIndex('material_transactions', ['business_id'], {
        name: 'uk_business_id',
        unique: true,
        transaction
      })
      console.log('✓ 唯一索引 business_id 创建成功')

      // 组合索引：(user_id, asset_code, created_at) - 用于按用户查询流水
      await queryInterface.addIndex('material_transactions', ['user_id', 'asset_code', 'created_at'], {
        name: 'idx_user_asset_created',
        transaction
      })
      console.log('✓ 组合索引 (user_id, asset_code, created_at) 创建成功')

      // 索引：user_id - 用于按用户查询
      await queryInterface.addIndex('material_transactions', ['user_id'], {
        name: 'idx_user_id',
        transaction
      })
      console.log('✓ 索引 user_id 创建成功')

      // 索引：asset_code - 用于按资产类型统计
      await queryInterface.addIndex('material_transactions', ['asset_code'], {
        name: 'idx_asset_code',
        transaction
      })
      console.log('✓ 索引 asset_code 创建成功')

      // 索引：business_type - 用于按业务类型统计
      await queryInterface.addIndex('material_transactions', ['business_type'], {
        name: 'idx_business_type',
        transaction
      })
      console.log('✓ 索引 business_type 创建成功')

      // 索引：created_at - 用于按时间范围查询
      await queryInterface.addIndex('material_transactions', ['created_at'], {
        name: 'idx_created_at',
        transaction
      })
      console.log('✓ 索引 created_at 创建成功')

      /*
       * ========================================
       * 第4步：创建外键约束
       * ========================================
       */
      // 外键：user_id -> users.user_id
      await queryInterface.addConstraint('material_transactions', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_material_transactions_user_id',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT', // 保护：不允许删除有流水记录的用户
        onUpdate: 'CASCADE',
        transaction
      })
      console.log('✓ 外键约束 user_id -> users.user_id 创建成功')

      // 外键：asset_code -> material_asset_types.asset_code
      await queryInterface.addConstraint('material_transactions', {
        fields: ['asset_code'],
        type: 'foreign key',
        name: 'fk_material_transactions_asset_code',
        references: {
          table: 'material_asset_types',
          field: 'asset_code'
        },
        onDelete: 'RESTRICT', // 保护：不允许删除有流水记录的材料类型
        onUpdate: 'CASCADE',
        transaction
      })
      console.log('✓ 外键约束 asset_code -> material_asset_types.asset_code 创建成功')

      await transaction.commit()
      console.log('✅ material_transactions 表创建完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 创建 material_transactions 表失败:', error.message)
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
      console.log('开始回滚：删除 material_transactions 表...')

      // 检查表是否存在
      const tableExists = await queryInterface.tableExists('material_transactions', { transaction })
      if (!tableExists) {
        console.log('表 material_transactions 不存在，跳过删除')
        await transaction.commit()
        return
      }

      // 删除外键约束
      await queryInterface.removeConstraint('material_transactions', 'fk_material_transactions_asset_code', { transaction })
      console.log('✓ 外键约束 asset_code 删除成功')

      await queryInterface.removeConstraint('material_transactions', 'fk_material_transactions_user_id', { transaction })
      console.log('✓ 外键约束 user_id 删除成功')

      // 删除表
      await queryInterface.dropTable('material_transactions', { transaction })
      console.log('✓ material_transactions 表删除成功')

      await transaction.commit()
      console.log('✅ material_transactions 表回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚 material_transactions 表失败:', error.message)
      throw error
    }
  }
}
