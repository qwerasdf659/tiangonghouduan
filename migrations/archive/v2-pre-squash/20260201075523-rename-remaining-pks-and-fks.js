'use strict'

/**
 * 🔧 技术债务修复 - 剩余主键和外键命名规范化迁移
 *
 * 迁移说明：
 * - 前8张表的主键已在之前迁移中完成重命名
 * - 本迁移处理剩余49张表的主键和21个技术外键
 * - 需要先删除外键约束，重命名列后再重建外键
 *
 * 已完成的主键（跳过）：
 * - lottery_campaigns: campaign_id -> lottery_campaign_id ✓
 * - lottery_prizes: prize_id -> lottery_prize_id ✓
 * - lottery_draws: draw_id -> lottery_draw_id ✓
 * - lottery_presets: preset_id -> lottery_preset_id ✓
 * - market_listings: listing_id -> market_listing_id ✓
 * - exchange_items: item_id -> exchange_item_id ✓
 * - image_resources: image_id -> image_resource_id ✓
 * - customer_service_sessions: session_id -> customer_service_session_id ✓
 *
 * @version 5.2.1
 * @date 2026-02-01
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🚀 开始剩余主键和外键规范化迁移...')

      // 阶段1: 禁用外键检查
      console.log('📌 阶段1: 禁用外键检查')
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction })

      // =====================================================================
      // 阶段2: 删除所有需要处理的外键约束
      // =====================================================================
      console.log('📌 阶段2: 删除外键约束')

      const foreignKeysToDrop = [
        // consumption_records 被引用的外键
        { table: 'merchant_operation_logs', constraint: 'merchant_operation_logs_ibfk_4' },
        // system_dictionaries 被引用的外键
        { table: 'system_dictionary_history', constraint: 'fk_dict_history_dict_id' },
        // exchange_items 被引用的外键
        { table: 'exchange_records', constraint: 'exchange_records_ibfk_2' },
        // lottery_draws 被引用的外键（draw_id -> lottery_draw_id）
        { table: 'lottery_draw_decisions', constraint: 'fk_decisions_draw' },
        // market_listings 被引用的外键（listing_id -> market_listing_id）
        { table: 'trade_orders', constraint: 'trade_orders_ibfk_1' },
        // customer_service_sessions 被引用的外键（session_id -> customer_service_session_id）
        { table: 'chat_messages', constraint: 'fk_chat_messages_session_id' },
        // image_resources 被引用的外键（image_id -> image_resource_id）
        { table: 'lottery_prizes', constraint: 'fk_lottery_prizes_image' },
        // lottery_presets 被引用的外键（preset_id -> lottery_preset_id）
        { table: 'preset_budget_debt', constraint: 'fk_budget_debt_preset_id' },
        { table: 'preset_inventory_debt', constraint: 'fk_inv_debt_preset_id' }
      ]

      for (const fk of foreignKeysToDrop) {
        try {
          await queryInterface.sequelize.query(
            `ALTER TABLE \`${fk.table}\` DROP FOREIGN KEY \`${fk.constraint}\``,
            { transaction }
          )
          console.log(`   ✅ 删除外键: ${fk.table}.${fk.constraint}`)
        } catch (err) {
          // 外键可能不存在
          console.log(`   ⚠️ 跳过外键 ${fk.table}.${fk.constraint}: ${err.message}`)
        }
      }

      // =====================================================================
      // 阶段3: 重命名剩余主键列（49张表）
      // =====================================================================
      console.log('📌 阶段3: 重命名剩余主键列（49张表）')

      const remainingPrimaryKeys = [
        // 批次1: 日志/记录表
        { table: 'consumption_records', oldColumn: 'record_id', newColumn: 'consumption_record_id' },
        { table: 'system_dictionaries', oldColumn: 'dict_id', newColumn: 'system_dictionary_id' },
        { table: 'admin_operation_logs', oldColumn: 'log_id', newColumn: 'admin_operation_log_id' },
        {
          table: 'batch_operation_logs',
          oldColumn: 'batch_log_id',
          newColumn: 'batch_operation_log_id'
        },
        {
          table: 'merchant_operation_logs',
          oldColumn: 'merchant_log_id',
          newColumn: 'merchant_operation_log_id'
        },
        {
          table: 'websocket_startup_logs',
          oldColumn: 'log_id',
          newColumn: 'websocket_startup_log_id'
        },
        { table: 'exchange_records', oldColumn: 'record_id', newColumn: 'exchange_record_id' },
        {
          table: 'user_role_change_records',
          oldColumn: 'record_id',
          newColumn: 'user_role_change_record_id'
        },
        {
          table: 'user_status_change_records',
          oldColumn: 'record_id',
          newColumn: 'user_status_change_record_id'
        },
        {
          table: 'lottery_clear_setting_records',
          oldColumn: 'record_id',
          newColumn: 'lottery_clear_setting_record_id'
        },
        {
          table: 'content_review_records',
          oldColumn: 'audit_id',
          newColumn: 'content_review_record_id'
        },
        {
          table: 'admin_notifications',
          oldColumn: 'notification_id',
          newColumn: 'admin_notification_id'
        },

        // 批次2: 配置/规则表
        {
          table: 'lottery_draw_quota_rules',
          oldColumn: 'rule_id',
          newColumn: 'lottery_draw_quota_rule_id'
        },
        {
          table: 'material_conversion_rules',
          oldColumn: 'rule_id',
          newColumn: 'material_conversion_rule_id'
        },
        { table: 'lottery_tier_rules', oldColumn: 'tier_rule_id', newColumn: 'lottery_tier_rule_id' },
        {
          table: 'lottery_strategy_config',
          oldColumn: 'strategy_config_id',
          newColumn: 'lottery_strategy_config_id'
        },
        {
          table: 'lottery_tier_matrix_config',
          oldColumn: 'matrix_config_id',
          newColumn: 'lottery_tier_matrix_config_id'
        },
        {
          table: 'lottery_campaign_pricing_config',
          oldColumn: 'config_id',
          newColumn: 'lottery_campaign_pricing_config_id'
        },
        {
          table: 'lottery_management_settings',
          oldColumn: 'setting_id',
          newColumn: 'lottery_management_setting_id'
        },
        { table: 'system_settings', oldColumn: 'setting_id', newColumn: 'system_setting_id' },
        { table: 'system_configs', oldColumn: 'config_id', newColumn: 'system_config_id' },
        { table: 'feature_flags', oldColumn: 'flag_id', newColumn: 'feature_flag_id' },

        // 批次3: 统计/状态表
        {
          table: 'lottery_hourly_metrics',
          oldColumn: 'metric_id',
          newColumn: 'lottery_hourly_metric_id'
        },
        {
          table: 'lottery_daily_metrics',
          oldColumn: 'daily_metric_id',
          newColumn: 'lottery_daily_metric_id'
        },
        {
          table: 'lottery_user_experience_state',
          oldColumn: 'state_id',
          newColumn: 'lottery_user_experience_state_id'
        },
        {
          table: 'lottery_user_global_state',
          oldColumn: 'global_state_id',
          newColumn: 'lottery_user_global_state_id'
        },
        {
          table: 'lottery_user_daily_draw_quota',
          oldColumn: 'quota_id',
          newColumn: 'lottery_user_daily_draw_quota_id'
        },
        {
          table: 'lottery_campaign_user_quota',
          oldColumn: 'quota_id',
          newColumn: 'lottery_campaign_user_quota_id'
        },
        {
          table: 'lottery_campaign_quota_grants',
          oldColumn: 'grant_id',
          newColumn: 'lottery_campaign_quota_grant_id'
        },

        // 批次4: 其他业务表
        {
          table: 'account_asset_balances',
          oldColumn: 'balance_id',
          newColumn: 'account_asset_balance_id'
        },
        {
          table: 'asset_transactions',
          oldColumn: 'transaction_id',
          newColumn: 'asset_transaction_id'
        },
        {
          table: 'authentication_sessions',
          oldColumn: 'user_session_id',
          newColumn: 'authentication_session_id'
        },
        { table: 'chat_messages', oldColumn: 'message_id', newColumn: 'chat_message_id' },
        {
          table: 'item_instance_events',
          oldColumn: 'event_id',
          newColumn: 'item_instance_event_id'
        },
        { table: 'lottery_alerts', oldColumn: 'alert_id', newColumn: 'lottery_alert_id' },
        {
          table: 'lottery_draw_decisions',
          oldColumn: 'decision_id',
          newColumn: 'lottery_draw_decision_id'
        },
        { table: 'popup_banners', oldColumn: 'banner_id', newColumn: 'popup_banner_id' },
        { table: 'preset_budget_debt', oldColumn: 'debt_id', newColumn: 'preset_budget_debt_id' },
        {
          table: 'preset_inventory_debt',
          oldColumn: 'debt_id',
          newColumn: 'preset_inventory_debt_id'
        },
        { table: 'preset_debt_limits', oldColumn: 'limit_id', newColumn: 'preset_debt_limit_id' },
        { table: 'redemption_orders', oldColumn: 'order_id', newColumn: 'redemption_order_id' },
        { table: 'risk_alerts', oldColumn: 'alert_id', newColumn: 'risk_alert_id' },
        {
          table: 'system_announcements',
          oldColumn: 'announcement_id',
          newColumn: 'system_announcement_id'
        },
        {
          table: 'system_dictionary_history',
          oldColumn: 'history_id',
          newColumn: 'system_dictionary_history_id'
        },
        { table: 'trade_orders', oldColumn: 'order_id', newColumn: 'trade_order_id' },
        { table: 'user_hierarchy', oldColumn: 'hierarchy_id', newColumn: 'user_hierarchy_id' },
        { table: 'user_premium_status', oldColumn: 'id', newColumn: 'user_premium_status_id' },
        {
          table: 'user_risk_profiles',
          oldColumn: 'risk_profile_id',
          newColumn: 'user_risk_profile_id'
        },
        {
          table: 'api_idempotency_requests',
          oldColumn: 'request_id',
          newColumn: 'api_idempotency_request_id'
        }
      ]

      for (const pk of remainingPrimaryKeys) {
        try {
          // 检查列是否存在
          const [columns] = await queryInterface.sequelize.query(
            `SHOW COLUMNS FROM \`${pk.table}\` WHERE Field = '${pk.oldColumn}'`,
            { transaction }
          )

          if (columns.length === 0) {
            // 检查是否已经是新名称
            const [newColumns] = await queryInterface.sequelize.query(
              `SHOW COLUMNS FROM \`${pk.table}\` WHERE Field = '${pk.newColumn}'`,
              { transaction }
            )
            if (newColumns.length > 0) {
              console.log(`   ⏭️ 跳过 ${pk.table}（已是 ${pk.newColumn}）`)
              continue
            }
            console.log(`   ⚠️ 跳过 ${pk.table}.${pk.oldColumn}（列不存在）`)
            continue
          }

          const columnDef = columns[0]
          const isAutoIncrement = columnDef.Extra && columnDef.Extra.includes('auto_increment')
          const columnType = columnDef.Type

          let newColumnDef = `${columnType} NOT NULL`
          if (isAutoIncrement) {
            newColumnDef += ' AUTO_INCREMENT'
          }

          await queryInterface.sequelize.query(
            `ALTER TABLE \`${pk.table}\` CHANGE \`${pk.oldColumn}\` \`${pk.newColumn}\` ${newColumnDef}`,
            { transaction }
          )
          console.log(`   ✅ ${pk.table}: ${pk.oldColumn} → ${pk.newColumn}`)
        } catch (err) {
          console.log(`   ❌ ${pk.table}.${pk.oldColumn} 失败: ${err.message}`)
          throw err
        }
      }

      // =====================================================================
      // 阶段4: 重命名技术外键列（21个）
      // =====================================================================
      console.log('📌 阶段4: 重命名技术外键列（21个）')

      const foreignKeys = [
        // 已完成主键表的外键
        { table: 'lottery_alerts', oldColumn: 'campaign_id', newColumn: 'lottery_campaign_id' },
        {
          table: 'lottery_campaign_pricing_config',
          oldColumn: 'campaign_id',
          newColumn: 'lottery_campaign_id'
        },
        {
          table: 'lottery_campaign_user_quota',
          oldColumn: 'campaign_id',
          newColumn: 'lottery_campaign_id'
        },
        {
          table: 'lottery_daily_metrics',
          oldColumn: 'campaign_id',
          newColumn: 'lottery_campaign_id'
        },
        { table: 'lottery_draws', oldColumn: 'campaign_id', newColumn: 'lottery_campaign_id' },
        {
          table: 'lottery_hourly_metrics',
          oldColumn: 'campaign_id',
          newColumn: 'lottery_campaign_id'
        },
        { table: 'lottery_prizes', oldColumn: 'campaign_id', newColumn: 'lottery_campaign_id' },
        { table: 'lottery_tier_rules', oldColumn: 'campaign_id', newColumn: 'lottery_campaign_id' },
        {
          table: 'lottery_user_experience_state',
          oldColumn: 'campaign_id',
          newColumn: 'lottery_campaign_id'
        },

        // lottery_prizes 外键
        { table: 'lottery_draws', oldColumn: 'prize_id', newColumn: 'lottery_prize_id' },
        { table: 'lottery_presets', oldColumn: 'prize_id', newColumn: 'lottery_prize_id' },
        { table: 'preset_inventory_debt', oldColumn: 'prize_id', newColumn: 'lottery_prize_id' },

        // 其他外键
        { table: 'lottery_draw_decisions', oldColumn: 'draw_id', newColumn: 'lottery_draw_id' },
        { table: 'trade_orders', oldColumn: 'listing_id', newColumn: 'market_listing_id' },
        { table: 'exchange_records', oldColumn: 'item_id', newColumn: 'exchange_item_id' },
        { table: 'lottery_prizes', oldColumn: 'image_id', newColumn: 'image_resource_id' },
        { table: 'preset_budget_debt', oldColumn: 'preset_id', newColumn: 'lottery_preset_id' },
        { table: 'preset_inventory_debt', oldColumn: 'preset_id', newColumn: 'lottery_preset_id' },
        {
          table: 'chat_messages',
          oldColumn: 'session_id',
          newColumn: 'customer_service_session_id'
        },
        {
          table: 'merchant_operation_logs',
          oldColumn: 'related_record_id',
          newColumn: 'consumption_record_id'
        },
        {
          table: 'system_dictionary_history',
          oldColumn: 'dict_id',
          newColumn: 'system_dictionary_id'
        }
      ]

      for (const fk of foreignKeys) {
        try {
          const [columns] = await queryInterface.sequelize.query(
            `SHOW COLUMNS FROM \`${fk.table}\` WHERE Field = '${fk.oldColumn}'`,
            { transaction }
          )

          if (columns.length === 0) {
            // 检查是否已是新名称
            const [newColumns] = await queryInterface.sequelize.query(
              `SHOW COLUMNS FROM \`${fk.table}\` WHERE Field = '${fk.newColumn}'`,
              { transaction }
            )
            if (newColumns.length > 0) {
              console.log(`   ⏭️ 跳过 ${fk.table}（已是 ${fk.newColumn}）`)
              continue
            }
            console.log(`   ⚠️ 跳过 ${fk.table}.${fk.oldColumn}（列不存在）`)
            continue
          }

          const columnDef = columns[0]
          const columnType = columnDef.Type
          const isNullable = columnDef.Null === 'YES'
          const defaultValue = columnDef.Default

          let newColumnDef = columnType
          if (isNullable) {
            newColumnDef += ' NULL'
          } else {
            newColumnDef += ' NOT NULL'
          }
          if (defaultValue !== null && defaultValue !== undefined) {
            newColumnDef += ` DEFAULT '${defaultValue}'`
          }

          await queryInterface.sequelize.query(
            `ALTER TABLE \`${fk.table}\` CHANGE \`${fk.oldColumn}\` \`${fk.newColumn}\` ${newColumnDef}`,
            { transaction }
          )
          console.log(`   ✅ ${fk.table}: ${fk.oldColumn} → ${fk.newColumn}`)
        } catch (err) {
          console.log(`   ❌ ${fk.table}.${fk.oldColumn} 失败: ${err.message}`)
          throw err
        }
      }

      // =====================================================================
      // 阶段5: 重建外键约束
      // =====================================================================
      console.log('📌 阶段5: 重建外键约束')

      const foreignKeysToCreate = [
        {
          table: 'merchant_operation_logs',
          constraint: 'fk_merchant_logs_consumption_record',
          column: 'consumption_record_id',
          refTable: 'consumption_records',
          refColumn: 'consumption_record_id',
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        },
        {
          table: 'system_dictionary_history',
          constraint: 'fk_dict_history_dict',
          column: 'system_dictionary_id',
          refTable: 'system_dictionaries',
          refColumn: 'system_dictionary_id',
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        {
          table: 'exchange_records',
          constraint: 'fk_exchange_records_item',
          column: 'exchange_item_id',
          refTable: 'exchange_items',
          refColumn: 'exchange_item_id',
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE'
        },
        {
          table: 'lottery_draw_decisions',
          constraint: 'fk_decisions_draw',
          column: 'lottery_draw_id',
          refTable: 'lottery_draws',
          refColumn: 'lottery_draw_id',
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        {
          table: 'trade_orders',
          constraint: 'fk_trade_orders_listing',
          column: 'market_listing_id',
          refTable: 'market_listings',
          refColumn: 'market_listing_id',
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE'
        },
        {
          table: 'chat_messages',
          constraint: 'fk_chat_messages_session',
          column: 'customer_service_session_id',
          refTable: 'customer_service_sessions',
          refColumn: 'customer_service_session_id',
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        {
          table: 'lottery_prizes',
          constraint: 'fk_lottery_prizes_image',
          column: 'image_resource_id',
          refTable: 'image_resources',
          refColumn: 'image_resource_id',
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        },
        {
          table: 'preset_budget_debt',
          constraint: 'fk_budget_debt_preset',
          column: 'lottery_preset_id',
          refTable: 'lottery_presets',
          refColumn: 'lottery_preset_id',
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        {
          table: 'preset_inventory_debt',
          constraint: 'fk_inv_debt_preset',
          column: 'lottery_preset_id',
          refTable: 'lottery_presets',
          refColumn: 'lottery_preset_id',
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        }
      ]

      for (const fk of foreignKeysToCreate) {
        try {
          await queryInterface.sequelize.query(
            `ALTER TABLE \`${fk.table}\` 
             ADD CONSTRAINT \`${fk.constraint}\` 
             FOREIGN KEY (\`${fk.column}\`) 
             REFERENCES \`${fk.refTable}\`(\`${fk.refColumn}\`)
             ON DELETE ${fk.onDelete} ON UPDATE ${fk.onUpdate}`,
            { transaction }
          )
          console.log(`   ✅ 创建外键: ${fk.table}.${fk.constraint}`)
        } catch (err) {
          console.log(`   ⚠️ 外键创建跳过 ${fk.constraint}: ${err.message}`)
        }
      }

      // 阶段6: 恢复外键检查
      console.log('📌 阶段6: 恢复外键检查')
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction })

      await transaction.commit()
      console.log('✅ 剩余主键和外键规范化迁移完成！')
      console.log(`   - 主键重命名: ${remainingPrimaryKeys.length} 张表`)
      console.log(`   - 外键重命名: ${foreignKeys.length} 个`)
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始回滚剩余主键和外键规范化迁移...')

      // 禁用外键检查
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction })

      // 删除新创建的外键约束
      const foreignKeysToDrop = [
        { table: 'merchant_operation_logs', constraint: 'fk_merchant_logs_consumption_record' },
        { table: 'system_dictionary_history', constraint: 'fk_dict_history_dict' }
      ]

      for (const fk of foreignKeysToDrop) {
        try {
          await queryInterface.sequelize.query(
            `ALTER TABLE \`${fk.table}\` DROP FOREIGN KEY \`${fk.constraint}\``,
            { transaction }
          )
          console.log(`   ✅ 删除外键: ${fk.table}.${fk.constraint}`)
        } catch (err) {
          console.log(`   ⚠️ 跳过: ${err.message}`)
        }
      }

      // 回滚外键列名（逆向）
      const foreignKeysRevert = [
        { table: 'lottery_alerts', oldColumn: 'lottery_campaign_id', newColumn: 'campaign_id' },
        {
          table: 'lottery_campaign_pricing_config',
          oldColumn: 'lottery_campaign_id',
          newColumn: 'campaign_id'
        },
        {
          table: 'lottery_campaign_user_quota',
          oldColumn: 'lottery_campaign_id',
          newColumn: 'campaign_id'
        },
        {
          table: 'lottery_daily_metrics',
          oldColumn: 'lottery_campaign_id',
          newColumn: 'campaign_id'
        },
        { table: 'lottery_draws', oldColumn: 'lottery_campaign_id', newColumn: 'campaign_id' },
        {
          table: 'lottery_hourly_metrics',
          oldColumn: 'lottery_campaign_id',
          newColumn: 'campaign_id'
        },
        { table: 'lottery_prizes', oldColumn: 'lottery_campaign_id', newColumn: 'campaign_id' },
        { table: 'lottery_tier_rules', oldColumn: 'lottery_campaign_id', newColumn: 'campaign_id' },
        {
          table: 'lottery_user_experience_state',
          oldColumn: 'lottery_campaign_id',
          newColumn: 'campaign_id'
        },
        { table: 'lottery_draws', oldColumn: 'lottery_prize_id', newColumn: 'prize_id' },
        { table: 'lottery_presets', oldColumn: 'lottery_prize_id', newColumn: 'prize_id' },
        { table: 'preset_inventory_debt', oldColumn: 'lottery_prize_id', newColumn: 'prize_id' },
        { table: 'lottery_draw_decisions', oldColumn: 'lottery_draw_id', newColumn: 'draw_id' },
        { table: 'trade_orders', oldColumn: 'market_listing_id', newColumn: 'listing_id' },
        { table: 'exchange_records', oldColumn: 'exchange_item_id', newColumn: 'item_id' },
        { table: 'lottery_prizes', oldColumn: 'image_resource_id', newColumn: 'image_id' },
        { table: 'preset_budget_debt', oldColumn: 'lottery_preset_id', newColumn: 'preset_id' },
        { table: 'preset_inventory_debt', oldColumn: 'lottery_preset_id', newColumn: 'preset_id' },
        { table: 'chat_messages', oldColumn: 'customer_service_session_id', newColumn: 'session_id' },
        {
          table: 'merchant_operation_logs',
          oldColumn: 'consumption_record_id',
          newColumn: 'related_record_id'
        },
        { table: 'system_dictionary_history', oldColumn: 'system_dictionary_id', newColumn: 'dict_id' }
      ]

      for (const fk of foreignKeysRevert) {
        try {
          const [columns] = await queryInterface.sequelize.query(
            `SHOW COLUMNS FROM \`${fk.table}\` WHERE Field = '${fk.oldColumn}'`,
            { transaction }
          )

          if (columns.length === 0) continue

          const columnDef = columns[0]
          const columnType = columnDef.Type
          const isNullable = columnDef.Null === 'YES'
          const newColumnDef = columnType + (isNullable ? ' NULL' : ' NOT NULL')

          await queryInterface.sequelize.query(
            `ALTER TABLE \`${fk.table}\` CHANGE \`${fk.oldColumn}\` \`${fk.newColumn}\` ${newColumnDef}`,
            { transaction }
          )
          console.log(`   ✅ ${fk.table}: ${fk.oldColumn} → ${fk.newColumn}`)
        } catch (err) {
          console.log(`   ⚠️ 跳过: ${err.message}`)
        }
      }

      // 回滚主键列名（49张表）
      const primaryKeysRevert = [
        { table: 'consumption_records', oldColumn: 'consumption_record_id', newColumn: 'record_id' },
        { table: 'system_dictionaries', oldColumn: 'system_dictionary_id', newColumn: 'dict_id' },
        { table: 'admin_operation_logs', oldColumn: 'admin_operation_log_id', newColumn: 'log_id' },
        {
          table: 'batch_operation_logs',
          oldColumn: 'batch_operation_log_id',
          newColumn: 'batch_log_id'
        },
        {
          table: 'merchant_operation_logs',
          oldColumn: 'merchant_operation_log_id',
          newColumn: 'merchant_log_id'
        },
        {
          table: 'websocket_startup_logs',
          oldColumn: 'websocket_startup_log_id',
          newColumn: 'log_id'
        },
        { table: 'exchange_records', oldColumn: 'exchange_record_id', newColumn: 'record_id' },
        {
          table: 'user_role_change_records',
          oldColumn: 'user_role_change_record_id',
          newColumn: 'record_id'
        },
        {
          table: 'user_status_change_records',
          oldColumn: 'user_status_change_record_id',
          newColumn: 'record_id'
        },
        {
          table: 'lottery_clear_setting_records',
          oldColumn: 'lottery_clear_setting_record_id',
          newColumn: 'record_id'
        },
        {
          table: 'content_review_records',
          oldColumn: 'content_review_record_id',
          newColumn: 'audit_id'
        },
        {
          table: 'admin_notifications',
          oldColumn: 'admin_notification_id',
          newColumn: 'notification_id'
        },
        {
          table: 'lottery_draw_quota_rules',
          oldColumn: 'lottery_draw_quota_rule_id',
          newColumn: 'rule_id'
        },
        {
          table: 'material_conversion_rules',
          oldColumn: 'material_conversion_rule_id',
          newColumn: 'rule_id'
        },
        {
          table: 'lottery_tier_rules',
          oldColumn: 'lottery_tier_rule_id',
          newColumn: 'tier_rule_id'
        },
        {
          table: 'lottery_strategy_config',
          oldColumn: 'lottery_strategy_config_id',
          newColumn: 'strategy_config_id'
        },
        {
          table: 'lottery_tier_matrix_config',
          oldColumn: 'lottery_tier_matrix_config_id',
          newColumn: 'matrix_config_id'
        },
        {
          table: 'lottery_campaign_pricing_config',
          oldColumn: 'lottery_campaign_pricing_config_id',
          newColumn: 'config_id'
        },
        {
          table: 'lottery_management_settings',
          oldColumn: 'lottery_management_setting_id',
          newColumn: 'setting_id'
        },
        { table: 'system_settings', oldColumn: 'system_setting_id', newColumn: 'setting_id' },
        { table: 'system_configs', oldColumn: 'system_config_id', newColumn: 'config_id' },
        { table: 'feature_flags', oldColumn: 'feature_flag_id', newColumn: 'flag_id' },
        {
          table: 'lottery_hourly_metrics',
          oldColumn: 'lottery_hourly_metric_id',
          newColumn: 'metric_id'
        },
        {
          table: 'lottery_daily_metrics',
          oldColumn: 'lottery_daily_metric_id',
          newColumn: 'daily_metric_id'
        },
        {
          table: 'lottery_user_experience_state',
          oldColumn: 'lottery_user_experience_state_id',
          newColumn: 'state_id'
        },
        {
          table: 'lottery_user_global_state',
          oldColumn: 'lottery_user_global_state_id',
          newColumn: 'global_state_id'
        },
        {
          table: 'lottery_user_daily_draw_quota',
          oldColumn: 'lottery_user_daily_draw_quota_id',
          newColumn: 'quota_id'
        },
        {
          table: 'lottery_campaign_user_quota',
          oldColumn: 'lottery_campaign_user_quota_id',
          newColumn: 'quota_id'
        },
        {
          table: 'lottery_campaign_quota_grants',
          oldColumn: 'lottery_campaign_quota_grant_id',
          newColumn: 'grant_id'
        },
        {
          table: 'account_asset_balances',
          oldColumn: 'account_asset_balance_id',
          newColumn: 'balance_id'
        },
        {
          table: 'asset_transactions',
          oldColumn: 'asset_transaction_id',
          newColumn: 'transaction_id'
        },
        {
          table: 'authentication_sessions',
          oldColumn: 'authentication_session_id',
          newColumn: 'user_session_id'
        },
        { table: 'chat_messages', oldColumn: 'chat_message_id', newColumn: 'message_id' },
        { table: 'item_instance_events', oldColumn: 'item_instance_event_id', newColumn: 'event_id' },
        { table: 'lottery_alerts', oldColumn: 'lottery_alert_id', newColumn: 'alert_id' },
        {
          table: 'lottery_draw_decisions',
          oldColumn: 'lottery_draw_decision_id',
          newColumn: 'decision_id'
        },
        { table: 'popup_banners', oldColumn: 'popup_banner_id', newColumn: 'banner_id' },
        { table: 'preset_budget_debt', oldColumn: 'preset_budget_debt_id', newColumn: 'debt_id' },
        {
          table: 'preset_inventory_debt',
          oldColumn: 'preset_inventory_debt_id',
          newColumn: 'debt_id'
        },
        { table: 'preset_debt_limits', oldColumn: 'preset_debt_limit_id', newColumn: 'limit_id' },
        { table: 'redemption_orders', oldColumn: 'redemption_order_id', newColumn: 'order_id' },
        { table: 'risk_alerts', oldColumn: 'risk_alert_id', newColumn: 'alert_id' },
        {
          table: 'system_announcements',
          oldColumn: 'system_announcement_id',
          newColumn: 'announcement_id'
        },
        {
          table: 'system_dictionary_history',
          oldColumn: 'system_dictionary_history_id',
          newColumn: 'history_id'
        },
        { table: 'trade_orders', oldColumn: 'trade_order_id', newColumn: 'order_id' },
        { table: 'user_hierarchy', oldColumn: 'user_hierarchy_id', newColumn: 'hierarchy_id' },
        { table: 'user_premium_status', oldColumn: 'user_premium_status_id', newColumn: 'id' },
        {
          table: 'user_risk_profiles',
          oldColumn: 'user_risk_profile_id',
          newColumn: 'risk_profile_id'
        },
        {
          table: 'api_idempotency_requests',
          oldColumn: 'api_idempotency_request_id',
          newColumn: 'request_id'
        }
      ]

      for (const pk of primaryKeysRevert) {
        try {
          const [columns] = await queryInterface.sequelize.query(
            `SHOW COLUMNS FROM \`${pk.table}\` WHERE Field = '${pk.oldColumn}'`,
            { transaction }
          )

          if (columns.length === 0) continue

          const columnDef = columns[0]
          const isAutoIncrement = columnDef.Extra && columnDef.Extra.includes('auto_increment')
          const columnType = columnDef.Type

          let newColumnDef = `${columnType} NOT NULL`
          if (isAutoIncrement) {
            newColumnDef += ' AUTO_INCREMENT'
          }

          await queryInterface.sequelize.query(
            `ALTER TABLE \`${pk.table}\` CHANGE \`${pk.oldColumn}\` \`${pk.newColumn}\` ${newColumnDef}`,
            { transaction }
          )
          console.log(`   ✅ ${pk.table}: ${pk.oldColumn} → ${pk.newColumn}`)
        } catch (err) {
          console.log(`   ⚠️ 跳过: ${err.message}`)
        }
      }

      // 重建原始外键约束
      const foreignKeysToRecreate = [
        {
          table: 'merchant_operation_logs',
          constraint: 'merchant_operation_logs_ibfk_4',
          column: 'related_record_id',
          refTable: 'consumption_records',
          refColumn: 'record_id',
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        },
        {
          table: 'system_dictionary_history',
          constraint: 'fk_dict_history_dict_id',
          column: 'dict_id',
          refTable: 'system_dictionaries',
          refColumn: 'dict_id',
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        }
      ]

      for (const fk of foreignKeysToRecreate) {
        try {
          await queryInterface.sequelize.query(
            `ALTER TABLE \`${fk.table}\` 
             ADD CONSTRAINT \`${fk.constraint}\` 
             FOREIGN KEY (\`${fk.column}\`) 
             REFERENCES \`${fk.refTable}\`(\`${fk.refColumn}\`)
             ON DELETE ${fk.onDelete} ON UPDATE ${fk.onUpdate}`,
            { transaction }
          )
          console.log(`   ✅ 重建外键: ${fk.constraint}`)
        } catch (err) {
          console.log(`   ⚠️ 跳过: ${err.message}`)
        }
      }

      // 恢复外键检查
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction })

      await transaction.commit()
      console.log('✅ 回滚完成！')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
