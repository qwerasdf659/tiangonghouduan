/**
 * 材料转换规则表扩展迁移
 *
 * 业务背景：实施"材料转换系统降维护成本方案"
 * 文档来源：docs/材料转换系统降维护成本方案-2026-01-13.md
 *
 * 扩展字段分类：
 * 1. 批次约束（Batch Constraints）：min_from_amount, max_from_amount
 * 2. 损耗建模（Loss Model）：fee_rate, fee_min_amount, fee_asset_code
 * 3. 前端展示（Frontend Display）：title, description, display_icon, risk_level, is_visible
 * 4. 舍入控制（Rounding Control）：rounding_mode
 * 5. 审计字段（Audit Fields）：updated_by
 *
 * 核心收益：
 * - 运营可在数据库层面调整转换参数，无需代码变更
 * - 支持手续费机制，实现三方记账（用户扣减 + 用户入账 + 系统手续费入账）
 * - 前端可动态渲染转换规则卡片
 *
 * 表名（snake_case）：material_conversion_rules
 * 创建时间：2026-01-13
 */

'use strict'

module.exports = {
  /**
   * 扩展材料转换规则表字段
   *
   * @param {Sequelize.QueryInterface} queryInterface - Sequelize查询接口
   * @param {Sequelize} Sequelize - Sequelize实例
   * @returns {Promise<void>} 无返回值
   */
  up: async (queryInterface, Sequelize) => {
    // ============================================
    // 1. 批次约束字段（Batch Constraints）
    // ============================================

    // min_from_amount - 最小转换数量（保护性下限）
    await queryInterface.addColumn('material_conversion_rules', 'min_from_amount', {
      type: Sequelize.BIGINT,
      allowNull: false,
      defaultValue: 1,
      comment: '最小转换数量（Min From Amount）：用户单次转换的最小源资产数量，用于保护性下限'
    })

    // max_from_amount - 最大转换数量（NULL = 无上限）
    await queryInterface.addColumn('material_conversion_rules', 'max_from_amount', {
      type: Sequelize.BIGINT,
      allowNull: true,
      defaultValue: null,
      comment: '最大转换数量（Max From Amount）：用户单次转换的最大源资产数量，NULL 表示无上限'
    })

    // ============================================
    // 2. 损耗建模字段（Loss Model - 手续费配置）
    // ============================================

    // fee_rate - 手续费费率（如 0.05 = 5%）
    await queryInterface.addColumn('material_conversion_rules', 'fee_rate', {
      type: Sequelize.DECIMAL(5, 4),
      allowNull: false,
      defaultValue: 0.0,
      comment: '手续费费率（Fee Rate）：如 0.05 = 5%，基于产出 to_amount 计算手续费'
    })

    // fee_min_amount - 最低手续费（向上取整到这个数）
    await queryInterface.addColumn('material_conversion_rules', 'fee_min_amount', {
      type: Sequelize.BIGINT,
      allowNull: false,
      defaultValue: 0,
      comment:
        '最低手续费（Fee Min Amount）：手续费下限，计算结果低于此值时取此值，0 表示无最低限制'
    })

    // fee_asset_code - 手续费资产类型（NULL = 与 to_asset_code 相同）
    await queryInterface.addColumn('material_conversion_rules', 'fee_asset_code', {
      type: Sequelize.STRING(50),
      allowNull: true,
      defaultValue: null,
      comment:
        '手续费资产类型（Fee Asset Code）：手续费收取的资产类型，NULL 时默认与 to_asset_code 相同'
    })

    // ============================================
    // 3. 前端展示字段（Frontend Display）
    // ============================================

    // title - 显示标题
    await queryInterface.addColumn('material_conversion_rules', 'title', {
      type: Sequelize.STRING(100),
      allowNull: true,
      defaultValue: null,
      comment: '显示标题（Title）：前端展示的规则名称，如"红晶片分解"'
    })

    // description - 描述文案
    await queryInterface.addColumn('material_conversion_rules', 'description', {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: null,
      comment: '描述文案（Description）：前端展示的规则说明文案'
    })

    // display_icon - 图标 URL 或 icon-name
    await queryInterface.addColumn('material_conversion_rules', 'display_icon', {
      type: Sequelize.STRING(200),
      allowNull: true,
      defaultValue: null,
      comment: '显示图标（Display Icon）：图标 URL 或 icon-name，用于前端渲染'
    })

    // risk_level - 风险等级标签
    await queryInterface.addColumn('material_conversion_rules', 'risk_level', {
      type: Sequelize.ENUM('low', 'medium', 'high'),
      allowNull: false,
      defaultValue: 'low',
      comment:
        '风险等级（Risk Level）：low-低风险（绿色）/medium-中风险（黄色）/high-高风险（红色），用于前端提示'
    })

    // is_visible - 是否在前端展示
    await queryInterface.addColumn('material_conversion_rules', 'is_visible', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: '前端可见（Is Visible）：true-前端可见/false-隐藏规则（仅后端内部使用）'
    })

    // ============================================
    // 4. 舍入控制字段（Rounding Control）
    // ============================================

    // rounding_mode - 尾数处理模式
    await queryInterface.addColumn('material_conversion_rules', 'rounding_mode', {
      type: Sequelize.ENUM('floor', 'ceil', 'round'),
      allowNull: false,
      defaultValue: 'floor',
      comment: '舍入模式（Rounding Mode）：floor-向下取整（默认保守）/ceil-向上取整/round-四舍五入'
    })

    // ============================================
    // 5. 审计字段（Audit Fields）
    // ============================================

    // updated_by - 最后更新人
    await queryInterface.addColumn('material_conversion_rules', 'updated_by', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
      comment: '最后更新人（Updated By）：记录规则最后更新者的 user_id，用于审计'
    })

    // ============================================
    // 6. 添加优化索引
    // ============================================

    // 索引：按可见性和生效时间查询（前端规则列表）
    await queryInterface.addIndex(
      'material_conversion_rules',
      ['is_visible', 'is_enabled', 'effective_at'],
      {
        name: 'idx_mcr_visible_enabled_effective',
        comment: '前端规则列表查询优化索引'
      }
    )

    // 索引：按手续费资产类型查询
    await queryInterface.addIndex('material_conversion_rules', ['fee_asset_code'], {
      name: 'idx_mcr_fee_asset_code',
      comment: '手续费资产类型查询优化索引'
    })

    // ============================================
    // 7. 更新现有规则数据（补充扩展字段默认值）
    // ============================================

    // 更新现有的 red_shard → DIAMOND 规则，补充展示信息
    await queryInterface.sequelize.query(`
      UPDATE material_conversion_rules 
      SET 
        title = '红晶片分解',
        description = '将红晶片分解为钻石，比例 1:20',
        risk_level = 'low',
        is_visible = true,
        rounding_mode = 'floor',
        min_from_amount = 1,
        fee_rate = 0.0000,
        fee_min_amount = 0
      WHERE from_asset_code = 'red_shard' AND to_asset_code = 'DIAMOND'
    `)

    console.log('✅ 材料转换规则表扩展成功：material_conversion_rules')
    console.log('   - 批次约束：min_from_amount, max_from_amount')
    console.log('   - 损耗建模：fee_rate, fee_min_amount, fee_asset_code')
    console.log('   - 前端展示：title, description, display_icon, risk_level, is_visible')
    console.log('   - 舍入控制：rounding_mode')
    console.log('   - 审计字段：updated_by')
    console.log('✅ 优化索引已添加')
    console.log('✅ 现有规则数据已更新')
  },

  /**
   * 回滚迁移
   *
   * @param {Sequelize.QueryInterface} queryInterface - Sequelize查询接口
   * @param {Sequelize} Sequelize - Sequelize实例
   * @returns {Promise<void>} 无返回值
   */
  down: async (queryInterface, Sequelize) => {
    // 删除索引
    await queryInterface.removeIndex(
      'material_conversion_rules',
      'idx_mcr_visible_enabled_effective'
    )
    await queryInterface.removeIndex('material_conversion_rules', 'idx_mcr_fee_asset_code')

    // 删除扩展字段
    await queryInterface.removeColumn('material_conversion_rules', 'min_from_amount')
    await queryInterface.removeColumn('material_conversion_rules', 'max_from_amount')
    await queryInterface.removeColumn('material_conversion_rules', 'fee_rate')
    await queryInterface.removeColumn('material_conversion_rules', 'fee_min_amount')
    await queryInterface.removeColumn('material_conversion_rules', 'fee_asset_code')
    await queryInterface.removeColumn('material_conversion_rules', 'title')
    await queryInterface.removeColumn('material_conversion_rules', 'description')
    await queryInterface.removeColumn('material_conversion_rules', 'display_icon')
    await queryInterface.removeColumn('material_conversion_rules', 'risk_level')
    await queryInterface.removeColumn('material_conversion_rules', 'is_visible')
    await queryInterface.removeColumn('material_conversion_rules', 'rounding_mode')
    await queryInterface.removeColumn('material_conversion_rules', 'updated_by')

    console.log('✅ 材料转换规则表扩展字段已回滚')
  }
}
