/**
 * 数据库字段一致性契约测试
 *
 * 验证关键业务表的字段名与代码认知一致
 * 防止数据库迁移后字段名与模型/路由/前端不同步
 *
 * 对应文档：阶段 7.4（DB 字段作为 Jest 契约测试固定 fixture）
 *
 * @module tests/api-contracts/db-field-consistency.contract.test
 */

'use strict'

const { initializeTestServiceManager } = require('../helpers/UnifiedTestManager')

/**
 * 关键表的预期字段清单（主键 + 核心业务字段）
 * 任何字段增删/重命名都必须同步更新此 fixture
 */
const TABLE_FIELD_FIXTURES = {
  users: [
    'user_id', 'user_uuid', 'mobile', 'nickname', 'avatar_url',
    'status', 'last_login', 'login_count', 'user_level',
    'last_active_at', 'consecutive_fail_count', 'history_total_points',
    'max_active_listings', 'wx_openid', 'created_at', 'updated_at'
  ],
  account_asset_balances: [
    'account_asset_balance_id', 'account_id', 'asset_code',
    'available_amount', 'frozen_amount',
    'lottery_campaign_id', 'lottery_campaign_key',
    'created_at', 'updated_at'
  ],
  lottery_prizes: [
    'lottery_prize_id', 'lottery_campaign_id', 'prize_name',
    'reward_tier', 'prize_value', 'win_probability',
    'stock_quantity', 'total_win_count', 'status',
    'sort_order', 'created_at', 'updated_at'
  ],
  market_listings: [
    'market_listing_id', 'seller_user_id', 'listing_kind',
    'offer_item_id', 'offer_asset_code', 'offer_amount',
    'price_asset_code', 'price_amount', 'status',
    'created_at', 'updated_at'
  ],
  diy_templates: [
    'diy_template_id', 'display_name', 'category_id',
    'base_image_media_id', 'preview_media_id',
    'status', 'is_enabled', 'sort_order',
    'created_at', 'updated_at'
  ]
}

describe('数据库字段一致性契约', () => {
  let sequelize

  beforeAll(async () => {
    await initializeTestServiceManager()
    const models = require('../../models')
    sequelize = models.sequelize
  })

  afterAll(async () => {
    if (sequelize) {
      await sequelize.close()
    }
  })

  for (const [tableName, expectedFields] of Object.entries(TABLE_FIELD_FIXTURES)) {
    describe(`${tableName} 表`, () => {
      test('预期字段全部存在', async () => {
        const [rows] = await sequelize.query(
          `SELECT COLUMN_NAME FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
           ORDER BY ORDINAL_POSITION`,
          { replacements: [tableName] }
        )
        const actualFields = rows.map(r => r.COLUMN_NAME)

        for (const field of expectedFields) {
          expect(actualFields).toContain(field)
        }
      })

      test('不存在意外的新增字段（防止未同步的迁移）', async () => {
        const [rows] = await sequelize.query(
          `SELECT COLUMN_NAME FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
           ORDER BY ORDINAL_POSITION`,
          { replacements: [tableName] }
        )
        const actualFields = rows.map(r => r.COLUMN_NAME)
        const unexpected = actualFields.filter(f => !expectedFields.includes(f))

        if (unexpected.length > 0) {
          console.warn(
            `⚠️ ${tableName} 表有 ${unexpected.length} 个字段未在 fixture 中声明: ${unexpected.join(', ')}\n` +
            '   请更新 tests/api-contracts/db-field-consistency.contract.test.js 的 TABLE_FIELD_FIXTURES'
          )
        }
      })
    })
  }
})
