'use strict'

/**
 * 修改表: ad_bid_logs.target_user_id 改为允许 NULL（支持未登录匿名访客竞价日志）
 *
 * 创建时间: 2026-06-21（北京时间）
 * 创建原因（ad-delivery 接口改为 optionalAuth 可选登录，方案B）:
 * - ad-delivery 由强制登录改为可选登录后，未登录匿名访客也会触发 selectWinners 选择逻辑，
 *   该逻辑会写竞价日志 ad_bid_logs；匿名访客无 user_id，target_user_id 需写入 NULL。
 * - 真实库 ad_bid_logs.target_user_id 当前为 NOT NULL，导致匿名请求写日志报错
 *   （Column 'target_user_id' cannot be null）→ 接口 500。
 * - 模型 models/AdBidLog.js 早已定义 allowNull:true，且外键删除策略为 SET NULL
 *   （SET NULL 本就要求列可空），故 NOT NULL 是模型与数据库不同步的历史遗留缺陷。
 *
 * 字段变更:
 * - ad_bid_logs.target_user_id INT 改为 allowNull=true（与模型定义、外键 SET NULL 策略对齐）
 *
 * 存量兼容:
 * - 仅放开 NULL 约束，存量数据（均为已登录用户的非空 user_id）不受任何影响。
 *
 * 外键: 不改外键本身（ad_bid_logs_ibfk_3 → users.user_id, ON DELETE SET NULL 保持），
 *       仅放开列的 NOT NULL；SET NULL 删除策略此后才真正可用。
 *
 * 回滚: 将 target_user_id 改回 NOT NULL（回滚前需确保无 NULL 行，否则回滚失败，属预期保护）。
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('ad_bid_logs', 'target_user_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: '目标用户ID（外键→users，未登录匿名访客为 NULL）'
    })
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('ad_bid_logs', 'target_user_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      comment: '目标用户ID（外键→users）'
    })
  }
}
