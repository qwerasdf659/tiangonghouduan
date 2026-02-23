'use strict'

/**
 * 回填缺失的基础策略配置
 *
 * 问题：活动 25/26/27 在前一次迁移中只补充了 management + grayscale 5条，
 *       缺少 pity/anti_empty/anti_high/luck_debt/budget_tier/pressure_tier/matrix 等基础配置。
 * 方案：以活动 1 的完整配置为模板，幂等地为缺失活动补充完整配置集。
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      /** 完整的默认策略配置（每活动 24 条） */
      const FULL_DEFAULTS = [
        { group: 'anti_empty', key: 'enabled', value: 'true', type: 'boolean', desc: '防连空开关' },
        { group: 'anti_empty', key: 'empty_streak_threshold', value: '3', type: 'number', desc: '连续空奖触发阈值' },
        { group: 'anti_high', key: 'enabled', value: 'true', type: 'boolean', desc: '防连高开关' },
        { group: 'anti_high', key: 'high_streak_threshold', value: '2', type: 'number', desc: '连续高价值触发阈值' },
        { group: 'anti_high', key: 'recent_draw_window', value: '5', type: 'number', desc: '近期抽奖统计窗口' },
        { group: 'budget_tier', key: 'threshold_high', value: '1000', type: 'number', desc: 'B3阈值' },
        { group: 'budget_tier', key: 'threshold_mid', value: '500', type: 'number', desc: 'B2阈值' },
        { group: 'budget_tier', key: 'threshold_low', value: '100', type: 'number', desc: 'B1阈值' },
        { group: 'luck_debt', key: 'enabled', value: 'true', type: 'boolean', desc: '运气债务开关' },
        { group: 'luck_debt', key: 'expected_empty_rate', value: '0.3', type: 'number', desc: '期望空奖率' },
        { group: 'luck_debt', key: 'min_draw_count', value: '10', type: 'number', desc: '最小样本量' },
        { group: 'matrix', key: 'enabled', value: 'true', type: 'boolean', desc: 'BxPx矩阵开关' },
        { group: 'pity', key: 'enabled', value: 'true', type: 'boolean', desc: 'Pity保底开关' },
        { group: 'pity', key: 'hard_guarantee_threshold', value: '10', type: 'number', desc: '硬保底阈值' },
        { group: 'pity', key: 'min_non_empty_cost', value: '10', type: 'number', desc: '最低非空奖价值' },
        { group: 'pity', key: 'multiplier_table', value: '{"0":1,"1":1,"2":1,"3":1.5,"4":2,"5":3,"6":4,"7":6,"8":8,"9":10}', type: 'object', desc: 'Pity倍数表' },
        { group: 'pressure_tier', key: 'enabled', value: 'true', type: 'boolean', desc: '活动压力开关' },
        { group: 'pressure_tier', key: 'threshold_high', value: '0.8', type: 'number', desc: 'P2阈值' },
        { group: 'pressure_tier', key: 'threshold_low', value: '0.5', type: 'number', desc: 'P1阈值' },
        { group: 'management', key: 'enabled', value: 'true', type: 'boolean', desc: '管理干预总开关' },
        { group: 'grayscale', key: 'pity_percentage', value: '100', type: 'number', desc: 'Pity灰度百分比' },
        { group: 'grayscale', key: 'luck_debt_percentage', value: '100', type: 'number', desc: '运气债务灰度百分比' },
        { group: 'grayscale', key: 'anti_empty_percentage', value: '100', type: 'number', desc: '防连空灰度百分比' },
        { group: 'grayscale', key: 'anti_high_percentage', value: '100', type: 'number', desc: '防连高灰度百分比' }
      ]

      const [campaigns] = await queryInterface.sequelize.query(
        'SELECT lottery_campaign_id FROM lottery_campaigns',
        { transaction }
      )

      let inserted_total = 0

      for (const campaign of campaigns) {
        const cid = campaign.lottery_campaign_id

        for (const cfg of FULL_DEFAULTS) {
          const [existing] = await queryInterface.sequelize.query(
            `SELECT lottery_strategy_config_id FROM lottery_strategy_config
             WHERE lottery_campaign_id = ? AND config_group = ? AND config_key = ? AND priority = 0`,
            { replacements: [cid, cfg.group, cfg.key], transaction }
          )

          if (existing.length === 0) {
            await queryInterface.sequelize.query(
              `INSERT INTO lottery_strategy_config
                (lottery_campaign_id, config_group, config_key, config_value, value_type, description, is_active, priority, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 1, 0, NOW(), NOW())`,
              { replacements: [cid, cfg.group, cfg.key, cfg.value, cfg.type, cfg.desc], transaction }
            )
            inserted_total++
          }
        }
      }

      console.log(`[backfill] 为 ${campaigns.length} 个活动补充了 ${inserted_total} 条缺失配置`)
      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    /* 回退：删除活动 25/26/27 的基础策略配置（活动 1 的配置不动） */
    await queryInterface.sequelize.query(
      `DELETE FROM lottery_strategy_config
       WHERE lottery_campaign_id IN (25, 26, 27)
         AND config_group NOT IN ('management', 'grayscale', 'matrix', 'pressure_tier')
         AND priority = 0`
    )
  }
}
