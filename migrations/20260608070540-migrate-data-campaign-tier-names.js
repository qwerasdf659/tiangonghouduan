'use strict'

/**
 * 数据迁移: 清理 lottery_campaigns.prize_distribution_config 中的旧有奖销售档位名
 *
 * 文件路径: migrations/20260608070540-migrate-data-campaign-tier-names.js
 * 创建时间: 2026-06-08（路线B 合规改造 模块0 收尾）
 *
 * 业务背景（合规相关）:
 * - admin 新建活动的 saveCampaign 已改用路线B 档位名（头号好礼/尊享回馈/优享回馈/常享回馈/基础礼遇），
 *   但该改动只影响"今后新建"的活动；库内既存活动 id=1 的 prize_distribution_config.tiers
 *   仍是旧的有奖销售/赌博暗示术语（特等奖/一等奖/二等奖/三等奖/谢谢参与）。
 * - 文案合规方案第三节明确"谢谢参与"属赌博暗示需删除、"几等奖"属有奖销售术语需替换。
 * - prize_distribution_config 属配置类 JSON（非余额/持有/锁定互锁表），可经迁移直接清理，不破坏体系。
 *
 * 处理方式:
 * - 按 tier_id 做"旧名→新名"的稳定映射，仅改 tier_name，保留 weight/tier_id 不动（与引擎权重无关）。
 * - 全表扫描所有含旧档位名的活动（不写死主键，避免依赖历史自增 ID），逐条事务内更新。
 * - 幂等: 已是新名的活动不会被重复改（按旧名匹配映射，命中才替换）。
 *
 * down 回滚: 将新名按 tier_id 反向映射回旧名（可逆）。
 */

// 旧档位名 → 路线B 档位名（与 admin saveCampaign 的 tier_name 完全一致）
const OLD_TO_NEW = {
  特等奖: '头号好礼',
  一等奖: '尊享回馈',
  二等奖: '优享回馈',
  三等奖: '常享回馈',
  谢谢参与: '基础礼遇'
}

// down 用的反向映射
const NEW_TO_OLD = Object.fromEntries(Object.entries(OLD_TO_NEW).map(([o, n]) => [n, o]))

// 含旧档位名的活动判定（任一旧名命中即需处理）
const OLD_NAMES = Object.keys(OLD_TO_NEW)

/**
 * 在事务内按映射表转换 prize_distribution_config.tiers[].tier_name
 *
 * @param {Object} queryInterface - Sequelize 迁移接口
 * @param {Object} mapping - 名称映射表（up 用旧→新，down 用新→旧）
 * @param {Array<string>} matchNames - 需匹配的源名称列表（命中才转换，保证幂等）
 */
async function transformTierNames(queryInterface, mapping, matchNames) {
  const transaction = await queryInterface.sequelize.transaction()
  try {
    // 仅取含目标名称的活动，逐条转换（数据量极小，无 N+1 风险）
    const likeClause = matchNames
      .map(n => `prize_distribution_config LIKE '%${n}%'`)
      .join(' OR ')
    const [rows] = await queryInterface.sequelize.query(
      `SELECT lottery_campaign_id, prize_distribution_config
       FROM lottery_campaigns
       WHERE ${likeClause}`,
      { transaction }
    )

    for (const row of rows) {
      const config =
        typeof row.prize_distribution_config === 'string'
          ? JSON.parse(row.prize_distribution_config)
          : row.prize_distribution_config
      if (!config || !Array.isArray(config.tiers)) continue

      config.tiers = config.tiers.map(tier => {
        const next = mapping[tier.tier_name]
        return next ? { ...tier, tier_name: next } : tier
      })

      await queryInterface.sequelize.query(
        `UPDATE lottery_campaigns
         SET prize_distribution_config = :config, updated_at = NOW()
         WHERE lottery_campaign_id = :id`,
        {
          replacements: {
            config: JSON.stringify(config),
            id: row.lottery_campaign_id
          },
          transaction
        }
      )
    }

    await transaction.commit()
  } catch (error) {
    await transaction.rollback()
    throw error
  }
}

module.exports = {
  async up(queryInterface) {
    await transformTierNames(queryInterface, OLD_TO_NEW, OLD_NAMES)
  },

  async down(queryInterface) {
    await transformTierNames(queryInterface, NEW_TO_OLD, Object.keys(NEW_TO_OLD))
  }
}
