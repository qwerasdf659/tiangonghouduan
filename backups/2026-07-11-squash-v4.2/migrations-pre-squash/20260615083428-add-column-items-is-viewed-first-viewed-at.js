'use strict'

/**
 * 添加列: items.is_viewed + items.first_viewed_at（背包物品「未读/已读」展示状态）
 *
 * 创建时间: 2026-06-15（北京时间）
 * 创建原因（议题二：仓库角标改「未读提醒」）:
 * - 首页「仓库」角标需从「物品总数」改为「未读提醒」（用户查看后清零）。
 * - 「未读/已读」是需持久化的展示状态，必须由后端权威记录（换设备/重装不丢）。
 *
 * 架构约束（物品三表互锁：items ↔ item_ledger ↔ item_holds）:
 * - 「是否已读」属纯展示状态，与持有/余额/锁定无关，做成 items 表独立列，可直接 UPDATE，
 *   不写入 item_ledger（账本流水）/ item_holds（锁定记录），不破坏互锁体系。
 *
 * 字段说明:
 * - is_viewed       TINYINT(1) NOT NULL DEFAULT 0  是否已查看（0=未读 1=已读）
 * - first_viewed_at DATETIME   NULL               首次查看时间（库内 UTC 存储，展示北京时间）
 * - 复合索引 idx_items_owner_status_viewed (owner_account_id, status, is_viewed)
 *   支撑「按持有者统计未读数」高频查询。已确认 items 现有索引无同名/同列组合，无重复。
 *
 * 存量回填: 现有 status='available' 物品回填为已读（is_viewed=1），
 *           避免上线瞬间历史物品全部计入未读、产生巨大角标冲击。
 *
 * 回滚: 删除复合索引 + 删除两列。
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()
    try {
      await queryInterface.addColumn(
        'items',
        'is_viewed',
        {
          type: Sequelize.TINYINT,
          allowNull: false,
          defaultValue: 0,
          comment: '是否已查看（0=未读 1=已读，纯展示状态，不入物品三表互锁）'
        },
        { transaction }
      )
      await queryInterface.addColumn(
        'items',
        'first_viewed_at',
        {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '首次查看时间（UTC 存储，北京时间展示）'
        },
        { transaction }
      )

      await queryInterface.addIndex('items', ['owner_account_id', 'status', 'is_viewed'], {
        name: 'idx_items_owner_status_viewed',
        transaction
      })

      // 存量回填：现有 available 物品视为已读，避免上线瞬间巨大未读角标
      await sequelize.query("UPDATE items SET is_viewed = 1 WHERE status = 'available'", {
        transaction
      })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()
    try {
      await queryInterface.removeIndex('items', 'idx_items_owner_status_viewed', { transaction })
      await queryInterface.removeColumn('items', 'first_viewed_at', { transaction })
      await queryInterface.removeColumn('items', 'is_viewed', { transaction })
      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
