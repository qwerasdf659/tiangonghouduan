/**
 * 系统配置 - 兑换页面配置API测试
 *
 * 测试目标：验证 GET /api/v4/system/config/exchange-page 公开接口
 * 1. 响应格式符合 ApiResponse 标准（success/code/message/data/timestamp/version/request_id）
 * 2. data 对象包含 tabs/spaces/shop_filters/market_filters/card_display/ui 六大模块
 * 3. data 对象包含 version 字段（基于 updated_at 时间戳，供前端缓存模块使用）
 * 4. 各模块数据结构正确
 *
 * 业务场景：
 * - 小程序兑换页面启动时调用此API获取 Tab/空间/筛选/卡片主题/运营参数配置
 * - 替代前端硬编码，运营无需前端发版即可调整兑换页面呈现
 * - 前端使用 4 层降级缓存策略，本接口不可用时降级到本地缓存 → 默认值
 *
 * 创建时间：2026-02-19 北京时间
 */

'use strict'

const request = require('supertest')
const app = require('../../../app')

describe('GET /api/v4/system/config/exchange-page - 获取兑换页面配置', () => {
  /**
   * 测试1：公开接口可正常访问（无需认证）
   * 验证：HTTP 200 + ApiResponse 标准格式
   */
  test('公开接口可正常访问，返回标准 ApiResponse 格式', async () => {
    const response = await request(app).get('/api/v4/system/config/exchange-page')

    expect(response.status).toBe(200)

    const body = response.body

    expect(body).toHaveProperty('success', true)
    expect(body).toHaveProperty('code')
    expect(body).toHaveProperty('message')
    expect(body).toHaveProperty('data')
    expect(body).toHaveProperty('timestamp')
    expect(body).toHaveProperty('version')
    expect(body).toHaveProperty('request_id')

    expect(typeof body.success).toBe('boolean')
    expect(typeof body.code).toBe('string')
    expect(typeof body.message).toBe('string')
    expect(typeof body.timestamp).toBe('string')
    expect(typeof body.version).toBe('string')
    expect(typeof body.request_id).toBe('string')
    expect(body.data).not.toBeNull()
  }, 15000)

  /**
   * 测试2：data 包含 tabs 数组（Tab 配置）
   * 验证：tabs 存在、为数组、每项包含 key/label/enabled/sort_order
   */
  test('data 包含有效的 tabs 配置', async () => {
    const response = await request(app).get('/api/v4/system/config/exchange-page')

    expect(response.status).toBe(200)

    const { data } = response.body
    expect(data).toHaveProperty('tabs')
    expect(Array.isArray(data.tabs)).toBe(true)
    expect(data.tabs.length).toBeGreaterThanOrEqual(1)

    for (const tab of data.tabs) {
      expect(tab).toHaveProperty('key')
      expect(tab).toHaveProperty('label')
      expect(tab).toHaveProperty('enabled')
      expect(tab).toHaveProperty('sort_order')
      expect(typeof tab.key).toBe('string')
      expect(typeof tab.label).toBe('string')
      expect(typeof tab.enabled).toBe('boolean')
      expect(typeof tab.sort_order).toBe('number')
    }
  }, 15000)

  /**
   * 测试3：data 包含 spaces 数组（空间配置）
   * 验证：spaces 存在、为数组、每项包含 id/name/enabled/sort_order
   */
  test('data 包含有效的 spaces 配置', async () => {
    const response = await request(app).get('/api/v4/system/config/exchange-page')

    expect(response.status).toBe(200)

    const { data } = response.body
    expect(data).toHaveProperty('spaces')
    expect(Array.isArray(data.spaces)).toBe(true)

    for (const space of data.spaces) {
      expect(space).toHaveProperty('id')
      expect(space).toHaveProperty('name')
      expect(space).toHaveProperty('enabled')
      expect(space).toHaveProperty('sort_order')
      expect(typeof space.id).toBe('string')
      expect(typeof space.name).toBe('string')
      expect(typeof space.enabled).toBe('boolean')
      expect(typeof space.sort_order).toBe('number')
    }
  }, 15000)

  /**
   * 测试4：data 包含 shop_filters 对象（商品兑换筛选项）
   * 验证：shop_filters 包含 categories/cost_ranges/sort_options 子数组
   */
  test('data 包含有效的 shop_filters 配置', async () => {
    const response = await request(app).get('/api/v4/system/config/exchange-page')

    expect(response.status).toBe(200)

    const { data } = response.body
    expect(data).toHaveProperty('shop_filters')
    expect(typeof data.shop_filters).toBe('object')

    const sf = data.shop_filters
    expect(Array.isArray(sf.categories)).toBe(true)
    expect(Array.isArray(sf.cost_ranges)).toBe(true)
    expect(Array.isArray(sf.sort_options)).toBe(true)

    sf.categories.forEach(item => {
      expect(item).toHaveProperty('label')
      expect(typeof item.label).toBe('string')
    })

    sf.cost_ranges.forEach(item => {
      expect(item).toHaveProperty('label')
      expect(typeof item.label).toBe('string')
    })

    sf.sort_options.forEach(item => {
      expect(item).toHaveProperty('value')
      expect(item).toHaveProperty('label')
    })
  }, 15000)

  /**
   * 测试5：data 包含 card_display 对象（卡片主题配置）
   * 验证：card_display.theme 为 A~E 之一
   */
  test('data 包含有效的 card_display 配置', async () => {
    const response = await request(app).get('/api/v4/system/config/exchange-page')

    expect(response.status).toBe(200)

    const { data } = response.body
    expect(data).toHaveProperty('card_display')
    expect(typeof data.card_display).toBe('object')

    const cd = data.card_display
    expect(['A', 'B', 'C', 'D', 'E']).toContain(cd.theme)
    expect(cd).toHaveProperty('effects')
    expect(typeof cd.effects).toBe('object')
  }, 15000)

  /**
   * 测试6：data 包含 ui 运营参数配置
   * 验证：ui 包含 low_stock_threshold/grid_page_size 等数值参数
   */
  test('data 包含有效的 ui 运营参数', async () => {
    const response = await request(app).get('/api/v4/system/config/exchange-page')

    expect(response.status).toBe(200)

    const { data } = response.body
    expect(data).toHaveProperty('ui')
    expect(typeof data.ui).toBe('object')

    const ui = data.ui
    expect(typeof ui.low_stock_threshold).toBe('number')
    expect(typeof ui.grid_page_size).toBe('number')
    expect(ui.low_stock_threshold).toBeGreaterThanOrEqual(0)
    expect(ui.grid_page_size).toBeGreaterThanOrEqual(1)
  }, 15000)

  /**
   * 测试7：data 包含 version 字段（前端缓存模块核心依赖）
   * 验证：version 存在、为字符串、是有效的时间戳数字字符串
   */
  test('data 包含 version 字段（前端缓存版本标识）', async () => {
    const response = await request(app).get('/api/v4/system/config/exchange-page')

    expect(response.status).toBe(200)

    const { data } = response.body
    expect(data).toHaveProperty('version')
    expect(typeof data.version).toBe('string')

    const versionNumber = Number(data.version)
    expect(isNaN(versionNumber)).toBe(false)
    expect(versionNumber).toBeGreaterThan(0)
  }, 15000)

  /**
   * 测试8：配置未变更时 version 保持一致
   * 验证：短时间内多次请求，version 保持不变
   */
  test('配置未变更时 version 保持一致', async () => {
    const response1 = await request(app).get('/api/v4/system/config/exchange-page')
    const response2 = await request(app).get('/api/v4/system/config/exchange-page')

    expect(response1.status).toBe(200)
    expect(response2.status).toBe(200)

    expect(response1.body.data.version).toBe(response2.body.data.version)
  }, 15000)
})
