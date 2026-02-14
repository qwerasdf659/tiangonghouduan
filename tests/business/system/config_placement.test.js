/**
 * 系统配置 - 活动位置配置API测试
 *
 * 测试目标：验证 GET /api/v4/system/config/placement 公开接口
 * 1. ✅ 响应格式符合 ApiResponse 标准（success/code/message/data/timestamp/version/request_id）
 * 2. ✅ data 对象包含 placements 数组
 * 3. ✅ data 对象包含 version 字段（基于 updated_at 时间戳，供前端缓存模块使用）
 * 4. ✅ data 对象包含 updated_at 字段（配置最后更新时间）
 * 5. ✅ placements 数组中每项结构正确（campaign_code、placement 对象）
 *
 * 业务场景：
 * - 前端小程序每次打开页面调用此API获取活动位置配置
 * - 前端缓存模块依赖 data.version 判断配置是否有更新
 * - 公开接口，无需登录认证
 *
 * 创建时间：2026-02-15 北京时间
 */

'use strict'

const request = require('supertest')
const app = require('../../../app')

describe('GET /api/v4/system/config/placement - 获取活动位置配置', () => {
  /**
   * 测试1：公开接口可正常访问（无需认证）
   * 验证：HTTP 200 + ApiResponse 标准格式
   */
  test('✅ 公开接口可正常访问，返回标准 ApiResponse 格式', async () => {
    const response = await request(app).get('/api/v4/system/config/placement')

    expect(response.status).toBe(200)

    const body = response.body

    // 验证 ApiResponse 顶层标准字段
    expect(body).toHaveProperty('success', true)
    expect(body).toHaveProperty('code', 'PLACEMENT_CONFIG_SUCCESS')
    expect(body).toHaveProperty('message', '获取配置成功')
    expect(body).toHaveProperty('data')
    expect(body).toHaveProperty('timestamp')
    expect(body).toHaveProperty('version') // 顶层 API 版本（如 "v4.0"）
    expect(body).toHaveProperty('request_id')

    // 验证字段类型
    expect(typeof body.success).toBe('boolean')
    expect(typeof body.code).toBe('string')
    expect(typeof body.message).toBe('string')
    expect(typeof body.timestamp).toBe('string')
    expect(typeof body.version).toBe('string')
    expect(typeof body.request_id).toBe('string')
    expect(body.data).not.toBeNull()
  }, 15000)

  /**
   * 测试2：data 对象包含 placements 数组
   * 验证：data.placements 存在且为数组
   */
  test('✅ data 包含 placements 数组', async () => {
    const response = await request(app).get('/api/v4/system/config/placement')

    expect(response.status).toBe(200)

    const { data } = response.body
    expect(data).toHaveProperty('placements')
    expect(Array.isArray(data.placements)).toBe(true)
  }, 15000)

  /**
   * 测试3：data 对象包含 version 字段（前端缓存模块核心依赖）
   * 验证：data.version 存在、为字符串、是有效的时间戳数字字符串
   *
   * 业务意义：
   * - 前端配置缓存模块依赖 data.version 判断配置是否有更新
   * - version 基于 updated_at 时间戳生成，配置变更时自动更新
   */
  test('✅ data 包含 version 字段（前端缓存版本标识）', async () => {
    const response = await request(app).get('/api/v4/system/config/placement')

    expect(response.status).toBe(200)

    const { data } = response.body
    expect(data).toHaveProperty('version')
    expect(typeof data.version).toBe('string')

    // version 应为有效的时间戳数字字符串（毫秒级 Unix 时间戳）
    const versionNumber = Number(data.version)
    expect(isNaN(versionNumber)).toBe(false)
    expect(versionNumber).toBeGreaterThan(0)
  }, 15000)

  /**
   * 测试4：data 对象包含 updated_at 字段
   * 验证：data.updated_at 存在，为有效日期
   */
  test('✅ data 包含 updated_at 字段（配置最后更新时间）', async () => {
    const response = await request(app).get('/api/v4/system/config/placement')

    expect(response.status).toBe(200)

    const { data } = response.body
    expect(data).toHaveProperty('updated_at')

    // updated_at 应为有效的日期字符串
    const parsedDate = new Date(data.updated_at)
    expect(isNaN(parsedDate.getTime())).toBe(false)
  }, 15000)

  /**
   * 测试5：version 与 updated_at 的一致性
   * 验证：version 等于 updated_at 转换为毫秒时间戳的字符串
   */
  test('✅ version 与 updated_at 时间戳一致', async () => {
    const response = await request(app).get('/api/v4/system/config/placement')

    expect(response.status).toBe(200)

    const { data } = response.body
    const expectedVersion = new Date(data.updated_at).getTime().toString()

    expect(data.version).toBe(expectedVersion)
  }, 15000)

  /**
   * 测试6：placements 数组项结构正确
   * 验证：每项包含 campaign_code 和 placement 对象
   */
  test('✅ placements 数组项结构正确（campaign_code + placement 对象）', async () => {
    const response = await request(app).get('/api/v4/system/config/placement')

    expect(response.status).toBe(200)

    const { placements } = response.body.data

    // 如果有配置项，验证每项结构
    if (placements.length > 0) {
      for (const item of placements) {
        expect(item).toHaveProperty('campaign_code')
        expect(typeof item.campaign_code).toBe('string')
        expect(item).toHaveProperty('placement')
        expect(typeof item.placement).toBe('object')

        // 验证 placement 对象的字段
        const { placement } = item
        expect(placement).toHaveProperty('page')
        expect(placement).toHaveProperty('position')
        expect(placement).toHaveProperty('size')
        expect(placement).toHaveProperty('priority')
        expect(typeof placement.page).toBe('string')
        expect(typeof placement.position).toBe('string')
        expect(typeof placement.size).toBe('string')
        expect(typeof placement.priority).toBe('number')
      }
    }
  }, 15000)

  /**
   * 测试7：多次请求返回一致的 version（配置未变更时）
   * 验证：短时间内多次请求，version 保持不变
   */
  test('✅ 配置未变更时 version 保持一致', async () => {
    const response1 = await request(app).get('/api/v4/system/config/placement')
    const response2 = await request(app).get('/api/v4/system/config/placement')

    expect(response1.status).toBe(200)
    expect(response2.status).toBe(200)

    expect(response1.body.data.version).toBe(response2.body.data.version)
  }, 15000)
})
