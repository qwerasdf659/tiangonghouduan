'use strict'

/**
 * Phase 4：竞价排名 — 竞价记录表
 *
 * 新建 1 张表：ad_bid_logs — 记录每次竞价的参与方、出价、胜负
 *
 * @see docs/广告系统升级方案.md 第十四节 14.4
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      await queryInterface.createTable(
        'ad_bid_logs',
        {
          ad_bid_log_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '竞价记录主键（BIGINT）'
          },
          ad_slot_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'ad_slots', key: 'ad_slot_id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
            comment: '竞争的广告位 ID'
          },
          ad_campaign_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'ad_campaigns', key: 'ad_campaign_id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
            comment: '参与竞价的广告计划 ID'
          },
          bid_amount_diamond: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '出价（钻石）'
          },
          is_winner: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            comment: '是否胜出'
          },
          target_user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'users', key: 'user_id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
            comment: '目标用户 ID（为谁竞价）'
          },
          lose_reason: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: '落选原因：outbid / targeting_mismatch / budget_exhausted'
          },
          bid_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW'),
            comment: '竞价时间'
          }
        },
        {
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '竞价记录表 — Phase 4 竞价排名',
          transaction
        }
      )

      await queryInterface.addIndex('ad_bid_logs', ['ad_slot_id', 'bid_at'], {
        name: 'idx_abl_slot_time',
        transaction
      })
      await queryInterface.addIndex('ad_bid_logs', ['ad_campaign_id'], {
        name: 'idx_abl_campaign',
        transaction
      })
      await queryInterface.addIndex('ad_bid_logs', ['target_user_id'], {
        name: 'idx_abl_user',
        transaction
      })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ad_bid_logs')
  }
}
