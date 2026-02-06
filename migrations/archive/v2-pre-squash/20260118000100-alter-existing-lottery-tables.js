'use strict'

/**
 * 迁移文件：统一抽奖平台架构 - 现有表结构调整
 *
 * 基于《抽奖平台统一架构设计方案》文档对现有表进行结构调整
 *
 * 本迁移修改以下表：
 * 1. lottery_campaigns - 添加pick_method、tier_fallback_prize_id等字段
 * 2. lottery_prizes - 添加reward_tier、win_weight整数权重字段
 * 3. lottery_presets - 添加approval_status、advance_mode等字段
 *
 * 设计原则：
 * - pick_method字段：区分选奖方法（normalize/fallback/tier_first）
 * - tier_first选奖法：先选档位再选奖品
 * - 整数权重制：win_weight替代浮点概率，避免精度问题
 * - 预设二次审批：approval_status字段实现审批流程
 *
 * 创建时间：2026-01-18
 * 作者：统一抽奖架构重构
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🚀 开始执行现有抽奖表结构调整迁移...')
    console.log('='.repeat(60))

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ============================================================
      // 第1部分：修改 lottery_campaigns 表
      // 添加：pick_method、tier_fallback_prize_id
      // ============================================================
      console.log('\n📋 修改 lottery_campaigns 表...')

      // 检查 pick_method 字段是否已存在
      const campaignColumns = await queryInterface.describeTable('lottery_campaigns')

      if (!campaignColumns.pick_method) {
        // 添加 pick_method 字段 - 选奖方法
        await queryInterface.addColumn(
          'lottery_campaigns',
          'pick_method',
          {
            type: Sequelize.ENUM('normalize', 'fallback', 'tier_first'),
            allowNull: false,
            defaultValue: 'tier_first',
            comment: '选奖方法：normalize-归一化, fallback-保底, tier_first-先选档位（推荐）',
            after: 'budget_mode'
          },
          { transaction }
        )
        console.log('  ✅ 添加 pick_method 字段成功')
      } else {
        console.log('  ⏭️ pick_method 字段已存在，跳过')
      }

      if (!campaignColumns.tier_fallback_prize_id) {
        // 添加 tier_fallback_prize_id 字段 - 档位保底奖品
        await queryInterface.addColumn(
          'lottery_campaigns',
          'tier_fallback_prize_id',
          {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '档位保底奖品ID（所有档位无货时发放此奖品，外键关联lottery_prizes.prize_id）',
            after: 'pick_method'
          },
          { transaction }
        )
        console.log('  ✅ 添加 tier_fallback_prize_id 字段成功')

        // 为tier_fallback_prize_id添加索引
        await queryInterface.addIndex('lottery_campaigns', ['tier_fallback_prize_id'], {
          name: 'idx_campaigns_fallback_prize',
          transaction
        })
      } else {
        console.log('  ⏭️ tier_fallback_prize_id 字段已存在，跳过')
      }

      if (!campaignColumns.tier_weight_scale) {
        // 添加 tier_weight_scale 字段 - 档位权重比例
        await queryInterface.addColumn(
          'lottery_campaigns',
          'tier_weight_scale',
          {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 1000000,
            comment: '档位权重比例因子（默认1,000,000，所有档位权重之和必须等于此值）',
            after: 'tier_fallback_prize_id'
          },
          { transaction }
        )
        console.log('  ✅ 添加 tier_weight_scale 字段成功')
      } else {
        console.log('  ⏭️ tier_weight_scale 字段已存在，跳过')
      }

      if (!campaignColumns.segment_resolver_version) {
        // 添加 segment_resolver_version 字段 - 分层解析器版本
        await queryInterface.addColumn(
          'lottery_campaigns',
          'segment_resolver_version',
          {
            type: Sequelize.STRING(32),
            allowNull: false,
            defaultValue: 'v1',
            comment: '分层解析器配置版本号（如v1/v2），用于匹配config/segment_rules.js中的配置',
            after: 'tier_weight_scale'
          },
          { transaction }
        )
        console.log('  ✅ 添加 segment_resolver_version 字段成功')
      } else {
        console.log('  ⏭️ segment_resolver_version 字段已存在，跳过')
      }

      console.log('  ✅ lottery_campaigns 表修改完成')

      // ============================================================
      // 第2部分：修改 lottery_prizes 表
      // 添加：reward_tier、win_weight
      // ============================================================
      console.log('\n📋 修改 lottery_prizes 表...')

      const prizeColumns = await queryInterface.describeTable('lottery_prizes')

      if (!prizeColumns.reward_tier) {
        // 添加 reward_tier 字段 - 奖品所属档位
        await queryInterface.addColumn(
          'lottery_prizes',
          'reward_tier',
          {
            type: Sequelize.ENUM('high', 'mid', 'low'),
            allowNull: false,
            defaultValue: 'low',
            comment: '奖品所属档位：high-高档位, mid-中档位, low-低档位（用于tier_first选奖法）',
            after: 'prize_value_points'
          },
          { transaction }
        )
        console.log('  ✅ 添加 reward_tier 字段成功')

        // 添加 reward_tier 索引
        await queryInterface.addIndex('lottery_prizes', ['reward_tier', 'status'], {
          name: 'idx_prizes_tier_status',
          transaction
        })
      } else {
        console.log('  ⏭️ reward_tier 字段已存在，跳过')
      }

      if (!prizeColumns.win_weight) {
        // 添加 win_weight 字段 - 整数权重（替代浮点概率）
        await queryInterface.addColumn(
          'lottery_prizes',
          'win_weight',
          {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
            comment: '中奖权重（整数，同档位内权重之和用于概率计算，0表示不参与抽奖）',
            after: 'reward_tier'
          },
          { transaction }
        )
        console.log('  ✅ 添加 win_weight 字段成功')

        // 添加 win_weight 索引
        await queryInterface.addIndex('lottery_prizes', ['campaign_id', 'reward_tier', 'win_weight'], {
          name: 'idx_prizes_campaign_tier_weight',
          transaction
        })
      } else {
        console.log('  ⏭️ win_weight 字段已存在，跳过')
      }

      if (!prizeColumns.is_fallback) {
        // 添加 is_fallback 字段 - 是否为保底奖品
        await queryInterface.addColumn(
          'lottery_prizes',
          'is_fallback',
          {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: '是否为保底奖品（prize_value_points=0的奖品应标记为true）',
            after: 'win_weight'
          },
          { transaction }
        )
        console.log('  ✅ 添加 is_fallback 字段成功')

        // 添加 is_fallback 索引
        await queryInterface.addIndex('lottery_prizes', ['campaign_id', 'is_fallback'], {
          name: 'idx_prizes_campaign_fallback',
          transaction
        })
      } else {
        console.log('  ⏭️ is_fallback 字段已存在，跳过')
      }

      console.log('  ✅ lottery_prizes 表修改完成')

      // ============================================================
      // 第3部分：修改 lottery_presets 表
      // 添加：approval_status、advance_mode、approved_by、approved_at
      // ============================================================
      console.log('\n📋 修改 lottery_presets 表...')

      const presetColumns = await queryInterface.describeTable('lottery_presets')

      if (!presetColumns.approval_status) {
        // 添加 approval_status 字段 - 审批状态
        await queryInterface.addColumn(
          'lottery_presets',
          'approval_status',
          {
            type: Sequelize.ENUM('pending', 'approved', 'rejected'),
            allowNull: false,
            defaultValue: 'approved', // 默认approved以兼容现有数据
            comment: '审批状态：pending-待审批, approved-已批准, rejected-已拒绝',
            after: 'status'
          },
          { transaction }
        )
        console.log('  ✅ 添加 approval_status 字段成功')

        // 添加审批状态索引
        await queryInterface.addIndex('lottery_presets', ['approval_status'], {
          name: 'idx_presets_approval_status',
          transaction
        })
      } else {
        console.log('  ⏭️ approval_status 字段已存在，跳过')
      }

      if (!presetColumns.advance_mode) {
        // 添加 advance_mode 字段 - 垫付模式
        await queryInterface.addColumn(
          'lottery_presets',
          'advance_mode',
          {
            type: Sequelize.ENUM('none', 'inventory', 'budget', 'both'),
            allowNull: false,
            defaultValue: 'both',
            comment: '垫付模式：none-不垫付, inventory-仅库存垫付, budget-仅预算垫付, both-全部垫付',
            after: 'approval_status'
          },
          { transaction }
        )
        console.log('  ✅ 添加 advance_mode 字段成功')
      } else {
        console.log('  ⏭️ advance_mode 字段已存在，跳过')
      }

      if (!presetColumns.approved_by) {
        // 添加 approved_by 字段 - 审批人
        await queryInterface.addColumn(
          'lottery_presets',
          'approved_by',
          {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '审批人ID（外键关联users.user_id）',
            after: 'advance_mode'
          },
          { transaction }
        )
        console.log('  ✅ 添加 approved_by 字段成功')
      } else {
        console.log('  ⏭️ approved_by 字段已存在，跳过')
      }

      if (!presetColumns.approved_at) {
        // 添加 approved_at 字段 - 审批时间
        await queryInterface.addColumn(
          'lottery_presets',
          'approved_at',
          {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '审批时间',
            after: 'approved_by'
          },
          { transaction }
        )
        console.log('  ✅ 添加 approved_at 字段成功')
      } else {
        console.log('  ⏭️ approved_at 字段已存在，跳过')
      }

      if (!presetColumns.rejection_reason) {
        // 添加 rejection_reason 字段 - 拒绝原因
        await queryInterface.addColumn(
          'lottery_presets',
          'rejection_reason',
          {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '拒绝原因（审批拒绝时填写）',
            after: 'approved_at'
          },
          { transaction }
        )
        console.log('  ✅ 添加 rejection_reason 字段成功')
      } else {
        console.log('  ⏭️ rejection_reason 字段已存在，跳过')
      }

      if (!presetColumns.campaign_id) {
        // 添加 campaign_id 字段 - 活动ID（lottery_presets目前可能缺少此字段）
        await queryInterface.addColumn(
          'lottery_presets',
          'campaign_id',
          {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '所属活动ID（外键关联lottery_campaigns.campaign_id，null表示通用预设）',
            after: 'prize_id'
          },
          { transaction }
        )
        console.log('  ✅ 添加 campaign_id 字段成功')

        // 添加 campaign_id 索引
        await queryInterface.addIndex('lottery_presets', ['campaign_id', 'status'], {
          name: 'idx_presets_campaign_status',
          transaction
        })
      } else {
        console.log('  ⏭️ campaign_id 字段已存在，跳过')
      }

      if (!presetColumns.updated_at) {
        // 添加 updated_at 字段（presets表可能缺少此字段）
        await queryInterface.addColumn(
          'lottery_presets',
          'updated_at',
          {
            type: Sequelize.DATE,
            allowNull: true,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
            comment: '更新时间'
          },
          { transaction }
        )
        console.log('  ✅ 添加 updated_at 字段成功')
      } else {
        console.log('  ⏭️ updated_at 字段已存在，跳过')
      }

      console.log('  ✅ lottery_presets 表修改完成')

      // ============================================================
      // 第4部分：修改 lottery_draws 表
      // 确保 reward_tier 字段的ENUM值包含 fallback
      // ============================================================
      console.log('\n📋 检查 lottery_draws 表...')

      const drawColumns = await queryInterface.describeTable('lottery_draws')

      // 检查 reward_tier 字段是否需要更新ENUM值
      if (drawColumns.reward_tier) {
        // reward_tier 字段已存在，检查是否需要添加 'fallback' 值
        // 注意：MySQL修改ENUM需要特殊处理
        try {
          await queryInterface.sequelize.query(
            `ALTER TABLE lottery_draws MODIFY COLUMN reward_tier 
             ENUM('high', 'mid', 'low', 'fallback', 'unknown') NOT NULL DEFAULT 'low' 
             COMMENT '奖品档位：high-高档, mid-中档, low-低档, fallback-保底, unknown-未知'`,
            { transaction }
          )
          console.log('  ✅ lottery_draws.reward_tier ENUM值已更新（添加fallback）')
        } catch (enumError) {
          console.log('  ⚠️ lottery_draws.reward_tier ENUM更新失败或已包含所需值:', enumError.message)
        }
      }

      console.log('  ✅ lottery_draws 表检查完成')

      // ============================================================
      // 提交事务
      // ============================================================
      await transaction.commit()

      console.log('\n' + '='.repeat(60))
      console.log('✅ 现有抽奖表结构调整迁移执行成功！')
      console.log('='.repeat(60))
      console.log('\n📊 修改摘要:')
      console.log('  - lottery_campaigns: 添加 pick_method, tier_fallback_prize_id, tier_weight_scale, segment_resolver_version')
      console.log('  - lottery_prizes: 添加 reward_tier, win_weight, is_fallback')
      console.log('  - lottery_presets: 添加 approval_status, advance_mode, approved_by, approved_at, rejection_reason, campaign_id')
      console.log('  - lottery_draws: 更新 reward_tier ENUM值')
      console.log('')
    } catch (error) {
      await transaction.rollback()
      console.error('\n❌ 迁移失败:', error.message)
      console.error(error.stack)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('🔄 开始回滚现有抽奖表结构调整迁移...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 回滚 lottery_campaigns 表修改
      console.log('  回滚 lottery_campaigns 表...')
      const campaignColumns = await queryInterface.describeTable('lottery_campaigns')

      if (campaignColumns.segment_resolver_version) {
        await queryInterface.removeColumn('lottery_campaigns', 'segment_resolver_version', { transaction })
      }
      if (campaignColumns.tier_weight_scale) {
        await queryInterface.removeColumn('lottery_campaigns', 'tier_weight_scale', { transaction })
      }
      if (campaignColumns.tier_fallback_prize_id) {
        // 先删除索引
        try {
          await queryInterface.removeIndex('lottery_campaigns', 'idx_campaigns_fallback_prize', { transaction })
        } catch (e) { /* 索引可能不存在 */ }
        await queryInterface.removeColumn('lottery_campaigns', 'tier_fallback_prize_id', { transaction })
      }
      if (campaignColumns.pick_method) {
        await queryInterface.removeColumn('lottery_campaigns', 'pick_method', { transaction })
      }

      // 回滚 lottery_prizes 表修改
      console.log('  回滚 lottery_prizes 表...')
      const prizeColumns = await queryInterface.describeTable('lottery_prizes')

      if (prizeColumns.is_fallback) {
        try {
          await queryInterface.removeIndex('lottery_prizes', 'idx_prizes_campaign_fallback', { transaction })
        } catch (e) { /* 索引可能不存在 */ }
        await queryInterface.removeColumn('lottery_prizes', 'is_fallback', { transaction })
      }
      if (prizeColumns.win_weight) {
        try {
          await queryInterface.removeIndex('lottery_prizes', 'idx_prizes_campaign_tier_weight', { transaction })
        } catch (e) { /* 索引可能不存在 */ }
        await queryInterface.removeColumn('lottery_prizes', 'win_weight', { transaction })
      }
      if (prizeColumns.reward_tier) {
        try {
          await queryInterface.removeIndex('lottery_prizes', 'idx_prizes_tier_status', { transaction })
        } catch (e) { /* 索引可能不存在 */ }
        await queryInterface.removeColumn('lottery_prizes', 'reward_tier', { transaction })
      }

      // 回滚 lottery_presets 表修改
      console.log('  回滚 lottery_presets 表...')
      const presetColumns = await queryInterface.describeTable('lottery_presets')

      if (presetColumns.updated_at) {
        await queryInterface.removeColumn('lottery_presets', 'updated_at', { transaction })
      }
      if (presetColumns.campaign_id) {
        try {
          await queryInterface.removeIndex('lottery_presets', 'idx_presets_campaign_status', { transaction })
        } catch (e) { /* 索引可能不存在 */ }
        await queryInterface.removeColumn('lottery_presets', 'campaign_id', { transaction })
      }
      if (presetColumns.rejection_reason) {
        await queryInterface.removeColumn('lottery_presets', 'rejection_reason', { transaction })
      }
      if (presetColumns.approved_at) {
        await queryInterface.removeColumn('lottery_presets', 'approved_at', { transaction })
      }
      if (presetColumns.approved_by) {
        await queryInterface.removeColumn('lottery_presets', 'approved_by', { transaction })
      }
      if (presetColumns.advance_mode) {
        await queryInterface.removeColumn('lottery_presets', 'advance_mode', { transaction })
      }
      if (presetColumns.approval_status) {
        try {
          await queryInterface.removeIndex('lottery_presets', 'idx_presets_approval_status', { transaction })
        } catch (e) { /* 索引可能不存在 */ }
        await queryInterface.removeColumn('lottery_presets', 'approval_status', { transaction })
      }

      await transaction.commit()
      console.log('✅ 现有抽奖表结构调整迁移回滚成功')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}

