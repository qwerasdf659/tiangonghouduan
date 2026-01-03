/**
 * 数据库迁移：BUDGET_POINTS 预算积分架构
 *
 * 迁移说明：
 * - 实现双账户模型：POINTS（抽奖资格）+ BUDGET_POINTS（奖品预算）
 * - 为 lottery_campaigns 表添加预算模式相关字段
 * - 创建 SYSTEM_CAMPAIGN_POOL 系统账户（用于活动池预算管理）
 *
 * 业务背景：
 * - POINTS：用户消费获得，控制"能否抽奖"（抽奖资格）
 * - BUDGET_POINTS：平台从消费抽成划拨，控制"能抽到什么"（奖品预算）
 * - 每个活动必须配置 budget_mode 确定预算来源
 *
 * 预算模式（budget_mode）：
 * - user：从用户预算账户扣减（用户自己的 BUDGET_POINTS）
 * - pool：从活动池预算扣减（SYSTEM_CAMPAIGN_POOL 账户）
 * - none：不限制预算（测试用途，生产禁用）
 *
 * 变更内容：
 * 1. lottery_campaigns 添加 budget_mode 字段（预算模式）
 * 2. lottery_campaigns 添加 pool_budget_total 字段（活动池总预算）
 * 3. lottery_campaigns 添加 pool_budget_remaining 字段（活动池剩余预算）
 * 4. lottery_campaigns 添加 allowed_campaign_ids 字段（允许使用的用户预算来源）
 * 5. 创建 SYSTEM_CAMPAIGN_POOL 系统账户
 *
 * 创建时间：2026-01-03
 * 影响表：lottery_campaigns, accounts, account_asset_balances
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：添加预算积分架构
   */
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🎯 开始执行 BUDGET_POINTS 预算积分架构迁移...')
      console.log('📋 业务场景：双账户模型 - POINTS（抽奖资格）+ BUDGET_POINTS（奖品预算）')

      // ========== 步骤1：添加 budget_mode 字段 ==========
      console.log('\n📌 步骤1：添加 budget_mode 字段（预算模式）...')

      // 检查字段是否已存在
      const [existingBudgetMode] = await queryInterface.sequelize.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'lottery_campaigns'
         AND COLUMN_NAME = 'budget_mode'`,
        { transaction }
      )

      if (existingBudgetMode.length === 0) {
        await queryInterface.addColumn(
          'lottery_campaigns',
          'budget_mode',
          {
            type: Sequelize.ENUM('user', 'pool', 'none'),
            allowNull: false,
            defaultValue: 'user',
            comment:
              '预算模式：user=用户预算账户扣减，pool=活动池预算扣减，none=不限制预算（测试用）',
            after: 'status'
          },
          { transaction }
        )
        console.log('✅ budget_mode 字段添加成功（默认值：user）')
      } else {
        console.log('⏭️ budget_mode 字段已存在，跳过添加')
      }

      // ========== 步骤2：添加 pool_budget_total 字段 ==========
      console.log('\n📌 步骤2：添加 pool_budget_total 字段（活动池总预算）...')

      const [existingPoolTotal] = await queryInterface.sequelize.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'lottery_campaigns'
         AND COLUMN_NAME = 'pool_budget_total'`,
        { transaction }
      )

      if (existingPoolTotal.length === 0) {
        await queryInterface.addColumn(
          'lottery_campaigns',
          'pool_budget_total',
          {
            type: Sequelize.BIGINT,
            allowNull: true,
            defaultValue: null,
            comment: '活动池总预算（仅 budget_mode=pool 时使用）',
            after: 'budget_mode'
          },
          { transaction }
        )
        console.log('✅ pool_budget_total 字段添加成功')
      } else {
        console.log('⏭️ pool_budget_total 字段已存在，跳过添加')
      }

      // ========== 步骤3：添加 pool_budget_remaining 字段 ==========
      console.log('\n📌 步骤3：添加 pool_budget_remaining 字段（活动池剩余预算）...')

      const [existingPoolRemaining] = await queryInterface.sequelize.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'lottery_campaigns'
         AND COLUMN_NAME = 'pool_budget_remaining'`,
        { transaction }
      )

      if (existingPoolRemaining.length === 0) {
        await queryInterface.addColumn(
          'lottery_campaigns',
          'pool_budget_remaining',
          {
            type: Sequelize.BIGINT,
            allowNull: true,
            defaultValue: null,
            comment: '活动池剩余预算（仅 budget_mode=pool 时使用，实时扣减）',
            after: 'pool_budget_total'
          },
          { transaction }
        )
        console.log('✅ pool_budget_remaining 字段添加成功')
      } else {
        console.log('⏭️ pool_budget_remaining 字段已存在，跳过添加')
      }

      // ========== 步骤4：添加 allowed_campaign_ids 字段 ==========
      console.log('\n📌 步骤4：添加 allowed_campaign_ids 字段（允许使用的用户预算来源）...')

      const [existingAllowedIds] = await queryInterface.sequelize.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'lottery_campaigns'
         AND COLUMN_NAME = 'allowed_campaign_ids'`,
        { transaction }
      )

      if (existingAllowedIds.length === 0) {
        await queryInterface.addColumn(
          'lottery_campaigns',
          'allowed_campaign_ids',
          {
            type: Sequelize.JSON,
            allowNull: true,
            defaultValue: null,
            comment: '允许使用的用户预算来源活动ID列表（JSON数组，仅 budget_mode=user 时使用）',
            after: 'pool_budget_remaining'
          },
          { transaction }
        )
        console.log('✅ allowed_campaign_ids 字段添加成功')
      } else {
        console.log('⏭️ allowed_campaign_ids 字段已存在，跳过添加')
      }

      // ========== 步骤5：创建 SYSTEM_CAMPAIGN_POOL 系统账户 ==========
      console.log('\n📌 步骤5：创建 SYSTEM_CAMPAIGN_POOL 系统账户...')

      // 检查账户是否已存在
      const [existingAccount] = await queryInterface.sequelize.query(
        `SELECT account_id FROM accounts
         WHERE account_type = 'system' AND system_code = 'SYSTEM_CAMPAIGN_POOL'`,
        { transaction }
      )

      if (existingAccount.length === 0) {
        await queryInterface.sequelize.query(
          `INSERT INTO accounts (account_type, system_code, status, created_at, updated_at)
           VALUES ('system', 'SYSTEM_CAMPAIGN_POOL', 'active', NOW(), NOW())`,
          { transaction }
        )
        console.log('✅ SYSTEM_CAMPAIGN_POOL 系统账户创建成功')
      } else {
        console.log('⏭️ SYSTEM_CAMPAIGN_POOL 系统账户已存在，跳过创建')
      }

      // ========== 步骤6：为现有活动设置默认预算模式 ==========
      console.log('\n📌 步骤6：为现有活动设置默认预算模式...')

      // 将现有活动的 budget_mode 设置为 'user'（用户预算模式）
      const [updateResult] = await queryInterface.sequelize.query(
        `UPDATE lottery_campaigns SET budget_mode = 'user' WHERE budget_mode IS NULL`,
        { transaction }
      )

      console.log(`✅ 已更新 ${updateResult.affectedRows || 0} 个活动的预算模式为 'user'`)

      // ========== 步骤7：验证迁移结果 ==========
      console.log('\n📌 步骤7：验证迁移结果...')

      // 验证字段存在
      const [columns] = await queryInterface.sequelize.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'lottery_campaigns'
         AND COLUMN_NAME IN ('budget_mode', 'pool_budget_total', 'pool_budget_remaining', 'allowed_campaign_ids')`,
        { transaction }
      )

      // 验证系统账户存在
      const [sysAccount] = await queryInterface.sequelize.query(
        `SELECT account_id, system_code FROM accounts
         WHERE account_type = 'system' AND system_code = 'SYSTEM_CAMPAIGN_POOL'`,
        { transaction }
      )

      console.log(`✅ lottery_campaigns 表新增 ${columns.length} 个字段`)
      console.log(`✅ SYSTEM_CAMPAIGN_POOL 账户已存在：account_id=${sysAccount[0]?.account_id}`)

      // 提交事务
      await transaction.commit()

      console.log('\n🎉 BUDGET_POINTS 预算积分架构迁移执行完成！')
      console.log('📋 后续步骤：')
      console.log('   1. 修改 AssetService 支持 campaign_id 参数')
      console.log('   2. 修改 ConsumptionService 发放预算时传 campaign_id')
      console.log('   3. 修改 BasicGuaranteeStrategy 使用 BUDGET_POINTS 筛奖')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移执行失败，已回滚：', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移
   */
  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始回滚 BUDGET_POINTS 预算积分架构迁移...')

      // 删除字段（逆序）
      const columnsToRemove = [
        'allowed_campaign_ids',
        'pool_budget_remaining',
        'pool_budget_total',
        'budget_mode'
      ]

      for (const column of columnsToRemove) {
        const [exists] = await queryInterface.sequelize.query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'lottery_campaigns'
           AND COLUMN_NAME = '${column}'`,
          { transaction }
        )

        if (exists.length > 0) {
          await queryInterface.removeColumn('lottery_campaigns', column, { transaction })
          console.log(`✅ 删除字段：${column}`)
        }
      }

      // 删除 ENUM 类型（如果存在）
      await queryInterface.sequelize
        .query(`DROP TYPE IF EXISTS enum_lottery_campaigns_budget_mode`, { transaction })
        .catch(() => {
          // MySQL 不需要显式删除 ENUM 类型
        })

      // 注意：不删除 SYSTEM_CAMPAIGN_POOL 系统账户（可能有历史数据关联）
      console.log('⚠️ SYSTEM_CAMPAIGN_POOL 系统账户保留（防止历史数据关联丢失）')

      await transaction.commit()
      console.log('🎉 回滚完成！')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败：', error.message)
      throw error
    }
  }
}
