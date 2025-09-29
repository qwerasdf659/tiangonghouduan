/**
 * 安全测试套件
 * 包含SQL注入、XSS攻击、JWT安全等测试功能
 * 创建时间：2025年01月21日 北京时间
 * 使用模型：Claude Sonnet 4
 */

const BaseTestManager = require('../core/base_test_manager')
const request = require('supertest')
const app = require('../../../app')

class SecurityTestSuite extends BaseTestManager {
  constructor (baseUrl) {
    super(baseUrl)

    // 安全测试相关
    this.security_score = 0
    this.vulnerabilities = []
    this.security_test_results = []

    console.log('[SecurityTestSuite] 安全测试套件初始化完成')
  }

  /**
   * 🔒 运行完整安全测试套件
   */
  async run_complete_security_tests () {
    console.log('🔒 开始运行完整安全测试套件...')
    const start_time = Date.now()

    try {
      // 1. SQL注入测试
      await this.run_sql_injection_tests()

      // 2. XSS攻击测试
      await this.run_xss_tests()

      // 3. JWT令牌安全测试
      await this.run_jwt_security_tests()

      // 4. API权限测试
      await this.run_api_permission_tests()

      // 5. 输入验证测试
      await this.run_input_validation_tests()

      // 计算安全评分
      this.calculate_security_score()

      const duration = Date.now() - start_time
      console.log(`✅ 安全测试完成，总耗时: ${duration}ms，安全评分: ${this.security_score}/100`)

      return {
        success: true,
        security_score: this.security_score,
        vulnerabilities: this.vulnerabilities,
        test_results: this.security_test_results,
        duration
      }
    } catch (error) {
      console.error('❌ 安全测试失败:', error)
      return {
        success: false,
        error: error.message,
        test_results: this.security_test_results,
        vulnerabilities: this.vulnerabilities
      }
    }
  }

  /**
   * 🛡️ SQL注入测试
   */
  async run_sql_injection_tests () {
    console.log('🛡️ 开始SQL注入测试...')

    const sql_injection_payloads = [
      '\' OR \'1\'=\'1\'',
      '\'; DROP TABLE users; --',
      '\' UNION SELECT * FROM users --',
      '1\' OR \'1\'=\'1\' --',
      'admin\'--',
      '\' OR 1=1#'
    ]

    const test_endpoints = [
      '/api/v4/unified-engine/auth/login',
      '/api/v4/unified-engine/users/profile',
      '/api/v4/unified-engine/admin/users'
    ]

    // 并发执行SQL注入测试
    await Promise.all(
      sql_injection_payloads.map(async payload => {
        for (const endpoint of test_endpoints) {
          try {
            const response = await request(app)
              .post(endpoint)
              .send({
                username: payload,
                password: payload,
                user_id: payload,
                phone: payload
              })
              .timeout(5000)

            // 检查是否存在SQL错误信息泄露
            const response_text = JSON.stringify(response.body).toLowerCase()
            const sql_error_patterns = [
              'mysql error',
              'sql syntax',
              'column.*doesn.*exist',
              'table.*doesn.*exist'
            ]

            let vulnerability_found = false
            for (const pattern of sql_error_patterns) {
              if (response_text.includes(pattern)) {
                vulnerability_found = true
                this.vulnerabilities.push({
                  type: 'SQL_INJECTION_INFO_DISCLOSURE',
                  endpoint,
                  payload,
                  severity: 'HIGH',
                  description: `SQL错误信息泄露: ${pattern}`
                })
                break
              }
            }

            this.security_test_results.push({
              test: 'SQL注入测试',
              endpoint,
              payload: payload.substring(0, 20) + '...',
              status: response.status,
              vulnerable: vulnerability_found,
              response_time: response.responseTime || 0
            })
          } catch (error) {
            // 超时可能表明存在SQL注入漏洞
            if (error.timeout) {
              this.vulnerabilities.push({
                type: 'SQL_INJECTION_TIMING',
                endpoint,
                payload,
                severity: 'MEDIUM',
                description: 'SQL注入时间延迟攻击可能成功'
              })
            }
          }
        }
      })
    )

    console.log(
      `✅ SQL注入测试完成，发现 ${this.vulnerabilities.filter(v => v.type.includes('SQL_INJECTION')).length} 个潜在漏洞`
    )
  }

  /**
   * 🚨 XSS攻击测试
   */
  async run_xss_tests () {
    console.log('🚨 开始XSS攻击测试...')

    const xss_payloads = [
      '<script>alert("XSS")</script>',
      '<img src="x" onerror="alert(\'XSS\')">',
      'javascript:alert("XSS")',
      '<svg onload="alert(\'XSS\')">',
      '"><script>alert("XSS")</script>'
    ]

    // 测试输入字段XSS
    await Promise.all(
      xss_payloads.map(async payload => {
        try {
          const response = await request(app).post('/api/v4/unified-engine/auth/register').send({
            username: payload,
            phone: '13612227930',
            verification_code: '123456'
          })

          // 检查响应中是否包含未转义的XSS payload
          const response_text = JSON.stringify(response.body)
          const contains_payload = response_text.includes(payload.replace(/[<>"']/g, ''))

          if (contains_payload) {
            this.vulnerabilities.push({
              type: 'XSS_REFLECTED',
              endpoint: '/api/v4/unified-engine/auth/register',
              payload,
              severity: 'HIGH',
              description: 'XSS payload在响应中未被正确转义'
            })
          }

          this.security_test_results.push({
            test: 'XSS测试',
            endpoint: '/api/v4/unified-engine/auth/register',
            payload: payload.substring(0, 30) + '...',
            status: response.status,
            vulnerable: contains_payload
          })
        } catch (error) {
          console.warn('XSS测试请求失败:', error.message)
        }
      })
    )

    console.log(
      `✅ XSS测试完成，发现 ${this.vulnerabilities.filter(v => v.type.includes('XSS')).length} 个潜在漏洞`
    )
  }

  /**
   * 🔐 JWT令牌安全测试
   */
  async run_jwt_security_tests () {
    console.log('🔐 开始JWT令牌安全测试...')

    const malformed_tokens = [
      'invalid.token.here',
      'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.invalid.signature',
      '',
      'Bearer ',
      'null',
      'undefined'
    ]

    for (const token of malformed_tokens) {
      try {
        const response = await request(app)
          .get('/api/v4/unified-engine/users/profile')
          .set('Authorization', `Bearer ${token}`)

        this.security_test_results.push({
          test: 'JWT安全测试',
          token: token.substring(0, 20) + '...',
          status: response.status,
          secure: response.status === 401 || response.status === 403
        })

        // 如果恶意token被接受，记录为漏洞
        if (response.status === 200) {
          this.vulnerabilities.push({
            type: 'JWT_BYPASS',
            token,
            severity: 'CRITICAL',
            description: '恶意JWT令牌被系统接受'
          })
        }
      } catch (error) {
        console.warn('JWT测试请求失败:', error.message)
      }
    }

    console.log(
      `✅ JWT安全测试完成，发现 ${this.vulnerabilities.filter(v => v.type.includes('JWT')).length} 个潜在漏洞`
    )
  }

  /**
   * 🔒 API权限测试
   */
  async run_api_permission_tests () {
    console.log('🔒 开始API权限测试...')

    const admin_endpoints = [
      '/api/v4/unified-engine/admin/users',
      '/api/v4/unified-engine/admin/dashboard',
      '/api/v4/unified-engine/admin/lottery/campaigns'
    ]

    // 测试未授权访问管理员端点
    for (const endpoint of admin_endpoints) {
      try {
        const response = await request(app).get(endpoint)

        this.security_test_results.push({
          test: '权限测试',
          endpoint,
          status: response.status,
          secure: response.status === 401 || response.status === 403
        })

        // 如果未授权请求被接受，记录为漏洞
        if (response.status === 200) {
          this.vulnerabilities.push({
            type: 'UNAUTHORIZED_ACCESS',
            endpoint,
            severity: 'HIGH',
            description: '管理员端点允许未授权访问'
          })
        }
      } catch (error) {
        console.warn('权限测试请求失败:', error.message)
      }
    }

    console.log(
      `✅ API权限测试完成，发现 ${this.vulnerabilities.filter(v => v.type.includes('UNAUTHORIZED')).length} 个潜在漏洞`
    )
  }

  /**
   * ✅ 输入验证测试
   */
  async run_input_validation_tests () {
    console.log('✅ 开始输入验证测试...')

    const invalid_inputs = [
      { phone: '123' }, // 无效手机号
      { phone: 'abcdefghijk' }, // 非数字手机号
      { verification_code: '99999999' }, // 过长验证码
      { username: 'a'.repeat(1000) } // 过长用户名
    ]

    for (const input of invalid_inputs) {
      try {
        const response = await request(app).post('/api/v4/unified-engine/auth/login').send(input)

        this.security_test_results.push({
          test: '输入验证测试',
          input: JSON.stringify(input).substring(0, 50) + '...',
          status: response.status,
          validated: response.status === 400 || response.status === 422
        })

        // 如果无效输入被接受，可能存在验证漏洞
        if (response.status === 200) {
          this.vulnerabilities.push({
            type: 'INPUT_VALIDATION_BYPASS',
            input,
            severity: 'MEDIUM',
            description: '无效输入未被正确验证'
          })
        }
      } catch (error) {
        console.warn('输入验证测试请求失败:', error.message)
      }
    }

    console.log(
      `✅ 输入验证测试完成，发现 ${this.vulnerabilities.filter(v => v.type.includes('INPUT_VALIDATION')).length} 个潜在漏洞`
    )
  }

  /**
   * 📊 计算安全评分
   */
  calculate_security_score () {
    const total_vulnerabilities = this.vulnerabilities.length
    const critical_count = this.vulnerabilities.filter(v => v.severity === 'CRITICAL').length
    const high_count = this.vulnerabilities.filter(v => v.severity === 'HIGH').length
    const medium_count = this.vulnerabilities.filter(v => v.severity === 'MEDIUM').length

    // 基础分数100，根据漏洞严重程度扣分
    this.security_score = Math.max(
      0,
      100 - (critical_count * 30 + high_count * 15 + medium_count * 5)
    )

    console.log(`📊 安全评分计算: 总漏洞${total_vulnerabilities}个，评分${this.security_score}/100`)
  }
}

module.exports = SecurityTestSuite
