'use strict';

/**
 * 数据库迁移：添加 lottery_draw_decisions 表缺失字段
 * 
 * 背景：模型定义中有以下字段，但数据库表中不存在
 * - original_tier: 原始命中档位（降级前）
 * - final_tier: 最终发放档位（降级后）
 * - downgrade_count: 降级次数
 * - fallback_triggered: 是否触发兜底逻辑
 * 
 * @module migrations/add-missing-decision-fields
 * @version 1.0.0
 * @since 2026-01-21
 */

module.exports = {
  /**
   * 执行迁移 - 添加缺失的字段
   * @param {QueryInterface} queryInterface - Sequelize 查询接口
   * @param {Sequelize} Sequelize - Sequelize 类
   */
  async up(queryInterface, Sequelize) {
    console.log('📦 开始添加 lottery_draw_decisions 表缺失字段...');
    
    // 添加 original_tier 字段 - 原始命中档位（降级前）
    await queryInterface.addColumn('lottery_draw_decisions', 'original_tier', {
      type: Sequelize.ENUM('high', 'mid', 'low'),
      allowNull: true,
      comment: '原始命中档位（降级前）',
      after: 'matched_reason'
    });
    console.log('  ✅ 已添加 original_tier 字段');
    
    // 添加 final_tier 字段 - 最终发放档位（降级后）
    await queryInterface.addColumn('lottery_draw_decisions', 'final_tier', {
      type: Sequelize.ENUM('high', 'mid', 'low', 'fallback'),
      allowNull: true,
      comment: '最终发放档位（降级后）',
      after: 'original_tier'
    });
    console.log('  ✅ 已添加 final_tier 字段');
    
    // 添加 downgrade_count 字段 - 降级次数
    await queryInterface.addColumn('lottery_draw_decisions', 'downgrade_count', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '降级次数（0=未降级）',
      after: 'final_tier'
    });
    console.log('  ✅ 已添加 downgrade_count 字段');
    
    // 添加 fallback_triggered 字段 - 是否触发兜底逻辑
    await queryInterface.addColumn('lottery_draw_decisions', 'fallback_triggered', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '是否触发兜底逻辑',
      after: 'downgrade_count'
    });
    console.log('  ✅ 已添加 fallback_triggered 字段');
    
    console.log('✅ 迁移完成：已添加 4 个缺失字段');
  },

  /**
   * 回滚迁移 - 删除添加的字段
   * @param {QueryInterface} queryInterface - Sequelize 查询接口
   * @param {Sequelize} Sequelize - Sequelize 类
   */
  async down(queryInterface, Sequelize) {
    console.log('🔄 回滚：删除 lottery_draw_decisions 表新增字段...');
    
    // 按添加的相反顺序删除
    await queryInterface.removeColumn('lottery_draw_decisions', 'fallback_triggered');
    console.log('  ✅ 已删除 fallback_triggered 字段');
    
    await queryInterface.removeColumn('lottery_draw_decisions', 'downgrade_count');
    console.log('  ✅ 已删除 downgrade_count 字段');
    
    await queryInterface.removeColumn('lottery_draw_decisions', 'final_tier');
    console.log('  ✅ 已删除 final_tier 字段');
    
    await queryInterface.removeColumn('lottery_draw_decisions', 'original_tier');
    console.log('  ✅ 已删除 original_tier 字段');
    
    console.log('✅ 回滚完成');
  }
};
