'use strict'

/**
 * 清理所有重复索引 Migration
 * 自动生成于: 2025-08-20T18:38:19.093Z
 * 清理索引数量: 39
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, _Sequelize) {
    console.log('🗂️ 开始清理所有重复索引...')
    console.log('📊 计划清理 39 个重复索引')

    // 删除 analytics_user_profiles.idx_analytics_profiles_user_id (重复索引，保留 user_id)
    try {
      await queryInterface.removeIndex('analytics_user_profiles', 'idx_analytics_profiles_user_id')
      console.log('   ✅ 删除重复索引: analytics_user_profiles.idx_analytics_profiles_user_id')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: idx_analytics_profiles_user_id -', error.message)
    }

    // 删除 analytics_user_profiles.user_id_2 (重复索引，保留 user_id)
    try {
      await queryInterface.removeIndex('analytics_user_profiles', 'user_id_2')
      console.log('   ✅ 删除重复索引: analytics_user_profiles.user_id_2')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: user_id_2 -', error.message)
    }

    // 删除 business_configs.business_type_2 (重复索引，保留 business_type)
    try {
      await queryInterface.removeIndex('business_configs', 'business_type_2')
      console.log('   ✅ 删除重复索引: business_configs.business_type_2')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: business_type_2 -', error.message)
    }

    // 删除 business_configs.business_type_3 (重复索引，保留 business_type)
    try {
      await queryInterface.removeIndex('business_configs', 'business_type_3')
      console.log('   ✅ 删除重复索引: business_configs.business_type_3')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: business_type_3 -', error.message)
    }

    // 删除 business_configs.business_type_4 (重复索引，保留 business_type)
    try {
      await queryInterface.removeIndex('business_configs', 'business_type_4')
      console.log('   ✅ 删除重复索引: business_configs.business_type_4')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: business_type_4 -', error.message)
    }

    // 删除 business_configs.idx_business_type (重复索引，保留 business_type)
    try {
      await queryInterface.removeIndex('business_configs', 'idx_business_type')
      console.log('   ✅ 删除重复索引: business_configs.idx_business_type')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: idx_business_type -', error.message)
    }

    // 删除 business_events.idx_business_events_event_status (重复索引，保留 idx_be_status)
    try {
      await queryInterface.removeIndex('business_events', 'idx_business_events_event_status')
      console.log('   ✅ 删除重复索引: business_events.idx_business_events_event_status')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: idx_business_events_event_status -', error.message)
    }

    // 删除 exchange_records.idx_exchange_records_exchange_code (重复索引，保留 exchange_code)
    try {
      await queryInterface.removeIndex('exchange_records', 'idx_exchange_records_exchange_code')
      console.log('   ✅ 删除重复索引: exchange_records.idx_exchange_records_exchange_code')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: idx_exchange_records_exchange_code -', error.message)
    }

    // 删除 lottery_campaigns.uk_campaign_code (重复索引，保留 campaign_code)
    try {
      await queryInterface.removeIndex('lottery_campaigns', 'uk_campaign_code')
      console.log('   ✅ 删除重复索引: lottery_campaigns.uk_campaign_code')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: uk_campaign_code -', error.message)
    }

    // 删除 lottery_campaigns.idx_lc_campaign_type (重复索引，保留 idx_campaign_type)
    try {
      await queryInterface.removeIndex('lottery_campaigns', 'idx_lc_campaign_type')
      console.log('   ✅ 删除重复索引: lottery_campaigns.idx_lc_campaign_type')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: idx_lc_campaign_type -', error.message)
    }

    // 删除 lottery_campaigns.idx_status_campaign (重复索引，保留 idx_lc_status)
    try {
      await queryInterface.removeIndex('lottery_campaigns', 'idx_status_campaign')
      console.log('   ✅ 删除重复索引: lottery_campaigns.idx_status_campaign')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: idx_status_campaign -', error.message)
    }

    // 删除 lottery_campaigns.idx_lc_time_range (重复索引，保留 idx_time_range)
    try {
      await queryInterface.removeIndex('lottery_campaigns', 'idx_lc_time_range')
      console.log('   ✅ 删除重复索引: lottery_campaigns.idx_lc_time_range')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: idx_lc_time_range -', error.message)
    }

    // 删除 lottery_records.lottery_records_created_at (重复索引，保留 idx_created_at)
    try {
      await queryInterface.removeIndex('lottery_records', 'lottery_records_created_at')
      console.log('   ✅ 删除重复索引: lottery_records.lottery_records_created_at')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: lottery_records_created_at -', error.message)
    }

    // 删除 lottery_records.lottery_records_draw_type (重复索引，保留 idx_draw_type)
    try {
      await queryInterface.removeIndex('lottery_records', 'lottery_records_draw_type')
      console.log('   ✅ 删除重复索引: lottery_records.lottery_records_draw_type')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: lottery_records_draw_type -', error.message)
    }

    // 删除 lottery_records.lottery_records_is_pity (重复索引，保留 idx_is_pity)
    try {
      await queryInterface.removeIndex('lottery_records', 'lottery_records_is_pity')
      console.log('   ✅ 删除重复索引: lottery_records.lottery_records_is_pity')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: lottery_records_is_pity -', error.message)
    }

    // 删除 lottery_records.idx_lottery_records_user_time (重复索引，保留 idx_user_created)
    try {
      await queryInterface.removeIndex('lottery_records', 'idx_lottery_records_user_time')
      console.log('   ✅ 删除重复索引: lottery_records.idx_lottery_records_user_time')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: idx_lottery_records_user_time -', error.message)
    }

    // 删除 lottery_records.lottery_records_user_id_created_at (重复索引，保留 idx_user_created)
    try {
      await queryInterface.removeIndex('lottery_records', 'lottery_records_user_id_created_at')
      console.log('   ✅ 删除重复索引: lottery_records.lottery_records_user_id_created_at')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: lottery_records_user_id_created_at -', error.message)
    }

    // 删除 lottery_records.lottery_records_prize_id (重复索引，保留 idx_prize_id)
    try {
      await queryInterface.removeIndex('lottery_records', 'lottery_records_prize_id')
      console.log('   ✅ 删除重复索引: lottery_records.lottery_records_prize_id')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: lottery_records_prize_id -', error.message)
    }

    // 删除 lottery_records.lottery_records_prize_type (重复索引，保留 idx_prize_type)
    try {
      await queryInterface.removeIndex('lottery_records', 'lottery_records_prize_type')
      console.log('   ✅ 删除重复索引: lottery_records.lottery_records_prize_type')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: lottery_records_prize_type -', error.message)
    }

    // 删除 lottery_records.lottery_records_user_id (重复索引，保留 idx_user_id)
    try {
      await queryInterface.removeIndex('lottery_records', 'lottery_records_user_id')
      console.log('   ✅ 删除重复索引: lottery_records.lottery_records_user_id')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: lottery_records_user_id -', error.message)
    }

    // 删除 points_earning_rules.uk_rule_code (重复索引，保留 rule_code)
    try {
      await queryInterface.removeIndex('points_earning_rules', 'uk_rule_code')
      console.log('   ✅ 删除重复索引: points_earning_rules.uk_rule_code')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: uk_rule_code -', error.message)
    }

    // 删除 points_records.points_records_user_id_created_at (重复索引，保留 idx_user_created)
    try {
      await queryInterface.removeIndex('points_records', 'points_records_user_id_created_at')
      console.log('   ✅ 删除重复索引: points_records.points_records_user_id_created_at')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: points_records_user_id_created_at -', error.message)
    }

    // 删除 points_transactions.idx_pt_status (重复索引，保留 idx_status)
    try {
      await queryInterface.removeIndex('points_transactions', 'idx_pt_status')
      console.log('   ✅ 删除重复索引: points_transactions.idx_pt_status')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: idx_pt_status -', error.message)
    }

    // 删除 points_transactions.idx_pt_user_time (重复索引，保留 idx_user_time)
    try {
      await queryInterface.removeIndex('points_transactions', 'idx_pt_user_time')
      console.log('   ✅ 删除重复索引: points_transactions.idx_pt_user_time')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: idx_pt_user_time -', error.message)
    }

    // 删除 products.idx_products_category (重复索引，保留 idx_category)
    try {
      await queryInterface.removeIndex('products', 'idx_products_category')
      console.log('   ✅ 删除重复索引: products.idx_products_category')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: idx_products_category -', error.message)
    }

    // 删除 products.idx_products_sort_order (重复索引，保留 idx_sort_order)
    try {
      await queryInterface.removeIndex('products', 'idx_products_sort_order')
      console.log('   ✅ 删除重复索引: products.idx_products_sort_order')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: idx_products_sort_order -', error.message)
    }

    // 删除 products.idx_products_stock (重复索引，保留 idx_stock)
    try {
      await queryInterface.removeIndex('products', 'idx_products_stock')
      console.log('   ✅ 删除重复索引: products.idx_products_stock')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: idx_products_stock -', error.message)
    }

    // 删除 trade_records.trade_records_trade_id (重复索引，保留 trade_id)
    try {
      await queryInterface.removeIndex('trade_records', 'trade_records_trade_id')
      console.log('   ✅ 删除重复索引: trade_records.trade_records_trade_id')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: trade_records_trade_id -', error.message)
    }

    // 删除 users.users_is_merchant_status (重复索引，保留 idx_status)
    try {
      await queryInterface.removeIndex('users', 'users_is_merchant_status')
      console.log('   ✅ 删除重复索引: users.users_is_merchant_status')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: users_is_merchant_status -', error.message)
    }

    // 删除 users.idx_users_admin_status (重复索引，保留 users_is_admin_status)
    try {
      await queryInterface.removeIndex('users', 'idx_users_admin_status')
      console.log('   ✅ 删除重复索引: users.idx_users_admin_status')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: idx_users_admin_status -', error.message)
    }

    // 删除 users.users_status_is_admin (重复索引，保留 users_is_admin_status)
    try {
      await queryInterface.removeIndex('users', 'users_status_is_admin')
      console.log('   ✅ 删除重复索引: users.users_status_is_admin')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: users_status_is_admin -', error.message)
    }

    // 删除 users.mobile_2 (重复索引，保留 mobile)
    try {
      await queryInterface.removeIndex('users', 'mobile_2')
      console.log('   ✅ 删除重复索引: users.mobile_2')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: mobile_2 -', error.message)
    }

    // 删除 users.mobile_3 (重复索引，保留 mobile)
    try {
      await queryInterface.removeIndex('users', 'mobile_3')
      console.log('   ✅ 删除重复索引: users.mobile_3')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: mobile_3 -', error.message)
    }

    // 删除 users.mobile_4 (重复索引，保留 mobile)
    try {
      await queryInterface.removeIndex('users', 'mobile_4')
      console.log('   ✅ 删除重复索引: users.mobile_4')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: mobile_4 -', error.message)
    }

    // 删除 users.mobile_5 (重复索引，保留 mobile)
    try {
      await queryInterface.removeIndex('users', 'mobile_5')
      console.log('   ✅ 删除重复索引: users.mobile_5')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: mobile_5 -', error.message)
    }

    // 删除 users.mobile_6 (重复索引，保留 mobile)
    try {
      await queryInterface.removeIndex('users', 'mobile_6')
      console.log('   ✅ 删除重复索引: users.mobile_6')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: mobile_6 -', error.message)
    }

    // 删除 users.mobile_7 (重复索引，保留 mobile)
    try {
      await queryInterface.removeIndex('users', 'mobile_7')
      console.log('   ✅ 删除重复索引: users.mobile_7')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: mobile_7 -', error.message)
    }

    // 删除 users.mobile_8 (重复索引，保留 mobile)
    try {
      await queryInterface.removeIndex('users', 'mobile_8')
      console.log('   ✅ 删除重复索引: users.mobile_8')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: mobile_8 -', error.message)
    }

    // 删除 users.users_mobile (重复索引，保留 mobile)
    try {
      await queryInterface.removeIndex('users', 'users_mobile')
      console.log('   ✅ 删除重复索引: users.users_mobile')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在: users_mobile -', error.message)
    }

    console.log('✅ 重复索引清理完成')
    console.log('📈 数据库性能已优化')
  },

  async down (queryInterface, _Sequelize) {
    console.log('🔄 回滚重复索引清理...')
    console.log('⚠️ 注意：这将重新创建重复索引，可能影响性能')

    // 注意：回滚会重新创建重复索引 analytics_user_profiles.idx_analytics_profiles_user_id
    try {
      await queryInterface.addIndex('analytics_user_profiles', ['user_id'], {
        name: 'idx_analytics_profiles_user_id'
      })
      console.log('   ✅ 重新创建索引: analytics_user_profiles.idx_analytics_profiles_user_id')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: idx_analytics_profiles_user_id -', error.message)
    }

    // 注意：回滚会重新创建重复索引 analytics_user_profiles.user_id_2
    try {
      await queryInterface.addIndex('analytics_user_profiles', ['user_id'], {
        name: 'user_id_2'
      })
      console.log('   ✅ 重新创建索引: analytics_user_profiles.user_id_2')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: user_id_2 -', error.message)
    }

    // 注意：回滚会重新创建重复索引 business_configs.business_type_2
    try {
      await queryInterface.addIndex('business_configs', ['business_type'], {
        name: 'business_type_2'
      })
      console.log('   ✅ 重新创建索引: business_configs.business_type_2')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: business_type_2 -', error.message)
    }

    // 注意：回滚会重新创建重复索引 business_configs.business_type_3
    try {
      await queryInterface.addIndex('business_configs', ['business_type'], {
        name: 'business_type_3'
      })
      console.log('   ✅ 重新创建索引: business_configs.business_type_3')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: business_type_3 -', error.message)
    }

    // 注意：回滚会重新创建重复索引 business_configs.business_type_4
    try {
      await queryInterface.addIndex('business_configs', ['business_type'], {
        name: 'business_type_4'
      })
      console.log('   ✅ 重新创建索引: business_configs.business_type_4')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: business_type_4 -', error.message)
    }

    // 注意：回滚会重新创建重复索引 business_configs.idx_business_type
    try {
      await queryInterface.addIndex('business_configs', ['business_type'], {
        name: 'idx_business_type'
      })
      console.log('   ✅ 重新创建索引: business_configs.idx_business_type')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: idx_business_type -', error.message)
    }

    // 注意：回滚会重新创建重复索引 business_events.idx_business_events_event_status
    try {
      await queryInterface.addIndex('business_events', ['event_status'], {
        name: 'idx_business_events_event_status'
      })
      console.log('   ✅ 重新创建索引: business_events.idx_business_events_event_status')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: idx_business_events_event_status -', error.message)
    }

    // 注意：回滚会重新创建重复索引 exchange_records.idx_exchange_records_exchange_code
    try {
      await queryInterface.addIndex('exchange_records', ['exchange_code'], {
        name: 'idx_exchange_records_exchange_code'
      })
      console.log('   ✅ 重新创建索引: exchange_records.idx_exchange_records_exchange_code')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: idx_exchange_records_exchange_code -', error.message)
    }

    // 注意：回滚会重新创建重复索引 lottery_campaigns.uk_campaign_code
    try {
      await queryInterface.addIndex('lottery_campaigns', ['campaign_code'], {
        name: 'uk_campaign_code'
      })
      console.log('   ✅ 重新创建索引: lottery_campaigns.uk_campaign_code')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: uk_campaign_code -', error.message)
    }

    // 注意：回滚会重新创建重复索引 lottery_campaigns.idx_lc_campaign_type
    try {
      await queryInterface.addIndex('lottery_campaigns', ['campaign_type'], {
        name: 'idx_lc_campaign_type'
      })
      console.log('   ✅ 重新创建索引: lottery_campaigns.idx_lc_campaign_type')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: idx_lc_campaign_type -', error.message)
    }

    // 注意：回滚会重新创建重复索引 lottery_campaigns.idx_status_campaign
    try {
      await queryInterface.addIndex('lottery_campaigns', ['status'], {
        name: 'idx_status_campaign'
      })
      console.log('   ✅ 重新创建索引: lottery_campaigns.idx_status_campaign')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: idx_status_campaign -', error.message)
    }

    // 注意：回滚会重新创建重复索引 lottery_campaigns.idx_lc_time_range
    try {
      await queryInterface.addIndex('lottery_campaigns', ['end_time', 'start_time'], {
        name: 'idx_lc_time_range'
      })
      console.log('   ✅ 重新创建索引: lottery_campaigns.idx_lc_time_range')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: idx_lc_time_range -', error.message)
    }

    // 注意：回滚会重新创建重复索引 lottery_records.lottery_records_created_at
    try {
      await queryInterface.addIndex('lottery_records', ['created_at'], {
        name: 'lottery_records_created_at'
      })
      console.log('   ✅ 重新创建索引: lottery_records.lottery_records_created_at')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: lottery_records_created_at -', error.message)
    }

    // 注意：回滚会重新创建重复索引 lottery_records.lottery_records_draw_type
    try {
      await queryInterface.addIndex('lottery_records', ['draw_type'], {
        name: 'lottery_records_draw_type'
      })
      console.log('   ✅ 重新创建索引: lottery_records.lottery_records_draw_type')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: lottery_records_draw_type -', error.message)
    }

    // 注意：回滚会重新创建重复索引 lottery_records.lottery_records_is_pity
    try {
      await queryInterface.addIndex('lottery_records', ['is_pity'], {
        name: 'lottery_records_is_pity'
      })
      console.log('   ✅ 重新创建索引: lottery_records.lottery_records_is_pity')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: lottery_records_is_pity -', error.message)
    }

    // 注意：回滚会重新创建重复索引 lottery_records.idx_lottery_records_user_time
    try {
      await queryInterface.addIndex('lottery_records', ['created_at', 'user_id'], {
        name: 'idx_lottery_records_user_time'
      })
      console.log('   ✅ 重新创建索引: lottery_records.idx_lottery_records_user_time')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: idx_lottery_records_user_time -', error.message)
    }

    // 注意：回滚会重新创建重复索引 lottery_records.lottery_records_user_id_created_at
    try {
      await queryInterface.addIndex('lottery_records', ['created_at', 'user_id'], {
        name: 'lottery_records_user_id_created_at'
      })
      console.log('   ✅ 重新创建索引: lottery_records.lottery_records_user_id_created_at')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: lottery_records_user_id_created_at -', error.message)
    }

    // 注意：回滚会重新创建重复索引 lottery_records.lottery_records_prize_id
    try {
      await queryInterface.addIndex('lottery_records', ['prize_id'], {
        name: 'lottery_records_prize_id'
      })
      console.log('   ✅ 重新创建索引: lottery_records.lottery_records_prize_id')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: lottery_records_prize_id -', error.message)
    }

    // 注意：回滚会重新创建重复索引 lottery_records.lottery_records_prize_type
    try {
      await queryInterface.addIndex('lottery_records', ['prize_type'], {
        name: 'lottery_records_prize_type'
      })
      console.log('   ✅ 重新创建索引: lottery_records.lottery_records_prize_type')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: lottery_records_prize_type -', error.message)
    }

    // 注意：回滚会重新创建重复索引 lottery_records.lottery_records_user_id
    try {
      await queryInterface.addIndex('lottery_records', ['user_id'], {
        name: 'lottery_records_user_id'
      })
      console.log('   ✅ 重新创建索引: lottery_records.lottery_records_user_id')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: lottery_records_user_id -', error.message)
    }

    // 注意：回滚会重新创建重复索引 points_earning_rules.uk_rule_code
    try {
      await queryInterface.addIndex('points_earning_rules', ['rule_code'], {
        name: 'uk_rule_code'
      })
      console.log('   ✅ 重新创建索引: points_earning_rules.uk_rule_code')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: uk_rule_code -', error.message)
    }

    // 注意：回滚会重新创建重复索引 points_records.points_records_user_id_created_at
    try {
      await queryInterface.addIndex('points_records', ['created_at', 'user_id'], {
        name: 'points_records_user_id_created_at'
      })
      console.log('   ✅ 重新创建索引: points_records.points_records_user_id_created_at')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: points_records_user_id_created_at -', error.message)
    }

    // 注意：回滚会重新创建重复索引 points_transactions.idx_pt_status
    try {
      await queryInterface.addIndex('points_transactions', ['status'], {
        name: 'idx_pt_status'
      })
      console.log('   ✅ 重新创建索引: points_transactions.idx_pt_status')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: idx_pt_status -', error.message)
    }

    // 注意：回滚会重新创建重复索引 points_transactions.idx_pt_user_time
    try {
      await queryInterface.addIndex('points_transactions', ['transaction_time', 'user_id'], {
        name: 'idx_pt_user_time'
      })
      console.log('   ✅ 重新创建索引: points_transactions.idx_pt_user_time')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: idx_pt_user_time -', error.message)
    }

    // 注意：回滚会重新创建重复索引 products.idx_products_category
    try {
      await queryInterface.addIndex('products', ['category'], {
        name: 'idx_products_category'
      })
      console.log('   ✅ 重新创建索引: products.idx_products_category')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: idx_products_category -', error.message)
    }

    // 注意：回滚会重新创建重复索引 products.idx_products_sort_order
    try {
      await queryInterface.addIndex('products', ['sort_order'], {
        name: 'idx_products_sort_order'
      })
      console.log('   ✅ 重新创建索引: products.idx_products_sort_order')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: idx_products_sort_order -', error.message)
    }

    // 注意：回滚会重新创建重复索引 products.idx_products_stock
    try {
      await queryInterface.addIndex('products', ['stock'], {
        name: 'idx_products_stock'
      })
      console.log('   ✅ 重新创建索引: products.idx_products_stock')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: idx_products_stock -', error.message)
    }

    // 注意：回滚会重新创建重复索引 trade_records.trade_records_trade_id
    try {
      await queryInterface.addIndex('trade_records', ['trade_id'], {
        name: 'trade_records_trade_id'
      })
      console.log('   ✅ 重新创建索引: trade_records.trade_records_trade_id')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: trade_records_trade_id -', error.message)
    }

    // 注意：回滚会重新创建重复索引 users.users_is_merchant_status
    try {
      await queryInterface.addIndex('users', ['status'], {
        name: 'users_is_merchant_status'
      })
      console.log('   ✅ 重新创建索引: users.users_is_merchant_status')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: users_is_merchant_status -', error.message)
    }

    // 注意：回滚会重新创建重复索引 users.idx_users_admin_status
    try {
      await queryInterface.addIndex('users', ['is_admin', 'status'], {
        name: 'idx_users_admin_status'
      })
      console.log('   ✅ 重新创建索引: users.idx_users_admin_status')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: idx_users_admin_status -', error.message)
    }

    // 注意：回滚会重新创建重复索引 users.users_status_is_admin
    try {
      await queryInterface.addIndex('users', ['is_admin', 'status'], {
        name: 'users_status_is_admin'
      })
      console.log('   ✅ 重新创建索引: users.users_status_is_admin')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: users_status_is_admin -', error.message)
    }

    // 注意：回滚会重新创建重复索引 users.mobile_2
    try {
      await queryInterface.addIndex('users', ['mobile'], {
        name: 'mobile_2'
      })
      console.log('   ✅ 重新创建索引: users.mobile_2')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: mobile_2 -', error.message)
    }

    // 注意：回滚会重新创建重复索引 users.mobile_3
    try {
      await queryInterface.addIndex('users', ['mobile'], {
        name: 'mobile_3'
      })
      console.log('   ✅ 重新创建索引: users.mobile_3')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: mobile_3 -', error.message)
    }

    // 注意：回滚会重新创建重复索引 users.mobile_4
    try {
      await queryInterface.addIndex('users', ['mobile'], {
        name: 'mobile_4'
      })
      console.log('   ✅ 重新创建索引: users.mobile_4')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: mobile_4 -', error.message)
    }

    // 注意：回滚会重新创建重复索引 users.mobile_5
    try {
      await queryInterface.addIndex('users', ['mobile'], {
        name: 'mobile_5'
      })
      console.log('   ✅ 重新创建索引: users.mobile_5')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: mobile_5 -', error.message)
    }

    // 注意：回滚会重新创建重复索引 users.mobile_6
    try {
      await queryInterface.addIndex('users', ['mobile'], {
        name: 'mobile_6'
      })
      console.log('   ✅ 重新创建索引: users.mobile_6')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: mobile_6 -', error.message)
    }

    // 注意：回滚会重新创建重复索引 users.mobile_7
    try {
      await queryInterface.addIndex('users', ['mobile'], {
        name: 'mobile_7'
      })
      console.log('   ✅ 重新创建索引: users.mobile_7')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: mobile_7 -', error.message)
    }

    // 注意：回滚会重新创建重复索引 users.mobile_8
    try {
      await queryInterface.addIndex('users', ['mobile'], {
        name: 'mobile_8'
      })
      console.log('   ✅ 重新创建索引: users.mobile_8')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: mobile_8 -', error.message)
    }

    // 注意：回滚会重新创建重复索引 users.users_mobile
    try {
      await queryInterface.addIndex('users', ['mobile'], {
        name: 'users_mobile'
      })
      console.log('   ✅ 重新创建索引: users.users_mobile')
    } catch (error) {
      console.log('   ⚠️ 创建索引失败: users_mobile -', error.message)
    }

    console.log('✅ 重复索引清理回滚完成')
    console.log('⚠️ 重复索引已恢复，建议重新运行清理')
  }
}
