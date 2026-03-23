'use strict'

/**
 * 迁移：为灰度控制新增用户白名单配置记录
 *
 * 业务背景：
 * Pity（软保底）等策略的灰度控制原先仅支持 .env 白名单和百分比滑块。
 * 运营需要在 Web 管理后台直接管理白名单用户，无需重启服务。
 *
 * 变更内容：
 * 在 lottery_strategy_config 表中为 config_group='grayscale' 新增
 * pity_user_whitelist 等白名单配置项，值为 JSON 数组格式。
 *
 * 与 Feature Flags 表的 whitelist_user_ids 是独立的两个通道：
 * - lottery_strategy_config.pity_user_whitelist → 策略配置页管理
 * - feature_flags.whitelist_user_ids → Feature Flags 管理页管理
 * 两者在引擎中合并判定（任一命中即启用）。
 *
 * @see services/UnifiedLotteryEngine/compute/config/ComputeConfig.js
 */
module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction()
    try {
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ')

      /**
       * 为四个灰度策略各添加一条 user_whitelist 配置
       * 初始值为空数组 []，运营按需在后台填入用户 ID
       */
      const whitelist_configs = [
        {
          config_key: 'pity_user_whitelist',
          description: 'Pity（软保底）灰度白名单用户ID列表，JSON数组格式，白名单内用户强制启用 Pity 保底，不受百分比限制'
        },
        {
          config_key: 'luck_debt_user_whitelist',
          description: '运气债务灰度白名单用户ID列表，JSON数组格式，白名单内用户强制启用运气债务机制'
        },
        {
          config_key: 'anti_empty_user_whitelist',
          description: '防连空灰度白名单用户ID列表，JSON数组格式，白名单内用户强制启用防连空保护'
        },
        {
          config_key: 'anti_high_user_whitelist',
          description: '防连高灰度白名单用户ID列表，JSON数组格式，白名单内用户强制启用防连高限制'
        }
      ]

      for (const config of whitelist_configs) {
        /* 幂等：已存在则跳过 */
        const [existing] = await queryInterface.sequelize.query(
          `SELECT COUNT(*) as cnt FROM lottery_strategy_config
           WHERE lottery_campaign_id = 1 AND config_group = 'grayscale' AND config_key = :config_key`,
          { replacements: { config_key: config.config_key }, transaction: t }
        )

        if (existing[0].cnt > 0) {
          console.log(`[跳过] ${config.config_key} 已存在`)
          continue
        }

        await queryInterface.sequelize.query(
          `INSERT INTO lottery_strategy_config
           (lottery_campaign_id, config_group, config_key, config_value, value_type,
            is_active, priority, description, created_at, updated_at)
           VALUES (1, 'grayscale', :config_key, '[]', 'object', 1, 100, :description, :now, :now)`,
          {
            replacements: { ...config, now },
            transaction: t
          }
        )
        console.log(`[新增] grayscale.${config.config_key} = []`)
      }

      await t.commit()
      console.log('✅ 灰度白名单配置记录迁移完成')
    } catch (error) {
      await t.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM lottery_strategy_config
       WHERE lottery_campaign_id = 1
         AND config_group = 'grayscale'
         AND config_key IN ('pity_user_whitelist', 'luck_debt_user_whitelist',
                            'anti_empty_user_whitelist', 'anti_high_user_whitelist')`
    )
    console.log('✅ 灰度白名单配置记录已回滚删除')
  }
}
