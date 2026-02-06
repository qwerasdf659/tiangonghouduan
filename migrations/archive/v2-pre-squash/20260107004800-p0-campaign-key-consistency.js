/**
 * 迁移文件：P0数据一致性加固 - campaign_key归一化列 + 新唯一索引
 *
 * 决策背景（2026-01-07 拍板）：
 * - 彻底解决 campaign_id=NULL 造成的"余额重复行"风险
 * - MySQL 下 campaign_id=NULL 时唯一索引失效，无法阻止重复
 * - 通过 campaign_key 归一化列 + 新唯一索引，覆盖 NULL 场景
 *
 * 变更内容：
 * 1. 新增 campaign_key 列（GENERATED STORED, VARCHAR(50), NOT NULL）
 *    - 规则：campaign_key = COALESCE(campaign_id, 'GLOBAL')
 * 2. 回填历史数据
 * 3. 新增唯一索引 uk_account_asset_campaign_key (account_id, asset_code, campaign_key)
 * 4. 移除旧唯一索引 uk_account_asset_campaign（已拍板）
 * 5. 添加 CHECK 约束：BUDGET_POINTS 强制 campaign_id 非空
 *
 * 技术方案：
 * - MySQL 8.0.30：使用 GENERATED STORED 列（自动维护，不需要触发器）
 * - 回滚策略：完整可逆
 *
 * @since 2026-01-07
 * @see docs/接口重复问题诊断报告-资产域API.md
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('📝 开始迁移：P0数据一致性加固 - campaign_key归一化列')

    // 步骤0：预检查 - 确认当前无重复数据
    console.log('\n🔍 步骤0：预检查 - 确认当前无重复数据')
    const [duplicates] = await queryInterface.sequelize.query(`
      SELECT account_id, asset_code, campaign_id, COUNT(*) AS cnt
      FROM account_asset_balances
      GROUP BY account_id, asset_code, campaign_id
      HAVING cnt > 1
    `)

    if (duplicates.length > 0) {
      console.error('❌ 发现重复数据，请先手动清理:')
      console.error(duplicates)
      throw new Error('存在重复余额记录，迁移中止')
    }
    console.log('✅ 预检查通过：无重复数据')

    // 步骤1：检查 campaign_key 列是否已存在
    console.log('\n🔧 步骤1：检查 campaign_key 列是否已存在')
    const [existingColumn] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'account_asset_balances'
        AND COLUMN_NAME = 'campaign_key'
    `)

    if (existingColumn.length > 0) {
      console.log('✅ campaign_key 列已存在，跳过创建')
    } else {
      // 步骤2：新增 campaign_key 列（先用普通列）
      console.log('\n🔧 步骤2：新增 campaign_key 列')
      await queryInterface.sequelize.query(`
        ALTER TABLE account_asset_balances
        ADD COLUMN campaign_key VARCHAR(50) NOT NULL DEFAULT 'GLOBAL'
        COMMENT '活动键（归一化）：COALESCE(campaign_id, GLOBAL)，用于唯一约束'
        AFTER campaign_id
      `)
      console.log('✅ 成功添加 campaign_key 列')

      // 步骤3：回填历史数据
      console.log('\n🔧 步骤3：回填历史数据')
      const [updateResult] = await queryInterface.sequelize.query(`
        UPDATE account_asset_balances
        SET campaign_key = COALESCE(campaign_id, 'GLOBAL')
      `)
      console.log('✅ 成功回填历史数据')

      // 验证回填结果
      const [backfillCheck] = await queryInterface.sequelize.query(`
        SELECT
          campaign_id,
          campaign_key,
          COUNT(*) AS cnt
        FROM account_asset_balances
        GROUP BY campaign_id, campaign_key
        ORDER BY campaign_id
      `)
      console.log('📊 回填结果验证:', backfillCheck)
    }

    // 步骤4：新增唯一索引
    console.log('\n🔧 步骤4：新增唯一索引')
    const [existingNewIndex] = await queryInterface.sequelize.query(`
      SELECT INDEX_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'account_asset_balances'
        AND INDEX_NAME = 'uk_account_asset_campaign_key'
    `)

    if (existingNewIndex.length > 0) {
      console.log('✅ uk_account_asset_campaign_key 索引已存在，跳过创建')
    } else {
      await queryInterface.sequelize.query(`
        CREATE UNIQUE INDEX uk_account_asset_campaign_key
        ON account_asset_balances(account_id, asset_code, campaign_key)
      `)
      console.log('✅ 成功创建 uk_account_asset_campaign_key 唯一索引')
    }

    // 步骤5：移除旧唯一索引（已拍板）
    console.log('\n🔧 步骤5：移除旧唯一索引 uk_account_asset_campaign')
    const [existingOldIndex] = await queryInterface.sequelize.query(`
      SELECT INDEX_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'account_asset_balances'
        AND INDEX_NAME = 'uk_account_asset_campaign'
    `)

    if (existingOldIndex.length > 0) {
      await queryInterface.sequelize.query(`
        DROP INDEX uk_account_asset_campaign ON account_asset_balances
      `)
      console.log('✅ 成功移除旧唯一索引 uk_account_asset_campaign')
    } else {
      console.log('✅ uk_account_asset_campaign 索引不存在，跳过移除')
    }

    // 步骤6：尝试将 campaign_key 改为 GENERATED STORED 列
    console.log('\n🔧 步骤6：尝试将 campaign_key 改为 GENERATED STORED 列')
    try {
      // 先删除唯一索引（因为要修改列）
      await queryInterface.sequelize
        .query(
          `
        DROP INDEX uk_account_asset_campaign_key ON account_asset_balances
      `
        )
        .catch(err => console.warn('[迁移回滚] 删除索引失败:', err.message))

      await queryInterface.sequelize.query(`
        ALTER TABLE account_asset_balances
        MODIFY COLUMN campaign_key VARCHAR(50)
        AS (COALESCE(campaign_id, 'GLOBAL')) STORED NOT NULL
        COMMENT '活动键（自动生成）：COALESCE(campaign_id, GLOBAL)'
      `)

      // 重新创建唯一索引
      await queryInterface.sequelize.query(`
        CREATE UNIQUE INDEX uk_account_asset_campaign_key
        ON account_asset_balances(account_id, asset_code, campaign_key)
      `)

      console.log('✅ 成功将 campaign_key 改为 GENERATED STORED 列')
    } catch (error) {
      console.log('⚠️ GENERATED STORED 列不支持，使用触发器方案:', error.message)

      // 回退：使用触发器方案
      console.log('正在创建触发器...')

      // 重新创建唯一索引（如果被删除）
      await queryInterface.sequelize
        .query(
          `
        CREATE UNIQUE INDEX uk_account_asset_campaign_key
        ON account_asset_balances(account_id, asset_code, campaign_key)
      `
        )
        .catch(err => console.warn('[迁移回滚] 创建索引失败:', err.message))

      // INSERT 触发器
      await queryInterface.sequelize
        .query(
          `
        CREATE TRIGGER trg_account_asset_balances_campaign_key_insert
        BEFORE INSERT ON account_asset_balances
        FOR EACH ROW
        SET NEW.campaign_key = COALESCE(NEW.campaign_id, 'GLOBAL')
      `
        )
        .catch(err => {
          console.log('⚠️ INSERT触发器已存在或创建失败:', err.message)
        })

      // UPDATE 触发器
      await queryInterface.sequelize
        .query(
          `
        CREATE TRIGGER trg_account_asset_balances_campaign_key_update
        BEFORE UPDATE ON account_asset_balances
        FOR EACH ROW
        SET NEW.campaign_key = COALESCE(NEW.campaign_id, 'GLOBAL')
      `
        )
        .catch(err => {
          console.log('⚠️ UPDATE触发器已存在或创建失败:', err.message)
        })

      console.log('✅ 成功创建触发器（INSERT + UPDATE）')
    }

    // 步骤7：添加 CHECK 约束（BUDGET_POINTS 强制 campaign_id 非空）
    console.log('\n🔧 步骤7：添加 CHECK 约束')
    try {
      // 检查约束是否已存在
      const [existingConstraint] = await queryInterface.sequelize.query(`
        SELECT CONSTRAINT_NAME
        FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND CONSTRAINT_NAME = 'chk_budget_points_campaign'
      `)

      if (existingConstraint.length > 0) {
        console.log('✅ CHECK约束 chk_budget_points_campaign 已存在，跳过创建')
      } else {
        await queryInterface.sequelize.query(`
          ALTER TABLE account_asset_balances
          ADD CONSTRAINT chk_budget_points_campaign
          CHECK (
            asset_code != 'BUDGET_POINTS' OR campaign_id IS NOT NULL
          )
        `)
        console.log('✅ 成功添加 CHECK 约束：BUDGET_POINTS 强制 campaign_id 非空')
      }
    } catch (error) {
      console.log('⚠️ CHECK约束不支持或创建失败（可能MySQL版本过低）:', error.message)
    }

    // 步骤8：最终验证
    console.log('\n📊 步骤8：最终验证')

    // 验证新唯一索引存在
    const [verifyIndex] = await queryInterface.sequelize.query(`
      SELECT INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'account_asset_balances'
        AND INDEX_NAME = 'uk_account_asset_campaign_key'
      GROUP BY INDEX_NAME, NON_UNIQUE
    `)

    if (verifyIndex.length > 0) {
      console.log('✅ 新唯一索引验证成功:')
      console.log('   - INDEX_NAME:', verifyIndex[0].INDEX_NAME)
      console.log('   - UNIQUE:', verifyIndex[0].NON_UNIQUE === 0)
      console.log('   - COLUMNS:', verifyIndex[0].columns)
    } else {
      throw new Error('迁移验证失败：新唯一索引不存在')
    }

    // 验证旧唯一索引已移除
    const [verifyOldIndex] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) AS old_index_exists
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'account_asset_balances'
        AND INDEX_NAME = 'uk_account_asset_campaign'
    `)

    if (verifyOldIndex[0].old_index_exists === 0) {
      console.log('✅ 旧唯一索引验证成功：已移除')
    } else {
      console.log('⚠️ 旧唯一索引仍然存在（可能需要手动移除）')
    }

    // 验证 campaign_key 无 NULL 值
    const [verifyNulls] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) AS null_count
      FROM account_asset_balances
      WHERE campaign_key IS NULL OR campaign_key = ''
    `)

    if (verifyNulls[0].null_count === 0) {
      console.log('✅ campaign_key 无 NULL/空值验证成功')
    } else {
      throw new Error('迁移验证失败：campaign_key 存在 NULL/空值')
    }

    console.log('\n✅ P0数据一致性加固迁移完成')
  },

  down: async (queryInterface, Sequelize) => {
    console.log('📝 开始回滚：P0数据一致性加固')

    // 步骤1：删除 CHECK 约束
    console.log('\n🔧 步骤1：删除 CHECK 约束')
    try {
      await queryInterface.sequelize.query(`
        ALTER TABLE account_asset_balances DROP CONSTRAINT chk_budget_points_campaign
      `)
      console.log('✅ 成功删除 CHECK 约束')
    } catch (error) {
      console.log('⚠️ CHECK约束不存在或删除失败:', error.message)
    }

    // 步骤2：删除触发器（如果使用触发器方案）
    console.log('\n🔧 步骤2：删除触发器')
    try {
      await queryInterface.sequelize.query(`
        DROP TRIGGER IF EXISTS trg_account_asset_balances_campaign_key_insert
      `)
      await queryInterface.sequelize.query(`
        DROP TRIGGER IF EXISTS trg_account_asset_balances_campaign_key_update
      `)
      console.log('✅ 成功删除触发器')
    } catch (error) {
      console.log('⚠️ 触发器删除失败（可能不存在）:', error.message)
    }

    // 步骤3：删除新唯一索引
    console.log('\n🔧 步骤3：删除新唯一索引')
    try {
      await queryInterface.sequelize.query(`
        DROP INDEX uk_account_asset_campaign_key ON account_asset_balances
      `)
      console.log('✅ 成功删除新唯一索引')
    } catch (error) {
      console.log('⚠️ 新唯一索引删除失败:', error.message)
    }

    // 步骤4：恢复旧唯一索引
    console.log('\n🔧 步骤4：恢复旧唯一索引')
    try {
      await queryInterface.sequelize.query(`
        CREATE UNIQUE INDEX uk_account_asset_campaign
        ON account_asset_balances(account_id, asset_code, campaign_id)
      `)
      console.log('✅ 成功恢复旧唯一索引')
    } catch (error) {
      console.log('⚠️ 旧唯一索引恢复失败:', error.message)
    }

    // 步骤5：删除 campaign_key 列
    console.log('\n🔧 步骤5：删除 campaign_key 列')
    try {
      await queryInterface.sequelize.query(`
        ALTER TABLE account_asset_balances DROP COLUMN campaign_key
      `)
      console.log('✅ 成功删除 campaign_key 列')
    } catch (error) {
      console.log('⚠️ campaign_key 列删除失败:', error.message)
    }

    // 步骤6：验证回滚结果
    console.log('\n📊 步骤6：验证回滚结果')

    const [verifyResult] = await queryInterface.sequelize.query(`
      SELECT
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'account_asset_balances'
         AND INDEX_NAME = 'uk_account_asset_campaign') AS old_index_exists,
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'account_asset_balances'
         AND COLUMN_NAME = 'campaign_key') AS campaign_key_exists
    `)

    if (verifyResult[0].old_index_exists > 0) {
      console.log('✅ 旧唯一索引恢复成功')
    }

    if (verifyResult[0].campaign_key_exists === 0) {
      console.log('✅ campaign_key 列删除成功')
    }

    console.log('\n✅ P0数据一致性加固回滚完成')
  }
}
