/**
 * 迁移：回填 NULL item_type 数据并清理空 status
 *
 * 背景（2026-02-07 阻塞项核实）：
 * - 发现 466 条 item_instances 记录 item_type 为 NULL
 * - 所有 466 条均关联 item_template_id=2（模板类型为 voucher，50元优惠券）
 * - 3 条记录 status 为空字符串（异常数据）
 * - 这些数据是历史迁移残留，影响前端 item_type 分流逻辑
 *
 * 操作：
 * 1. 通过 item_templates 表关联回填 item_type（以模板的 item_type 为准）
 * 2. 将空字符串 status 修正为 'expired'（无效状态的历史数据）
 *
 * @version 1.0.0
 * @date 2026-02-07
 */

'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    /*
     * 步骤 1：回填 NULL item_type
     * 策略：从关联的 item_templates 表获取正确的 item_type
     * 安全保障：使用 JOIN 确保只更新有对应模板的数据
     */
    await queryInterface.sequelize.query(`
      UPDATE item_instances ii
      INNER JOIN item_templates it ON ii.item_template_id = it.item_template_id
      SET ii.item_type = it.item_type,
          ii.updated_at = NOW()
      WHERE ii.item_type IS NULL
    `)

    /*
     * 步骤 2：清理空字符串 status
     * 策略：空 status 不是合法枚举值，标记为 'expired'
     * 这些数据（3条）是历史残留，不影响正常业务
     */
    await queryInterface.sequelize.query(`
      UPDATE item_instances
      SET status = 'expired',
          updated_at = NOW()
      WHERE status = ''
    `)
  },

  async down(queryInterface) {
    /*
     * 回滚说明：
     * - 此迁移为数据修复操作（回填 NULL 值）
     * - 回滚后将恢复为 NULL / 空字符串状态
     * - 不建议在生产环境执行 down 操作
     */
    await queryInterface.sequelize.query(`
      UPDATE item_instances ii
      INNER JOIN item_templates it ON ii.item_template_id = it.item_template_id
      SET ii.item_type = NULL
      WHERE it.item_template_id = 2
        AND ii.item_type = 'voucher'
        AND ii.created_at < '2026-02-07'
    `)
  }
}
