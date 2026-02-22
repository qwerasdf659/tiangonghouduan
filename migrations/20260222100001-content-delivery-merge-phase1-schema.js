'use strict'

/**
 * 内容投放系统合并 Phase 1：数据库结构变更
 *
 * 将 PopupBanner + CarouselItem + SystemAnnouncement 合并进 Ad System
 *
 * 变更清单：
 * 1. ad_campaigns 新增 6 个字段（campaign_category, frequency_rule, frequency_value, force_show, internal_notes, slide_interval_ms）
 * 2. ad_campaigns.advertiser_user_id 改为 allowNull
 * 3. ad_creatives 新增 3 个字段（content_type, text_content, display_mode）
 * 4. ad_creatives.image_url 改为 allowNull
 * 5. 新建 ad_interaction_logs 通用交互日志表（D2 定论：方案 B）
 * 6. INSERT home_announcement 广告位种子数据
 *
 * @see docs/内容投放系统-重复功能合并方案.md 第十五节 Phase 1
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      /* ============================================================
       * 1. ad_campaigns 新增 6 个字段
       * ============================================================ */

      // 1a. campaign_category — 区分商业广告 / 运营内容 / 系统通知
      await queryInterface.addColumn(
        'ad_campaigns',
        'campaign_category',
        {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: 'commercial',
          comment: '计划分类：commercial=商业广告 / operational=运营内容 / system=系统通知'
        },
        { transaction }
      )

      // 1b. frequency_rule — 频次控制规则（原 PopupBanner 独有属性）
      await queryInterface.addColumn(
        'ad_campaigns',
        'frequency_rule',
        {
          type: Sequelize.STRING(30),
          allowNull: true,
          defaultValue: 'once_per_day',
          comment: '频次规则：always / once / once_per_session / once_per_day / once_per_n_days / n_times_total'
        },
        { transaction }
      )

      // 1c. frequency_value — 频次参数值
      await queryInterface.addColumn(
        'ad_campaigns',
        'frequency_value',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          defaultValue: 1,
          comment: '频次参数值（配合 frequency_rule 使用，如 once_per_n_days 的天数）'
        },
        { transaction }
      )

      // 1d. force_show — 强制弹出（原 PopupBanner 独有属性）
      await queryInterface.addColumn(
        'ad_campaigns',
        'force_show',
        {
          type: Sequelize.BOOLEAN,
          allowNull: true,
          defaultValue: false,
          comment: '是否强制弹出（忽略频次限制，system 类型默认 true）'
        },
        { transaction }
      )

      // 1e. internal_notes — 内部备注（原 SystemAnnouncement 独有属性）
      await queryInterface.addColumn(
        'ad_campaigns',
        'internal_notes',
        {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: '内部运营备注（仅管理后台可见，不展示给前端用户）'
        },
        { transaction }
      )

      // 1f. slide_interval_ms — 轮播间隔（原 CarouselItem 独有属性）
      await queryInterface.addColumn(
        'ad_campaigns',
        'slide_interval_ms',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          defaultValue: 3000,
          comment: '轮播间隔毫秒（仅 slot_type=carousel 时使用）'
        },
        { transaction }
      )

      // 1g. campaign_category 索引
      await queryInterface.addIndex('ad_campaigns', ['campaign_category'], {
        name: 'idx_campaign_category',
        transaction
      })

      /* ============================================================
       * 2. ad_campaigns.advertiser_user_id 改为 allowNull
       *    operational/system 类型不需要广告主，存运营人员自己的 user_id
       * ============================================================ */
      await queryInterface.changeColumn(
        'ad_campaigns',
        'advertiser_user_id',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '广告主用户ID（operational/system 类型存运营人员 user_id，可为 NULL）'
        },
        { transaction }
      )

      /* ============================================================
       * 3. ad_creatives 新增 3 个字段
       * ============================================================ */

      // 3a. content_type — 区分图片创意和纯文字创意
      await queryInterface.addColumn(
        'ad_creatives',
        'content_type',
        {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: 'image',
          comment: '创意内容类型：image=图片 / text=纯文字（系统公告）'
        },
        { transaction }
      )

      // 3b. text_content — 纯文字内容（原 SystemAnnouncement.content）
      await queryInterface.addColumn(
        'ad_creatives',
        'text_content',
        {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: '文字内容（content_type=text 时使用，如系统公告的文字内容）'
        },
        { transaction }
      )

      // 3c. display_mode — 显示模式（原 PopupBanner 的 6 种显示模式）
      await queryInterface.addColumn(
        'ad_creatives',
        'display_mode',
        {
          type: Sequelize.STRING(30),
          allowNull: true,
          comment: '显示模式：wide / horizontal / square / tall / slim / full_image'
        },
        { transaction }
      )

      /* ============================================================
       * 4. ad_creatives.image_url 改为 allowNull
       *    text-only 创意（system 类型公告）没有图片
       * ============================================================ */
      await queryInterface.changeColumn(
        'ad_creatives',
        'image_url',
        {
          type: Sequelize.STRING(500),
          allowNull: true,
          comment: '图片URL（content_type=image 时必填，text 类型为 NULL）'
        },
        { transaction }
      )

      /* ============================================================
       * 5. 新建 ad_interaction_logs 通用交互日志表
       *    D2 定论：方案 B — 新表 interaction_type + extra_data JSON
       *    替代将 popup_show_logs/carousel_show_logs 塞入 ad_impression_logs
       * ============================================================ */
      await queryInterface.createTable(
        'ad_interaction_logs',
        {
          ad_interaction_log_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '交互日志主键ID'
          },
          ad_campaign_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'ad_campaigns', key: 'ad_campaign_id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
            comment: '关联广告计划ID'
          },
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'users', key: 'user_id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
            comment: '用户ID'
          },
          ad_slot_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: 'ad_slots', key: 'ad_slot_id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
            comment: '广告位ID（可为空）'
          },
          interaction_type: {
            type: Sequelize.STRING(20),
            allowNull: false,
            comment: '交互类型：impression=展示 / click=点击 / close=关闭 / swipe=滑动'
          },
          extra_data: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '扩展数据（JSON），如 show_duration_ms / close_method / is_manual_swipe 等异构字段'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间'
          }
        },
        {
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '内容交互日志表（统一记录弹窗/轮播/公告的展示、点击、关闭等交互事件）',
          transaction
        }
      )

      await queryInterface.addIndex('ad_interaction_logs', ['ad_campaign_id'], {
        name: 'idx_ail_campaign',
        transaction
      })
      await queryInterface.addIndex('ad_interaction_logs', ['user_id'], {
        name: 'idx_ail_user',
        transaction
      })
      await queryInterface.addIndex('ad_interaction_logs', ['interaction_type'], {
        name: 'idx_ail_type',
        transaction
      })
      await queryInterface.addIndex('ad_interaction_logs', ['created_at'], {
        name: 'idx_ail_created',
        transaction
      })

      /* ============================================================
       * 6. INSERT home_announcement 广告位种子数据
       * ============================================================ */
      const [existingSlots] = await queryInterface.sequelize.query(
        "SELECT ad_slot_id FROM ad_slots WHERE slot_key = 'home_announcement'",
        { transaction }
      )

      if (existingSlots.length === 0) {
        await queryInterface.bulkInsert(
          'ad_slots',
          [
            {
              slot_key: 'home_announcement',
              slot_name: '首页公告位',
              slot_type: 'announcement',
              position: 'home',
              max_display_count: 5,
              daily_price_diamond: 0,
              min_bid_diamond: 0,
              min_budget_diamond: 0,
              is_active: 1,
              description: '首页系统公告展示位（announcement 类型，免费）',
              created_at: new Date(),
              updated_at: new Date()
            }
          ],
          { transaction }
        )
      }

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 6. 删除 home_announcement 广告位
      await queryInterface.bulkDelete(
        'ad_slots',
        { slot_key: 'home_announcement' },
        { transaction }
      )

      // 5. 删除 ad_interaction_logs 表
      await queryInterface.dropTable('ad_interaction_logs', { transaction })

      // 4. ad_creatives.image_url 恢复为 NOT NULL
      await queryInterface.changeColumn(
        'ad_creatives',
        'image_url',
        {
          type: Sequelize.STRING(500),
          allowNull: false,
          comment: '图片URL（对象存储key）'
        },
        { transaction }
      )

      // 3. 删除 ad_creatives 新增字段
      await queryInterface.removeColumn('ad_creatives', 'display_mode', { transaction })
      await queryInterface.removeColumn('ad_creatives', 'text_content', { transaction })
      await queryInterface.removeColumn('ad_creatives', 'content_type', { transaction })

      // 2. ad_campaigns.advertiser_user_id 恢复为 NOT NULL
      await queryInterface.changeColumn(
        'ad_campaigns',
        'advertiser_user_id',
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '广告主用户ID'
        },
        { transaction }
      )

      // 1. 删除 ad_campaigns 新增字段和索引
      await queryInterface.removeIndex('ad_campaigns', 'idx_campaign_category', { transaction })
      await queryInterface.removeColumn('ad_campaigns', 'slide_interval_ms', { transaction })
      await queryInterface.removeColumn('ad_campaigns', 'internal_notes', { transaction })
      await queryInterface.removeColumn('ad_campaigns', 'force_show', { transaction })
      await queryInterface.removeColumn('ad_campaigns', 'frequency_value', { transaction })
      await queryInterface.removeColumn('ad_campaigns', 'frequency_rule', { transaction })
      await queryInterface.removeColumn('ad_campaigns', 'campaign_category', { transaction })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
