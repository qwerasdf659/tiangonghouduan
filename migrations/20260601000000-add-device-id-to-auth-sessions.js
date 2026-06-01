/**
 * 迁移：为 authentication_sessions 增加 device_id（设备级多会话）
 *
 * 背景（设备级多会话方案 / docs/会话认证体系最终方案-设备级多会话.md）：
 * - 会话隔离粒度由「(user_type + login_platform)」改为「(user_id, user_type) + device_id」
 * - device_id 由前端生成并持久化的 UUID，存量数据为 NULL（按"未知设备 legacy"处理）
 * - 不参与安全判定（安全靠 session_token + Redis 校验 + 可踢设备 + 高危二次确认）
 *
 * 本迁移做三件事（均显式定义、可回滚）：
 * 1. authentication_sessions 增加 device_id VARCHAR(64) NULL 列
 * 2. 增加复合索引 idx_user_device (user_type, user_id, device_id, is_active)
 *    —— 与现有 idx_user_sessions_platform 同款式，支持"某用户某设备活跃会话"查找/替换/踢设备
 *    —— 创建前用 SHOW INDEX 校验，避免与现有 6 个索引重复
 * 3. 存量脏数据兜底：将非法 login_platform（空串等不在 ENUM 白名单的值）标记 is_active=0
 *    —— 仅标记，不物理删除，保留审计语义
 *
 * ⚠️ 主键类型说明：真实库 authentication_session_id 已是 BIGINT（实测 AUTO_INCREMENT），
 *    模型定义写的是 INTEGER —— 此处仅修正"模型定义"与库对齐（见 models/AuthenticationSession.js），
 *    不在迁移内 ALTER 主键（主键带外键 authentication_sessions_ibfk_1，不应改类型）。
 *
 * 创建时间：2026-06-01 北京时间
 */

'use strict'

const TABLE = 'authentication_sessions'
const COLUMN = 'device_id'
const INDEX_NAME = 'idx_user_device'
/** 合法平台白名单（与 utils/platformDetector.VALID_PLATFORMS + unknown 兜底一致） */
const VALID_PLATFORMS = ['web', 'wechat_mp', 'douyin_mp', 'alipay_mp', 'app', 'unknown']

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const sequelize = queryInterface.sequelize

    // 1. 增加 device_id 列（幂等：列已存在则跳过）
    const table = await queryInterface.describeTable(TABLE)
    if (!table[COLUMN]) {
      await queryInterface.addColumn(TABLE, COLUMN, {
        type: Sequelize.STRING(64),
        allowNull: true,
        comment: '设备标识（前端生成的UUID）。NULL=未知设备(legacy存量数据)'
      })
    }

    // 2. 创建复合索引（幂等：用 SHOW INDEX 校验，已存在则跳过，避免与现有索引重复）
    const [existingIndexes] = await sequelize.query(`SHOW INDEX FROM \`${TABLE}\``)
    const hasIndex = existingIndexes.some(i => i.Key_name === INDEX_NAME)
    if (!hasIndex) {
      await queryInterface.addIndex(TABLE, ['user_type', 'user_id', COLUMN, 'is_active'], {
        name: INDEX_NAME
      })
    }

    // 3. 存量脏数据兜底：非法 login_platform 标记失效（仅标记，不物理删除）
    const placeholders = VALID_PLATFORMS.map(() => '?').join(',')
    await sequelize.query(
      `UPDATE \`${TABLE}\` SET is_active = 0 WHERE login_platform NOT IN (${placeholders}) AND is_active = 1`,
      { replacements: VALID_PLATFORMS }
    )
  },

  down: async (queryInterface) => {
    const sequelize = queryInterface.sequelize

    // 回滚 2：删除复合索引（存在才删）
    const [existingIndexes] = await sequelize.query(`SHOW INDEX FROM \`${TABLE}\``)
    if (existingIndexes.some(i => i.Key_name === INDEX_NAME)) {
      await queryInterface.removeIndex(TABLE, INDEX_NAME)
    }

    // 回滚 1：删除 device_id 列（存在才删）
    const table = await queryInterface.describeTable(TABLE)
    if (table[COLUMN]) {
      await queryInterface.removeColumn(TABLE, COLUMN)
    }

    // 说明：脏数据 is_active=0 标记不还原（审计语义，且无法区分历史已失效记录）
  }
}
