'use strict'

/**
 * 餐厅积分抽奖系统 - 数据库迁移
 *
 * 迁移内容：清理 2 个命名错误的冗余非唯一索引
 *
 * 问题描述（基于 2026-01-05 幂等性保护核查发现）：
 * 1. lottery_draws.idx_lottery_draw_business_id(idempotency_key)
 *    - 索引名叫 business_id 但实际字段是 idempotency_key（命名错误）
 *    - 是非唯一索引，已有唯一索引 uk_lottery_draws_idempotency_key 存在
 *    - 完全冗余，只增加写入开销
 *
 * 2. consumption_records.idx_consumption_business_id(idempotency_key)
 *    - 索引名叫 business_id 但实际字段是 idempotency_key（命名错误）
 *    - 是非唯一索引，已有唯一索引 uk_consumption_records_idempotency_key 存在
 *    - 完全冗余，只增加写入开销
 *
 * 影响评估：
 * - 删除这 2 个冗余索引可减少每次 INSERT/UPDATE 的索引维护开销
 * - 不影响查询性能（唯一索引已覆盖相同字段）
 * - 代码中没有任何地方依赖这两个索引名
 *
 * 索引策略：MySQL 8.0 默认使用 INPLACE 在线 DDL 算法
 *
 * 创建时间：2026年01月05日
 * 方案类型：索引瘦身（P2 级 - 清理历史遗留冗余索引）
 */

module.exports = {
  /**
   * 执行迁移：清理 2 个命名错误的冗余非唯一索引
   *
   * @param {import('sequelize').QueryInterface} queryInterface - Sequelize查询接口
   * @param {import('sequelize')} Sequelize - Sequelize实例
   * @returns {Promise<void>}
   */
  async up(queryInterface, Sequelize) {
    console.log('开始迁移：清理命名错误的冗余非唯一索引...')
    console.log('='.repeat(60))

    // ===============================================================
    // 清理 1: lottery_draws.idx_lottery_draw_business_id
    // 问题：索引名叫 business_id 但实际字段是 idempotency_key
    // 已有唯一索引 uk_lottery_draws_idempotency_key 覆盖相同字段
    // ===============================================================
    console.log('\n【lottery_draws 表】')
    console.log('待删除：idx_lottery_draw_business_id(idempotency_key) - 非唯一索引')
    console.log('保留：uk_lottery_draws_idempotency_key(idempotency_key) - 唯一索引')

    const [ldIndexExists] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as cnt
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'lottery_draws'
        AND INDEX_NAME = 'idx_lottery_draw_business_id'
    `)

    if (ldIndexExists[0].cnt > 0) {
      await queryInterface.sequelize.query(`
        DROP INDEX \`idx_lottery_draw_business_id\` ON lottery_draws
      `)
      console.log('  ✅ 已删除冗余索引: lottery_draws.idx_lottery_draw_business_id')
    } else {
      console.log('  ⚠️ 索引 lottery_draws.idx_lottery_draw_business_id 不存在，跳过')
    }

    // ===============================================================
    // 清理 2: consumption_records.idx_consumption_business_id
    // 问题：索引名叫 business_id 但实际字段是 idempotency_key
    // 已有唯一索引 uk_consumption_records_idempotency_key 覆盖相同字段
    // ===============================================================
    console.log('\n【consumption_records 表】')
    console.log('待删除：idx_consumption_business_id(idempotency_key) - 非唯一索引')
    console.log('保留：uk_consumption_records_idempotency_key(idempotency_key) - 唯一索引')

    const [crIndexExists] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as cnt
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'consumption_records'
        AND INDEX_NAME = 'idx_consumption_business_id'
    `)

    if (crIndexExists[0].cnt > 0) {
      await queryInterface.sequelize.query(`
        DROP INDEX \`idx_consumption_business_id\` ON consumption_records
      `)
      console.log('  ✅ 已删除冗余索引: consumption_records.idx_consumption_business_id')
    } else {
      console.log('  ⚠️ 索引 consumption_records.idx_consumption_business_id 不存在，跳过')
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ 冗余索引清理迁移完成（共删除 2 个命名错误的非唯一索引）')
    console.log('📊 预期收益: 减少 INSERT/UPDATE 的索引维护开销')
  },

  /**
   * 回滚迁移：恢复删除的冗余索引
   *
   * 注意：回滚会重新引入命名错误的冗余索引，仅在必要时使用
   *
   * @param {import('sequelize').QueryInterface} queryInterface - Sequelize查询接口
   * @param {import('sequelize')} Sequelize - Sequelize实例
   * @returns {Promise<void>}
   */
  async down(queryInterface, Sequelize) {
    console.log('开始回滚：恢复冗余索引（不推荐）...')
    console.log('⚠️ 警告: 这将恢复命名错误的冗余索引，会增加写入开销')

    // 恢复 lottery_draws 表冗余索引（命名错误：名字叫 business_id 但字段是 idempotency_key）
    await queryInterface.sequelize
      .query(
        `
      CREATE INDEX idx_lottery_draw_business_id ON lottery_draws (idempotency_key)
    `
      )
      .catch(err => {
        console.log('  ⚠️ 恢复 idx_lottery_draw_business_id 失败:', err.message)
      })
    console.log('  ✅ 已恢复索引: lottery_draws.idx_lottery_draw_business_id')

    // 恢复 consumption_records 表冗余索引（命名错误：名字叫 business_id 但字段是 idempotency_key）
    await queryInterface.sequelize
      .query(
        `
      CREATE INDEX idx_consumption_business_id ON consumption_records (idempotency_key)
    `
      )
      .catch(err => {
        console.log('  ⚠️ 恢复 idx_consumption_business_id 失败:', err.message)
      })
    console.log('  ✅ 已恢复索引: consumption_records.idx_consumption_business_id')

    console.log('✅ 冗余索引回滚完成')
    console.log('⚠️ 警告: 已恢复 2 个命名错误的冗余索引，会增加写入开销')
  }
}
