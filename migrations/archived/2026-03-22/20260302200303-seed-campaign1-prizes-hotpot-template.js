'use strict'

/**
 * 活动 1 奖品重配：基于文档第三章「火锅店九宫格活动」模板
 *
 * 业务背景：
 * - D10 已清理活动 1 全部旧奖品（15 个不合规奖品 + 5 个 fallback）
 * - 本迁移按文档方案新建 8 个奖品，匹配 card_flip 弹性范围 4-20
 *
 * 奖品配置依据（文档「三、完整示例：火锅店九宫格活动」）：
 * - 客单价约 100 元（消费 100 元 → 22 预算积分 → 100 钻石配额）
 * - 五层结构：镇场大奖 + 惊喜奖 + 实惠小奖 + 微回馈 + fallback
 * - 每个档位 win_weight 总和 = 1,000,000
 * - fallback 严格 1 个，prize_value_points=0，prize_type=points
 * - low 档非 fallback 的 prize_value_points >= 1
 *
 */
module.exports = {
  async up(queryInterface, _Sequelize) {
    const [campaigns] = await queryInterface.sequelize.query(
      'SELECT lottery_campaign_id FROM lottery_campaigns WHERE lottery_campaign_id = 1'
    )
    if (campaigns.length === 0) {
      console.log('[Seed] 活动 1 不存在，跳过奖品配置')
      return
    }

    const [existing] = await queryInterface.sequelize.query(
      "SELECT COUNT(*) as cnt FROM lottery_prizes WHERE lottery_campaign_id = 1 AND deleted_at IS NULL AND status = 'active'"
    )
    if (existing[0].cnt > 0) {
      console.log(`[Seed] 活动 1 已有 ${existing[0].cnt} 个激活奖品，跳过避免重复`)
      return
    }

    // 清空已软删除旧奖品的 sort_order，避免唯一索引冲突
    await queryInterface.sequelize.query(
      `UPDATE lottery_prizes SET sort_order = sort_order + 1000
       WHERE lottery_campaign_id = 1 AND deleted_at IS NOT NULL AND sort_order BETWEEN 1 AND 20`
    )
    console.log('[Seed] 已偏移旧奖品 sort_order 避免唯一索引冲突')

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ')

    /**
     * 8 个奖品 - 火锅店九宫格模板
     *
     * 格位 | 奖品名称         | 类型     | 档位 | 可见价值 | 预算价值 | 稀有度    | 档内权重   | 库存  | 每日上限
     * 1    | 四人鸳鸯锅套餐     | physical | high | 388     | 20      | legendary | 200,000   | 50    | 2
     * 2    | 八折优惠券         | coupon   | high | 0       | 15      | epic      | 800,000   | 3000  | NULL
     * 3    | 招牌虾滑1份       | physical | mid  | 68      | 10      | rare      | 400,000   | 500   | 10
     * 4    | 精酿啤酒1杯       | physical | mid  | 38      | 8       | rare      | 350,000   | 1000  | 20
     * 5    | 九五折券           | coupon   | mid  | 0       | 5       | uncommon  | 250,000   | 8000  | NULL
     * 6    | 钻石×1            | virtual  | low  | 1       | 1       | common    | 300,000   | 99999 | NULL
     * 7    | 幸运5积分         | points   | low  | 5       | 1       | common    | 350,000   | 99999 | NULL
     * 8    | 幸运5积分(保底)    | points   | low  | 5       | 0       | common    | 350,000   | 99999 | NULL (fallback)
     */
    const prizes = [
      {
        lottery_campaign_id: 1,
        prize_name: '四人鸳鸯锅套餐',
        prize_type: 'physical',
        reward_tier: 'high',
        rarity_code: 'legendary',
        prize_value: 388.00,
        prize_value_points: 20,
        win_weight: 200000,
        win_probability: 0.01,
        stock_quantity: 50,
        max_daily_wins: 2,
        max_user_wins: 1,
        is_fallback: 0,
        sort_order: 1,
        status: 'active',
        prize_description: '镇场大奖：四人鸳鸯锅超值套餐，含锅底+四荤四素+小吃拼盘',
        material_asset_code: null,
        material_amount: null,
        primary_media_id: null,
        merchant_id: null,
        reserved_for_vip: 0,
        total_win_count: 0,
        daily_win_count: 0,
        created_at: now,
        updated_at: now
      },
      {
        lottery_campaign_id: 1,
        prize_name: '八折优惠券',
        prize_type: 'coupon',
        reward_tier: 'high',
        rarity_code: 'epic',
        prize_value: 0.00,
        prize_value_points: 15,
        win_weight: 800000,
        win_probability: 0.04,
        stock_quantity: 3000,
        max_daily_wins: null,
        max_user_wins: null,
        is_fallback: 0,
        sort_order: 2,
        status: 'active',
        prize_description: '惊喜奖：全场八折优惠券，下次到店结账时出示核销码使用',
        material_asset_code: null,
        material_amount: null,
        primary_media_id: null,
        merchant_id: null,
        reserved_for_vip: 0,
        total_win_count: 0,
        daily_win_count: 0,
        created_at: now,
        updated_at: now
      },
      {
        lottery_campaign_id: 1,
        prize_name: '招牌虾滑1份',
        prize_type: 'physical',
        reward_tier: 'mid',
        rarity_code: 'rare',
        prize_value: 68.00,
        prize_value_points: 10,
        win_weight: 400000,
        win_probability: 0.06,
        stock_quantity: 500,
        max_daily_wins: 10,
        max_user_wins: null,
        is_fallback: 0,
        sort_order: 3,
        status: 'active',
        prize_description: '实惠小奖：招牌手打虾滑1份，到店出示核销码领取',
        material_asset_code: null,
        material_amount: null,
        primary_media_id: null,
        merchant_id: null,
        reserved_for_vip: 0,
        total_win_count: 0,
        daily_win_count: 0,
        created_at: now,
        updated_at: now
      },
      {
        lottery_campaign_id: 1,
        prize_name: '精酿啤酒1杯',
        prize_type: 'physical',
        reward_tier: 'mid',
        rarity_code: 'rare',
        prize_value: 38.00,
        prize_value_points: 8,
        win_weight: 350000,
        win_probability: 0.05,
        stock_quantity: 1000,
        max_daily_wins: 20,
        max_user_wins: null,
        is_fallback: 0,
        sort_order: 4,
        status: 'active',
        prize_description: '实惠小奖：精酿啤酒1杯，到店出示核销码领取',
        material_asset_code: null,
        material_amount: null,
        primary_media_id: null,
        merchant_id: null,
        reserved_for_vip: 0,
        total_win_count: 0,
        daily_win_count: 0,
        created_at: now,
        updated_at: now
      },
      {
        lottery_campaign_id: 1,
        prize_name: '九五折券',
        prize_type: 'coupon',
        reward_tier: 'mid',
        rarity_code: 'uncommon',
        prize_value: 0.00,
        prize_value_points: 5,
        win_weight: 250000,
        win_probability: 0.04,
        stock_quantity: 8000,
        max_daily_wins: null,
        max_user_wins: null,
        is_fallback: 0,
        sort_order: 5,
        status: 'active',
        prize_description: '实惠小奖：九五折优惠券，下次到店结账时出示核销码使用',
        material_asset_code: null,
        material_amount: null,
        primary_media_id: null,
        merchant_id: null,
        reserved_for_vip: 0,
        total_win_count: 0,
        daily_win_count: 0,
        created_at: now,
        updated_at: now
      },
      {
        lottery_campaign_id: 1,
        prize_name: '钻石×1',
        prize_type: 'virtual',
        reward_tier: 'low',
        rarity_code: 'common',
        prize_value: 1.00,
        prize_value_points: 1,
        win_weight: 300000,
        win_probability: 0.24,
        stock_quantity: 99999,
        max_daily_wins: null,
        max_user_wins: null,
        is_fallback: 0,
        sort_order: 6,
        status: 'active',
        prize_description: '微回馈：获得1颗钻石，可用于交易市场或投放广告',
        material_asset_code: 'DIAMOND',
        material_amount: 1,
        primary_media_id: null,
        merchant_id: null,
        reserved_for_vip: 0,
        total_win_count: 0,
        daily_win_count: 0,
        created_at: now,
        updated_at: now
      },
      {
        lottery_campaign_id: 1,
        prize_name: '幸运5积分',
        prize_type: 'points',
        reward_tier: 'low',
        rarity_code: 'common',
        prize_value: 5.00,
        prize_value_points: 1,
        win_weight: 350000,
        win_probability: 0.28,
        stock_quantity: 99999,
        max_daily_wins: null,
        max_user_wins: null,
        is_fallback: 0,
        sort_order: 7,
        status: 'active',
        prize_description: '微回馈：获得5积分，可用于下次抽奖',
        material_asset_code: null,
        material_amount: null,
        primary_media_id: null,
        merchant_id: null,
        reserved_for_vip: 0,
        total_win_count: 0,
        daily_win_count: 0,
        created_at: now,
        updated_at: now
      },
      {
        lottery_campaign_id: 1,
        prize_name: '幸运5积分',
        prize_type: 'points',
        reward_tier: 'low',
        rarity_code: 'common',
        prize_value: 5.00,
        prize_value_points: 0,
        win_weight: 350000,
        win_probability: 0.28,
        stock_quantity: 99999,
        max_daily_wins: null,
        max_user_wins: null,
        is_fallback: 1,
        sort_order: 8,
        status: 'active',
        prize_description: '保底奖品(fallback)：确保每次抽奖都有结果，获得5积分',
        material_asset_code: null,
        material_amount: null,
        primary_media_id: null,
        merchant_id: null,
        reserved_for_vip: 0,
        total_win_count: 0,
        daily_win_count: 0,
        created_at: now,
        updated_at: now
      }
    ]

    await queryInterface.bulkInsert('lottery_prizes', prizes)
    console.log(`[Seed] 已为活动 1 创建 ${prizes.length} 个奖品（火锅店模板）`)

    // 验证权重总和
    const [weightCheck] = await queryInterface.sequelize.query(`
      SELECT reward_tier, SUM(win_weight) as total_weight, COUNT(*) as cnt
      FROM lottery_prizes
      WHERE lottery_campaign_id = 1 AND deleted_at IS NULL AND status = 'active'
      GROUP BY reward_tier
    `)
    weightCheck.forEach(row => {
      const ok = parseInt(row.total_weight) === 1000000 ? '✅' : '❌'
      console.log(`  ${ok} ${row.reward_tier}: ${row.cnt} 个奖品, 权重总和 ${row.total_weight}`)
    })
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.sequelize.query(`
      DELETE FROM lottery_prizes
      WHERE lottery_campaign_id = 1
        AND prize_name IN (
          '四人鸳鸯锅套餐', '八折优惠券', '招牌虾滑1份', '精酿啤酒1杯',
          '九五折券', '钻石×1', '幸运5积分'
        )
        AND created_at >= '2026-03-02'
    `)
    console.log('[Seed rollback] 已删除活动 1 火锅店模板奖品')
  }
}

