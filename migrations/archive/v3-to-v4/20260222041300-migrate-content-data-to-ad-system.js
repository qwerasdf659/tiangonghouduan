'use strict'

/**
 * 内容投放系统数据迁移 — 将 popup_banners / carousel_items / system_announcements 数据迁入 Ad System
 *
 * 迁移内容：
 * 1. 2 条 popup_banners → ad_campaigns + ad_creatives（campaign_category='operational'）
 * 2. 1 条 carousel_items → ad_campaigns + ad_creatives（campaign_category='operational'）
 * 3. 1 条 system_announcements → ad_campaigns + ad_creatives（campaign_category='system'）
 * 4. 36 条 popup_show_logs → ad_interaction_logs
 * 5. 11 条 carousel_show_logs → ad_interaction_logs
 *
 * 决策依据：docs/内容投放系统-重复功能合并方案.md 第十五节 Phase 2
 *
 * @version 5.0.0
 * @date 2026-02-22
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ─── 辅助函数：根据 position + slot_type 查找 ad_slot_id ───
      async function findSlotId(slotType, position) {
        const [rows] = await queryInterface.sequelize.query(
          'SELECT ad_slot_id FROM ad_slots WHERE slot_type = ? AND position = ? AND is_active = 1 LIMIT 1',
          { replacements: [slotType, position], transaction }
        )
        return rows.length > 0 ? rows[0].ad_slot_id : null
      }

      // ─── 1. 迁移 popup_banners → ad_campaigns + ad_creatives ───
      const [popupBanners] = await queryInterface.sequelize.query(
        'SELECT * FROM popup_banners ORDER BY popup_banner_id',
        { transaction }
      )

      for (const banner of popupBanners) {
        const slotId = await findSlotId('popup', banner.position || 'home')
        if (!slotId) {
          console.warn(`⚠️ 未找到匹配广告位: popup/${banner.position}，跳过 popup_banner_id=${banner.popup_banner_id}`)
          continue
        }

        const priorityMap = { notice: 900, event: 500, promo: 100 }
        const mappedPriority = priorityMap[banner.banner_type] || banner.priority || 500

        const startDate = banner.start_time ? new Date(banner.start_time).toISOString().split('T')[0] : null
        const endDate = banner.end_time ? new Date(banner.end_time).toISOString().split('T')[0] : null

        // 插入 ad_campaigns
        const [campaignResult] = await queryInterface.sequelize.query(
          `INSERT INTO ad_campaigns (
            business_id, advertiser_user_id, ad_slot_id, campaign_name, billing_mode,
            status, priority, start_date, end_date, targeting_rules,
            campaign_category, frequency_rule, frequency_value, force_show,
            created_at, updated_at, budget_spent_diamond
          ) VALUES (?, ?, ?, ?, 'free', ?, ?, ?, ?, NULL,
            'operational', ?, ?, ?, ?, ?, 0)`,
          {
            replacements: [
              `migrated_popup_banner_${banner.popup_banner_id}`,
              banner.created_by,
              slotId,
              banner.title,
              banner.is_active ? 'active' : 'paused',
              mappedPriority,
              startDate,
              endDate,
              banner.frequency_rule || 'once_per_day',
              banner.frequency_value || 1,
              banner.force_show ? 1 : 0,
              banner.created_at || new Date(),
              banner.updated_at || new Date()
            ],
            transaction
          }
        )

        const campaignId = campaignResult

        // 插入 ad_creatives
        const linkTypeMap = { none: 'none', page: 'page', miniprogram: 'miniprogram', webview: 'webview' }
        const mappedLinkType = linkTypeMap[banner.link_type] || 'none'

        await queryInterface.sequelize.query(
          `INSERT INTO ad_creatives (
            ad_campaign_id, title, image_url, image_width, image_height,
            link_url, link_type, review_status, content_type, display_mode,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', 'image', ?, ?, ?)`,
          {
            replacements: [
              campaignId,
              banner.title,
              banner.image_url,
              banner.image_width,
              banner.image_height,
              banner.link_url,
              mappedLinkType,
              banner.display_mode || null,
              banner.created_at || new Date(),
              banner.updated_at || new Date()
            ],
            transaction
          }
        )

        console.log(`✅ 迁移 popup_banner #${banner.popup_banner_id} → ad_campaign #${campaignId}`)
      }

      // ─── 2. 迁移 carousel_items → ad_campaigns + ad_creatives ───
      const [carouselItems] = await queryInterface.sequelize.query(
        'SELECT * FROM carousel_items ORDER BY carousel_item_id',
        { transaction }
      )

      for (const item of carouselItems) {
        const slotId = await findSlotId('carousel', item.position || 'home')
        if (!slotId) {
          console.warn(`⚠️ 未找到匹配广告位: carousel/${item.position}，跳过 carousel_item_id=${item.carousel_item_id}`)
          continue
        }

        const startDate = item.start_time ? new Date(item.start_time).toISOString().split('T')[0] : null
        const endDate = item.end_time ? new Date(item.end_time).toISOString().split('T')[0] : null

        const [carouselCampaignResult] = await queryInterface.sequelize.query(
          `INSERT INTO ad_campaigns (
            business_id, advertiser_user_id, ad_slot_id, campaign_name, billing_mode,
            status, priority, start_date, end_date, targeting_rules,
            campaign_category, frequency_rule, frequency_value, force_show,
            slide_interval_ms, created_at, updated_at, budget_spent_diamond
          ) VALUES (?, ?, ?, ?, 'free', ?, ?, ?, ?, NULL,
            'operational', 'always', 1, 0, ?, ?, ?, 0)`,
          {
            replacements: [
              `migrated_carousel_item_${item.carousel_item_id}`,
              item.created_by,
              slotId,
              item.title || '轮播图',
              item.is_active ? 'active' : 'paused',
              item.display_order || 500,
              startDate,
              endDate,
              item.slide_interval_ms || 3000,
              item.created_at || new Date(),
              item.updated_at || new Date()
            ],
            transaction
          }
        )

        const carouselCampaignId = carouselCampaignResult

        const linkTypeMap = { none: 'none', page: 'page', miniprogram: 'miniprogram', webview: 'webview' }
        const carouselLinkType = linkTypeMap[item.link_type] || 'none'

        await queryInterface.sequelize.query(
          `INSERT INTO ad_creatives (
            ad_campaign_id, title, image_url, image_width, image_height,
            link_url, link_type, review_status, content_type, display_mode,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', 'image', ?, ?, ?)`,
          {
            replacements: [
              carouselCampaignId,
              item.title || '轮播图',
              item.image_url,
              item.image_width,
              item.image_height,
              item.link_url,
              carouselLinkType,
              item.display_mode || 'wide',
              item.created_at || new Date(),
              item.updated_at || new Date()
            ],
            transaction
          }
        )

        console.log(`✅ 迁移 carousel_item #${item.carousel_item_id} → ad_campaign #${carouselCampaignId}`)
      }

      // ─── 3. 迁移 system_announcements → ad_campaigns + ad_creatives ───
      const [announcements] = await queryInterface.sequelize.query(
        'SELECT * FROM system_announcements ORDER BY system_announcement_id',
        { transaction }
      )

      // 查找公告广告位
      const announcementSlotId = await findSlotId('announcement', 'home')

      for (const ann of announcements) {
        const typePriorityMap = { system: 999, maintenance: 950, activity: 900, notice: 900 }
        const priorityPriorityMap = { high: 999, medium: 950, low: 900 }
        const annPriority = typePriorityMap[ann.type] || priorityPriorityMap[ann.priority] || 950

        const endDate = ann.expires_at ? new Date(ann.expires_at).toISOString().split('T')[0] : null

        const [annCampaignResult] = await queryInterface.sequelize.query(
          `INSERT INTO ad_campaigns (
            business_id, advertiser_user_id, ad_slot_id, campaign_name, billing_mode,
            status, priority, start_date, end_date, targeting_rules,
            campaign_category, frequency_rule, force_show, internal_notes,
            created_at, updated_at, budget_spent_diamond
          ) VALUES (?, ?, ?, ?, 'free', ?, ?, NULL, ?, ?,
            'system', 'always', 1, ?, ?, ?, 0)`,
          {
            replacements: [
              `migrated_announcement_${ann.system_announcement_id}`,
              ann.admin_id,
              announcementSlotId,
              ann.title,
              ann.is_active ? 'active' : 'paused',
              annPriority,
              endDate,
              ann.target_groups ? JSON.stringify(ann.target_groups) : null,
              ann.internal_notes,
              ann.created_at || new Date(),
              ann.updated_at || new Date()
            ],
            transaction
          }
        )

        const annCampaignId = annCampaignResult

        await queryInterface.sequelize.query(
          `INSERT INTO ad_creatives (
            ad_campaign_id, title, image_url, link_url, link_type,
            review_status, content_type, text_content,
            created_at, updated_at
          ) VALUES (?, ?, NULL, NULL, 'none', 'approved', 'text', ?, ?, ?)`,
          {
            replacements: [
              annCampaignId,
              ann.title,
              ann.content,
              ann.created_at || new Date(),
              ann.updated_at || new Date()
            ],
            transaction
          }
        )

        console.log(`✅ 迁移 system_announcement #${ann.system_announcement_id} → ad_campaign #${annCampaignId}`)
      }

      // ─── 4. 迁移 popup_show_logs → ad_interaction_logs ───
      const [popupLogs] = await queryInterface.sequelize.query(
        'SELECT * FROM popup_show_logs ORDER BY popup_show_log_id',
        { transaction }
      )

      if (popupLogs.length > 0) {
        // 建立 popup_banner_id → ad_campaign_id 映射
        const [campaignMap] = await queryInterface.sequelize.query(
          "SELECT ad_campaign_id, business_id FROM ad_campaigns WHERE business_id LIKE 'migrated_popup_banner_%'",
          { transaction }
        )
        const popupCampaignMap = {}
        for (const row of campaignMap) {
          const oldId = row.business_id.replace('migrated_popup_banner_', '')
          popupCampaignMap[oldId] = row.ad_campaign_id
        }

        for (const log of popupLogs) {
          const newCampaignId = popupCampaignMap[String(log.popup_banner_id)]
          if (!newCampaignId) continue

          const extraData = JSON.stringify({
            show_duration_ms: log.show_duration_ms,
            close_method: log.close_method,
            queue_position: log.queue_position,
            migrated_from: 'popup_show_logs',
            original_id: log.popup_show_log_id
          })

          await queryInterface.sequelize.query(
            `INSERT INTO ad_interaction_logs (
              ad_campaign_id, user_id, ad_slot_id, interaction_type, extra_data, created_at
            ) VALUES (?, ?, NULL, 'impression', ?, ?)`,
            {
              replacements: [newCampaignId, log.user_id, extraData, log.created_at || new Date()],
              transaction
            }
          )
        }
        console.log(`✅ 迁移 ${popupLogs.length} 条 popup_show_logs → ad_interaction_logs`)
      }

      // ─── 5. 迁移 carousel_show_logs → ad_interaction_logs ───
      const [carouselLogs] = await queryInterface.sequelize.query(
        'SELECT * FROM carousel_show_logs ORDER BY carousel_show_log_id',
        { transaction }
      )

      if (carouselLogs.length > 0) {
        const [carouselCampaignMapRows] = await queryInterface.sequelize.query(
          "SELECT ad_campaign_id, business_id FROM ad_campaigns WHERE business_id LIKE 'migrated_carousel_item_%'",
          { transaction }
        )
        const carouselCampaignMap = {}
        for (const row of carouselCampaignMapRows) {
          const oldId = row.business_id.replace('migrated_carousel_item_', '')
          carouselCampaignMap[oldId] = row.ad_campaign_id
        }

        for (const log of carouselLogs) {
          const newCampaignId = carouselCampaignMap[String(log.carousel_item_id)]
          if (!newCampaignId) continue

          const extraData = JSON.stringify({
            exposure_duration_ms: log.exposure_duration_ms,
            is_manual_swipe: log.is_manual_swipe,
            is_clicked: log.is_clicked,
            migrated_from: 'carousel_show_logs',
            original_id: log.carousel_show_log_id
          })

          await queryInterface.sequelize.query(
            `INSERT INTO ad_interaction_logs (
              ad_campaign_id, user_id, ad_slot_id, interaction_type, extra_data, created_at
            ) VALUES (?, ?, NULL, 'impression', ?, ?)`,
            {
              replacements: [newCampaignId, log.user_id, extraData, log.created_at || new Date()],
              transaction
            }
          )
        }
        console.log(`✅ 迁移 ${carouselLogs.length} 条 carousel_show_logs → ad_interaction_logs`)
      }

      // ─── 6. 验证迁移数据正确性 ───
      const [campaignCount] = await queryInterface.sequelize.query(
        "SELECT COUNT(*) as cnt FROM ad_campaigns WHERE business_id LIKE 'migrated_%'",
        { transaction }
      )
      const [logCount] = await queryInterface.sequelize.query(
        "SELECT COUNT(*) as cnt FROM ad_interaction_logs WHERE JSON_EXTRACT(extra_data, '$.migrated_from') IS NOT NULL",
        { transaction }
      )

      console.log(`📊 迁移验证：${campaignCount[0].cnt} 条 campaigns，${logCount[0].cnt} 条 interaction_logs`)

      await transaction.commit()
      console.log('✅ 内容投放系统数据迁移完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 数据迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 删除迁移的交互日志
      await queryInterface.sequelize.query(
        "DELETE FROM ad_interaction_logs WHERE JSON_EXTRACT(extra_data, '$.migrated_from') IS NOT NULL",
        { transaction }
      )

      // 删除迁移的创意（通过关联的 campaign 的 business_id 找到）
      await queryInterface.sequelize.query(
        "DELETE ac FROM ad_creatives ac INNER JOIN ad_campaigns acam ON ac.ad_campaign_id = acam.ad_campaign_id WHERE acam.business_id LIKE 'migrated_%'",
        { transaction }
      )

      // 删除迁移的 campaigns
      await queryInterface.sequelize.query(
        "DELETE FROM ad_campaigns WHERE business_id LIKE 'migrated_%'",
        { transaction }
      )

      await transaction.commit()
      console.log('✅ 数据迁移回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
