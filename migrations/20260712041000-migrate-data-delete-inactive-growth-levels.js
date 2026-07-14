'use strict'

/**
 * 硬删除废弃的 inactive 成长等级旧数据（2026-07-12）
 *
 * 背景:
 * - user_growth_levels 表存在 4 条历史遗留的 inactive 旧等级（bronze/silver/gold/diamond），
 *   均为早期"占位阈值，需运营确认"的未定稿数据，现行生效等级已是 v1~v9（active）。
 * - 这批 inactive 数据不参与任何派生（等级实时派生仅取 active），但与 v1~v9 并存易造成认知混淆。
 * - 经全库核查：代码无引用（仅 level-probability.js 注释举例，非真实引用），
 *   exchange_redeem_requirement 等配置表引用数为 0，用户表不存 level_key（实时派生），可安全硬删。
 * - 孤儿/废弃配置数据按硬删除处理（非软删除），彻底清理避免技术债务。
 *
 * 变更: 删除 user_growth_levels 中 status='inactive' 的 4 条记录（bronze/silver/gold/diamond）。
 * 回滚: down 按原始值重建这 4 条（earn_multiplier 均 1.00，status=inactive）。
 */

/** 待删除/回滚重建的 inactive 旧等级原始数据（level_key 为业务码，稳定标识） */
const INACTIVE_LEVELS = [
  {
    level_key: 'bronze',
    level_name: '青铜',
    min_history_points: 0,
    sort_order: 0,
    description: '成长等级最低档（累计积分 0 起）；阈值为起步占位值，需运营确认'
  },
  {
    level_key: 'silver',
    level_name: '白银',
    min_history_points: 100000,
    sort_order: 1,
    description: '⚠️ 占位阈值 100000，需运营按真实业务规则确认'
  },
  {
    level_key: 'gold',
    level_name: '黄金',
    min_history_points: 500000,
    sort_order: 2,
    description: '⚠️ 占位阈值 500000，需运营按真实业务规则确认'
  },
  {
    level_key: 'diamond',
    level_name: '钻石',
    min_history_points: 2000000,
    sort_order: 3,
    description: '⚠️ 占位阈值 2000000，需运营按真实业务规则确认'
  }
]

const OLD_KEYS = INACTIVE_LEVELS.map(l => l.level_key)

module.exports = {
  async up(queryInterface) {
    // 双重条件（status + level_key 白名单）确保只删这 4 条废弃数据，不误伤 active 等级
    const [result] = await queryInterface.sequelize.query(
      `DELETE FROM user_growth_levels
       WHERE status = 'inactive' AND level_key IN (:keys)`,
      { replacements: { keys: OLD_KEYS } }
    )
    console.log('✅ 已硬删除 inactive 废弃成长等级（bronze/silver/gold/diamond）', {
      affected: result && result.affectedRows
    })
  },

  async down(queryInterface) {
    const now = new Date()
    for (const lv of INACTIVE_LEVELS) {
      await queryInterface.sequelize.query(
        `INSERT INTO user_growth_levels
           (level_key, level_name, min_history_points, sort_order, status, description, earn_multiplier, created_at, updated_at)
         VALUES (:level_key, :level_name, :min_history_points, :sort_order, 'inactive', :description, 1.00, :now, :now)`,
        {
          replacements: {
            level_key: lv.level_key,
            level_name: lv.level_name,
            min_history_points: lv.min_history_points,
            sort_order: lv.sort_order,
            description: lv.description,
            now
          }
        }
      )
    }
    console.log('⏪ 已重建 4 条 inactive 成长等级（回滚）')
  }
}
