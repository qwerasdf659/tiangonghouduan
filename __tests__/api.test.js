/**
 * API功能测试
 * 测试后端服务的基本功能
 * 创建时间：2025年08月04日
 */

const request = require('supertest')
const { app } = require('../app')

describe('API功能测试', () => {
  // 健康检查测试
  describe('GET /health', () => {
    it('应该返回健康状态', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200)

      expect(response.body).toHaveProperty('code', 0)
      expect(response.body).toHaveProperty('msg', 'Service is healthy')
      expect(response.body.data).toHaveProperty('status', 'healthy')
      expect(response.body.data).toHaveProperty('version', '2.0.0')
      expect(response.body.data).toHaveProperty('database', 'connected')
    })
  })

  // V2 API健康检查测试
  describe('GET /api/v2/health', () => {
    it('应该返回V2健康状态（符合前端期望格式）', async () => {
      const response = await request(app)
        .get('/api/v2/health')
        .expect(200)

      expect(response.body).toHaveProperty('code', 0)
      expect(response.body).toHaveProperty('msg', '服务器运行正常')
      expect(response.body.data).toHaveProperty('status', 'healthy')
      expect(response.body.data).toHaveProperty('serverInfo')
      expect(response.body.data.serverInfo).toHaveProperty('version', '2.0.0')
      expect(response.body.data.serverInfo).toHaveProperty('uptime')
      expect(response.body.data.serverInfo).toHaveProperty('serviceStatus')
      expect(response.body.data.serverInfo.serviceStatus).toHaveProperty('database', 'connected')
      expect(response.body.data.serverInfo.serviceStatus).toHaveProperty('storage', 'available')
      expect(response.body.data.serverInfo.serviceStatus).toHaveProperty('api', 'operational')
      expect(response.body.data).toHaveProperty('performance')
      expect(response.body.data.performance).toHaveProperty('responseTimeMs')
      expect(response.body.data.performance).toHaveProperty('memoryUsage')
      expect(response.body.data.performance).toHaveProperty('cpuUsage')
    })
  })

  // API版本信息测试
  describe('GET /api/v2', () => {
    it('应该返回API版本信息', async () => {
      const response = await request(app)
        .get('/api/v2')
        .expect(200)

      expect(response.body).toHaveProperty('code', 0)
      expect(response.body.data).toHaveProperty('version', '2.0.0')
      expect(response.body.data).toHaveProperty('title')
    })
  })

  // 登录功能测试
  describe('POST /api/v2/auth/login', () => {
    it('应该使用正确的手机号和验证码登录成功', async () => {
      const loginData = {
        mobile: '13800138000',
        verification_code: '123456'
      }

      const response = await request(app)
        .post('/api/v2/auth/login')
        .send(loginData)
        .expect(200)

      expect(response.body).toHaveProperty('code', 0)
      expect(response.body).toHaveProperty('msg', '登录成功')
      expect(response.body.data).toHaveProperty('token')
      expect(response.body.data).toHaveProperty('userInfo')
      expect(response.body.data.userInfo).toHaveProperty('mobile', '13800138000')
    })

    it('应该在缺少参数时返回错误', async () => {
      const response = await request(app)
        .post('/api/v2/auth/login')
        .send({})
        .expect(200)

      expect(response.body).toHaveProperty('code', 2002)
      expect(response.body).toHaveProperty('msg', '手机号和验证码不能为空')
    })

    it('应该在手机号格式错误时返回错误', async () => {
      const loginData = {
        mobile: '12345',
        verification_code: '123456'
      }

      const response = await request(app)
        .post('/api/v2/auth/login')
        .send(loginData)
        .expect(200)

      expect(response.body).toHaveProperty('code', 2001)
      expect(response.body).toHaveProperty('msg', '手机号格式不正确')
    })

    it('应该在验证码错误时返回错误', async () => {
      const loginData = {
        mobile: '13800138000',
        verification_code: '000000'
      }

      const response = await request(app)
        .post('/api/v2/auth/login')
        .send(loginData)
        .expect(200)

      expect(response.body).toHaveProperty('code', 1002)
      expect(response.body).toHaveProperty('msg')
      expect(response.body.msg).toContain('验证码错误')
    })
  })

  // 404错误测试
  describe('访问不存在的端点', () => {
    it('应该返回404错误', async () => {
      const response = await request(app)
        .get('/api/v2/nonexistent')
        .expect(404)

      expect(response.body).toHaveProperty('code', 4004)
      expect(response.body).toHaveProperty('msg')
      expect(response.body.msg).toContain('接口不存在')
    })
  })
})
