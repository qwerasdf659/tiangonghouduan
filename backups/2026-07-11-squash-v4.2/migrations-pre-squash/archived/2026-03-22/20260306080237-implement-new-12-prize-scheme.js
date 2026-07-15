'use strict'

/**
 * 迁移：实施新 12 奖品方案（抽奖奖品体系全新设计方案）
 *
 * 业务背景：
 * 从旧 8 奖品（physical/coupon 实体奖品）升级为新 12 奖品虚拟经济体系：
 *   - 6 钻石奖品（×500/×200/×80/×50/×30/×10）
 *   - 5 红水晶碎片奖品（×50/×25/×12/×8/×3）
 *   - 1 保底积分（×10）
 *
 * 执行步骤（对应设计文档第二十五章）：
 * Step 1: 更新 red_shard.budget_value_points = 1（原值 10）
 * Step 2: 软删除旧 8 条奖品 + 插入 12 条新奖品
 * Step 3: 更新档位权重（default 10/25/65、new_user 20/25/55）
 * Step 4: 添加 first_win 首抽必中策略配置
 * Step 5: 更新活动定价 base_cost=30 + grid_cols=4
 * Step 6: 清理测试数据（draws/decisions/experience_state/计数器归零）
 *
 * 关键约束：
 * - sort_order 唯一索引（lottery_campaign_id, sort_order）
 * - 每档位 win_weight 总和 = 1,000,000
 * - fallback 严格 1 个
 * - 项目未上线，安全清理测试数据
 *
 */
module.exports = {
  async up(queryInterface, _Sequelize) {
    const t = await queryInterface.sequelize.transaction()

    try {
      // ================================================================
      // Step 1: 更新 red_shard.budget_value_points = 1
      // 原值 10 → 新值 1，使 material_amount 直接等于 BP 扣减量
      // ================================================================
      await queryInterface.sequelize.query(
        "UPDATE material_asset_types SET budget_value_points = 1 WHERE asset_code = 'red_shard'",
        { transaction: t }
      )
      console.log('[Step 1] red_shard.budget_value_points 已更新为 1')

      // ================================================================
      // Step 2a: 软删除活动 1 的旧奖品
      // ================================================================
      await queryInterface.sequelize.query(
        `UPDATE lottery_prizes
         SET deleted_at = NOW(), status = 'inactive'
         WHERE lottery_campaign_id = 1 AND deleted_at IS NULL`,
        { transaction: t }
      )
      console.log('[Step 2a] 旧奖品已软删除')

      // 偏移旧奖品 sort_order 避免唯一索引冲突
      await queryInterface.sequelize.query(
        `UPDATE lottery_prizes SET sort_order = sort_order + 2000
         WHERE lottery_campaign_id = 1 AND deleted_at IS NOT NULL AND sort_order BETWEEN 1 AND 100`,
        { transaction: t }
      )
      console.log('[Step 2a] 旧奖品 sort_order 已偏移避免冲突')

      // ================================================================
      // Step 2b: 插入 12 条新奖品
      // win_weight 校验：
      //   high: 50000 + 350000 + 600000 = 1,000,000 ✓
      //   mid:  480000 + 200000 + 200000 + 120000 = 1,000,000 ✓
      //   low:  138462 + 153846 + 61538 + 107692 + 538462 = 1,000,000 ✓
      // ================================================================
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
      const campaignId = 1

      const newPrizes = [
        // high 档（3 个奖品，综合概率 10%）
        {
          sort_order: 1, prize_name: '钻石 ×500', prize_type: 'virtual',
          reward_tier: 'high', material_asset_code: 'DIAMOND', material_amount: 500,
          prize_value: 500.00, prize_value_points: 0, budget_cost: 0,
          rarity_code: 'legendary', win_weight: 50000, is_fallback: 0,
          stock_quantity: 200, max_daily_wins: null, win_probability: 0.005000
        },
        {
          sort_order: 2, prize_name: '钻石 ×200', prize_type: 'virtual',
          reward_tier: 'high', material_asset_code: 'DIAMOND', material_amount: 200,
          prize_value: 200.00, prize_value_points: 0, budget_cost: 0,
          rarity_code: 'epic', win_weight: 350000, is_fallback: 0,
          stock_quantity: 2000, max_daily_wins: null, win_probability: 0.035000
        },
        {
          sort_order: 3, prize_name: '红水晶碎片 ×50', prize_type: 'virtual',
          reward_tier: 'high', material_asset_code: 'red_shard', material_amount: 50,
          prize_value: 50.00, prize_value_points: 8, budget_cost: 50,
          rarity_code: 'epic', win_weight: 600000, is_fallback: 0,
          stock_quantity: 1000, max_daily_wins: 5, win_probability: 0.060000
        },
        // mid 档（4 个奖品，综合概率 25%）
        {
          sort_order: 4, prize_name: '钻石 ×80', prize_type: 'virtual',
          reward_tier: 'mid', material_asset_code: 'DIAMOND', material_amount: 80,
          prize_value: 80.00, prize_value_points: 0, budget_cost: 0,
          rarity_code: 'rare', win_weight: 480000, is_fallback: 0,
          stock_quantity: 999999, max_daily_wins: null, win_probability: 0.120000
        },
        {
          sort_order: 5, prize_name: '钻石 ×50', prize_type: 'virtual',
          reward_tier: 'mid', material_asset_code: 'DIAMOND', material_amount: 50,
          prize_value: 50.00, prize_value_points: 0, budget_cost: 0,
          rarity_code: 'rare', win_weight: 200000, is_fallback: 0,
          stock_quantity: 999999, max_daily_wins: null, win_probability: 0.050000
        },
        {
          sort_order: 6, prize_name: '红水晶碎片 ×25', prize_type: 'virtual',
          reward_tier: 'mid', material_asset_code: 'red_shard', material_amount: 25,
          prize_value: 25.00, prize_value_points: 4, budget_cost: 25,
          rarity_code: 'rare', win_weight: 200000, is_fallback: 0,
          stock_quantity: 999999, max_daily_wins: null, win_probability: 0.050000
        },
        {
          sort_order: 7, prize_name: '红水晶碎片 ×12', prize_type: 'virtual',
          reward_tier: 'mid', material_asset_code: 'red_shard', material_amount: 12,
          prize_value: 12.00, prize_value_points: 2, budget_cost: 12,
          rarity_code: 'uncommon', win_weight: 120000, is_fallback: 0,
          stock_quantity: 999999, max_daily_wins: null, win_probability: 0.030000
        },
        // low 档（5 个奖品，综合概率 65%）
        {
          sort_order: 8, prize_name: '钻石 ×30', prize_type: 'virtual',
          reward_tier: 'low', material_asset_code: 'DIAMOND', material_amount: 30,
          prize_value: 30.00, prize_value_points: 0, budget_cost: 0,
          rarity_code: 'uncommon', win_weight: 138462, is_fallback: 0,
          stock_quantity: 999999, max_daily_wins: null, win_probability: 0.090000
        },
        {
          sort_order: 9, prize_name: '钻石 ×10', prize_type: 'virtual',
          reward_tier: 'low', material_asset_code: 'DIAMOND', material_amount: 10,
          prize_value: 10.00, prize_value_points: 0, budget_cost: 0,
          rarity_code: 'common', win_weight: 153846, is_fallback: 0,
          stock_quantity: 999999, max_daily_wins: null, win_probability: 0.100000
        },
        {
          sort_order: 10, prize_name: '红水晶碎片 ×8', prize_type: 'virtual',
          reward_tier: 'low', material_asset_code: 'red_shard', material_amount: 8,
          prize_value: 8.00, prize_value_points: 1, budget_cost: 8,
          rarity_code: 'common', win_weight: 61538, is_fallback: 0,
          stock_quantity: 999999, max_daily_wins: null, win_probability: 0.040000
        },
        {
          sort_order: 11, prize_name: '红水晶碎片 ×3', prize_type: 'virtual',
          reward_tier: 'low', material_asset_code: 'red_shard', material_amount: 3,
          prize_value: 3.00, prize_value_points: 1, budget_cost: 3,
          rarity_code: 'common', win_weight: 107692, is_fallback: 0,
          stock_quantity: 999999, max_daily_wins: null, win_probability: 0.070000
        },
        {
          sort_order: 12, prize_name: '积分 ×10', prize_type: 'points',
          reward_tier: 'low', material_asset_code: null, material_amount: null,
          prize_value: 10.00, prize_value_points: 0, budget_cost: 0,
          rarity_code: 'common', win_weight: 538462, is_fallback: 1,
          stock_quantity: 999999, max_daily_wins: null, win_probability: 0.350000
        }
      ]

      for (const prize of newPrizes) {
        await queryInterface.sequelize.query(
          `INSERT INTO lottery_prizes (
            lottery_campaign_id, sort_order, prize_name, prize_type, reward_tier,
            material_asset_code, material_amount, prize_value, prize_value_points,
            budget_cost, rarity_code, win_weight, is_fallback, stock_quantity,
            max_daily_wins, win_probability, status, angle, color, cost_points,
            is_activity, total_win_count, daily_win_count, reserved_for_vip,
            created_at, updated_at
          ) VALUES (
            :campaign_id, :sort_order, :prize_name, :prize_type, :reward_tier,
            :material_asset_code, :material_amount, :prize_value, :prize_value_points,
            :budget_cost, :rarity_code, :win_weight, :is_fallback, :stock_quantity,
            :max_daily_wins, :win_probability, 'active', 0, '#FF6B6B', 30,
            0, 0, 0, 0,
            :now, :now
          )`,
          {
            replacements: {
              campaign_id: campaignId,
              ...prize,
              now
            },
            transaction: t
          }
        )
      }
      console.log('[Step 2b] 12 条新奖品已插入')

      // ================================================================
      // Step 3: 更新档位权重
      // default: 5%/15%/80% → 10%/25%/65%
      // new_user: 10%/20%/70% → 20%/25%/55%
      // ================================================================
      const tierUpdates = [
        { segment: 'default', tier: 'high', weight: 100000 },
        { segment: 'default', tier: 'mid', weight: 250000 },
        { segment: 'default', tier: 'low', weight: 650000 },
        { segment: 'new_user', tier: 'high', weight: 200000 },
        { segment: 'new_user', tier: 'mid', weight: 250000 },
        { segment: 'new_user', tier: 'low', weight: 550000 }
      ]

      for (const update of tierUpdates) {
        await queryInterface.sequelize.query(
          `UPDATE lottery_tier_rules SET tier_weight = :weight
           WHERE lottery_campaign_id = 1 AND segment_key = :segment AND tier_name = :tier`,
          { replacements: update, transaction: t }
        )
      }
      console.log('[Step 3] 档位权重已更新（default 10/25/65, new_user 20/25/55）')

      // ================================================================
      // Step 4: 添加 first_win 首抽必中策略配置
      // ================================================================
      const [existingFirstWin] = await queryInterface.sequelize.query(
        "SELECT COUNT(*) as cnt FROM lottery_strategy_config WHERE lottery_campaign_id = 1 AND config_group = 'first_win'",
        { transaction: t }
      )

      if (existingFirstWin[0].cnt === 0) {
        const firstWinConfigs = [
          {
            key: 'enabled', value: 'true', type: 'boolean',
            desc: '首抽必中总开关：新用户首次抽奖是否启用 Preset 注入保证中奖'
          },
          {
            key: 'inject_position', value: '2', type: 'number',
            desc: '首抽必中奖品注入位置（多抽时第2抽注入，单抽时第1抽）'
          },
          {
            key: 'debt_coefficient', value: '0.15', type: 'number',
            desc: '首抽必中触发的运气债务系数（低于普通 HIGH 的 0.5，减少惩罚性后果）'
          },
          {
            key: 'max_bp_consumption_ratio', value: '0.4', type: 'number',
            desc: '首抽奖品最大预算积分消耗比例（不超过总 BP 的 40%）'
          },
          {
            key: 'pools', type: 'object',
            desc: '五档动态首抽奖品池（按消费段匹配）',
            value: JSON.stringify({
              tier_1: { max_spend: 50, candidates: [
                { asset: 'red_shard', amount: 3, weight: 60 },
                { asset: 'DIAMOND', amount: 30, weight: 40 }
              ]},
              tier_2: { max_spend: 150, candidates: [
                { asset: 'red_shard', amount: 8, weight: 70 },
                { asset: 'DIAMOND', amount: 50, weight: 30 }
              ]},
              tier_3: { max_spend: 400, candidates: [
                { asset: 'red_shard', amount: 12, weight: 40 },
                { asset: 'DIAMOND', amount: 80, weight: 35 },
                { asset: 'red_shard', amount: 25, weight: 25 }
              ]},
              tier_4: { max_spend: 1500, candidates: [
                { asset: 'red_shard', amount: 25, weight: 45 },
                { asset: 'DIAMOND', amount: 200, weight: 30 },
                { asset: 'red_shard', amount: 50, weight: 25 }
              ]},
              tier_5: { min_spend: 1501, candidates: [
                { asset: 'red_shard', amount: 50, weight: 40 },
                { asset: 'DIAMOND', amount: 200, weight: 35 },
                { asset: 'DIAMOND', amount: 500, weight: 25 }
              ]}
            })
          }
        ]

        for (const config of firstWinConfigs) {
          await queryInterface.sequelize.query(
            `INSERT INTO lottery_strategy_config
             (lottery_campaign_id, config_group, config_key, config_value, value_type,
              is_active, priority, description, created_at, updated_at)
             VALUES (1, 'first_win', :key, :value, :type, 1, 100, :desc, :now, :now)`,
            {
              replacements: { ...config, now },
              transaction: t
            }
          )
        }
        console.log('[Step 4] first_win 策略配置已添加（5 条记录）')
      } else {
        console.log('[Step 4] first_win 配置已存在，跳过')
      }

      // ================================================================
      // Step 5a: 归档旧定价 + 插入新定价（base_cost=30, discount=1.0）
      // ================================================================
      await queryInterface.sequelize.query(
        `UPDATE lottery_campaign_pricing_config SET status = 'archived'
         WHERE lottery_campaign_id = 1 AND status = 'active'`,
        { transaction: t }
      )

      const pricingConfig = JSON.stringify({
        base_cost: 30,
        draw_buttons: [
          { count: 1, label: '单抽', enabled: true, discount: 1, sort_order: 1 },
          { count: 3, label: '3连抽', enabled: true, discount: 1, sort_order: 3 },
          { count: 5, label: '5连抽', enabled: true, discount: 1, sort_order: 5 },
          { count: 10, label: '10连抽', enabled: true, discount: 1, sort_order: 10 }
        ]
      })

      await queryInterface.sequelize.query(
        `INSERT INTO lottery_campaign_pricing_config
         (lottery_campaign_pricing_config_id, lottery_campaign_id, version, pricing_config,
          status, created_by, created_at, updated_at)
         VALUES (:config_id, 1, 14, :pricing_config, 'active', 31, :now, :now)`,
        {
          replacements: {
            config_id: `pricing_${Date.now()}_new12`,
            pricing_config: pricingConfig,
            now
          },
          transaction: t
        }
      )
      console.log('[Step 5a] 定价已更新：base_cost=30, 折扣全部 1.0')

      // ================================================================
      // Step 5b: 更新 campaign grid_cols = 4（D29）
      // ================================================================
      await queryInterface.sequelize.query(
        'UPDATE lottery_campaigns SET grid_cols = 4 WHERE lottery_campaign_id = 1',
        { transaction: t }
      )
      console.log('[Step 5b] campaign grid_cols 已更新为 4')

      // ================================================================
      // Step 5c: 更新 tier_fallback.prize_id → 新保底奖品（B11 关键修复）
      // ================================================================
      const [newFallbackRows] = await queryInterface.sequelize.query(
        `SELECT lottery_prize_id FROM lottery_prizes
         WHERE lottery_campaign_id = 1 AND is_fallback = 1
           AND deleted_at IS NULL AND status = 'active'
         ORDER BY lottery_prize_id DESC LIMIT 1`,
        { transaction: t }
      )
      if (newFallbackRows.length > 0) {
        const newFallbackId = newFallbackRows[0].lottery_prize_id
        await queryInterface.sequelize.query(
          `UPDATE lottery_strategy_config SET config_value = :pid
           WHERE lottery_campaign_id = 1
             AND config_group = 'tier_fallback' AND config_key = 'prize_id'`,
          { replacements: { pid: String(newFallbackId) }, transaction: t }
        )
        console.log(`[Step 5c] tier_fallback.prize_id → ${newFallbackId}`)
      } else {
        console.warn('[Step 5c] 未找到新保底奖品，tier_fallback.prize_id 未更新')
      }

      // ================================================================
      // Step 5d: Pity 灰度 52% → 100%（B12 关键修复）
      // ================================================================
      await queryInterface.sequelize.query(
        `UPDATE lottery_strategy_config SET config_value = '100'
         WHERE lottery_campaign_id = 1
           AND config_group = 'grayscale' AND config_key = 'pity_percentage'`,
        { transaction: t }
      )
      console.log('[Step 5d] pity_percentage → 100%')

      // ================================================================
      // Step 6: 清理测试数据（项目未上线，干净起步）
      // ================================================================
      // 6a: 清空抽奖决策记录
      await queryInterface.sequelize.query(
        `DELETE dd FROM lottery_draw_decisions dd
         INNER JOIN lottery_draws ld ON dd.lottery_draw_id = ld.lottery_draw_id
         WHERE ld.lottery_campaign_id = 1`,
        { transaction: t }
      )

      // 6b: 清空抽奖记录
      await queryInterface.sequelize.query(
        'DELETE FROM lottery_draws WHERE lottery_campaign_id = 1',
        { transaction: t }
      )

      // 6c: 清空用户体验状态
      await queryInterface.sequelize.query(
        'DELETE FROM lottery_user_experience_state WHERE lottery_campaign_id = 1',
        { transaction: t }
      )

      // 6d: 重置 campaign 统计计数器
      await queryInterface.sequelize.query(
        `UPDATE lottery_campaigns SET
          total_participants = 0, total_draws = 0, total_prizes_awarded = 0
         WHERE lottery_campaign_id = 1`,
        { transaction: t }
      )

      // 6e: 清空用户配额记录
      const [quotaTable] = await queryInterface.sequelize.query(
        "SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'lottery_campaign_user_quota'"
      )
      if (quotaTable[0].cnt > 0) {
        await queryInterface.sequelize.query(
          'DELETE FROM lottery_campaign_user_quota WHERE lottery_campaign_id = 1',
          { transaction: t }
        )
      }

      console.log('[Step 6] 测试数据已清理（draws/decisions/experience_state/计数器归零）')

      await t.commit()
      console.log('\n✅ 新 12 奖品方案迁移完成')
    } catch (error) {
      await t.rollback()
      console.error('❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface, _Sequelize) {
    const t = await queryInterface.sequelize.transaction()

    try {
      // 回滚：删除新 12 条奖品
      await queryInterface.sequelize.query(
        `DELETE FROM lottery_prizes
         WHERE lottery_campaign_id = 1 AND sort_order BETWEEN 1 AND 12
           AND prize_name IN (
             '钻石 ×500', '钻石 ×200', '红水晶碎片 ×50',
             '钻石 ×80', '钻石 ×50', '红水晶碎片 ×25', '红水晶碎片 ×12',
             '钻石 ×30', '钻石 ×10', '红水晶碎片 ×8', '红水晶碎片 ×3', '积分 ×10'
           )`,
        { transaction: t }
      )

      // 恢复旧奖品
      await queryInterface.sequelize.query(
        `UPDATE lottery_prizes SET deleted_at = NULL, status = 'active', sort_order = sort_order - 2000
         WHERE lottery_campaign_id = 1 AND deleted_at IS NOT NULL AND sort_order > 2000`,
        { transaction: t }
      )

      // 恢复 red_shard.budget_value_points = 10
      await queryInterface.sequelize.query(
        "UPDATE material_asset_types SET budget_value_points = 10 WHERE asset_code = 'red_shard'",
        { transaction: t }
      )

      // 恢复档位权重
      const oldWeights = [
        { segment: 'default', tier: 'high', weight: 50000 },
        { segment: 'default', tier: 'mid', weight: 150000 },
        { segment: 'default', tier: 'low', weight: 800000 },
        { segment: 'new_user', tier: 'high', weight: 100000 },
        { segment: 'new_user', tier: 'mid', weight: 200000 },
        { segment: 'new_user', tier: 'low', weight: 700000 }
      ]
      for (const w of oldWeights) {
        await queryInterface.sequelize.query(
          `UPDATE lottery_tier_rules SET tier_weight = :weight
           WHERE lottery_campaign_id = 1 AND segment_key = :segment AND tier_name = :tier`,
          { replacements: w, transaction: t }
        )
      }

      // 删除 first_win 配置
      await queryInterface.sequelize.query(
        "DELETE FROM lottery_strategy_config WHERE lottery_campaign_id = 1 AND config_group = 'first_win'",
        { transaction: t }
      )

      // 恢复定价
      await queryInterface.sequelize.query(
        `UPDATE lottery_campaign_pricing_config SET status = 'active'
         WHERE lottery_campaign_id = 1 AND version = 13`,
        { transaction: t }
      )
      await queryInterface.sequelize.query(
        `DELETE FROM lottery_campaign_pricing_config
         WHERE lottery_campaign_id = 1 AND version = 14`,
        { transaction: t }
      )

      // 恢复 grid_cols
      await queryInterface.sequelize.query(
        'UPDATE lottery_campaigns SET grid_cols = 3 WHERE lottery_campaign_id = 1',
        { transaction: t }
      )

      await t.commit()
      console.log('✅ 回滚完成：恢复旧 8 奖品方案')
    } catch (error) {
      await t.rollback()
      throw error
    }
  }
}

