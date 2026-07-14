'use strict'

/**
 * 调整用户成长等级门槛（2026-07-12 业务确认）
 *
 * 背景:
 * - 原门槛曲线低档过密（消费一两次即跨多级）、高档对"永久累计"偏低（v9 仅 100 万终身），
 *   等级区分度不足。经与业务方对标中高端餐饮/奢侈品会员体系后确认新曲线。
 * - 累计方式维持"永久累计"（history_total_points 账本派生，只增不减），本次仅调门槛数值。
 * - user_growth_levels 属配置实体（非余额/物品互锁表），直接改数据即生效，不破坏对账体系。
 *
 * 门槛调整（min_history_points，1 积分≈累计消费 1 元）:
 *   v2 银卡    2,000    → 5,000（≈5 千元）
 *   v3 金卡    6,000    → 20,000（≈2 万元）
 *   v4 铂金卡  15,000   → 50,000（≈5 万元）
 *   v5 钻石卡  40,000   → 120,000（≈12 万元）
 *   v6 黑金卡  100,000  → 300,000（≈30 万元）
 *   v7 至尊卡  250,000  → 700,000（≈70 万元）
 *   v8 首席贵宾 500,000  → 1,500,000（≈150 万元）
 *   v9 荣耀殿堂 1,000,000 → 3,000,000（≈300 万元，象征性顶档）
 *   v1 铜卡    0        → 0（注册即享，不变）
 *
 * 同步更新各档 description 中的"≈累计消费 X 元"文案，保持代码即文档一致。
 *
 * 回滚: down 完整还原到调整前的门槛与描述。
 */

/** 新门槛与描述（level_key 为稳定业务码，按其定位更新，与展示名解耦） */
const NEW_LEVELS = [
  { level_key: 'v2', points: 5000, desc: '银卡：累计积分满 5000（≈累计消费 5 千元）解锁' },
  { level_key: 'v3', points: 20000, desc: '金卡：累计积分满 20000（≈累计消费 2 万元）解锁' },
  { level_key: 'v4', points: 50000, desc: '铂金卡：累计积分满 50000（≈累计消费 5 万元）解锁' },
  { level_key: 'v5', points: 120000, desc: '钻石卡：累计积分满 120000（≈累计消费 12 万元）解锁' },
  { level_key: 'v6', points: 300000, desc: '黑金卡：累计积分满 300000（≈累计消费 30 万元）解锁' },
  { level_key: 'v7', points: 700000, desc: '至尊卡：累计积分满 700000（≈累计消费 70 万元）解锁' },
  {
    level_key: 'v8',
    points: 1500000,
    desc: '首席贵宾：累计积分满 1500000（≈累计消费 150 万元）解锁'
  },
  {
    level_key: 'v9',
    points: 3000000,
    desc: '荣耀殿堂：累计积分满 3000000（≈累计消费 300 万元）解锁'
  }
]

/** 调整前的原始门槛与描述（用于 down 精确回滚） */
const OLD_LEVELS = [
  { level_key: 'v2', points: 2000, desc: '银卡：累计积分满 2000（≈累计消费 2000 元）解锁' },
  { level_key: 'v3', points: 6000, desc: '金卡：累计积分满 6000（≈累计消费 6000 元）解锁' },
  { level_key: 'v4', points: 15000, desc: '铂金卡：累计积分满 15000（≈累计消费 15000 元）解锁' },
  { level_key: 'v5', points: 40000, desc: '钻石卡：累计积分满 40000（≈累计消费 40000 元）解锁' },
  {
    level_key: 'v6',
    points: 100000,
    desc: '黑金卡：累计积分满 100000（≈累计消费 100000 元）解锁'
  },
  {
    level_key: 'v7',
    points: 250000,
    desc: '至尊卡：累计积分满 250000（≈累计消费 250000 元）解锁'
  },
  {
    level_key: 'v8',
    points: 500000,
    desc: '首席贵宾：累计积分满 500000（≈累计消费 500000 元）解锁'
  },
  {
    level_key: 'v9',
    points: 1000000,
    desc: '荣耀殿堂：累计积分满 1000000（≈累计消费 1000000 元）解锁'
  }
]

async function applyLevels(queryInterface, levels) {
  for (const lv of levels) {
    await queryInterface.sequelize.query(
      `UPDATE user_growth_levels
       SET min_history_points = :points, description = :desc, updated_at = NOW()
       WHERE level_key = :level_key AND status = 'active'`,
      { replacements: { points: lv.points, desc: lv.desc, level_key: lv.level_key } }
    )
  }
}

module.exports = {
  async up(queryInterface) {
    await applyLevels(queryInterface, NEW_LEVELS)
    console.log('✅ 成长等级门槛已调整为新曲线（v2~v9）')
  },

  async down(queryInterface) {
    await applyLevels(queryInterface, OLD_LEVELS)
    console.log('⏪ 成长等级门槛已回滚至调整前值（v2~v9）')
  }
}
