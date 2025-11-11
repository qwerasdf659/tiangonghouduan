/* eslint-disable valid-jsdoc */
/**
 * 餐厅积分抽奖系统 V4.0 - 数据库迁移
 *
 * 迁移名称：添加exchange_records表用户兑换记录查询性能优化索引
 * 迁移类型：create-index（创建索引）
 * 版本号：v4.1.3
 * 创建时间：2025-11-09
 * 优先级：P1（中等 - 数据量>1000条后查询性能下降）
 *
 * 变更说明：
 * 1. 添加idx_user_exchange_time复合索引（user_id + exchange_time）
 *
 * 业务场景：
 * - 用户兑换记录查询（GET /api/v4/inventory/exchange-records）
 * - 查询条件：WHERE user_id = ? AND is_deleted = 0
 * - 排序条件：ORDER BY exchange_time DESC
 * - 分页支持：LIMIT ? OFFSET ?
 *
 * 问题描述：
 * - 当前仅有单字段索引：idx_exchange_records_user_id (user_id)
 * - 当前仅有单字段索引：idx_exchange_records_exchange_time (exchange_time)
 * - MySQL只能使用其中一个索引，无法同时利用两个单字段索引
 * - 查询时MySQL使用user_id索引过滤，但仍需对结果进行filesort排序
 * - 随着数据量增长（>1000条），filesort性能下降明显
 *
 * 优化方案：
 * - 创建复合索引：idx_user_exchange_time (user_id, exchange_time)
 * - 该索引同时满足WHERE user_id = ? 和 ORDER BY exchange_time DESC
 * - MySQL可以直接使用索引顺序返回结果，避免filesort操作
 *
 * 性能影响（预期）：
 * - 查询响应时间：80-120ms → 20-40ms（优化70%）
 * - 索引命中率：50%（仅user_id索引） → 100%（复合索引）
 * - 扫描行数：用户全部兑换记录 → 分页所需行数（减少95%）
 * - 消除filesort操作（CPU密集型操作）
 *
 * 索引设计依据：
 * - user_id放在第一位：满足WHERE user_id = ?等值查询
 * - exchange_time放在第二位：满足ORDER BY exchange_time DESC排序
 * - 复合索引左前缀原则：可以同时满足WHERE和ORDER BY
 *
 * 依赖关系：
 * - 依赖exchange_records表存在（已创建）
 * - 需要user_id字段（已存在，INT类型，外键）
 * - 需要exchange_time字段（已存在，DATETIME类型，北京时间）
 *
 * 影响范围：
 * - 添加1个复合索引
 * - 索引大小：约10-20MB（取决于数据量）
 * - 无破坏性变更
 * - 完全向后兼容
 * - 不影响现有查询
 *
 * 实施方案文档：docs/获取兑换记录API实施方案.md 问题2（数据库索引缺失）
 *
 * 注意事项：
 * - 索引创建时会锁表，建议在业务低峰期执行
 * - 索引创建完成后，旧的单字段索引idx_exchange_records_user_id和idx_exchange_records_exchange_time可以保留
 * - 复合索引idx_user_exchange_time可以覆盖单字段user_id索引的功能
 * - 保留单字段索引有利于其他仅按user_id或仅按exchange_time查询的场景
 */

'use strict'

/**
 * 数据库迁移模块
 */
module.exports = {
  /**
   * 执行迁移（up方向）
   *
   * @param {import('sequelize').QueryInterface} queryInterface - Sequelize查询接口
   * @param {import('sequelize')} _Sequelize - Sequelize实例（未使用）
   * @returns {Promise<void>} 无返回值
   */
  async up (queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('📝 开始添加exchange_records表用户兑换记录查询性能优化索引...')

      // 🔍 步骤1：检查索引是否已存在（避免重复创建）
      const [existingIndexes] = await queryInterface.sequelize.query(
        'SHOW INDEX FROM exchange_records',
        { transaction }
      )

      const existingIndexNames = new Set(existingIndexes.map(idx => idx.Key_name))

      console.log(`📊 现有索引数量: ${existingIndexNames.size}`)
      console.log('📊 检查目标索引: idx_user_exchange_time')

      // 🔑 创建复合索引：idx_user_exchange_time (user_id, exchange_time)
      if (!existingIndexNames.has('idx_user_exchange_time')) {
        console.log('➕ 创建索引: idx_user_exchange_time (user_id, exchange_time)')
        console.log('   业务场景: 用户兑换记录查询（GET /api/v4/inventory/exchange-records）')
        console.log('   查询条件: WHERE user_id = ? ORDER BY exchange_time DESC')
        console.log('   预期优化: 查询时间减少70%，消除filesort操作')

        await queryInterface.addIndex(
          'exchange_records', // 表名
          ['user_id', 'exchange_time'], // 索引字段（顺序很重要）
          {
            name: 'idx_user_exchange_time', // 索引名称
            transaction
          }
        )

        console.log('✅ 索引创建成功: idx_user_exchange_time')
        console.log('   索引结构: user_id (等值查询) + exchange_time (排序)')
        console.log('   索引类型: 复合索引（BTREE）')
      } else {
        console.log('⏭️  索引已存在，跳过: idx_user_exchange_time')
      }

      // 提交事务
      await transaction.commit()

      console.log('\n✅ exchange_records表性能优化索引添加完成')
      console.log('📊 索引命中率预期提升: 50% → 100%')
      console.log('⚡ 查询响应时间预期优化: 80-120ms → 20-40ms')
      console.log('🗂️  消除filesort操作，减少CPU占用')
    } catch (error) {
      // 回滚事务
      await transaction.rollback()
      console.error('❌ 添加索引失败:', error.message)
      console.error('   错误类型:', error.name)
      console.error('   错误堆栈:', error.stack)
      throw error
    }
  },

  /**
   * 回滚迁移（down方向）
   *
   * @param {import('sequelize').QueryInterface} queryInterface - Sequelize查询接口
   * @param {import('sequelize')} _Sequelize - Sequelize实例（未使用）
   * @returns {Promise<void>} 无返回值
   */
  async down (queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('📝 开始回滚exchange_records表性能优化索引...')

      // 删除复合索引：idx_user_exchange_time
      console.log('➖ 删除索引: idx_user_exchange_time')
      await queryInterface.removeIndex(
        'exchange_records',
        'idx_user_exchange_time',
        { transaction }
      )
      console.log('✅ 索引删除成功: idx_user_exchange_time')

      // 提交事务
      await transaction.commit()

      console.log('\n✅ exchange_records表性能优化索引回滚完成')
      console.log('⚠️  警告: 回滚后查询性能将下降，建议在业务低峰期执行')
    } catch (error) {
      // 回滚事务
      await transaction.rollback()
      console.error('❌ 删除索引失败:', error.message)
      console.error('   错误类型:', error.name)
      console.error('   错误堆栈:', error.stack)
      throw error
    }
  }
}
