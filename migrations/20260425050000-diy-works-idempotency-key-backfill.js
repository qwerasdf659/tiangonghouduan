/**
 * DIY 作品存量幂等键回填 — 编码规则统一方案 D15-A 补全
 *
 * 业务背景：
 * - D15-A 只对新建作品写入 idempotency_key，存量 7 条记录仍为 NULL
 * - 虽然 UNIQUE 约束允许多个 NULL，但为数据完整性统一回填
 *
 * 回填格式：diy_save_{account_id}_{diy_template_id}_{timestamp}_{6位hex}
 * 使用 crypto.randomBytes 保证唯一性
 *
 * @module migrations/20260425050000-diy-works-idempotency-key-backfill
 */

'use strict'

const crypto = require('crypto')

module.exports = {
  up: async (queryInterface, _Sequelize) => {
    console.log('🔧 [迁移] DIY 作品存量幂等键回填 — 开始执行...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      const [works] = await queryInterface.sequelize.query(
        `SELECT diy_work_id, account_id, diy_template_id, created_at
         FROM diy_works
         WHERE idempotency_key IS NULL
         ORDER BY diy_work_id`,
        { transaction }
      )

      console.log(`  📊 需要回填: ${works.length} 条`)

      for (const work of works) {
        const ts = new Date(work.created_at).getTime()
        const random = crypto.randomBytes(3).toString('hex')
        const key = `diy_save_${work.account_id}_${work.diy_template_id}_${ts}_${random}`

        await queryInterface.sequelize.query(
          `UPDATE diy_works SET idempotency_key = :key WHERE diy_work_id = :id`,
          { replacements: { key, id: work.diy_work_id }, transaction }
        )
        console.log(`  ✅ work ${work.diy_work_id} → ${key}`)
      }

      await transaction.commit()
      console.log('✅ [迁移] DIY 作品存量幂等键回填 — 完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ [迁移] 回填失败，已回滚:', error.message)
      throw error
    }
  },

  down: async (queryInterface, _Sequelize) => {
    console.log('⚠️  [回滚] 将存量 idempotency_key 置回 NULL')
    await queryInterface.sequelize.query(
      `UPDATE diy_works SET idempotency_key = NULL
       WHERE idempotency_key LIKE 'diy_save_%'
       AND diy_work_id IN (32, 33, 34, 35, 37, 45, 48)`
    )
  }
}
