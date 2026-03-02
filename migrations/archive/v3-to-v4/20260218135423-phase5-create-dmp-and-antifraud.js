'use strict'

/**
 * Phase 5：DMP 人群定向 + 反作弊
 *
 * 新建 4 张表：
 * 1. user_ad_tags — 用户行为标签（定时聚合、支持定向投放）
 * 2. ad_impression_logs — 广告曝光日志（去重后有效曝光）
 * 3. ad_click_logs — 广告点击日志（归因追踪数据源）
 * 4. ad_antifraud_logs — 反作弊判定日志
 *
 * @see docs/广告系统升级方案.md 第十四节 14.5
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      /* ============================================================
       * 1. user_ad_tags — 用户行为标签表
       * ============================================================ */
      await queryInterface.createTable(
        'user_ad_tags',
        {
          user_ad_tag_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '用户标签主键'
          },
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'users', key: 'user_id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
            comment: '用户 ID'
          },
          tag_key: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '标签键（如 lottery_active_7d / diamond_balance / new_user）'
          },
          tag_value: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '标签值（如 true / false / 数字字符串）'
          },
          calculated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '标签计算时间（凌晨3点定时任务写入）'
          }
        },
        {
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '用户行为标签表 — Phase 5 DMP 人群定向',
          transaction
        }
      )

      await queryInterface.addConstraint('user_ad_tags', {
        fields: ['user_id', 'tag_key'],
        type: 'unique',
        name: 'uk_uat_user_tag',
        transaction
      })
      await queryInterface.addIndex('user_ad_tags', ['tag_key', 'tag_value'], {
        name: 'idx_uat_tag',
        transaction
      })

      /* ============================================================
       * 2. ad_impression_logs — 广告曝光日志
       * ============================================================ */
      await queryInterface.createTable(
        'ad_impression_logs',
        {
          ad_impression_log_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '广告曝光日志主键'
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
            comment: '曝光用户 ID'
          },
          ad_slot_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'ad_slots', key: 'ad_slot_id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
            comment: '广告位 ID'
          },
          is_valid: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            comment: '是否有效曝光（反作弊判定结果）'
          },
          invalid_reason: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: '无效原因：self_view / frequency_limit / batch_suspect'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW'),
            comment: '曝光时间'
          }
        },
        {
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '广告曝光日志表 — Phase 5 反作弊过滤',
          transaction
        }
      )

      await queryInterface.addIndex('ad_impression_logs', ['ad_campaign_id'], {
        name: 'idx_ail_campaign',
        transaction
      })
      await queryInterface.addIndex('ad_impression_logs', ['user_id'], {
        name: 'idx_ail_user',
        transaction
      })
      await queryInterface.addIndex('ad_impression_logs', ['created_at'], {
        name: 'idx_ail_created',
        transaction
      })

      /* ============================================================
       * 3. ad_click_logs — 广告点击日志
       * ============================================================ */
      await queryInterface.createTable(
        'ad_click_logs',
        {
          ad_click_log_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '广告点击日志主键'
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
            comment: '点击用户 ID'
          },
          ad_slot_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'ad_slots', key: 'ad_slot_id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
            comment: '广告位 ID'
          },
          click_target: {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: '跳转目标 URL'
          },
          is_valid: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            comment: '是否有效点击（反作弊判定结果）'
          },
          invalid_reason: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: '无效原因：fake_click / self_click'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW'),
            comment: '点击时间'
          }
        },
        {
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '广告点击日志表 — Phase 5 归因数据源',
          transaction
        }
      )

      await queryInterface.addIndex('ad_click_logs', ['ad_campaign_id'], {
        name: 'idx_acl_campaign',
        transaction
      })
      await queryInterface.addIndex('ad_click_logs', ['user_id', 'created_at'], {
        name: 'idx_acl_user_created',
        transaction
      })

      /* ============================================================
       * 4. ad_antifraud_logs — 反作弊判定日志
       * ============================================================ */
      await queryInterface.createTable(
        'ad_antifraud_logs',
        {
          ad_antifraud_log_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '反作弊判定日志主键'
          },
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '触发用户 ID'
          },
          ad_campaign_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '关联广告计划 ID'
          },
          event_type: {
            type: Sequelize.STRING(20),
            allowNull: false,
            comment: '事件类型：impression / click'
          },
          rule_triggered: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '触发的反作弊规则名称'
          },
          verdict: {
            type: Sequelize.STRING(20),
            allowNull: false,
            comment: '判定结果：valid / invalid / suspicious'
          },
          raw_data: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '原始事件数据（调试用）'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW'),
            comment: '判定时间'
          }
        },
        {
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '反作弊判定日志表 — Phase 5 无效流量识别',
          transaction
        }
      )

      await queryInterface.addIndex('ad_antifraud_logs', ['user_id'], {
        name: 'idx_aaf_user',
        transaction
      })
      await queryInterface.addIndex('ad_antifraud_logs', ['ad_campaign_id'], {
        name: 'idx_aaf_campaign',
        transaction
      })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ad_antifraud_logs')
    await queryInterface.dropTable('ad_click_logs')
    await queryInterface.dropTable('ad_impression_logs')
    await queryInterface.dropTable('user_ad_tags')
  }
}
