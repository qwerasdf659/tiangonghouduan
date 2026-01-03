/**
 * 餐厅积分抽奖系统 V4.0 - 数据库迁移
 *
 * 迁移名称：创建材料资产类型表 material_asset_types
 * 迁移类型：create-table（创建表）
 * 版本号：v4.5.0-material-system
 * 创建时间：2025-12-15 16:56:20 (北京时间)
 *
 * 变更说明：
 * 1. 创建材料资产类型表，定义系统中存在的材料种类（碎红水晶、完整红水晶、橙碎片、完整橙水晶等）
 * 2. 支持动态新增材料类型，无需修改表结构
 * 3. 支持材料价值配置（可见价值、预算价值）
 * 4. 支持材料分组、形态、层级管理
 *
 * 业务场景：
 * - 材料类型管理：运营可动态新增/禁用材料类型
 * - 材料价值展示：通过visible_value_points字段展示材料价值
 * - 预算控制：通过budget_value_points字段参与预算控奖系统
 * - UI展示：通过sort_order控制材料在前端的展示顺序
 *
 * 依赖关系：
 * - 无依赖（基础表）
 *
 * 影响范围：
 * - 创建新表 material_asset_types
 * - 创建主键索引 asset_code
 * - 创建组合索引 (group_code, form, tier)
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
      console.log('开始创建 material_asset_types 表...')

      /*
       * ========================================
       * 第1步：检查表是否已存在（幂等性保护）
       * ========================================
       */
      const tableExists = await queryInterface.tableExists('material_asset_types', { transaction })
      if (tableExists) {
        console.log('表 material_asset_types 已存在，跳过创建')
        await transaction.commit()
        return
      }

      /*
       * ========================================
       * 第2步：创建 material_asset_types 表
       * ========================================
       */
      await queryInterface.createTable(
        'material_asset_types',
        {
          // 主键：资产代码（如：red_shard、red_crystal、orange_shard、orange_crystal）
          asset_code: {
            type: Sequelize.STRING(32),
            primaryKey: true,
            allowNull: false,
            comment:
              '资产代码（主键），如：red_shard（碎红水晶）、red_crystal（完整红水晶）、orange_shard（橙碎片）、orange_crystal（完整橙水晶）'
          },

          // 展示名称（用于前端显示）
          display_name: {
            type: Sequelize.STRING(64),
            allowNull: false,
            comment: '展示名称（用于前端显示），如：碎红水晶、完整红水晶、橙碎片、完整橙水晶'
          },

          // 材料组代码（用于运营分组、UI展示与规则配置的分组边界）
          group_code: {
            type: Sequelize.STRING(16),
            allowNull: false,
            comment: '材料组代码（用于分组管理），如：red（红系）、orange（橙系）、purple（紫系）'
          },

          // 形态（碎片或完整体）
          form: {
            type: Sequelize.ENUM('shard', 'crystal'),
            allowNull: false,
            comment: '形态：shard（碎片）、crystal（完整体/水晶）'
          },

          // 层级（红=1、橙=2、紫=3...，用于限制升级方向，避免循环转换）
          tier: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '层级（红=1、橙=2、紫=3...），用于限制升级方向，避免循环转换'
          },

          // 可见价值（积分口径，用于展示、对齐门票单位、解释成本）
          visible_value_points: {
            type: Sequelize.BIGINT,
            allowNull: false,
            defaultValue: 0,
            comment:
              '可见价值（积分口径），用于展示、对齐门票单位、解释成本。例如：碎红水晶=10、完整红水晶=100'
          },

          // 预算价值（积分口径，用于预算控奖、系统成本口径）
          budget_value_points: {
            type: Sequelize.BIGINT,
            allowNull: false,
            defaultValue: 0,
            comment:
              '预算价值（积分口径），用于预算控奖、系统成本口径。例如：碎红水晶=10、完整红水晶=100'
          },

          // 排序顺序（用于前端展示排序）
          sort_order: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '排序顺序（数字越小越靠前），用于前端展示排序'
          },

          // 是否启用（1=启用，0=禁用）
          is_enabled: {
            type: Sequelize.TINYINT(1),
            allowNull: false,
            defaultValue: 1,
            comment: '是否启用（1=启用，0=禁用）。禁用后不再出现在前端选择列表中'
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
          comment:
            '材料资产类型表（定义系统中存在的材料种类：碎红水晶、完整红水晶、橙碎片、完整橙水晶等）',
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          engine: 'InnoDB'
        }
      )

      console.log('✓ material_asset_types 表创建成功')

      /*
       * ========================================
       * 第3步：创建索引
       * ========================================
       */
      // 组合索引：(group_code, form, tier) - 用于运营查询和规则校验
      await queryInterface.addIndex('material_asset_types', ['group_code', 'form', 'tier'], {
        name: 'idx_group_form_tier',
        transaction
      })
      console.log('✓ 组合索引 (group_code, form, tier) 创建成功')

      // 索引：is_enabled - 用于查询启用的材料类型
      await queryInterface.addIndex('material_asset_types', ['is_enabled'], {
        name: 'idx_is_enabled',
        transaction
      })
      console.log('✓ 索引 is_enabled 创建成功')

      // 索引：sort_order - 用于前端展示排序
      await queryInterface.addIndex('material_asset_types', ['sort_order'], {
        name: 'idx_sort_order',
        transaction
      })
      console.log('✓ 索引 sort_order 创建成功')

      await transaction.commit()
      console.log('✅ material_asset_types 表创建完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 创建 material_asset_types 表失败:', error.message)
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
      console.log('开始回滚：删除 material_asset_types 表...')

      // 检查表是否存在
      const tableExists = await queryInterface.tableExists('material_asset_types', { transaction })
      if (!tableExists) {
        console.log('表 material_asset_types 不存在，跳过删除')
        await transaction.commit()
        return
      }

      // 删除表
      await queryInterface.dropTable('material_asset_types', { transaction })
      console.log('✓ material_asset_types 表删除成功')

      await transaction.commit()
      console.log('✅ material_asset_types 表回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚 material_asset_types 表失败:', error.message)
      throw error
    }
  }
}
