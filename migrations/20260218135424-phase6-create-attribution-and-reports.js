'use strict'

/**
 * Phase 6：归因追踪 + 多维报表
 *
 * 新建 2 张表：
 * 1. ad_attribution_logs — 归因追踪日志（点击→转化关联）
 * 2. ad_report_daily_snapshots — 每日报表快照（凌晨4点聚合）
 *
 * @see docs/广告系统升级方案.md 第十四节 14.6
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      /* ============================================================
       * 1. ad_attribution_logs — 归因追踪日志
       * ============================================================ */
      await queryInterface.createTable(
        'ad_attribution_logs',
        {
          ad_attribution_log_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '归因日志主键'
          },
          ad_click_log_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            references: { model: 'ad_click_logs', key: 'ad_click_log_id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
            comment: '关联的广告点击日志 ID'
          },
          ad_campaign_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'ad_campaigns', key: 'ad_campaign_id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
            comment: '广告计划 ID'
          },
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'users', key: 'user_id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
            comment: '转化用户 ID'
          },
          conversion_type: {
            type: Sequelize.STRING(30),
            allowNull: false,
            comment: '转化类型：lottery_draw / exchange / market_buy / page_view'
          },
          conversion_entity_id: {
            type: Sequelize.STRING(100),
            allowNull: true,
            comment: '转化实体 ID（如 draw_id / exchange_record_id）'
          },
          click_at: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '广告点击时间'
          },
          conversion_at: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '转化发生时间'
          },
          attribution_window_hours: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 24,
            comment: '归因窗口期（拍板决策7：24小时）'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW')
          }
        },
        {
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '归因追踪日志表 — Phase 6 点击→转化关联',
          transaction
        }
      )

      await queryInterface.addIndex('ad_attribution_logs', ['ad_campaign_id'], {
        name: 'idx_aal_campaign',
        transaction
      })
      await queryInterface.addIndex('ad_attribution_logs', ['user_id'], {
        name: 'idx_aal_user',
        transaction
      })
      await queryInterface.addIndex('ad_attribution_logs', ['conversion_type'], {
        name: 'idx_aal_type',
        transaction
      })
      await queryInterface.addIndex('ad_attribution_logs', ['click_at'], {
        name: 'idx_aal_click_at',
        transaction
      })

      /* ============================================================
       * 2. ad_report_daily_snapshots — 每日报表快照
       * ============================================================ */
      await queryInterface.createTable(
        'ad_report_daily_snapshots',
        {
          snapshot_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '快照主键'
          },
          snapshot_date: {
            type: Sequelize.DATEONLY,
            allowNull: false,
            comment: '快照日期'
          },
          ad_campaign_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'ad_campaigns', key: 'ad_campaign_id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
            comment: '广告计划 ID'
          },
          ad_slot_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'ad_slots', key: 'ad_slot_id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
            comment: '广告位 ID'
          },
          impressions_total: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '总曝光数'
          },
          impressions_valid: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '有效曝光数（去除作弊）'
          },
          clicks_total: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '总点击数'
          },
          clicks_valid: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '有效点击数（去除作弊）'
          },
          conversions: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '转化数'
          },
          spend_diamond: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '消耗钻石数'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW')
          }
        },
        {
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '每日报表快照表 — Phase 6 凌晨4点聚合',
          transaction
        }
      )

      await queryInterface.addConstraint('ad_report_daily_snapshots', {
        fields: ['snapshot_date', 'ad_campaign_id', 'ad_slot_id'],
        type: 'unique',
        name: 'uk_ards_date_campaign_slot',
        transaction
      })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ad_report_daily_snapshots')
    await queryInterface.dropTable('ad_attribution_logs')
  }
}
