'use strict'

/**
 * 新建「水晶奖品倍率规则」两表（水晶奖品倍率活动设计方案 §18.1 / §3.1 / §3.2）
 *
 * - reward_multiplier_campaigns：倍率规则主表（绑定到具体抽奖活动，活动间隔离）
 * - reward_multiplier_targets   ：倍率规则作用对象表（仅引用现网人群标识，不自造人群）
 *
 * 关键约束（求证真实库后校准）：
 * - lottery_campaign_id 用 INT（对齐 lottery_campaigns.lottery_campaign_id 真实类型 INT，A11）。
 * - 强制绑定活动（NOT NULL），禁止全局规则（D-8 活动隔离）。
 * - extra_cost_limit NOT NULL（D-6 成本封顶强制必填）。
 * - target_type='segment' 时 target_ref 存 segment_key，命中判定复用活动 resolver_version 内
 *   SegmentResolver 求值（§14.2 / D-1）；不建外键到人群表（弱引用软标识）。
 * - 不新增 per_draw_extra_cap 列（D-9：red_gem 订正为 10 后取消双口径，单一成本封顶覆盖全部水晶）。
 * - 字符集 utf8mb4_unicode_ci；created_at/updated_at DATETIME；BIGINT 主键。
 *
 * 事务化 up/down，可回滚。
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()

    try {
      // ========== 主表：reward_multiplier_campaigns ==========
      await queryInterface.createTable(
        'reward_multiplier_campaigns',
        {
          multiplier_campaign_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '倍率规则主键'
          },
          lottery_campaign_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment:
              '绑定的抽奖活动ID（FK→lottery_campaigns.lottery_campaign_id）；该规则只在此活动内生效；强制必填，禁止全局规则（活动隔离）'
          },
          campaign_name: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '规则名（对内运营识别）'
          },
          display_name: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '对用户展示名（如"新春水晶翻倍"）'
          },
          multiplier: {
            type: Sequelize.DECIMAL(4, 2),
            allowNull: false,
            comment: '倍率（支持小数，如 1.50/1.75/2.00/2.50），>=1'
          },
          reward_scope: {
            type: Sequelize.ENUM('crystal_all', 'group', 'asset_codes'),
            allowNull: false,
            defaultValue: 'crystal_all',
            comment:
              '作用奖品范围：crystal_all=全部水晶 / group=按 group_code / asset_codes=指定资产码'
          },
          scope_values: {
            type: Sequelize.JSON,
            allowNull: true,
            comment:
              'reward_scope=group 时存 group_code 数组；=asset_codes 时存 asset_code 数组；=crystal_all 时 NULL'
          },
          target_type: {
            type: Sequelize.ENUM('all', 'segment', 'tag', 'growth_level', 'user'),
            allowNull: false,
            defaultValue: 'all',
            comment:
              '作用人群：all=全体 / segment=分群(segment_rule_configs) / tag=标签(user_ad_tags) / growth_level=等级(user_growth_levels) / user=指定用户'
          },
          rounding_mode: {
            type: Sequelize.ENUM('round', 'floor', 'ceil'),
            allowNull: false,
            defaultValue: 'ceil',
            comment:
              '小数倍率取整方式（默认 ceil 向上，偏用户体感）：ceil=向上 / round=四舍五入 / floor=向下'
          },
          stack_strategy: {
            type: Sequelize.ENUM('max'),
            allowNull: false,
            defaultValue: 'max',
            comment: '同活动内多规则命中合并策略（当前全局仅 max，预留枚举）'
          },
          priority: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '优先级（并列同倍率时决胜与展示排序，越大越优先）'
          },
          max_multiplier_cap: {
            type: Sequelize.DECIMAL(4, 2),
            allowNull: false,
            defaultValue: 3.0,
            comment: '倍率硬上限（默认 3.00，覆盖 2.5 需求且留余量；防误填，发放时二次夹紧）'
          },
          extra_cost_limit: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment:
              '因翻倍额外送出水晶的成本上限（按 material_asset_types.budget_value_points 折算累计）；本规则的成本刹车；强制必填，达上限自动停翻回落×1'
          },
          extra_cost_used: {
            type: Sequelize.BIGINT,
            allowNull: false,
            defaultValue: 0,
            comment: '本规则已累计的额外翻倍成本（实时累加，达 extra_cost_limit 自动停翻）'
          },
          per_user_daily_limit: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: 'per-user 每日最多享受翻倍次数（NULL=不限）；防单人长期薅'
          },
          eligibility_days: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '资格时间盒：仅在"进入命中人群后 N 天内"享翻倍（NULL=不限）；过期实时判定自动失效'
          },
          per_user_extra_cap: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: 'per-user 累计翻倍额外发放数量上限（单人最多多拿 N 个水晶，NULL=不限）'
          },
          start_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '生效开始（北京时间），NULL=不限'
          },
          end_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '生效结束（北京时间），NULL=不限'
          },
          status: {
            type: Sequelize.ENUM('active', 'inactive'),
            allowNull: false,
            defaultValue: 'inactive',
            comment: '开关：active 生效 / inactive 停用'
          },
          remark: {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: '备注'
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
          comment: '水晶奖品倍率规则主表（绑定到具体抽奖活动，活动间隔离）'
        }
      )

      await queryInterface.addIndex(
        'reward_multiplier_campaigns',
        ['lottery_campaign_id', 'status', 'start_at', 'end_at'],
        { name: 'idx_rmc_scope_status', transaction }
      )
      await queryInterface.addIndex('reward_multiplier_campaigns', ['target_type'], {
        name: 'idx_rmc_target',
        transaction
      })
      await queryInterface.addConstraint('reward_multiplier_campaigns', {
        fields: ['lottery_campaign_id'],
        type: 'foreign key',
        name: 'fk_rmc_lottery_campaign',
        references: { table: 'lottery_campaigns', field: 'lottery_campaign_id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction
      })

      // ========== 作用对象表：reward_multiplier_targets ==========
      await queryInterface.createTable(
        'reward_multiplier_targets',
        {
          reward_multiplier_target_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '作用对象主键'
          },
          multiplier_campaign_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '所属倍率规则（FK→reward_multiplier_campaigns.multiplier_campaign_id）'
          },
          target_type: {
            type: Sequelize.ENUM('segment', 'tag', 'growth_level', 'user'),
            allowNull: false,
            comment: '对象类型：segment/tag/growth_level/user'
          },
          target_ref: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment:
              '引用现网人群标识：segment→该活动 resolver_version 内的 segment_key / tag→user_ad_tags.tag_key / growth_level→user_growth_levels.level_key / user→users.user_id'
          },
          target_value: {
            type: Sequelize.STRING(100),
            allowNull: true,
            comment: '可选精确值：target_type=tag 时匹配 user_ad_tags.tag_value；其它类型可空'
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
          comment: '倍率规则作用对象（仅引用现网人群标识；target_type=all 时本表无记录）'
        }
      )

      await queryInterface.addConstraint('reward_multiplier_targets', {
        fields: ['multiplier_campaign_id', 'target_type', 'target_ref'],
        type: 'unique',
        name: 'uk_rmt_campaign_type_ref',
        transaction
      })
      await queryInterface.addIndex('reward_multiplier_targets', ['target_type', 'target_ref'], {
        name: 'idx_rmt_ref',
        transaction
      })
      await queryInterface.addConstraint('reward_multiplier_targets', {
        fields: ['multiplier_campaign_id'],
        type: 'foreign key',
        name: 'fk_rmt_campaign',
        references: {
          table: 'reward_multiplier_campaigns',
          field: 'multiplier_campaign_id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction
      })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    // 先删子表（FK 依赖），再删主表
    await queryInterface.dropTable('reward_multiplier_targets')
    await queryInterface.dropTable('reward_multiplier_campaigns')
  }
}
