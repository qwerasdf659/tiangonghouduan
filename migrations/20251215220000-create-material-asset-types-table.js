/**
 * 材料资产类型表迁移
 *
 * Phase 2 - P1-1：恢复材料配置表（必须建表）
 *
 * 业务场景：
 * - 材料类型配置（display_name/group_code/form/tier/sort_order）
 * - 价值口径配置（visible_value_points/budget_value_points）
 * - 材料展示与转换规则配置
 *
 * 硬约束（来自文档）：
 * - **禁止硬编码**：所有材料类型必须来自配置表，便于运营动态调整
 * - 配置表真相：material_asset_types 为材料配置真相源
 * - 余额真相：account_asset_balances 为余额真相源（不在本表）
 *
 * 表名（snake_case）：material_asset_types
 * 命名时间：2025-12-15 22:00:00
 */

'use strict'

module.exports = {
  /**
   * 创建材料资产类型表
   *
   * @param {Sequelize.QueryInterface} queryInterface - Sequelize查询接口
   * @param {Sequelize} Sequelize - Sequelize实例
   * @returns {Promise<void>} 无返回值
   */
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('material_asset_types', {
      // 主键ID（Material Asset Type ID）
      material_asset_type_id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '材料资产类型ID（主键）'
      },

      // 资产代码（Asset Code - 唯一标识）
      asset_code: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
        comment:
          '资产代码（Asset Code - 唯一标识）：如 red_shard/red_crystal/orange_shard，必须唯一，与 account_asset_balances.asset_code 关联'
      },

      // 展示名称（Display Name - 用户可见名称）
      display_name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: '展示名称（Display Name - 用户可见名称）：如"红色碎片""红色水晶"'
      },

      // 分组代码（Group Code - 材料分组）
      group_code: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment:
          '分组代码（Group Code - 材料分组）：如 red/orange/yellow/green/blue/purple，用于材料逐级转换的层级归类'
      },

      // 形态（Form - 碎片/水晶）
      form: {
        type: Sequelize.ENUM('shard', 'crystal'),
        allowNull: false,
        comment: '形态（Form - 碎片/水晶）：shard-碎片（低级形态），crystal-水晶（高级形态）'
      },

      // 层级（Tier - 材料层级）
      tier: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment:
          '层级（Tier - 材料层级）：数字越大层级越高，如 1-碎片层级，2-水晶层级，用于转换规则校验'
      },

      // 排序权重（Sort Order - 展示排序）
      sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '排序权重（Sort Order - 展示排序）：数字越小越靠前，用于材料列表展示排序'
      },

      // 可见价值锚点（Visible Value Points - 展示口径）
      visible_value_points: {
        type: Sequelize.BIGINT,
        allowNull: true,
        comment:
          '可见价值锚点（Visible Value Points - 展示口径）：用户可见的材料价值锚点，如 1 red_shard = 10 visible_value_points，用于展示与比较，可选'
      },

      // 预算价值锚点（Budget Value Points - 系统口径）
      budget_value_points: {
        type: Sequelize.BIGINT,
        allowNull: true,
        comment:
          '预算价值锚点（Budget Value Points - 系统口径）：系统内部预算计算口径，用于成本核算与风控，可选'
      },

      // 是否启用（Is Enabled - 启用状态）
      is_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment:
          '是否启用（Is Enabled - 启用状态）：true-启用（可展示可转换），false-禁用（不可展示不可转换）'
      },

      // 创建时间（Created At - 北京时间）
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: '创建时间（Created At - 北京时间）：记录创建时间'
      },

      // 更新时间（Updated At - 北京时间）
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: '更新时间（Updated At - 北京时间）：记录最后更新时间'
      }
    })

    // 添加索引
    await queryInterface.addIndex('material_asset_types', ['asset_code'], {
      unique: true,
      name: 'uk_material_asset_types_asset_code'
    })

    await queryInterface.addIndex('material_asset_types', ['group_code'], {
      name: 'idx_material_asset_types_group_code'
    })

    await queryInterface.addIndex('material_asset_types', ['is_enabled'], {
      name: 'idx_material_asset_types_is_enabled'
    })

    // 插入初始材料类型数据（基于文档要求）
    await queryInterface.bulkInsert('material_asset_types', [
      {
        asset_code: 'red_shard',
        display_name: '红色碎片',
        group_code: 'red',
        form: 'shard',
        tier: 1,
        sort_order: 10,
        visible_value_points: 10,
        budget_value_points: 10,
        is_enabled: true,
        created_at: new Date(),
        updated_at: new Date()
      }
      // 可根据业务需要添加其他材料类型（red_crystal/orange_shard 等）
    ])

    console.log('✅ 材料资产类型表创建成功：material_asset_types')
  },

  /**
   * 回滚迁移
   *
   * @param {Sequelize.QueryInterface} queryInterface - Sequelize查询接口
   * @param {Sequelize} Sequelize - Sequelize实例
   * @returns {Promise<void>} 无返回值
   */
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('material_asset_types')
    console.log('✅ 材料资产类型表已删除：material_asset_types')
  }
}
