/**
 * 餐厅积分抽奖系统 V4.0 - 数据库迁移
 *
 * 迁移名称：创建材料转换规则表 material_conversion_rules
 * 迁移类型：create-table（创建表）
 * 版本号：v4.5.0-material-system
 * 创建时间：2025-12-15 16:56:22 (北京时间)
 *
 * 变更说明：
 * 1. 创建材料转换规则表，定义"从哪种材料按什么比例换到哪种材料"
 * 2. 支持动态调整兑换比例（通过新增未来生效规则实现版本化）
 * 3. 支持启用/禁用规则
 * 4. 支持历史追溯（通过effective_at字段记录生效时间）
 *
 * 业务场景：
 * - 合成规则：如 10个碎红水晶 -> 1个完整红水晶
 * - 分解规则：如 1个完整红水晶 -> 9个碎红水晶（9折下行，抑制套利）
 * - 逐级分解：如 1个橙碎片 -> 9个完整红水晶
 * - 比例调整：运营可新增未来生效规则，不覆盖历史规则（用于审计和对账）
 *
 * 依赖关系：
 * - 依赖 material_asset_types 表（from_asset_code、to_asset_code 外键）
 *
 * 影响范围：
 * - 创建新表 material_conversion_rules
 * - 创建主键索引 rule_id
 * - 创建唯一索引 (from_asset_code, to_asset_code, effective_at)
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
      console.log('开始创建 material_conversion_rules 表...')

      /*
       * ========================================
       * 第1步：检查表是否已存在（幂等性保护）
       * ========================================
       */
      const tableExists = await queryInterface.tableExists('material_conversion_rules', {
        transaction
      })
      if (tableExists) {
        console.log('表 material_conversion_rules 已存在，跳过创建')
        await transaction.commit()
        return
      }

      /*
       * ========================================
       * 第2步：创建 material_conversion_rules 表
       * ========================================
       */
      await queryInterface.createTable(
        'material_conversion_rules',
        {
          // 主键：规则ID（自增）
          rule_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
            comment: '规则ID（主键，自增）'
          },

          // 源资产代码（从哪种材料转换，外键关联material_asset_types表）
          from_asset_code: {
            type: Sequelize.STRING(32),
            allowNull: false,
            comment: '源资产代码（从哪种材料转换），如：red_shard、orange_shard'
          },

          // 目标资产代码（转换成哪种材料，外键关联material_asset_types表）
          to_asset_code: {
            type: Sequelize.STRING(32),
            allowNull: false,
            comment: '目标资产代码（转换成哪种材料），如：red_crystal、orange_crystal'
          },

          // 源材料数量（需要消耗的源材料数量）
          from_amount: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '源材料数量（需要消耗的源材料数量），例如：合成规则为10、分解规则为1'
          },

          // 目标材料数量（转换后获得的目标材料数量）
          to_amount: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment:
              '目标材料数量（转换后获得的目标材料数量），例如：合成规则为1、分解规则为9（9折下行）'
          },

          // 生效时间（用于版本化管理，支持未来生效规则）
          effective_at: {
            type: Sequelize.DATE,
            allowNull: false,
            comment:
              '生效时间（北京时间），用于版本化管理。改比例时新增未来生效规则，不覆盖历史规则'
          },

          // 是否启用（1=启用，0=禁用）
          is_enabled: {
            type: Sequelize.TINYINT(1),
            allowNull: false,
            defaultValue: 1,
            comment: '是否启用（1=启用，0=禁用）。禁用后该规则不再生效'
          },

          // 规则描述（可选，用于运营备注）
          description: {
            type: Sequelize.STRING(255),
            allowNull: true,
            comment: '规则描述（可选），如：合成规则、分解规则、逐级分解规则'
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
          comment: '材料转换规则表（定义材料间的转换关系和比例，支持动态调整和版本化管理）',
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          engine: 'InnoDB'
        }
      )

      console.log('✓ material_conversion_rules 表创建成功')

      /*
       * ========================================
       * 第3步：创建索引
       * ========================================
       */
      // 唯一索引：(from_asset_code, to_asset_code, effective_at) - 防止重复规则
      await queryInterface.addIndex(
        'material_conversion_rules',
        ['from_asset_code', 'to_asset_code', 'effective_at'],
        {
          name: 'uk_from_to_effective',
          unique: true,
          transaction
        }
      )
      console.log('✓ 唯一索引 (from_asset_code, to_asset_code, effective_at) 创建成功')

      // 组合索引：(from_asset_code, to_asset_code, is_enabled, effective_at) - 用于查询生效规则
      await queryInterface.addIndex(
        'material_conversion_rules',
        ['from_asset_code', 'to_asset_code', 'is_enabled', 'effective_at'],
        {
          name: 'idx_from_to_enabled_effective',
          transaction
        }
      )
      console.log('✓ 组合索引 (from_asset_code, to_asset_code, is_enabled, effective_at) 创建成功')

      // 索引：is_enabled - 用于查询启用的规则
      await queryInterface.addIndex('material_conversion_rules', ['is_enabled'], {
        name: 'idx_is_enabled',
        transaction
      })
      console.log('✓ 索引 is_enabled 创建成功')

      /*
       * ========================================
       * 第4步：创建外键约束
       * ========================================
       */
      // 外键：from_asset_code -> material_asset_types.asset_code
      await queryInterface.addConstraint('material_conversion_rules', {
        fields: ['from_asset_code'],
        type: 'foreign key',
        name: 'fk_material_conversion_rules_from_asset',
        references: {
          table: 'material_asset_types',
          field: 'asset_code'
        },
        onDelete: 'RESTRICT', // 保护：不允许删除有转换规则的材料类型
        onUpdate: 'CASCADE',
        transaction
      })
      console.log('✓ 外键约束 from_asset_code -> material_asset_types.asset_code 创建成功')

      // 外键：to_asset_code -> material_asset_types.asset_code
      await queryInterface.addConstraint('material_conversion_rules', {
        fields: ['to_asset_code'],
        type: 'foreign key',
        name: 'fk_material_conversion_rules_to_asset',
        references: {
          table: 'material_asset_types',
          field: 'asset_code'
        },
        onDelete: 'RESTRICT', // 保护：不允许删除有转换规则的材料类型
        onUpdate: 'CASCADE',
        transaction
      })
      console.log('✓ 外键约束 to_asset_code -> material_asset_types.asset_code 创建成功')

      await transaction.commit()
      console.log('✅ material_conversion_rules 表创建完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 创建 material_conversion_rules 表失败:', error.message)
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
      console.log('开始回滚：删除 material_conversion_rules 表...')

      // 检查表是否存在
      const tableExists = await queryInterface.tableExists('material_conversion_rules', {
        transaction
      })
      if (!tableExists) {
        console.log('表 material_conversion_rules 不存在，跳过删除')
        await transaction.commit()
        return
      }

      // 删除外键约束
      await queryInterface.removeConstraint(
        'material_conversion_rules',
        'fk_material_conversion_rules_to_asset',
        { transaction }
      )
      console.log('✓ 外键约束 to_asset_code 删除成功')

      await queryInterface.removeConstraint(
        'material_conversion_rules',
        'fk_material_conversion_rules_from_asset',
        { transaction }
      )
      console.log('✓ 外键约束 from_asset_code 删除成功')

      // 删除表
      await queryInterface.dropTable('material_conversion_rules', { transaction })
      console.log('✓ material_conversion_rules 表删除成功')

      await transaction.commit()
      console.log('✅ material_conversion_rules 表回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚 material_conversion_rules 表失败:', error.message)
      throw error
    }
  }
}
