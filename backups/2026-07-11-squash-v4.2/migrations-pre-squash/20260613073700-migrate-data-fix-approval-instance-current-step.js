'use strict'

/**
 * 数据修正：修复 approval_chain_instances.current_step 语义错误
 *
 * 创建时间: 2026-06-13 北京时间
 *
 * 背景（直连真实库 restaurant_points_dev 核对）:
 * - current_step 语义应为「当前进行到第几步」的 1-based 序位（取值 1..total_steps）。
 * - 历史代码（ApprovalChainService.createChainInstance / advanceToNextStep）误将
 *   节点的 step_number（模板节点稀疏排序号，如 3、9）直接写入 current_step，
 *   导致出现 current_step > total_steps 的矛盾数据（前端显示"第3步/共2步""第9步/共2步"）。
 * - 实测受影响实例：current_step=3/total_steps=2（2 条）、current_step=9/total_steps=2（3 条）。
 *
 * 修正逻辑（与修复后的 Service 语义一致）:
 * - 「当前活动步骤」= 该实例 status='pending' 的步骤；若无 pending（已完成/拒绝），
 *   取该实例中 step_number 最大且已处理（status IN approved/rejected/timeout/skipped）的步骤。
 * - current_step = 本实例中 step_number <= 活动步骤 step_number 的步骤数（即活动步骤的 1-based 序位）。
 * - 仅修正 current_step 与重算值不一致的实例，幂等可重复执行。
 *
 * 回滚: down 为安全空实现（不恢复错误的旧值）。
 */

module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction()
    try {
      // 取所有实例及其步骤，按实例聚合后在 JS 内重算序位（避免复杂 SQL 方言差异）
      const [steps] = await queryInterface.sequelize.query(
        `SELECT s.instance_id, s.step_number, s.status,
                i.current_step, i.total_steps
         FROM approval_chain_steps s
         JOIN approval_chain_instances i ON i.instance_id = s.instance_id
         ORDER BY s.instance_id, s.step_number`,
        { transaction: t }
      )

      // 按 instance_id 分组
      const byInstance = new Map()
      for (const row of steps) {
        if (!byInstance.has(row.instance_id)) {
          byInstance.set(row.instance_id, {
            current_step: row.current_step,
            total_steps: row.total_steps,
            steps: []
          })
        }
        byInstance.get(row.instance_id).steps.push({
          step_number: Number(row.step_number),
          status: row.status
        })
      }

      const PROCESSED = new Set(['approved', 'rejected', 'timeout', 'skipped'])
      let fixed = 0

      for (const [instanceId, info] of byInstance) {
        const ordered = info.steps.slice().sort((a, b) => a.step_number - b.step_number)
        // 活动步骤：优先 pending；否则取 step_number 最大的已处理步骤；都没有则第 1 步
        const pending = ordered.find(s => s.status === 'pending')
        let active = pending
        if (!active) {
          const processed = ordered.filter(s => PROCESSED.has(s.status))
          active = processed.length ? processed[processed.length - 1] : ordered[0]
        }
        if (!active) continue

        // 1-based 序位 = step_number <= 活动步骤 step_number 的步骤数
        const ordinal = ordered.filter(s => s.step_number <= active.step_number).length

        if (Number(info.current_step) !== ordinal) {
          // eslint-disable-next-line no-await-in-loop
          await queryInterface.sequelize.query(
            'UPDATE approval_chain_instances SET current_step = :ordinal WHERE instance_id = :id',
            { replacements: { ordinal, id: instanceId }, transaction: t }
          )
          fixed += 1
        }
      }

      // eslint-disable-next-line no-console
      console.log(`[migrate] approval_chain_instances.current_step 修正完成，共修正 ${fixed} 条`)
      await t.commit()
    } catch (e) {
      await t.rollback()
      throw e
    }
  },

  async down() {
    // 数据语义修正，不恢复错误的旧 current_step 值
  }
}
