/**
 * 管理员模块信息API单元测试
 * 用途：防止模块信息与实际路由不一致
 * 创建时间：2025年11月08日
 */

const request = require('supertest')
const app = require('../../../app')

describe('GET /api/v4/console/ - 管理员模块信息API', () => {
  /**
   * 测试1：基础功能测试
   * 验证API是否正常返回数据
   */
  test('应该返回200状态码和成功响应', async () => {
    const response = await request(app).get('/api/v4/console/')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.code).toBe('SUCCESS')
    expect(response.body.message).toBe('Admin API模块信息')
  })

  /**
   * 测试2：数据结构验证
   * 验证返回的数据结构是否符合预期
   */
  test('应该返回正确的数据结构', async () => {
    const response = await request(app).get('/api/v4/console/')
    const { data } = response.body

    // 验证必需字段
    expect(data).toHaveProperty('name')
    expect(data).toHaveProperty('description')
    expect(data).toHaveProperty('version')
    expect(data).toHaveProperty('modules')
    expect(data).toHaveProperty('documentation')
    expect(data).toHaveProperty('timestamp')

    // 验证字段值类型
    expect(typeof data.name).toBe('string')
    expect(typeof data.version).toBe('string')
    expect(typeof data.modules).toBe('object')
  })

  /**
   * 测试3：模块数量验证
   * 验证返回的模块数量（当前应为18个实际挂载的模块）
   * 2026-01-08：新增 assets 和 images 模块
   */
  test('应该返回21个已实现的模块', async () => {
    const response = await request(app).get('/api/v4/console/')
    const { modules } = response.body.data

    const moduleCount = Object.keys(modules).length
    expect(moduleCount).toBe(21) // 实际挂载的路由数量（2026-01-09：新增1个模块）

    // 验证必需的模块是否存在（原有8个）
    expect(modules).toHaveProperty('auth')
    expect(modules).toHaveProperty('system')
    expect(modules).toHaveProperty('config')
    expect(modules).toHaveProperty('prize_pool')
    expect(modules).toHaveProperty('user_management')
    expect(modules).toHaveProperty('lottery_management')
    expect(modules).toHaveProperty('analytics')

    // 验证新增的模块（V4.5.0+）
    expect(modules).toHaveProperty('settings')
    expect(modules).toHaveProperty('customer_service')
    expect(modules).toHaveProperty('marketplace')
    expect(modules).toHaveProperty('material')
    expect(modules).toHaveProperty('diamond')
    expect(modules).toHaveProperty('popup_banners')
    expect(modules).toHaveProperty('lottery_quota')

    // 验证新增的模块（2026-01-08）
    expect(modules).toHaveProperty('assets')
    expect(modules).toHaveProperty('images')
  })

  /**
   * 测试4：模块信息格式验证
   * 验证每个模块的信息格式是否正确
   */
  test('每个模块应该包含description和endpoints字段', async () => {
    const response = await request(app).get('/api/v4/console/')
    const { modules } = response.body.data

    Object.entries(modules).forEach(([_moduleName, moduleInfo]) => {
      expect(moduleInfo).toHaveProperty('description')
      expect(moduleInfo).toHaveProperty('endpoints')
      expect(typeof moduleInfo.description).toBe('string')
      expect(Array.isArray(moduleInfo.endpoints)).toBe(true)
      expect(moduleInfo.endpoints.length).toBeGreaterThan(0)
    })
  })

  /**
   * 测试5：模块路由一致性验证（关键测试）
   * 验证每个列出的模块端点都有对应的实际路由
   * 这个测试会自动捕获未来的不一致问题
   */
  test('列出的所有模块端点都应该有对应的路由', async () => {
    const response = await request(app).get('/api/v4/console/')
    const { modules } = response.body.data

    // 遍历所有模块的端点
    for (const [moduleName, moduleInfo] of Object.entries(modules)) {
      for (const endpoint of moduleInfo.endpoints) {
        // 构建完整路径
        const fullPath = `/api/v4/console${endpoint}`

        /*
         * 使用OPTIONS请求测试路由是否存在
         * OPTIONS方法通常用于CORS预检，不执行业务逻辑，适合用来测试路由存在性
         */
        const res = await request(app).options(fullPath)

        // 如果路由存在，状态码不应该是404
        expect(res.status).not.toBe(404)

        /*
         * 如果测试失败，提供详细的错误信息
         */
        if (res.status === 404) {
          console.error(`❌ 模块 ${moduleName} 的端点 ${endpoint} 不存在（404错误）`)
          console.error(`   完整路径: ${fullPath}`)
          console.error('   请检查路由是否已正确挂载')
        }
      }
    }
  }, 30000) // 设置30秒超时（因为需要测试多个端点）

  /**
   * 测试6：版本号格式验证
   * 验证版本号是否符合语义化版本规范
   */
  test('版本号应该符合语义化版本格式', async () => {
    const response = await request(app).get('/api/v4/console/')
    const { version } = response.body.data

    // 验证版本号格式：x.y.z
    const semverRegex = /^\d+\.\d+\.\d+$/
    expect(version).toMatch(semverRegex)
  })

  /**
   * 测试7：时间戳格式验证
   * 验证时间戳是否为有效的北京时间ISO 8601格式
   */
  test('时间戳应该是有效的北京时间ISO格式', async () => {
    const response = await request(app).get('/api/v4/console/')
    const { timestamp } = response.body.data

    /*
     * 验证时间戳格式：ISO 8601格式带北京时区（BeijingTimeHelper.apiTimestamp格式）
     * 例如：2025-11-09T01:56:10.720+08:00
     */
    const timestampRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+08:00$/
    expect(timestamp).toMatch(timestampRegex)

    // 验证时间戳是否为有效日期
    const date = new Date(timestamp)
    expect(date.toString()).not.toBe('Invalid Date')

    // 验证时区确实是+08:00（北京时间）
    expect(timestamp).toContain('+08:00')
  })

  /**
   * 测试8：响应时间性能测试
   * 验证API响应时间是否在可接受范围内（<100ms）
   */
  test('API响应时间应该小于100ms', async () => {
    const startTime = Date.now()

    await request(app).get('/api/v4/console/')

    const endTime = Date.now()
    const responseTime = endTime - startTime

    expect(responseTime).toBeLessThan(100) // 静态JSON返回应该非常快
  })

  /**
   * 测试9：无需认证访问测试
   * 验证此接口可以无需JWT token访问（公开接口）
   */
  test('应该可以无需JWT token访问（公开接口）', async () => {
    // 不传递Authorization头
    const response = await request(app).get('/api/v4/console/')

    expect(response.status).toBe(200) // 应该成功返回，不需要认证
  })

  /**
   * 测试10：CORS支持测试
   * 验证API是否支持跨域访问
   */
  test('应该支持跨域访问（CORS）', async () => {
    const response = await request(app)
      .options('/api/v4/console/')
      .set('Origin', 'http://localhost:8080') // 模拟前端域名

    // 验证CORS相关头是否存在
    expect(response.headers['access-control-allow-origin']).toBeDefined()
  })
})
