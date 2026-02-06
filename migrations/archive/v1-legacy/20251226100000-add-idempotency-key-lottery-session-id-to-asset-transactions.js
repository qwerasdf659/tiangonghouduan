/**
 * 餐厅积分抽奖系统 V4.2 - 数据库迁移
 *
 * 迁移内容：asset_transactions 表幂等性修复（方案A实施）
 *
 * 修复内容：
 * 1. 新增 idempotency_key 字段 - 独立幂等键（每条事务记录唯一）
 * 2. 新增 lottery_session_id 字段 - 抽奖会话ID（一次抽奖对应多条事务）
 * 3. 添加 uk_idempotency_key 唯一约束
 * 4. 添加 idx_lottery_session_id 普通索引
 *
 * 业务背景：
 * - 原 business_id 字段语义混淆（既做关联ID又做幂等键）
 * - 采用"入口幂等 + 内部派生"两层幂等设计
 * - lottery_session_id: 把同一次抽奖的多条流水串起来
 * - idempotency_key: 每条流水独立的幂等键
 *
 * 数据回填策略：
 * - 历史数据的 idempotency_key = 'tx_' + transaction_id（保证唯一性）
 * - 历史数据的 lottery_session_id = 原 business_id（保持业务关联）
 *
 * 创建时间：2025年12月26日
 * 技术债务修复：P1级 - asset_transactions 幂等性架构升级
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：新增幂等字段和索引
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize实例
   * @returns {Promise<void>}
   */
  async up(queryInterface, Sequelize) {
    console.log('开始迁移：asset_transactions 幂等性修复（方案A）...')

    // ========================================
    // 步骤1：检查字段是否已存在
    // ========================================
    console.log('\n=== 步骤1：检查字段是否已存在 ===')

    const [columns] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'asset_transactions'
        AND COLUMN_NAME IN ('idempotency_key', 'lottery_session_id')
    `)

    const existingColumns = columns.map(c => c.COLUMN_NAME)
    console.log('已存在的字段:', existingColumns.length > 0 ? existingColumns.join(', ') : '无')

    // ========================================
    // 步骤2：新增字段（先允许 NULL，避免阻塞）
    // ========================================
    console.log('\n=== 步骤2：新增字段 ===')

    if (!existingColumns.includes('lottery_session_id')) {
      console.log('添加字段: lottery_session_id')
      await queryInterface.addColumn('asset_transactions', 'lottery_session_id', {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: '抽奖会话ID（一次抽奖对应多条事务记录，如 consume + reward）'
      })
      console.log('  ✅ lottery_session_id 已添加')
    } else {
      console.log('  ✅ lottery_session_id 已存在，跳过')
    }

    if (!existingColumns.includes('idempotency_key')) {
      console.log('添加字段: idempotency_key')
      await queryInterface.addColumn('asset_transactions', 'idempotency_key', {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: '幂等键（每条事务记录唯一，格式：{type}_{account}_{timestamp}_{random}）'
      })
      console.log('  ✅ idempotency_key 已添加')
    } else {
      console.log('  ✅ idempotency_key 已存在，跳过')
    }

    // ========================================
    // 步骤3：数据回填
    // ========================================
    console.log('\n=== 步骤3：数据回填 ===')

    // 回填 lottery_session_id（使用原 business_id）
    const [lotterySessionNulls] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as null_count
      FROM asset_transactions
      WHERE lottery_session_id IS NULL
    `)

    if (lotterySessionNulls[0].null_count > 0) {
      console.log(`回填 lottery_session_id: ${lotterySessionNulls[0].null_count} 条记录`)
      await queryInterface.sequelize.query(`
        UPDATE asset_transactions
        SET lottery_session_id = business_id
        WHERE lottery_session_id IS NULL
      `)
      console.log('  ✅ lottery_session_id 回填完成')
    } else {
      console.log('  ✅ lottery_session_id 无需回填')
    }

    // 回填 idempotency_key（使用 tx_ + transaction_id）
    const [idempotencyKeyNulls] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as null_count
      FROM asset_transactions
      WHERE idempotency_key IS NULL
    `)

    if (idempotencyKeyNulls[0].null_count > 0) {
      console.log(`回填 idempotency_key: ${idempotencyKeyNulls[0].null_count} 条记录`)
      await queryInterface.sequelize.query(`
        UPDATE asset_transactions
        SET idempotency_key = CONCAT('tx_', transaction_id)
        WHERE idempotency_key IS NULL
      `)
      console.log('  ✅ idempotency_key 回填完成')
    } else {
      console.log('  ✅ idempotency_key 无需回填')
    }

    // ========================================
    // 步骤4：验证数据完整性
    // ========================================
    console.log('\n=== 步骤4：验证数据完整性 ===')

    // 检查唯一性
    const [duplicates] = await queryInterface.sequelize.query(`
      SELECT idempotency_key, COUNT(*) as cnt
      FROM asset_transactions
      WHERE idempotency_key IS NOT NULL
      GROUP BY idempotency_key
      HAVING COUNT(*) > 1
      LIMIT 5
    `)

    if (duplicates.length > 0) {
      console.error('  ❌ 发现重复的 idempotency_key，无法添加唯一约束')
      console.error('  重复记录:', duplicates)
      throw new Error('idempotency_key 存在重复值，请手动处理后重试')
    }

    console.log('  ✅ idempotency_key 唯一性验证通过')

    // 检查是否有剩余的 NULL 值
    const [remainingNulls] = await queryInterface.sequelize.query(`
      SELECT
        SUM(CASE WHEN idempotency_key IS NULL THEN 1 ELSE 0 END) as idem_nulls,
        SUM(CASE WHEN lottery_session_id IS NULL THEN 1 ELSE 0 END) as session_nulls
      FROM asset_transactions
    `)

    if (remainingNulls[0].idem_nulls > 0 || remainingNulls[0].session_nulls > 0) {
      console.error('  ❌ 仍有 NULL 值存在')
      console.error('  idempotency_key NULL:', remainingNulls[0].idem_nulls)
      console.error('  lottery_session_id NULL:', remainingNulls[0].session_nulls)
      throw new Error('数据回填不完整，请检查')
    }

    console.log('  ✅ 无 NULL 值残留')

    // ========================================
    // 步骤5：添加唯一索引
    // ========================================
    console.log('\n=== 步骤5：添加唯一索引 ===')

    const [existingUniqueIndex] = await queryInterface.sequelize.query(`
      SHOW INDEX FROM asset_transactions
      WHERE Key_name = 'uk_idempotency_key'
    `)

    if (existingUniqueIndex.length === 0) {
      console.log('创建唯一索引: uk_idempotency_key')
      await queryInterface.addIndex('asset_transactions', {
        fields: ['idempotency_key'],
        unique: true,
        name: 'uk_idempotency_key',
        type: 'UNIQUE'
      })
      console.log('  ✅ 唯一索引已创建')
    } else {
      console.log('  ✅ 唯一索引已存在，跳过')
    }

    // ========================================
    // 步骤6：设置 NOT NULL 约束
    // ========================================
    console.log('\n=== 步骤6：设置 NOT NULL 约束 ===')

    await queryInterface.changeColumn('asset_transactions', 'idempotency_key', {
      type: Sequelize.STRING(100),
      allowNull: false,
      comment: '幂等键（每条事务记录唯一，格式：{type}_{account}_{timestamp}_{random}）'
    })
    console.log('  ✅ idempotency_key 已设置为 NOT NULL')

    await queryInterface.changeColumn('asset_transactions', 'lottery_session_id', {
      type: Sequelize.STRING(100),
      allowNull: false,
      comment: '抽奖会话ID（一次抽奖对应多条事务记录，如 consume + reward）'
    })
    console.log('  ✅ lottery_session_id 已设置为 NOT NULL')

    // ========================================
    // 步骤7：添加普通索引（优化关联查询）
    // ========================================
    console.log('\n=== 步骤7：添加普通索引 ===')

    const [existingSessionIndex] = await queryInterface.sequelize.query(`
      SHOW INDEX FROM asset_transactions
      WHERE Key_name = 'idx_lottery_session_id'
    `)

    if (existingSessionIndex.length === 0) {
      console.log('创建普通索引: idx_lottery_session_id')
      await queryInterface.addIndex('asset_transactions', {
        fields: ['lottery_session_id'],
        name: 'idx_lottery_session_id'
      })
      console.log('  ✅ 普通索引已创建')
    } else {
      console.log('  ✅ 普通索引已存在，跳过')
    }

    // ========================================
    // 步骤8：验证最终结果
    // ========================================
    console.log('\n=== 步骤8：验证最终结果 ===')

    const [finalColumns] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_COMMENT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'asset_transactions'
        AND COLUMN_NAME IN ('idempotency_key', 'lottery_session_id')
    `)

    console.log('新增字段验证:')
    finalColumns.forEach(col => {
      console.log(`  - ${col.COLUMN_NAME}: ${col.COLUMN_TYPE}, NULL=${col.IS_NULLABLE}`)
    })

    const [finalIndexes] = await queryInterface.sequelize.query(`
      SELECT INDEX_NAME, NON_UNIQUE
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'asset_transactions'
        AND INDEX_NAME IN ('uk_idempotency_key', 'idx_lottery_session_id')
    `)

    console.log('新增索引验证:')
    finalIndexes.forEach(idx => {
      console.log(`  - ${idx.INDEX_NAME}: ${idx.NON_UNIQUE === 0 ? 'UNIQUE' : 'INDEX'}`)
    })

    console.log('\n✅ asset_transactions 幂等性修复完成（方案A）')
  },

  /**
   * 回滚迁移：移除新增字段和索引
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize实例
   * @returns {Promise<void>}
   */
  async down(queryInterface, Sequelize) {
    console.log('回滚迁移：asset_transactions 幂等性修复...')
    console.log('⚠️ 警告：回滚将移除幂等性字段，可能影响业务')

    // 1. 删除唯一索引
    console.log('\n=== 步骤1：删除索引 ===')

    const [uniqueIndex] = await queryInterface.sequelize.query(`
      SHOW INDEX FROM asset_transactions
      WHERE Key_name = 'uk_idempotency_key'
    `)

    if (uniqueIndex.length > 0) {
      await queryInterface.removeIndex('asset_transactions', 'uk_idempotency_key')
      console.log('  ✅ 已删除唯一索引 uk_idempotency_key')
    }

    const [sessionIndex] = await queryInterface.sequelize.query(`
      SHOW INDEX FROM asset_transactions
      WHERE Key_name = 'idx_lottery_session_id'
    `)

    if (sessionIndex.length > 0) {
      await queryInterface.removeIndex('asset_transactions', 'idx_lottery_session_id')
      console.log('  ✅ 已删除索引 idx_lottery_session_id')
    }

    // 2. 删除字段
    console.log('\n=== 步骤2：删除字段 ===')

    const [columns] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'asset_transactions'
        AND COLUMN_NAME IN ('idempotency_key', 'lottery_session_id')
    `)

    const existingColumns = columns.map(c => c.COLUMN_NAME)

    if (existingColumns.includes('idempotency_key')) {
      await queryInterface.removeColumn('asset_transactions', 'idempotency_key')
      console.log('  ✅ 已删除字段 idempotency_key')
    }

    if (existingColumns.includes('lottery_session_id')) {
      await queryInterface.removeColumn('asset_transactions', 'lottery_session_id')
      console.log('  ✅ 已删除字段 lottery_session_id')
    }

    console.log('\n✅ 回滚完成')
  }
}
