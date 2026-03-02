'use strict'

/**
 * 内容投放系统合并迁移 — PopupBanner + CarouselItem + SystemAnnouncement 合并入 Ad System
 *
 * 业务背景：
 * - 弹窗公告、轮播图、系统公告三套 CRUD 与广告系统存在大量字段/逻辑重复
 * - 合并后只维护一套 CRUD、一套展示队列、一套数据报表
 * - 通过 campaign_category 字段区分 commercial / operational / system 三类
 *
 * 变更内容：
 * 1. ad_campaigns 新增 6 个字段 + advertiser_user_id 改 NULL
 * 2. ad_creatives 新增 3 个字段 + image_url 改 NULL
 * 3. 新建 ad_interaction_logs 通用交互日志表（D2 定论）
 * 4. 插入 home_announcement 广告位种子数据
 *
 * 决策依据：docs/内容投放系统-重复功能合并方案.md 第十五节 Phase 1
 *
 * @version 5.0.0
 * @date 2026-02-22
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ─── 1. ad_campaigns 新增 campaign_category 字段 ───
      const [catCols] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM ad_campaigns LIKE 'campaign_category'",
        { transaction }
      )
      if (catCols.length === 0) {
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
      }

      // ─── 2. ad_campaigns 新增 frequency_rule 字段 ───
      const [frCols] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM ad_campaigns LIKE 'frequency_rule'",
        { transaction }
      )
      if (frCols.length === 0) {
        await queryInterface.addColumn(
          'ad_campaigns',
          'frequency_rule',
          {
            type: Sequelize.STRING(30),
            allowNull: true,
            defaultValue: 'once_per_day',
            comment: '频次规则：always/once/once_per_session/once_per_day/once_per_n_days/n_times_total'
          },
          { transaction }
        )
      }

      // ─── 3. ad_campaigns 新增 frequency_value 字段 ───
      const [fvCols] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM ad_campaigns LIKE 'frequency_value'",
        { transaction }
      )
      if (fvCols.length === 0) {
        await queryInterface.addColumn(
          'ad_campaigns',
          'frequency_value',
          {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: 1,
            comment: '频次参数（once_per_n_days 的 N 天，n_times_total 的 N 次）'
          },
          { transaction }
        )
      }

      // ─── 4. ad_campaigns 新增 force_show 字段 ───
      const [fsCols] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM ad_campaigns LIKE 'force_show'",
        { transaction }
      )
      if (fsCols.length === 0) {
        await queryInterface.addColumn(
          'ad_campaigns',
          'force_show',
          {
            type: Sequelize.BOOLEAN,
            allowNull: true,
            defaultValue: false,
            comment: '是否强制弹出（忽略用户关闭行为）'
          },
          { transaction }
        )
      }

      // ─── 5. ad_campaigns 新增 internal_notes 字段 ───
      const [inCols] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM ad_campaigns LIKE 'internal_notes'",
        { transaction }
      )
      if (inCols.length === 0) {
        await queryInterface.addColumn(
          'ad_campaigns',
          'internal_notes',
          {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '内部备注（运营人员可见，不展示给前端用户）'
          },
          { transaction }
        )
      }

      // ─── 6. ad_campaigns 新增 slide_interval_ms 字段 ───
      const [siCols] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM ad_campaigns LIKE 'slide_interval_ms'",
        { transaction }
      )
      if (siCols.length === 0) {
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
      }

      // ─── 7. ad_campaigns.advertiser_user_id 改为可空 ───
      // operational/system 类型不需要广告主，存运营人员自己的 user_id
      await queryInterface.changeColumn(
        'ad_campaigns',
        'advertiser_user_id',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '广告主/创建人用户ID（operational/system 类型存运营人员 user_id）'
        },
        { transaction }
      )

      // ─── 8. ad_campaigns 新增 campaign_category 索引 ───
      const [catIdxRows] = await queryInterface.sequelize.query(
        "SHOW INDEX FROM ad_campaigns WHERE Key_name = 'idx_campaign_category'",
        { transaction }
      )
      if (catIdxRows.length === 0) {
        await queryInterface.addIndex('ad_campaigns', ['campaign_category'], {
          name: 'idx_campaign_category',
          transaction
        })
      }

      // ─── 9. ad_creatives 新增 content_type 字段 ───
      const [ctCols] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM ad_creatives LIKE 'content_type'",
        { transaction }
      )
      if (ctCols.length === 0) {
        await queryInterface.addColumn(
          'ad_creatives',
          'content_type',
          {
            type: Sequelize.STRING(20),
            allowNull: false,
            defaultValue: 'image',
            comment: '内容类型：image=图片 / text=纯文字'
          },
          { transaction }
        )
      }

      // ─── 10. ad_creatives 新增 text_content 字段 ───
      const [tcCols] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM ad_creatives LIKE 'text_content'",
        { transaction }
      )
      if (tcCols.length === 0) {
        await queryInterface.addColumn(
          'ad_creatives',
          'text_content',
          {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '文字内容（content_type=text 时使用，原 SystemAnnouncement.content）'
          },
          { transaction }
        )
      }

      // ─── 11. ad_creatives 新增 display_mode 字段 ───
      const [dmCols] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM ad_creatives LIKE 'display_mode'",
        { transaction }
      )
      if (dmCols.length === 0) {
        await queryInterface.addColumn(
          'ad_creatives',
          'display_mode',
          {
            type: Sequelize.STRING(30),
            allowNull: true,
            comment: '显示模式：wide/horizontal/square/tall/slim/full_image（原 PopupBanner 的 6 种显示模式）'
          },
          { transaction }
        )
      }

      // ─── 12. ad_creatives.image_url 改为可空 ───
      // text-only 创意（system 类型公告）没有图片
      await queryInterface.changeColumn(
        'ad_creatives',
        'image_url',
        {
          type: Sequelize.STRING(500),
          allowNull: true,
          comment: '图片URL（对象存储key，content_type=text 时为 NULL）'
        },
        { transaction }
      )

      // ─── 13. 新建 ad_interaction_logs 通用交互日志表（D2 定论：方案 B） ───
      const [tblRows] = await queryInterface.sequelize.query(
        "SHOW TABLES LIKE 'ad_interaction_logs'",
        { transaction }
      )
      if (tblRows.length === 0) {
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
              comment: '所属广告计划ID'
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
              comment: '广告位ID'
            },
            interaction_type: {
              type: Sequelize.STRING(20),
              allowNull: false,
              comment: '交互类型：impression=展示 / click=点击 / close=关闭 / swipe=滑动'
            },
            extra_data: {
              type: Sequelize.JSON,
              allowNull: true,
              comment: '异构扩展数据（如 show_duration_ms/close_method/is_manual_swipe 等）'
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
            comment: '通用内容交互日志表 — 统一记录弹窗/轮播/公告/广告的展示、点击、关闭等交互事件',
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
      }

      // ─── 14. 插入 home_announcement 广告位种子数据 ───
      const [existingSlot] = await queryInterface.sequelize.query(
        "SELECT ad_slot_id FROM ad_slots WHERE slot_key = 'home_announcement'",
        { transaction }
      )
      if (existingSlot.length === 0) {
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
              is_active: true,
              description: '首页系统公告展示位（免费）',
              created_at: new Date(),
              updated_at: new Date()
            }
          ],
          { transaction }
        )
      }

      await transaction.commit()
      console.log('✅ 内容投放系统合并迁移完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 删除 home_announcement 广告位
      await queryInterface.bulkDelete(
        'ad_slots',
        { slot_key: 'home_announcement' },
        { transaction }
      )

      // 删除 ad_interaction_logs 表
      const [tblRows] = await queryInterface.sequelize.query(
        "SHOW TABLES LIKE 'ad_interaction_logs'",
        { transaction }
      )
      if (tblRows.length > 0) {
        await queryInterface.dropTable('ad_interaction_logs', { transaction })
      }

      // 恢复 ad_creatives.image_url 为 NOT NULL
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

      // 移除 ad_creatives 新增字段
      const creativeFields = ['display_mode', 'text_content', 'content_type']
      for (const field of creativeFields) {
        const [cols] = await queryInterface.sequelize.query(
          `SHOW COLUMNS FROM ad_creatives LIKE '${field}'`,
          { transaction }
        )
        if (cols.length > 0) {
          await queryInterface.removeColumn('ad_creatives', field, { transaction })
        }
      }

      // 恢复 ad_campaigns.advertiser_user_id 为 NOT NULL
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

      // 移除 ad_campaigns 新增索引
      const [catIdxRows] = await queryInterface.sequelize.query(
        "SHOW INDEX FROM ad_campaigns WHERE Key_name = 'idx_campaign_category'",
        { transaction }
      )
      if (catIdxRows.length > 0) {
        await queryInterface.removeIndex('ad_campaigns', 'idx_campaign_category', { transaction })
      }

      // 移除 ad_campaigns 新增字段
      const campaignFields = [
        'slide_interval_ms',
        'internal_notes',
        'force_show',
        'frequency_value',
        'frequency_rule',
        'campaign_category'
      ]
      for (const field of campaignFields) {
        const [cols] = await queryInterface.sequelize.query(
          `SHOW COLUMNS FROM ad_campaigns LIKE '${field}'`,
          { transaction }
        )
        if (cols.length > 0) {
          await queryInterface.removeColumn('ad_campaigns', field, { transaction })
        }
      }

      await transaction.commit()
      console.log('✅ 内容投放系统合并迁移回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
