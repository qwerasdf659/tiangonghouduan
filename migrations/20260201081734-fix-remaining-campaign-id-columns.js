'use strict'

/**
 * 补充迁移：修复遗漏的 campaign_id 字段重命名
 *
 * 需要重命名的表：
 * 1. lottery_presets.campaign_id → lottery_campaign_id
 * 2. lottery_campaign_quota_grants.campaign_id → lottery_campaign_id
 * 3. lottery_user_daily_draw_quota.campaign_id → lottery_campaign_id
 * 4. preset_budget_debt.campaign_id → lottery_campaign_id
 * 5. preset_inventory_debt.campaign_id → lottery_campaign_id
 *
 * 注意：account_asset_balances.campaign_id 是 VARCHAR(50) 类型的业务标识符，不是技术外键，保持不变
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🔄 开始补充修复遗漏的 campaign_id 字段重命名...')

    // 需要重命名的表和字段
    const tablesToFix = [
      {
        table: 'lottery_presets',
        oldColumn: 'campaign_id',
        newColumn: 'lottery_campaign_id',
        type: 'INT',
        allowNull: true
      },
      {
        table: 'lottery_campaign_quota_grants',
        oldColumn: 'campaign_id',
        newColumn: 'lottery_campaign_id',
        type: 'INT',
        allowNull: false
      },
      {
        table: 'lottery_user_daily_draw_quota',
        oldColumn: 'campaign_id',
        newColumn: 'lottery_campaign_id',
        type: 'INT',
        allowNull: false
      },
      {
        table: 'preset_budget_debt',
        oldColumn: 'campaign_id',
        newColumn: 'lottery_campaign_id',
        type: 'INT',
        allowNull: false
      },
      {
        table: 'preset_inventory_debt',
        oldColumn: 'campaign_id',
        newColumn: 'lottery_campaign_id',
        type: 'INT',
        allowNull: false
      }
    ]

    // 还需要修复 prize_id → lottery_prize_id
    const prizeFixes = [
      {
        table: 'preset_inventory_debt',
        oldColumn: 'prize_id',
        newColumn: 'lottery_prize_id',
        type: 'INT',
        allowNull: false
      }
    ]

    // 还需要修复 preset_id → lottery_preset_id
    const presetFixes = [
      {
        table: 'preset_budget_debt',
        oldColumn: 'preset_id',
        newColumn: 'lottery_preset_id',
        type: 'INT',
        allowNull: false
      },
      {
        table: 'preset_inventory_debt',
        oldColumn: 'preset_id',
        newColumn: 'lottery_preset_id',
        type: 'INT',
        allowNull: false
      }
    ]

    const allFixes = [...tablesToFix, ...prizeFixes, ...presetFixes]

    for (const fix of allFixes) {
      try {
        // 检查表是否存在
        const [tables] = await queryInterface.sequelize.query(
          `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${fix.table}'`
        )

        if (tables.length === 0) {
          console.log(`  ⏭️ 跳过 ${fix.table}：表不存在`)
          continue
        }

        // 检查旧列是否存在
        const [columns] = await queryInterface.sequelize.query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${fix.table}' AND COLUMN_NAME = '${fix.oldColumn}'`
        )

        if (columns.length === 0) {
          console.log(`  ⏭️ 跳过 ${fix.table}.${fix.oldColumn}：列不存在（可能已重命名）`)
          continue
        }

        // 检查新列是否已存在
        const [newColumns] = await queryInterface.sequelize.query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${fix.table}' AND COLUMN_NAME = '${fix.newColumn}'`
        )

        if (newColumns.length > 0) {
          console.log(`  ⏭️ 跳过 ${fix.table}.${fix.oldColumn}：新列 ${fix.newColumn} 已存在`)
          continue
        }

        // 重命名列
        const nullClause = fix.allowNull ? 'NULL' : 'NOT NULL'
        await queryInterface.sequelize.query(
          `ALTER TABLE ${fix.table} CHANGE COLUMN ${fix.oldColumn} ${fix.newColumn} ${fix.type} ${nullClause}`
        )
        console.log(`  ✅ ${fix.table}: ${fix.oldColumn} → ${fix.newColumn}`)
      } catch (error) {
        console.error(`  ❌ ${fix.table}.${fix.oldColumn} 重命名失败:`, error.message)
        throw error
      }
    }

    console.log('✅ 补充迁移完成')
  },

  async down(queryInterface, Sequelize) {
    console.log('🔄 开始回滚补充迁移...')

    // 回滚重命名
    const rollbackFixes = [
      { table: 'lottery_presets', oldColumn: 'lottery_campaign_id', newColumn: 'campaign_id', type: 'INT', allowNull: true },
      { table: 'lottery_campaign_quota_grants', oldColumn: 'lottery_campaign_id', newColumn: 'campaign_id', type: 'INT', allowNull: false },
      { table: 'lottery_user_daily_draw_quota', oldColumn: 'lottery_campaign_id', newColumn: 'campaign_id', type: 'INT', allowNull: false },
      { table: 'preset_budget_debt', oldColumn: 'lottery_campaign_id', newColumn: 'campaign_id', type: 'INT', allowNull: false },
      { table: 'preset_inventory_debt', oldColumn: 'lottery_campaign_id', newColumn: 'campaign_id', type: 'INT', allowNull: false },
      { table: 'preset_inventory_debt', oldColumn: 'lottery_prize_id', newColumn: 'prize_id', type: 'INT', allowNull: false },
      { table: 'preset_budget_debt', oldColumn: 'lottery_preset_id', newColumn: 'preset_id', type: 'INT', allowNull: false },
      { table: 'preset_inventory_debt', oldColumn: 'lottery_preset_id', newColumn: 'preset_id', type: 'INT', allowNull: false }
    ]

    for (const fix of rollbackFixes) {
      try {
        const [columns] = await queryInterface.sequelize.query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${fix.table}' AND COLUMN_NAME = '${fix.oldColumn}'`
        )

        if (columns.length === 0) {
          console.log(`  ⏭️ 跳过 ${fix.table}.${fix.oldColumn}：列不存在`)
          continue
        }

        const nullClause = fix.allowNull ? 'NULL' : 'NOT NULL'
        await queryInterface.sequelize.query(
          `ALTER TABLE ${fix.table} CHANGE COLUMN ${fix.oldColumn} ${fix.newColumn} ${fix.type} ${nullClause}`
        )
        console.log(`  ✅ ${fix.table}: ${fix.oldColumn} → ${fix.newColumn}`)
      } catch (error) {
        console.error(`  ❌ 回滚失败:`, error.message)
      }
    }

    console.log('✅ 回滚完成')
  }
}
