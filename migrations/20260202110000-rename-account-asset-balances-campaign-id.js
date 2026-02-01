'use strict'

/**
 * 迁移：统一 account_asset_balances 表的字段命名
 *
 * 重命名字段：
 * 1. campaign_id → lottery_campaign_id
 * 2. campaign_key → lottery_campaign_key（生成列，需要先删除再重建）
 *
 * 复杂性说明：
 * - campaign_key 是基于 campaign_id 的 GENERATED COLUMN
 * - 有唯一索引 uk_account_asset_campaign_key 依赖 campaign_key
 * - 有检查约束依赖 campaign_id
 * 必须按顺序处理这些依赖关系
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🔄 开始重命名 account_asset_balances 表的 campaign_id 字段...')

    try {
      // 1. 检查 campaign_id 字段是否存在
      const [columns] = await queryInterface.sequelize.query(
        `SHOW COLUMNS FROM account_asset_balances LIKE 'campaign_id'`
      )

      if (columns.length === 0) {
        console.log('⚠️ campaign_id 字段不存在，可能已经迁移过，跳过')
        return
      }

      // 2. 删除检查约束
      console.log('📋 步骤1: 删除检查约束...')
      try {
        await queryInterface.sequelize.query(
          `ALTER TABLE account_asset_balances DROP CONSTRAINT chk_budget_points_campaign`
        )
        console.log('  ✅ 删除检查约束 chk_budget_points_campaign')
      } catch (e) {
        try {
          await queryInterface.sequelize.query(
            `ALTER TABLE account_asset_balances DROP CHECK chk_budget_points_campaign`
          )
          console.log('  ✅ 删除检查约束 chk_budget_points_campaign (DROP CHECK)')
        } catch (e2) {
          console.log('  ⚠️ 检查约束不存在，跳过')
        }
      }

      // 3. 删除唯一索引（依赖生成列）
      console.log('📋 步骤2: 删除唯一索引...')
      try {
        await queryInterface.sequelize.query(
          `ALTER TABLE account_asset_balances DROP INDEX uk_account_asset_campaign_key`
        )
        console.log('  ✅ 删除唯一索引 uk_account_asset_campaign_key')
      } catch (e) {
        console.log('  ⚠️ 唯一索引不存在，跳过')
      }

      // 4. 删除生成列 campaign_key（依赖 campaign_id）
      console.log('📋 步骤3: 删除生成列 campaign_key...')
      try {
        await queryInterface.sequelize.query(
          `ALTER TABLE account_asset_balances DROP COLUMN campaign_key`
        )
        console.log('  ✅ 删除生成列 campaign_key')
      } catch (e) {
        console.log('  ⚠️ 生成列不存在，跳过')
      }

      // 5. 重命名 campaign_id → lottery_campaign_id
      console.log('📋 步骤4: 重命名 campaign_id → lottery_campaign_id...')
      await queryInterface.sequelize.query(
        `ALTER TABLE account_asset_balances 
         CHANGE COLUMN campaign_id lottery_campaign_id VARCHAR(50) 
         DEFAULT NULL 
         COMMENT '抽奖活动ID（仅 BUDGET_POINTS 需要，其他资产为 NULL）'`
      )
      console.log('  ✅ 重命名成功')

      // 6. 重新创建生成列（使用新字段名）
      console.log('📋 步骤5: 创建新生成列 lottery_campaign_key...')
      await queryInterface.sequelize.query(
        `ALTER TABLE account_asset_balances 
         ADD COLUMN lottery_campaign_key VARCHAR(50) 
         GENERATED ALWAYS AS (COALESCE(lottery_campaign_id, 'GLOBAL')) STORED 
         NOT NULL 
         COMMENT '抽奖活动键（自动生成）：COALESCE(lottery_campaign_id, GLOBAL)'`
      )
      console.log('  ✅ 创建生成列成功')

      // 7. 重新创建唯一索引
      console.log('📋 步骤6: 创建新唯一索引...')
      await queryInterface.sequelize.query(
        `ALTER TABLE account_asset_balances 
         ADD UNIQUE INDEX uk_account_asset_lottery_campaign_key (account_id, asset_code, lottery_campaign_key)`
      )
      console.log('  ✅ 创建唯一索引 uk_account_asset_lottery_campaign_key')

      // 8. 创建单列索引
      console.log('📋 步骤7: 创建单列索引...')
      try {
        await queryInterface.sequelize.query(
          `ALTER TABLE account_asset_balances 
           ADD INDEX idx_account_asset_balances_lottery_campaign_id (lottery_campaign_id)`
        )
        console.log('  ✅ 创建索引 idx_account_asset_balances_lottery_campaign_id')
      } catch (e) {
        console.log('  ⚠️ 索引已存在，跳过')
      }

      // 9. 重新创建检查约束
      console.log('📋 步骤8: 创建新检查约束...')
      try {
        await queryInterface.sequelize.query(
          `ALTER TABLE account_asset_balances 
           ADD CONSTRAINT chk_budget_points_lottery_campaign 
           CHECK (asset_code != 'BUDGET_POINTS' OR lottery_campaign_id IS NOT NULL)`
        )
        console.log('  ✅ 创建检查约束 chk_budget_points_lottery_campaign')
      } catch (e) {
        console.log('  ⚠️ 创建检查约束失败:', e.message)
      }

      console.log('✅ account_asset_balances 字段重命名完成')
    } catch (error) {
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('🔄 回滚：将 lottery_campaign_id 改回 campaign_id...')

    try {
      // 1. 删除新检查约束
      try {
        await queryInterface.sequelize.query(
          `ALTER TABLE account_asset_balances DROP CHECK chk_budget_points_lottery_campaign`
        )
      } catch (e) { /* ignore */ }

      // 2. 删除新索引
      try {
        await queryInterface.sequelize.query(
          `ALTER TABLE account_asset_balances DROP INDEX idx_account_asset_balances_lottery_campaign_id`
        )
      } catch (e) { /* ignore */ }

      // 3. 删除唯一索引
      try {
        await queryInterface.sequelize.query(
          `ALTER TABLE account_asset_balances DROP INDEX uk_account_asset_lottery_campaign_key`
        )
      } catch (e) { /* ignore */ }

      // 4. 删除生成列
      try {
        await queryInterface.sequelize.query(
          `ALTER TABLE account_asset_balances DROP COLUMN lottery_campaign_key`
        )
      } catch (e) { /* ignore */ }

      // 5. 重命名回原字段名
      await queryInterface.sequelize.query(
        `ALTER TABLE account_asset_balances 
         CHANGE COLUMN lottery_campaign_id campaign_id VARCHAR(50) 
         DEFAULT NULL 
         COMMENT '活动ID（仅 BUDGET_POINTS 需要，其他资产为 NULL）'`
      )

      // 6. 重建原生成列
      await queryInterface.sequelize.query(
        `ALTER TABLE account_asset_balances 
         ADD COLUMN campaign_key VARCHAR(50) 
         GENERATED ALWAYS AS (COALESCE(campaign_id, 'GLOBAL')) STORED 
         NOT NULL 
         COMMENT '活动键（自动生成）：COALESCE(campaign_id, GLOBAL)'`
      )

      // 7. 重建原唯一索引
      await queryInterface.sequelize.query(
        `ALTER TABLE account_asset_balances 
         ADD UNIQUE INDEX uk_account_asset_campaign_key (account_id, asset_code, campaign_key)`
      )

      // 8. 重建原检查约束
      try {
        await queryInterface.sequelize.query(
          `ALTER TABLE account_asset_balances 
           ADD CONSTRAINT chk_budget_points_campaign 
           CHECK (asset_code != 'BUDGET_POINTS' OR campaign_id IS NOT NULL)`
        )
      } catch (e) { /* ignore */ }

      console.log('✅ 回滚完成')
    } catch (error) {
      throw error
    }
  }
}
