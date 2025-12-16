/**
 * 材料转换规则表迁移
 *
 * Phase 2 - P1-2：恢复材料转换规则配置表（必须建表）
 *
 * 业务场景：
 * - 材料合成/分解/逐级转换规则配置
 * - 材料→DIAMOND 显式分解规则（固定比例 1 red_shard = 20 DIAMOND）
 * - 规则版本化管理（effective_at 生效时间）
 *
 * 硬约束（来自文档）：
 * - **版本化强约束**：改比例/费率必须新增规则（禁止 UPDATE 覆盖历史）
 * - 通过 effective_at 生效时间控制规则切换
 * - 历史流水可通过 effective_at 回放计算依据，确保可审计/可解释
 * - **风控校验（保存/启用时触发）**：
 *   - 循环拦截：不得出现 A→B→...→A 的闭环路径
 *   - 套利拦截：不得出现"沿环路换一圈资产数量不减反增"（负环检测）
 *
 * 表名（snake_case）：material_conversion_rules
 * 命名时间：2025-12-15 22:01:00
 */

'use strict'

module.exports = {
  /**
   * 创建材料转换规则表
   *
   * @param {Sequelize.QueryInterface} queryInterface - Sequelize查询接口
   * @param {Sequelize} Sequelize - Sequelize实例
   * @returns {Promise<void>} 无返回值
   */
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('material_conversion_rules', {
      // 主键ID（Conversion Rule ID）
      rule_id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '转换规则ID（主键）'
      },

      // 源资产代码（From Asset Code - 转换源）
      from_asset_code: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: '源资产代码（From Asset Code - 转换源）：如 red_shard，表示从哪种资产转换出去'
      },

      // 目标资产代码（To Asset Code - 转换目标）
      to_asset_code: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment:
          '目标资产代码（To Asset Code - 转换目标）：如 DIAMOND/red_crystal，表示转换成哪种资产'
      },

      // 源资产数量（From Amount - 转换输入数量）
      from_amount: {
        type: Sequelize.BIGINT,
        allowNull: false,
        comment:
          '源资产数量（From Amount - 转换输入数量）：如 1，表示消耗 1 个源资产（如 1 red_shard）'
      },

      // 目标资产数量（To Amount - 转换输出数量）
      to_amount: {
        type: Sequelize.BIGINT,
        allowNull: false,
        comment:
          '目标资产数量（To Amount - 转换输出数量）：如 20，表示获得 20 个目标资产（如 20 DIAMOND），比例 = to_amount / from_amount'
      },

      // 生效时间（Effective At - 版本化关键字段）
      effective_at: {
        type: Sequelize.DATE,
        allowNull: false,
        comment:
          '生效时间（Effective At - 版本化关键字段）：规则从此时间开始生效，查询时取当前时间前的最新已启用规则（WHERE effective_at <= NOW() AND is_enabled=true ORDER BY effective_at DESC LIMIT 1），确保历史流水可回放'
      },

      // 是否启用（Is Enabled - 启用状态）
      is_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment:
          '是否启用（Is Enabled - 启用状态）：true-启用（规则生效），false-禁用（规则不生效）'
      },

      // 创建人（Created By - 操作记录）
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '创建人（Created By - 操作记录）：记录规则创建者的 user_id，用于审计'
      },

      // 创建时间（Created At - 北京时间）
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: '创建时间（Created At - 北京时间）：记录规则创建时间'
      },

      // 更新时间（Updated At - 北京时间）
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: '更新时间（Updated At - 北京时间）：记录规则最后更新时间'
      }
    })

    // 添加索引
    await queryInterface.addIndex(
      'material_conversion_rules',
      ['from_asset_code', 'to_asset_code', 'effective_at'],
      {
        name: 'idx_material_conversion_rules_conversion_path'
      }
    )

    await queryInterface.addIndex('material_conversion_rules', ['is_enabled', 'effective_at'], {
      name: 'idx_material_conversion_rules_enabled_effective'
    })

    // 插入初始转换规则数据（基于文档硬约束：1 red_shard = 20 DIAMOND）
    await queryInterface.bulkInsert('material_conversion_rules', [
      {
        from_asset_code: 'red_shard',
        to_asset_code: 'DIAMOND',
        from_amount: 1,
        to_amount: 20,
        effective_at: new Date('2025-12-15T00:00:00.000+08:00'), // 北京时间 2025-12-15 00:00:00
        is_enabled: true,
        created_by: null, // 系统初始化规则
        created_at: new Date(),
        updated_at: new Date()
      }
    ])

    console.log('✅ 材料转换规则表创建成功：material_conversion_rules')
    console.log('✅ 初始规则已插入：1 red_shard = 20 DIAMOND（effective_at: 2025-12-15 00:00:00）')
  },

  /**
   * 回滚迁移
   *
   * @param {Sequelize.QueryInterface} queryInterface - Sequelize查询接口
   * @param {Sequelize} Sequelize - Sequelize实例
   * @returns {Promise<void>} 无返回值
   */
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('material_conversion_rules')
    console.log('✅ 材料转换规则表已删除：material_conversion_rules')
  }
}
