/**
 * 数据库迁移：添加 locks JSON 字段到 item_instances 表
 *
 * 实施方案B（JSON 多级锁定）：
 * - 添加 locks JSON 字段支持多级锁定
 * - 迁移现有锁定数据到新格式
 * - 移除旧字段 locked_by_order_id 和 locked_at（避免双真相）
 *
 * 支持的锁类型：
 * - trade: 交易订单锁定（3分钟TTL，自动释放）
 * - redemption: 兑换码锁定（30天TTL，手动释放）
 * - security: 风控冻结锁定（无限期，仅管理员显式解锁）
 *
 * 锁覆盖规则：
 * - 优先级: security > redemption > trade
 * - security 可覆盖 trade/redemption（用于紧急风控冻结）
 *
 * 时间格式：北京时间 +08:00 ISO8601
 *
 * 创建时间：2026-01-02
 */
'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('📦 开始执行迁移：添加 locks JSON 字段...')

    // 1. 添加 locks JSON 字段
    await queryInterface.addColumn('item_instances', 'locks', {
      type: Sequelize.JSON,
      allowNull: true,
      defaultValue: null,
      comment:
        '锁定记录数组。格式: [{lock_type, lock_id, locked_at, expires_at, auto_release, reason}]。lock_type: trade/redemption/security'
    })
    console.log('  ✅ 已添加 locks JSON 字段')

    // 2. 迁移现有锁定数据到 locks JSON（使用北京时间 +08:00 格式）
    // 注意：MySQL CONVERT_TZ 需要时区表已加载，这里使用 DATE_ADD 手动计算
    const [migratedRows] = await queryInterface.sequelize.query(`
      UPDATE item_instances
      SET locks = JSON_ARRAY(
        JSON_OBJECT(
          'lock_type', CASE
            WHEN locked_by_order_id LIKE 'redemption_%' THEN 'redemption'
            WHEN locked_by_order_id LIKE 'trade_%' THEN 'trade'
            ELSE 'trade'
          END,
          'lock_id', locked_by_order_id,
          'locked_at', CONCAT(DATE_FORMAT(DATE_ADD(locked_at, INTERVAL 8 HOUR), '%Y-%m-%dT%H:%i:%s.000'), '+08:00'),
          'expires_at', CONCAT(
            DATE_FORMAT(
              DATE_ADD(
                CASE
                  WHEN locked_by_order_id LIKE 'redemption_%'
                  THEN DATE_ADD(locked_at, INTERVAL 30 DAY)
                  ELSE DATE_ADD(locked_at, INTERVAL 3 MINUTE)
                END,
                INTERVAL 8 HOUR
              ),
              '%Y-%m-%dT%H:%i:%s.000'
            ),
            '+08:00'
          ),
          'auto_release', CASE
            WHEN locked_by_order_id LIKE 'redemption_%' THEN CAST(0 AS JSON)
            ELSE CAST(1 AS JSON)
          END,
          'reason', '历史数据迁移'
        )
      )
      WHERE status = 'locked'
        AND locked_by_order_id IS NOT NULL
        AND locked_at IS NOT NULL
    `)
    console.log('  ✅ 已迁移现有锁定数据到 locks JSON 字段')

    // 3. 移除旧字段（避免双真相）
    // 注意：先移除索引再移除字段
    try {
      await queryInterface.removeIndex('item_instances', 'idx_item_instances_locked_by_order')
      console.log('  ✅ 已移除旧索引 idx_item_instances_locked_by_order')
    } catch (e) {
      console.log('  ⚠️ 旧索引可能不存在，跳过:', e.message)
    }

    await queryInterface.removeColumn('item_instances', 'locked_by_order_id')
    console.log('  ✅ 已移除旧字段 locked_by_order_id')

    await queryInterface.removeColumn('item_instances', 'locked_at')
    console.log('  ✅ 已移除旧字段 locked_at')

    console.log('🎉 迁移完成：locks JSON 多级锁定机制已启用')
  },

  down: async (queryInterface, Sequelize) => {
    console.log('📦 开始回滚迁移：恢复旧字段...')

    // 1. 恢复旧字段
    await queryInterface.addColumn('item_instances', 'locked_by_order_id', {
      type: Sequelize.STRING(100),
      allowNull: true,
      comment: '锁定订单ID（已弃用，使用 locks JSON 代替）'
    })

    await queryInterface.addColumn('item_instances', 'locked_at', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: '锁定时间（已弃用，使用 locks JSON 代替）'
    })

    // 2. 从 locks JSON 恢复数据到旧字段
    await queryInterface.sequelize.query(`
      UPDATE item_instances
      SET
        locked_by_order_id = JSON_UNQUOTE(JSON_EXTRACT(locks, '$[0].lock_id')),
        locked_at = STR_TO_DATE(
          REPLACE(JSON_UNQUOTE(JSON_EXTRACT(locks, '$[0].locked_at')), '+08:00', ''),
          '%Y-%m-%dT%H:%i:%s.000'
        )
      WHERE locks IS NOT NULL
        AND JSON_LENGTH(locks) > 0
    `)

    // 3. 恢复索引
    await queryInterface.addIndex('item_instances', ['locked_by_order_id'], {
      name: 'idx_item_instances_locked_by_order'
    })

    // 4. 移除 locks 字段
    await queryInterface.removeColumn('item_instances', 'locks')

    console.log('🎉 回滚完成：已恢复旧字段')
  }
}
