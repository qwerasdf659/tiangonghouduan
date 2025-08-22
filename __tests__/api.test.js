/**
 * API功能测试
 * 测试后端服务的基本功能 - V3架构适配
 * 更新时间：2025年01月21日
 */

const request = require('supertest')
const app = require('../app')

describe('API功能测试', () => {
  // 健康检查测试
  describe('GET /health', () => {
    it('应该返回健康状态', async () => {
      const response = await request(app).get('/health').expect(200)

      expect(response.body).toHaveProperty('code', 0)
      expect(response.body).toHaveProperty('msg', 'V3 Separated Architecture is healthy') // 更新为实际返回值
      expect(response.body.data).toHaveProperty('status', 'healthy')
      expect(response.body.data).toHaveProperty('version', '3.0.0') // 更新版本号
      // 数据库状态现在在systems对象中
      expect(response.body.data.systems).toHaveProperty('database')
      expect(response.body.data.systems.database).toMatch(/^(connected|disconnected|checking)$/)
    })
  })

  // V3 API信息测试
  describe('GET /api/v3', () => {
    it('应该返回V3 API版本信息', async () => {
      const response = await request(app).get('/api/v3').expect(200)

      expect(response.body).toHaveProperty('code', 0)
      expect(response.body.data).toHaveProperty('version', '3.0.0')
      expect(response.body.data).toHaveProperty('architecture', 'separated-microservices')
      expect(response.body.data).toHaveProperty('systems')
      expect(response.body.data.systems).toHaveProperty('points')
      expect(response.body.data.systems).toHaveProperty('lottery')
    })
  })

  // V3 API文档测试
  describe('GET /api/v3/docs', () => {
    it('应该返回V3 API文档', async () => {
      const response = await request(app).get('/api/v3/docs').expect(200)

      expect(response.body).toHaveProperty('code', 0)
      expect(response.body.data).toHaveProperty('title')
      expect(response.body.data).toHaveProperty('version', '3.0.0')
      expect(response.body.data).toHaveProperty('architecture', 'separated-microservices')
      expect(response.body.data).toHaveProperty('points_system')
      expect(response.body.data).toHaveProperty('lottery_system')
    })
  })

  // V3 认证测试（需要手机号和验证码）
  describe('POST /api/v3/auth/login', () => {
    it('应该使用正确的手机号和验证码登录成功', async () => {
      const loginData = {
        mobile: '13800138000',
        verification_code: '123456' // 测试环境万能验证码
      }

      const response = await request(app).post('/api/v3/auth/login').send(loginData).expect(200)

      expect(response.body).toHaveProperty('success', true)
      expect(response.body).toHaveProperty('data')
      expect(response.body.data).toHaveProperty('token')
      expect(response.body.data).toHaveProperty('user')
    })

    it('应该在缺少参数时返回错误', async () => {
      const response = await request(app).post('/api/v3/auth/login').send({}).expect(400)

      expect(response.body).toHaveProperty('success', false)
      expect(response.body).toHaveProperty('error')
    })

    it('应该在手机号格式错误时返回错误', async () => {
      const loginData = {
        phone: '123', // 错误格式
        verification_code: '123456'
      }

      const response = await request(app).post('/api/v3/auth/login').send(loginData).expect(400)

      expect(response.body).toHaveProperty('success', false)
      expect(response.body).toHaveProperty('error')
    })

    it('应该在验证码错误时返回错误', async () => {
      const loginData = {
        phone: '13800138000',
        verification_code: '000000' // 错误验证码
      }

      const response = await request(app).post('/api/v3/auth/login').send(loginData).expect(400)

      expect(response.body).toHaveProperty('success', false)
      expect(response.body).toHaveProperty('error')
    })
  })

  // 访问不存在的端点
  describe('访问不存在的端点', () => {
    it('应该返回404错误', async () => {
      const response = await request(app).get('/api/v3/nonexistent').expect(404)

      expect(response.body).toHaveProperty('code')
      expect(response.body.code).not.toBe(0)
      expect(response.body).toHaveProperty('msg')
    })
  })
})
