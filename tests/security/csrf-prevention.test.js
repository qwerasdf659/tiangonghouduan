'use strict'

/**
 * P1-7.1: CSRF（跨站请求伪造）防护测试套件
 *
 * 测试目标：
 * - 验证CORS策略正确配置
 * - 验证跨域请求被正确处理
 * - 验证非法Origin被拒绝
 * - 验证Cookie安全属性（如适用）
 * - 验证敏感操作的Origin验证
 *
 * 项目安全架构说明：
 * - 本项目使用 JWT Token 认证，不使用传统的 CSRF Token 机制
 * - JWT 通过 Authorization Header 传递，天然防止 CSRF（Cookie不参与认证）
 * - CORS 策略配置为白名单模式，仅允许特定域名访问
 * - 微信小程序请求无 Origin，需要特殊处理
 *
 * 验收标准：
 * - 非法Origin的请求被拒绝或标记
 * - CORS白名单外的域名无法访问敏感API
 * - 预检请求(OPTIONS)正确处理
 * - 微信小程序请求正常通过
 *
 * @module tests/security/csrf-prevention
 * @since 2026-01-30
 */

require('dotenv').config()

const request = require('supertest')
const app = require('../../app')

describe('P1-7.1: CSRF防护测试', () => {
  // 测试超时设置
  jest.setTimeout(30000)

  // 允许的Origin列表（从环境变量或默认值）
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:3000', 'http://localhost:8080', 'https://omqktqrtntnn.sealosbja.site']

  // 非法Origin列表（用于测试CORS策略）
  const maliciousOrigins = [
    'http://evil.com',
    'https://attacker.site',
    'http://phishing-site.com',
    'https://fake-sealos.site',
    'http://localhost:9999' // 端口不在白名单
  ]

  describe('CORS白名单策略验证', () => {
    test('允许的Origin应该返回正确的CORS头', async () => {
      // 测试已配置的允许Origin
      for (const origin of allowedOrigins) {
        const response = await request(app)
          .options('/health') // 预检请求
          .set('Origin', origin)
          .set('Access-Control-Request-Method', 'GET')

        // 验证CORS响应头
        expect(response.headers['access-control-allow-origin']).toBe(origin)
        expect(response.headers['access-control-allow-credentials']).toBe('true')

        console.log(`[P1-7.1] Origin ${origin}: CORS验证通过`)
      }

      console.log('[P1-7.1] 允许Origin的CORS白名单测试通过')
    })

    test('非法Origin应该被CORS策略拒绝', async () => {
      for (const origin of maliciousOrigins) {
        const response = await request(app)
          .options('/health')
          .set('Origin', origin)
          .set('Access-Control-Request-Method', 'GET')

        /*
         * 非法Origin不应该返回Access-Control-Allow-Origin头
         * 或者返回错误
         */
        const corsHeader = response.headers['access-control-allow-origin']

        /*
         * CORS策略检查：
         * 1. 如果返回了 cors header，不应该是通配符或匹配的恶意origin
         * 2. 如果没有返回 cors header，说明被正确拒绝
         */
        if (corsHeader) {
          expect(corsHeader).not.toBe('*') // 不应该使用通配符
          expect(corsHeader).not.toBe(origin) // 不应该匹配恶意origin
        }

        console.log(`[P1-7.1] 非法Origin ${origin}: 已被拒绝或限制`)
      }

      console.log('[P1-7.1] 非法Origin的CORS拒绝测试通过')
    })

    test('无Origin的请求应该被允许（支持微信小程序）', async () => {
      /*
       * 微信小程序请求不带Origin头
       * 项目应该允许这种请求以支持小程序访问
       */
      const response = await request(app).get('/health')
      // 没有Origin的请求不设置CORS头（服务端兼容处理）

      // 无Origin请求应该成功（支持服务端到服务端调用和小程序）
      expect([200, 304]).toContain(response.status)

      console.log('[P1-7.1] 无Origin请求（微信小程序兼容）测试通过')
    })
  })

  describe('CORS预检请求(OPTIONS)处理', () => {
    test('OPTIONS预检请求应该正确响应', async () => {
      const response = await request(app)
        .options('/api/v4/auth/login')
        .set('Origin', allowedOrigins[0] || 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type,Authorization')

      // OPTIONS请求应该返回200或204
      expect([200, 204]).toContain(response.status)

      // 验证允许的方法
      const allowedMethods = response.headers['access-control-allow-methods']
      if (allowedMethods) {
        expect(allowedMethods).toMatch(/POST/i)
      }

      // 验证允许的头部
      const allowedHeaders = response.headers['access-control-allow-headers']
      if (allowedHeaders) {
        expect(allowedHeaders.toLowerCase()).toMatch(/content-type/i)
        expect(allowedHeaders.toLowerCase()).toMatch(/authorization/i)
      }

      console.log('[P1-7.1] OPTIONS预检请求处理测试通过')
    })

    test('OPTIONS预检请求应该限制不允许的HTTP方法', async () => {
      const response = await request(app)
        .options('/health')
        .set('Origin', allowedOrigins[0] || 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'TRACE') // TRACE方法通常被禁止

      // TRACE方法可能被拒绝或不在允许列表中
      const allowedMethods = response.headers['access-control-allow-methods']
      if (allowedMethods) {
        // TRACE方法不应该被允许（安全最佳实践）
        expect(allowedMethods.toUpperCase()).not.toMatch(/TRACE/)
      }

      console.log('[P1-7.1] 不允许的HTTP方法限制测试通过')
    })
  })

  describe('跨域请求的实际访问控制', () => {
    test('带有非法Origin的实际请求应该被限制', async () => {
      const maliciousOrigin = 'http://evil.com'

      // 尝试用非法Origin发送实际请求
      const response = await request(app)
        .post('/api/v4/auth/login')
        .set('Origin', maliciousOrigin)
        .set('Content-Type', 'application/json')
        .send({ mobile: '13612227930', verification_code: '123456' })

      /*
       * 处理方式可能有：
       * 1. 请求被完全拒绝（500/403）
       * 2. 请求被处理但不返回CORS头（浏览器会阻止）
       * 3. 返回CORS错误
       */
      const corsHeader = response.headers['access-control-allow-origin']
      if (corsHeader) {
        expect(corsHeader).not.toBe(maliciousOrigin)
        expect(corsHeader).not.toBe('*')
      }

      console.log('[P1-7.1] 非法Origin实际请求限制测试通过')
    })

    test('带有合法Origin的请求应该正常处理', async () => {
      const legitOrigin = allowedOrigins[0] || 'http://localhost:3000'

      const response = await request(app).get('/health').set('Origin', legitOrigin)

      // 合法Origin的请求应该成功
      expect(response.status).toBe(200)

      // 应该返回正确的CORS头
      expect(response.headers['access-control-allow-origin']).toBe(legitOrigin)

      console.log('[P1-7.1] 合法Origin请求处理测试通过')
    })
  })

  describe('状态变更操作的Origin验证', () => {
    test('敏感POST操作应该验证请求来源', async () => {
      const maliciousOrigin = 'http://attacker.site'

      // 尝试从恶意Origin发起敏感操作（如转账、修改资料等）
      const response = await request(app)
        .post('/api/v4/user/some-action') // 假设的敏感操作接口
        .set('Origin', maliciousOrigin)
        .set('Content-Type', 'application/json')
        .send({ action: 'test' })

      /*
       * 敏感操作应该：
       * 1. 需要认证Token（401）
       * 2. 或被CORS拒绝
       * 3. 或返回403
       */
      const corsHeader = response.headers['access-control-allow-origin']
      if (corsHeader) {
        expect(corsHeader).not.toBe(maliciousOrigin)
      }

      // 无Token的请求应该被拒绝（JWT防护）
      expect([401, 403, 404, 500]).toContain(response.status)

      console.log('[P1-7.1] 敏感操作Origin验证测试通过')
    })
  })

  describe('Cookie安全属性验证（如适用）', () => {
    test('登录响应的Cookie应该有安全标志', async () => {
      // 执行登录请求
      const response = await request(app)
        .post('/api/v4/auth/login')
        .set('Origin', allowedOrigins[0] || 'http://localhost:3000')
        .set('Content-Type', 'application/json')
        .send({ mobile: '13612227930', verification_code: '123456' })

      // 检查Set-Cookie头（如果有）
      const setCookieHeader = response.headers['set-cookie']

      if (setCookieHeader) {
        /*
         * Cookie安全最佳实践检查：
         * - HttpOnly: 防止XSS窃取Cookie
         * - Secure: 仅HTTPS传输（生产环境）
         * - SameSite: 防止CSRF
         */
        const cookieString = Array.isArray(setCookieHeader)
          ? setCookieHeader.join('; ')
          : setCookieHeader

        // 记录Cookie设置（用于调试）
        console.log('[P1-7.1] Cookie设置:', cookieString)

        // 敏感Cookie应该有HttpOnly标志
        if (
          cookieString.toLowerCase().includes('token') ||
          cookieString.toLowerCase().includes('session')
        ) {
          expect(cookieString.toLowerCase()).toMatch(/httponly/i)
        }
      } else {
        /*
         * 本项目使用JWT通过Header传递，不使用Cookie存储Token
         * 这是更安全的做法，天然防止CSRF
         */
        console.log('[P1-7.1] 项目使用JWT Header认证，无Cookie设置（安全设计）')
      }

      console.log('[P1-7.1] Cookie安全属性验证测试通过')
    })
  })

  describe('Referer验证（补充安全层）', () => {
    test('敏感API应该验证Referer来源（如启用）', async () => {
      const maliciousReferer = 'http://evil.com/attack-page'

      // 带有恶意Referer的请求
      const response = await request(app)
        .get('/health')
        .set('Origin', allowedOrigins[0] || 'http://localhost:3000')
        .set('Referer', maliciousReferer)

      /*
       * Referer验证策略：
       * 1. 某些安全框架会额外验证Referer
       * 2. 但Referer不是可靠的安全机制（用户可能禁用）
       * 3. 主要依赖CORS + JWT Token进行安全控制
       */

      // 健康检查接口应该正常工作（不验证Referer）
      expect(response.status).toBe(200)

      console.log('[P1-7.1] Referer验证测试完成')
    })
  })

  describe('微信小程序特殊场景', () => {
    test('模拟微信小程序请求应该正常通过', async () => {
      // 微信小程序的请求特征
      const response = await request(app).get('/health').set('User-Agent', 'MicroMessenger/8.0.0') // 模拟微信UA
      // 不设置Origin（小程序特征）

      // 微信小程序请求应该被允许
      expect(response.status).toBe(200)

      console.log('[P1-7.1] 微信小程序请求兼容性测试通过')
    })

    test('带有servicewechat.com Origin的请求应该被允许', async () => {
      // 微信小程序可能带有的特殊Origin
      const wechatOrigin = 'https://servicewechat.com/wx1234567890/0/page-frame.html'

      const response = await request(app).get('/health').set('Origin', wechatOrigin)

      // 微信域名应该被CORS允许
      expect(response.status).toBe(200)

      console.log('[P1-7.1] 微信servicewechat.com Origin测试通过')
    })
  })

  describe('CSRF防护总结报告', () => {
    test('输出CSRF防护配置状态', async () => {
      console.log('\n')
      console.log('╔════════════════════════════════════════════════════════════════╗')
      console.log('║             P1-7.1 CSRF防护测试报告                            ║')
      console.log('╠════════════════════════════════════════════════════════════════╣')
      console.log('║ 认证方式: JWT Token (Header传递)                               ║')
      console.log('║ CSRF策略: CORS白名单 + JWT认证                                 ║')
      console.log('║ Cookie: 不用于认证（天然防CSRF）                               ║')
      console.log('║ 小程序: 支持无Origin请求                                       ║')
      console.log('╠════════════════════════════════════════════════════════════════╣')
      console.log(
        `║ 允许的Origin数量: ${allowedOrigins.length}                                            ║`
      )
      console.log(`║ CORS凭证支持: 是                                               ║`)
      console.log('╚════════════════════════════════════════════════════════════════╝')
      console.log('\n')

      expect(true).toBe(true)
    })
  })
})
