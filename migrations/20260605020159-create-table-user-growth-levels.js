'use strict'

/**
 * 新建独立"用户成长等级"体系（P1=乙，2026-06-04 合规改造 B 线依赖项）
 *
 * 业务背景（详见 docs/抽奖管理干预接入缺口诊断.md §六）：
 * - per-user 暗箱干预下线后，"让某类人更易中"改走"按成长等级的公示分级概率"（B 线）
 * - 成长等级是独立一等公民体系：累计消费/积分（users.history_total_points）→ 成长等级
 * - ⚠️ 不复用 users.user_level enum('normal','vip','merchant')（那是身份类型，merchant 是商家不应"更易中"）
 * - 等级可被抽奖中奖率加成、兑换折扣、特权、客服优先级等多功能复用；抽奖只读不造
 *
 * 表设计（配置实体：低频变更、语义稳定、数量有限 → 业务码 level_key）：
 * - user_growth_levels：定义成长等级阶梯（level_key + 阈值 min_history_points）
 * - 用户当前等级由 UserGrowthLevelService 根据 history_total_points 实时派生（单一数据源，无 per-user 同步债）
 * - 各等级的中奖率倍数不在本表，而在 lottery_strategy_config 的 level_probability 组按活动配置（公示口径）
 *
 * ⚠️ 阈值为占位起步值，需运营按真实业务规则确认后通过管理 API 调整（不得当作最终业务数据）
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()

    try {
      await queryInterface.createTable(
        'user_growth_levels',
        {
          user_growth_level_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            comment: '成长等级定义主键'
          },
          level_key: {
            type: Sequelize.STRING(32),
            allowNull: false,
            comment: '成长等级业务码（如 bronze/silver/gold/diamond），全局稳定标识'
          },
          level_name: {
            type: Sequelize.STRING(32),
            allowNull: false,
            comment: '成长等级中文名（如 青铜/白银/黄金/钻石），用于展示'
          },
          min_history_points: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '达到该等级所需的累计积分下限（取 users.history_total_points 比对，含本值）'
          },
          sort_order: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '等级排序（由低到高，0 最低）'
          },
          status: {
            type: Sequelize.ENUM('active', 'inactive'),
            allowNull: false,
            defaultValue: 'active',
            comment: '等级状态：active-启用，inactive-停用'
          },
          description: {
            type: Sequelize.STRING(255),
            allowNull: true,
            comment: '等级说明（含会员权益公示口径）'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间（北京时间）'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
            comment: '更新时间（北京时间）'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '用户成长等级定义表（独立体系，累计积分→等级；抽奖等多功能只读复用）'
        }
      )

      // level_key 唯一
      await queryInterface.addConstraint('user_growth_levels', {
        fields: ['level_key'],
        type: 'unique',
        name: 'uk_user_growth_levels_level_key',
        transaction
      })
      // 按阈值快速派生等级
      await queryInterface.addIndex('user_growth_levels', ['status', 'min_history_points'], {
        name: 'idx_user_growth_levels_status_points',
        transaction
      })

      /*
       * 种子：起步阶梯（⚠️ min_history_points 为占位起步值，需运营按真实业务规则确认）
       * bronze 阈值=0 保证所有用户至少落在最低档（multiplier 默认 1.0，零行为变化，安全）
       * 实际倍数在 lottery_strategy_config.level_probability 按活动配置（公示口径）
       */
      await queryInterface.bulkInsert(
        'user_growth_levels',
        [
          {
            level_key: 'bronze',
            level_name: '青铜',
            min_history_points: 0,
            sort_order: 0,
            status: 'active',
            description: '成长等级最低档（累计积分 0 起）；阈值为起步占位值，需运营确认',
            created_at: sequelize.literal('CURRENT_TIMESTAMP'),
            updated_at: sequelize.literal('CURRENT_TIMESTAMP')
          },
          {
            level_key: 'silver',
            level_name: '白银',
            min_history_points: 100000,
            sort_order: 1,
            status: 'active',
            description: '⚠️ 占位阈值 100000，需运营按真实业务规则确认',
            created_at: sequelize.literal('CURRENT_TIMESTAMP'),
            updated_at: sequelize.literal('CURRENT_TIMESTAMP')
          },
          {
            level_key: 'gold',
            level_name: '黄金',
            min_history_points: 500000,
            sort_order: 2,
            status: 'active',
            description: '⚠️ 占位阈值 500000，需运营按真实业务规则确认',
            created_at: sequelize.literal('CURRENT_TIMESTAMP'),
            updated_at: sequelize.literal('CURRENT_TIMESTAMP')
          },
          {
            level_key: 'diamond',
            level_name: '钻石',
            min_history_points: 2000000,
            sort_order: 3,
            status: 'active',
            description: '⚠️ 占位阈值 2000000，需运营按真实业务规则确认',
            created_at: sequelize.literal('CURRENT_TIMESTAMP'),
            updated_at: sequelize.literal('CURRENT_TIMESTAMP')
          }
        ],
        { transaction }
      )

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('user_growth_levels')
  }
}
