'use strict'

/**
 * Pressure-Only 矩阵迁移
 *
 * 背景：双配额体系（DIAMOND_QUOTA + BUDGET_POINTS）下，
 * BudgetTierCalculator._calculateDynamicThresholds 因 DIAMOND 奖品 pvp=0 导致
 * 动态阈值坍塌，Budget Tier 概率门控完全失效（所有用户恒为 B3）。
 *
 * 方案：Budget Tier 降级为纯监控指标，概率层只保留 Pressure Tier，
 * 资格控制全靠 BuildPrizePoolStage._filterByResourceEligibility 资源级过滤。
 *
 * 变更内容：
 * 1. ALTER ENUM 加 'ALL' 值（表示不区分 Budget Tier）
 * 2. 删除旧的 12 行 B0-B3 差异化数据
 * 3. 插入 3 行 budget_tier='ALL' 的 Pressure-Only 数据（P0/P1/P2）
 *
 */
module.exports = {
  async up(queryInterface) {
    // 1. ALTER ENUM 加 'ALL' 值
    await queryInterface.sequelize.query(`
      ALTER TABLE lottery_tier_matrix_config
      MODIFY COLUMN budget_tier ENUM('B0','B1','B2','B3','ALL') NOT NULL DEFAULT 'ALL'
    `)

    // 2. 删除旧的 B0-B3 数据（所有活动）
    await queryInterface.sequelize.query(`
      DELETE FROM lottery_tier_matrix_config
      WHERE budget_tier IN ('B0','B1','B2','B3')
    `)

    // 3. 为 campaign_id=1（当前唯一 active 活动）插入 Pressure-Only 数据
    await queryInterface.sequelize.query(`
      INSERT INTO lottery_tier_matrix_config
        (lottery_campaign_id, budget_tier, pressure_tier,
         high_multiplier, mid_multiplier, low_multiplier, fallback_multiplier,
         cap_multiplier, empty_weight_multiplier,
         description, is_active, created_at, updated_at)
      VALUES
        (1, 'ALL', 'P0', 1.30, 1.10, 0.90, 0.80, 1.00, 1.00,
         'Pressure-Only P0：低压，高档概率略提', 1, NOW(), NOW()),
        (1, 'ALL', 'P1', 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
         'Pressure-Only P1：中压，保持原始权重', 1, NOW(), NOW()),
        (1, 'ALL', 'P2', 0.60, 0.80, 1.20, 1.50, 1.00, 1.00,
         'Pressure-Only P2：高压，压低高档提高低档', 1, NOW(), NOW())
    `)
  },

  async down(queryInterface) {
    // 1. 删除 'ALL' 行
    await queryInterface.sequelize.query(`
      DELETE FROM lottery_tier_matrix_config WHERE budget_tier = 'ALL'
    `)

    // 2. 恢复 ENUM（去掉 'ALL'）
    await queryInterface.sequelize.query(`
      ALTER TABLE lottery_tier_matrix_config
      MODIFY COLUMN budget_tier ENUM('B0','B1','B2','B3') NOT NULL
    `)

    // 3. 重新插入原始 12 行 B0-B3 差异化数据（campaign_id=1）
    await queryInterface.sequelize.query(`
      INSERT INTO lottery_tier_matrix_config
        (lottery_campaign_id, budget_tier, pressure_tier,
         high_multiplier, mid_multiplier, low_multiplier, fallback_multiplier,
         cap_multiplier, empty_weight_multiplier,
         description, is_active, created_at, updated_at)
      VALUES
        (1,'B0','P0', 0.00,0.00,1.00,1.00, 0.00,10.00, 'B0×P0 回滚', 1, NOW(), NOW()),
        (1,'B0','P1', 0.00,0.00,1.00,1.00, 0.00,10.00, 'B0×P1 回滚', 1, NOW(), NOW()),
        (1,'B0','P2', 0.00,0.00,1.00,1.00, 0.30,10.00, 'B0×P2 回滚', 1, NOW(), NOW()),
        (1,'B1','P0', 0.00,0.00,1.20,0.90, 1.00,1.20,  'B1×P0 回滚', 1, NOW(), NOW()),
        (1,'B1','P1', 0.00,0.00,1.00,1.00, 1.00,1.00,  'B1×P1 回滚', 1, NOW(), NOW()),
        (1,'B1','P2', 0.00,0.00,0.80,1.20, 0.80,0.80,  'B1×P2 回滚', 1, NOW(), NOW()),
        (1,'B2','P0', 0.00,1.30,1.10,0.80, 1.00,1.00,  'B2×P0 回滚', 1, NOW(), NOW()),
        (1,'B2','P1', 0.00,1.00,1.00,1.00, 1.30,0.90,  'B2×P1 回滚', 1, NOW(), NOW()),
        (1,'B2','P2', 0.00,0.70,1.10,1.30, 0.90,0.70,  'B2×P2 回滚', 1, NOW(), NOW()),
        (1,'B3','P0', 1.50,1.20,0.90,0.70, 1.00,0.80,  'B3×P0 回滚', 1, NOW(), NOW()),
        (1,'B3','P1', 1.00,1.00,1.00,1.00, 1.00,0.70,  'B3×P1 回滚', 1, NOW(), NOW()),
        (1,'B3','P2', 0.60,0.80,1.20,1.50, 1.00,0.60,  'B3×P2 回滚', 1, NOW(), NOW())
    `)
  }
}

