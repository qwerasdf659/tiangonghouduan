'use strict'

/**
 * 迁移：trade_orders 幂等键存量回填
 *
 * 背景：
 *   trade_orders 表有 157 条历史记录，idempotency_key 存在 10+ 种前缀
 *   （order_、stress_、withdraw_、first_、shared_、single_、test_ 等），
 *   均为开发/测试阶段产生的数据。
 *
 * 目标：
 *   将所有存量记录的 idempotency_key 统一回填为：
 *     trade_{order_no}_{原key的SHA-256前8位}
 *   保留原 key 的 hash 确保回填后仍然唯一。
 *
 * 安全措施：
 *   - 在事务中执行，验证无冲突后 COMMIT
 *   - idempotency_key 列有 UNIQUE 约束，冲突时自动回滚
 *   - 空字符串的原 key 使用 'empty' 占位计算 hash
 *
 * 关联文档：docs/编码规则统一方案.md §25 Phase 7-9
 */

const crypto = require('crypto')

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🔄 开始回填 trade_orders 幂等键...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 查询所有 trade_orders 记录
      const [rows] = await queryInterface.sequelize.query(
        'SELECT trade_order_id, order_no, idempotency_key FROM trade_orders ORDER BY trade_order_id',
        { transaction }
      )

      console.log(`📊 共 ${rows.length} 条记录需要回填`)

      if (rows.length === 0) {
        console.log('✅ 无记录需要回填，跳过')
        await transaction.commit()
        return
      }

      // 2. 逐条生成新的统一格式幂等键
      let updatedCount = 0
      const newKeys = new Set()

      for (const row of rows) {
        // 原 key 为空字符串时用 'empty' 占位
        const originalKey = row.idempotency_key || 'empty'
        const hash8 = crypto
          .createHash('sha256')
          .update(originalKey)
          .digest('hex')
          .substring(0, 8)

        const newKey = `trade_${row.order_no}_${hash8}`

        // 唯一性预检（应用层）
        if (newKeys.has(newKey)) {
          throw new Error(
            `回填冲突：trade_order_id=${row.trade_order_id} 生成的新 key "${newKey}" 与已有记录重复`
          )
        }
        newKeys.add(newKey)

        // 3. 逐条 UPDATE（UNIQUE 约束提供数据库层兜底）
        await queryInterface.sequelize.query(
          'UPDATE trade_orders SET idempotency_key = ? WHERE trade_order_id = ?',
          {
            replacements: [newKey, row.trade_order_id],
            transaction
          }
        )
        updatedCount++
      }

      // 4. 提交事务
      await transaction.commit()
      console.log(`✅ 回填完成：${updatedCount} 条记录已更新为 trade_{order_no}_{hash8} 格式`)
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回填失败，已回滚：', error.message)
      throw error
    }
  },

  down: async (queryInterface, Sequelize) => {
    /*
     * 回滚说明：
     * 此迁移为一次性数据回填，原始 idempotency_key 值无法从新值反推。
     * 由于全部为测试数据，回滚时不做任何操作。
     * 如需恢复，请从数据库备份中还原 trade_orders 表。
     */
    console.log('⚠️ trade_orders 幂等键回填为一次性操作，down 不执行任何操作')
    console.log('   如需恢复原始值，请从数据库备份还原')
  }
}
