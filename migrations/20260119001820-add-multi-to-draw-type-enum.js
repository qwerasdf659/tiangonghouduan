'use strict'

/**
 * 迁移：扩展 draw_type 枚举，添加 'multi' 值
 * 
 * 问题背景：
 * - SettleStage.js 中使用 draw_type = draw_count > 1 ? 'multi' : 'single'
 * - 但数据库枚举只有 ('single','triple','five','ten')，不包含 'multi'
 * - 连抽支持动态 draw_count 1-20，需要支持任意连抽类型
 * 
 * 解决方案：
 * - 添加 'multi' 到 draw_type 枚举
 * - 用于表示非固定档位的连抽（如 2连、4连、6连等）
 * 
 * @since 2026-01-19
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('[Migration] 扩展 draw_type 枚举，添加 multi 值...')
    
    // MySQL 修改 ENUM 需要用 CHANGE COLUMN
    await queryInterface.sequelize.query(`
      ALTER TABLE lottery_draws 
      MODIFY COLUMN draw_type ENUM('single', 'triple', 'five', 'ten', 'multi') 
      COMMENT '抽奖类型：single=单抽，triple=3连，five=5连，ten=10连，multi=其他连抽'
    `)
    
    console.log('[Migration] ✅ draw_type 枚举扩展完成')
    
    // 验证修改
    const [colInfo] = await queryInterface.sequelize.query(`
      SHOW COLUMNS FROM lottery_draws LIKE 'draw_type'
    `)
    console.log('[Migration] 验证结果:', colInfo[0]?.Type)
    
    return Promise.resolve()
  },

  async down(queryInterface, Sequelize) {
    console.log('[Rollback] 回滚 draw_type 枚举，移除 multi 值...')
    
    // 先将所有 'multi' 更新为 'single'（避免数据丢失）
    await queryInterface.sequelize.query(`
      UPDATE lottery_draws SET draw_type = 'single' WHERE draw_type = 'multi'
    `)
    
    // 恢复原枚举
    await queryInterface.sequelize.query(`
      ALTER TABLE lottery_draws 
      MODIFY COLUMN draw_type ENUM('single', 'triple', 'five', 'ten') 
      COMMENT '抽奖类型'
    `)
    
    console.log('[Rollback] ✅ draw_type 枚举回滚完成')
    
    return Promise.resolve()
  }
}
