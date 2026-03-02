'use strict'

/**
 * Phase 2：服务端展示日志（弹窗队列 + 轮播图追踪）
 *
 * 新建 2 张日志表：
 * 1. popup_show_logs — 弹窗队列展示日志（展示时长、关闭方式、队列位置）
 * 2. carousel_show_logs — 轮播图曝光日志（曝光时长、手动滑入、是否点击）
 *
 * 日志表主键均使用 BIGINT，预留大数据量增长空间
 *
 * @see docs/广告系统升级方案.md 第十四节 14.2
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      /* ============================================================
       * 1. popup_show_logs — 弹窗展示日志
       * ============================================================ */
      await queryInterface.createTable(
        'popup_show_logs',
        {
          popup_show_log_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '弹窗展示日志主键（BIGINT 预留大数据量）'
          },
          popup_banner_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'popup_banners', key: 'popup_banner_id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
            comment: '关联弹窗 ID'
          },
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'users', key: 'user_id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
            comment: '上报用户 ID'
          },
          show_duration_ms: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: true,
            comment: '展示时长（毫秒），用户关闭时上报'
          },
          close_method: {
            type: Sequelize.STRING(20),
            allowNull: false,
            comment: '关闭方式：close_btn / overlay / confirm_btn / auto_timeout'
          },
          queue_position: {
            type: Sequelize.TINYINT.UNSIGNED,
            allowNull: false,
            comment: '在弹窗队列中的位置（1~5）'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW'),
            comment: '上报时间'
          }
        },
        {
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '弹窗展示日志 — Phase 2 方案B队列追踪',
          transaction
        }
      )

      await queryInterface.addIndex('popup_show_logs', ['popup_banner_id'], {
        name: 'idx_psl_banner',
        transaction
      })
      await queryInterface.addIndex('popup_show_logs', ['user_id'], {
        name: 'idx_psl_user',
        transaction
      })
      await queryInterface.addIndex('popup_show_logs', ['created_at'], {
        name: 'idx_psl_created',
        transaction
      })

      /* ============================================================
       * 2. carousel_show_logs — 轮播图曝光日志
       * ============================================================ */
      await queryInterface.createTable(
        'carousel_show_logs',
        {
          carousel_show_log_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '轮播图曝光日志主键（BIGINT 预留大数据量）'
          },
          carousel_item_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'carousel_items', key: 'carousel_item_id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
            comment: '关联轮播图 ID'
          },
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'users', key: 'user_id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
            comment: '上报用户 ID'
          },
          exposure_duration_ms: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: true,
            comment: '曝光时长（毫秒），离开视口时上报'
          },
          is_manual_swipe: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: '是否用户手动滑入（区分自动滑动 vs 手动滑动）'
          },
          is_clicked: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: '是否点击了跳转链接'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW'),
            comment: '上报时间'
          }
        },
        {
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '轮播图曝光日志 — Phase 2 逐张追踪',
          transaction
        }
      )

      await queryInterface.addIndex('carousel_show_logs', ['carousel_item_id'], {
        name: 'idx_csl_item',
        transaction
      })
      await queryInterface.addIndex('carousel_show_logs', ['user_id'], {
        name: 'idx_csl_user',
        transaction
      })
      await queryInterface.addIndex('carousel_show_logs', ['created_at'], {
        name: 'idx_csl_created',
        transaction
      })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('carousel_show_logs')
    await queryInterface.dropTable('popup_show_logs')
  }
}
