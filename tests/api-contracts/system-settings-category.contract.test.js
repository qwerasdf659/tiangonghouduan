/**
 * system_settings category 一致性合约测试
 *
 * 验证数据库中 system_settings 的 category 分布与代码认知一致
 * 防止注释/白名单与真实配置分类漂移
 *
 * 对应文档决策：7.14（一次性覆盖全部 15 个 category + 加单测防漂移）
 *
 * @module tests/api-contracts/system-settings-category.contract.test
 */

'use strict'

const { initializeTestServiceManager } = require('../helpers/UnifiedTestManager')

/**
 * 2026-04-22 真实数据库快照：15 个 category
 * 任何新增/删除/重命名 category 都必须同步更新此列表
 */
const EXPECTED_CATEGORIES = [
  'marketplace',
  'points',
  'basic',
  'ad_pricing',
  'batch_operation',
  'redemption',
  'security',
  'exchange',
  'feature',
  'general',
  'notification',
  'backpack',
  'ad_system',
  'auction',
  'customer_service'
].sort()

describe('system_settings category 一致性合约', () => {
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

  test('数据库中的 category 集合与预期一致', async () => {
    const [rows] = await sequelize.query(
      'SELECT DISTINCT category FROM system_settings ORDER BY category'
    )
    const actualCategories = rows.map(r => r.category).sort()
    expect(actualCategories).toEqual(EXPECTED_CATEGORIES)
  })

  test('每个 category 至少有 1 条配置', async () => {
    const [rows] = await sequelize.query(
      'SELECT category, COUNT(*) as cnt FROM system_settings GROUP BY category'
    )
    rows.forEach(row => {
      expect(Number(row.cnt)).toBeGreaterThan(0)
    })
  })

  test('不存在 NULL category', async () => {
    const [rows] = await sequelize.query(
      'SELECT COUNT(*) as cnt FROM system_settings WHERE category IS NULL'
    )
    expect(Number(rows[0].cnt)).toBe(0)
  })

  test('不存在空字符串 category', async () => {
    const [rows] = await sequelize.query(
      "SELECT COUNT(*) as cnt FROM system_settings WHERE category = ''"
    )
    expect(Number(rows[0].cnt)).toBe(0)
  })
})
