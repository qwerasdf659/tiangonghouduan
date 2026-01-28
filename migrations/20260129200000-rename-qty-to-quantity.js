'use strict'

/**
 * 数据库迁移：重命名 max_inventory_debt_qty → max_inventory_debt_quantity
 *
 * @description 技术债务清理 - 消除缩写字段名，使用完整单词
 * @date 2026-01-29
 * @issue P1 必须修复 - 语义优先原则排查报告
 *
 * 变更说明：
 * - 将 lottery_campaigns.max_inventory_debt_qty 重命名为 max_inventory_debt_quantity
 * - 符合阿里/腾讯数据库命名规范：禁止使用缩写，使用完整单词
 *
 * 影响范围：
 * - 表：lottery_campaigns
 * - 字段：max_inventory_debt_qty → max_inventory_debt_quantity
 * - 模型：LotteryCampaign.js（需同步修改）
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  /**
   * 升级迁移：重命名字段 qty → quantity
   * @param {import('sequelize').QueryInterface} queryInterface
   * @param {import('sequelize').Sequelize} Sequelize
   */
  async up(queryInterface, Sequelize) {
    console.log('📝 开始迁移：重命名 max_inventory_debt_qty → max_inventory_debt_quantity')

    // 检查源字段是否存在
    const tableInfo = await queryInterface.describeTable('lottery_campaigns')

    if (tableInfo.max_inventory_debt_qty) {
      // 使用原生 SQL 重命名列（Sequelize 的 renameColumn 在某些版本有兼容性问题）
      await queryInterface.sequelize.query(`
        ALTER TABLE lottery_campaigns 
        CHANGE COLUMN max_inventory_debt_qty max_inventory_debt_quantity INT NOT NULL DEFAULT 0 
        COMMENT '该活动库存欠账总数量上限（0=不限制，强烈不推荐）'
      `)
      console.log('✅ 字段重命名完成：max_inventory_debt_qty → max_inventory_debt_quantity')
    } else if (tableInfo.max_inventory_debt_quantity) {
      console.log('⚠️ 字段 max_inventory_debt_quantity 已存在，跳过迁移')
    } else {
      console.log('⚠️ 源字段 max_inventory_debt_qty 不存在，跳过迁移')
    }
  },

  /**
   * 回滚迁移：恢复字段名 quantity → qty
   * @param {import('sequelize').QueryInterface} queryInterface
   * @param {import('sequelize').Sequelize} Sequelize
   */
  async down(queryInterface, Sequelize) {
    console.log('📝 回滚迁移：恢复 max_inventory_debt_quantity → max_inventory_debt_qty')

    const tableInfo = await queryInterface.describeTable('lottery_campaigns')

    if (tableInfo.max_inventory_debt_quantity) {
      await queryInterface.sequelize.query(`
        ALTER TABLE lottery_campaigns 
        CHANGE COLUMN max_inventory_debt_quantity max_inventory_debt_qty INT NOT NULL DEFAULT 0 
        COMMENT '该活动库存欠账总数量上限（0=不限制，强烈不推荐）'
      `)
      console.log('✅ 字段回滚完成：max_inventory_debt_quantity → max_inventory_debt_qty')
    } else {
      console.log('⚠️ 字段 max_inventory_debt_quantity 不存在，跳过回滚')
    }
  }
}

