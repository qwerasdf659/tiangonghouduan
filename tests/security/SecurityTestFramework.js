/**
 * 🔒 安全测试框架
 * 提供完整的安全测试套件，包括SQL注入、XSS、权限验证等
 */

const request = require('supertest')
const app = require('../../app')
const testLogger = require('../api/helpers/testLogger')

/**
 * 🔒 安全测试框架
 * 提供完整的安全测试套件，包括SQL注入、XSS、权限验证等
 */
class SecurityTestFramework {
  constructor () {
    this.testResults = []
    this.securityScore = 0
    this.vulnerabilities = []
  }

  /**
   * 🔒 运行完整安全测试套件
   */
  async runCompleteSecurityTests () {
    testLogger.info('🔒 开始运行完整安全测试套件...')
    const startTime = Date.now()

    try {
      // 1. SQL注入测试
      await this.runSQLInjectionTests()

      // 2. XSS攻击测试
      await this.runXSSTests()

      // 3. JWT令牌安全测试
      await this.runJWTSecurityTests()

      // 4. API权限测试
      await this.runAPIPermissionTests()

      // 5. 输入验证测试
      await this.runInputValidationTests()

      // 6. 认证绕过测试
      await this.runAuthBypassTests()

      // 7. 数据泄露测试
      await this.runDataLeakageTests()

      // 8. 速率限制测试
      await this.runRateLimitTests()

      // 计算安全评分
      this.calculateSecurityScore()

      const duration = Date.now() - startTime
      testLogger.info(`✅ 安全测试完成，总耗时: ${duration}ms，安全评分: ${this.securityScore}/100`)

      return {
        success: true,
        securityScore: this.securityScore,
        vulnerabilities: this.vulnerabilities,
        testResults: this.testResults,
        duration
      }
    } catch (error) {
      testLogger.error('❌ 安全测试失败:', error)
      return {
        success: false,
        error: error.message,
        testResults: this.testResults,
        vulnerabilities: this.vulnerabilities
      }
    }
  }

  /**
   * 🛡️ SQL注入测试
   */
  async runSQLInjectionTests () {
    testLogger.info('🛡️ 开始SQL注入测试...')

    const _sqlInjectionPayloads = [
      '\' OR \'1\'=\'1\'',
      '\'; DROP TABLE users; --',
      '\' UNION SELECT * FROM users --',
      '1\' OR \'1\'=\'1\' --',
      'admin\'--',
      '\' OR 1=1#',
      '\'; WAITFOR DELAY \'00:00:05\' --',
      '1\' AND (SELECT SUBSTRING(@@version,1,1))=\'M\'--',
      '\' OR EXISTS(SELECT 1 FROM users WHERE username=\'admin\')--',
      '1\' UNION SELECT NULL,username,password FROM users--'
    ]

    const testEndpoints = [
      '/api/v4/unified-engine/auth/login',
      '/api/v4/unified-engine/users/profile',
      '/api/v4/unified-engine/admin/users',
      '/api/v4/unified-engine/lottery/campaigns'
    ]

    // TODO: 性能优化 - 考虑使用Promise.all并发执行
    // 🚀 性能优化：并发执行替代循环中await
    await Promise.all(
      _sqlInjectionPayloads.map(async payload => {
        for (const endpoint of testEndpoints) {
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
            const responseText = JSON.stringify(response.body).toLowerCase()
            const sqlErrorPatterns = [
              'mysql error',
              'sql syntax',
              'ora-',
              'postgresql error',
              'sqlite_error',
              'column.*doesn.*exist',
              'table.*doesn.*exist',
              'duplicate entry'
            ]

            let vulnerabilityFound = false
            for (const pattern of sqlErrorPatterns) {
              if (responseText.includes(pattern)) {
                vulnerabilityFound = true
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

            this.testResults.push({
              test: 'SQL注入测试',
              endpoint,
              payload: payload.substring(0, 20) + '...',
              status: response.status,
              vulnerable: vulnerabilityFound,
              responseTime: response.responseTime || 0
            })
          } catch (error) {
            // 超时或其他错误可能表明存在SQL注入漏洞
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

    testLogger.info(
      `✅ SQL注入测试完成，发现 ${this.vulnerabilities.filter(v => v.type.includes('SQL_INJECTION')).length} 个潜在漏洞`
    )
  }

  /**
   * 🚨 XSS攻击测试
   */
  async runXSSTests () {
    testLogger.info('🚨 开始XSS攻击测试...')

    const _xssPayloads = [
      '<script>alert("XSS")</script>',
      '<img src="x" onerror="alert(\'XSS\')">',
      'javascript:alert("XSS")',
      '<svg onload="alert(\'XSS\')">',
      '"><script>alert("XSS")</script>',
      '\';alert("XSS");//',
      '<iframe src="javascript:alert(\'XSS\')"></iframe>',
      '<body onload="alert(\'XSS\')">',
      '<input type="text" value="" onfocus="alert(\'XSS\')">'
    ]

    // 测试输入字段XSS
    // 🚀 性能优化：并发执行替代循环中await
    await Promise.all(
      _xssPayloads.map(async payload => {
        try {
          const response = await request(app).post('/api/v4/unified-engine/auth/register').send({
            username: payload,
            phone: '13800138000',
            password: 'password123'
          })

          // 检查响应是否包含未转义的脚本
          const responseText = JSON.stringify(response.body)
          if (
            responseText.includes('<script>') ||
            responseText.includes('javascript:') ||
            responseText.includes('onerror=')
          ) {
            this.vulnerabilities.push({
              type: 'XSS_REFLECTED',
              endpoint: '/api/v4/unified-engine/auth/register',
              payload,
              severity: 'HIGH',
              description: 'XSS反射攻击漏洞'
            })
          }

          this.testResults.push({
            test: 'XSS反射攻击测试',
            endpoint: '/api/v4/unified-engine/auth/register',
            payload: payload.substring(0, 30) + '...',
            status: response.status,
            vulnerable: responseText.includes('<script>'),
            responseTime: response.responseTime || 0
          })
        } catch (error) {
          testLogger.warn(`XSS测试出错: ${error.message}`)
        }
      })
    )

    testLogger.info(
      `✅ XSS攻击测试完成，发现 ${this.vulnerabilities.filter(v => v.type.includes('XSS')).length} 个潜在漏洞`
    )
  }

  /**
   * 🔐 JWT令牌安全测试
   */
  async runJWTSecurityTests () {
    testLogger.info('🔐 开始JWT令牌安全测试...')

    // 1. 测试无效令牌
    const invalidTokens = [
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature',
      'Bearer invalid_token',
      'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.',
      'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJhdXRoLWFwaSIsInN1YiI6ImF1dGgiLCJhdWQiOiJhdXRoLWFwaSIsImlhdCI6MTU3MDYzOTY5MywiZXhwIjoxNTcwNjQzMjkzfQ.invalid'
    ]

    // 🚀 性能优化：并发执行替代循环中await
    await Promise.all(
      invalidTokens.map(async token => {
        try {
          const response = await request(app)
            .get('/api/v4/unified-engine/user/profile')
            .set('Authorization', token)

          this.testResults.push({
            test: 'JWT无效令牌测试',
            token: token.substring(0, 30) + '...',
            status: response.status,
            shouldReject: true,
            actuallyRejected: response.status === 401 || response.status === 403,
            secure: response.status === 401 || response.status === 403
          })

          // 如果无效令牌被接受，这是一个严重漏洞
          if (response.status === 200) {
            this.vulnerabilities.push({
              type: 'JWT_INVALID_TOKEN_ACCEPTED',
              token,
              severity: 'CRITICAL',
              description: 'JWT无效令牌被系统接受'
            })
          }
        } catch (error) {
          // 这是预期行为
        }
      })
    )

    // 2. 测试过期令牌
    try {
      const expiredToken =
        'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJhdXRoLWFwaSIsInN1YiI6ImF1dGgiLCJhdWQiOiJhdXRoLWFwaSIsImlhdCI6MTAwMDAwMDAwMCwiZXhwIjoxMDAwMDAwMDAxfQ.invalid'

      const response = await request(app)
        .get('/api/v4/unified-engine/user/profile')
        .set('Authorization', expiredToken)

      this.testResults.push({
        test: 'JWT过期令牌测试',
        status: response.status,
        shouldReject: true,
        actuallyRejected: response.status === 401,
        secure: response.status === 401
      })
    } catch (error) {
      // 这是预期行为
    }

    testLogger.info('✅ JWT令牌安全测试完成')
  }

  /**
   * 🛡️ API权限测试
   */
  async runAPIPermissionTests () {
    testLogger.info('🛡️ 开始API权限测试...')

    // 1. 未授权访问管理员接口
    const _adminEndpoints = [
      '/api/v4/unified-engine/admin/users',
      '/api/v4/unified-engine/admin/prizes',
      '/api/v4/unified-engine/admin/campaigns',
      '/api/v4/unified-engine/admin/system/stats'
    ]

    // TODO: 性能优化 - 考虑使用Promise.all并发执行
    // 🚀 性能优化：并发执行替代循环中await
    await Promise.all(
      _adminEndpoints.map(async endpoint => {
        try {
          // 无令牌访问
          const responseNoAuth = await request(app).get(endpoint)

          // 普通用户令牌访问(需要先获取普通用户令牌)
          const userAuthResponse = await request(app)
            .post('/api/v4/unified-engine/auth/login')
            .send({
              phone: '13800138000',
              code: '123456'
            })

          let userToken = null
          if (userAuthResponse.status === 200 && userAuthResponse.body.token) {
            userToken = `Bearer ${userAuthResponse.body.token}`

            const responseUserAuth = await request(app)
              .get(endpoint)
              .set('Authorization', userToken)

            // 普通用户不应该能访问管理员接口
            if (responseUserAuth.status === 200) {
              this.vulnerabilities.push({
                type: 'PRIVILEGE_ESCALATION',
                endpoint,
                severity: 'CRITICAL',
                description: '普通用户可以访问管理员接口'
              })
            }

            this.testResults.push({
              test: '权限升级测试',
              endpoint,
              userType: '普通用户',
              status: responseUserAuth.status,
              shouldReject: true,
              actuallyRejected: responseUserAuth.status !== 200,
              secure: responseUserAuth.status !== 200
            })
          }

          this.testResults.push({
            test: '未授权访问测试',
            endpoint,
            status: responseNoAuth.status,
            shouldReject: true,
            actuallyRejected: responseNoAuth.status === 401 || responseNoAuth.status === 403,
            secure: responseNoAuth.status === 401 || responseNoAuth.status === 403
          })
        } catch (error) {
          testLogger.warn(`权限测试出错: ${error.message}`)
        }
      })
    )

    testLogger.info('✅ API权限测试完成')
  }

  /**
   * ✅ 输入验证测试
   */
  async runInputValidationTests () {
    testLogger.info('✅ 开始输入验证测试...')

    const maliciousInputs = [
      { field: 'phone', value: '../../../etc/passwd', type: 'PATH_TRAVERSAL' },
      { field: 'username', value: 'A'.repeat(10000), type: 'BUFFER_OVERFLOW' },
      { field: 'password', value: '\x00\x01\x02\x03', type: 'NULL_BYTE_INJECTION' },
      { field: 'phone', value: '${' + '7*7}', type: 'TEMPLATE_INJECTION' },
      { field: 'username', value: '<>:"{}|\\^`[]', type: 'SPECIAL_CHARACTERS' },
      { field: 'phone', value: 'javascript:void(0)', type: 'JAVASCRIPT_SCHEME' }
    ]

    for (const input of maliciousInputs) {
      try {
        const testData = {
          phone: '13800138000',
          password: 'password123',
          username: 'testuser'
        }
        testData[input.field] = input.value

        const response = await request(app)
          .post('/api/v4/unified-engine/auth/register')
          .send(testData)

        // 检查是否正确拒绝恶意输入
        const inputAccepted = response.status === 200 || response.status === 201
        if (inputAccepted && input.type !== 'SPECIAL_CHARACTERS') {
          this.vulnerabilities.push({
            type: 'INPUT_VALIDATION_BYPASS',
            field: input.field,
            inputType: input.type,
            severity: 'MEDIUM',
            description: `恶意输入被系统接受: ${input.type}`
          })
        }

        this.testResults.push({
          test: '输入验证测试',
          field: input.field,
          inputType: input.type,
          status: response.status,
          inputRejected: !inputAccepted,
          secure: !inputAccepted || input.type === 'SPECIAL_CHARACTERS'
        })
      } catch (error) {
        // 这通常是好的，表明输入被正确拒绝
      }
    }

    testLogger.info('✅ 输入验证测试完成')
  }

  /**
   * 🔓 认证绕过测试
   */
  async runAuthBypassTests () {
    testLogger.info('🔓 开始认证绕过测试...')

    const bypassAttempts = [
      { method: 'HEADER_MANIPULATION', headers: { 'X-User-Id': '1', 'X-Is-Admin': 'true' } },
      { method: 'PARAMETER_POLLUTION', params: { user_id: ['1', '2'] } },
      { method: 'HTTP_METHOD_OVERRIDE', headers: { 'X-HTTP-Method-Override': 'GET' } },
      { method: 'HOST_HEADER_INJECTION', headers: { Host: 'evil.com' } }
    ]

    for (const attempt of bypassAttempts) {
      try {
        let requestBuilder = request(app).get('/api/v4/unified-engine/user/profile')

        // 添加测试headers
        if (attempt.headers) {
          for (const [key, value] of Object.entries(attempt.headers)) {
            requestBuilder = requestBuilder.set(key, value)
          }
        }

        const response = await requestBuilder

        // 如果没有token但请求成功，可能存在认证绕过
        if (response.status === 200) {
          this.vulnerabilities.push({
            type: 'AUTH_BYPASS',
            method: attempt.method,
            severity: 'CRITICAL',
            description: `认证绕过成功: ${attempt.method}`
          })
        }

        this.testResults.push({
          test: '认证绕过测试',
          method: attempt.method,
          status: response.status,
          shouldReject: true,
          bypassSuccessful: response.status === 200,
          secure: response.status !== 200
        })
      } catch (error) {
        // 这是预期行为
      }
    }

    testLogger.info('✅ 认证绕过测试完成')
  }

  /**
   * 📋 数据泄露测试
   */
  async runDataLeakageTests () {
    testLogger.info('📋 开始数据泄露测试...')

    // 1. 测试错误信息泄露
    const errorInducingRequests = [
      { endpoint: '/api/v4/unified-engine/nonexistent', expectedStatus: 404 },
      { endpoint: '/api/v4/unified-engine/user/profile/999999', expectedStatus: [400, 404] },
      { endpoint: '/api/v4/unified-engine/admin/users?limit=abc', expectedStatus: 400 }
    ]

    // 🚀 性能优化：并发执行替代循环中await
    await Promise.all(
      errorInducingRequests.map(async req => {
        try {
          const response = await request(app).get(req.endpoint)

          // 检查错误响应是否泄露敏感信息
          const responseText = JSON.stringify(response.body).toLowerCase()
          const sensitivePatterns = [
            'stack trace',
            'file path',
            '/home/',
            'c:\\',
            'database error',
            'internal server error',
            'debug',
            'development'
          ]

          let dataLeakage = false
          for (const pattern of sensitivePatterns) {
            if (responseText.includes(pattern)) {
              dataLeakage = true
              this.vulnerabilities.push({
                type: 'DATA_LEAKAGE',
                endpoint: req.endpoint,
                pattern,
                severity: 'MEDIUM',
                description: `错误信息泄露敏感信息: ${pattern}`
              })
              break
            }
          }

          this.testResults.push({
            test: '数据泄露测试',
            endpoint: req.endpoint,
            status: response.status,
            dataLeakage,
            secure: !dataLeakage
          })
        } catch (error) {
          // 继续测试其他端点
        }
      })
    )

    testLogger.info('✅ 数据泄露测试完成')
  }

  /**
   * ⏱️ 速率限制测试
   */
  async runRateLimitTests () {
    testLogger.info('⏱️ 开始速率限制测试...')

    // 测试登录接口的速率限制
    const loginEndpoint = '/api/v4/unified-engine/auth/login'
    let rateLimitTriggered = false
    const testRequests = 20 // 快速发送20个请求

    const promises = []
    for (let i = 0; i < testRequests; i++) {
      const promise = request(app)
        .post(loginEndpoint)
        .send({
          phone: '13800138000',
          code: 'wrong_code'
        })
        .catch(() => {}) // 忽略错误，专注于速率限制

      promises.push(promise)
    }

    try {
      const responses = await Promise.allSettled(promises)

      // 检查是否有429 (Too Many Requests) 状态码
      for (const result of responses) {
        if (result.status === 'fulfilled' && result.value && result.value.status === 429) {
          rateLimitTriggered = true
          break
        }
      }

      // 如果没有触发速率限制，这可能是一个安全问题
      if (!rateLimitTriggered) {
        this.vulnerabilities.push({
          type: 'NO_RATE_LIMITING',
          endpoint: loginEndpoint,
          severity: 'MEDIUM',
          description: '登录接口缺少速率限制保护'
        })
      }

      this.testResults.push({
        test: '速率限制测试',
        endpoint: loginEndpoint,
        requestCount: testRequests,
        rateLimitTriggered,
        secure: rateLimitTriggered
      })
    } catch (error) {
      testLogger.warn(`速率限制测试出错: ${error.message}`)
    }

    testLogger.info('✅ 速率限制测试完成')
  }

  /**
   * 📊 计算安全评分
   */
  calculateSecurityScore () {
    let score = 100
    const vulnerabilityWeights = {
      CRITICAL: 25,
      HIGH: 15,
      MEDIUM: 8,
      LOW: 3
    }

    for (const vulnerability of this.vulnerabilities) {
      const weight = vulnerabilityWeights[vulnerability.severity] || 5
      score -= weight
    }

    // 确保评分不低于0
    this.securityScore = Math.max(0, score)

    testLogger.info(`🔍 安全评分计算完成: ${this.securityScore}/100`)
    testLogger.info('📊 发现漏洞统计:')
    testLogger.info(
      `   - 严重: ${this.vulnerabilities.filter(v => v.severity === 'CRITICAL').length} 个`
    )
    testLogger.info(
      `   - 高危: ${this.vulnerabilities.filter(v => v.severity === 'HIGH').length} 个`
    )
    testLogger.info(
      `   - 中危: ${this.vulnerabilities.filter(v => v.severity === 'MEDIUM').length} 个`
    )
    testLogger.info(
      `   - 低危: ${this.vulnerabilities.filter(v => v.severity === 'LOW').length} 个`
    )
  }

  /**
   * 📋 生成安全测试报告
   */
  generateSecurityReport () {
    const report = {
      timestamp: new Date().toISOString(),
      securityScore: this.securityScore,
      totalTests: this.testResults.length,
      totalVulnerabilities: this.vulnerabilities.length,
      vulnerabilitiesBySeverity: {
        critical: this.vulnerabilities.filter(v => v.severity === 'CRITICAL').length,
        high: this.vulnerabilities.filter(v => v.severity === 'HIGH').length,
        medium: this.vulnerabilities.filter(v => v.severity === 'MEDIUM').length,
        low: this.vulnerabilities.filter(v => v.severity === 'LOW').length
      },
      testResults: this.testResults,
      vulnerabilities: this.vulnerabilities,
      recommendations: this.generateSecurityRecommendations()
    }

    return report
  }

  /**
   * 💡 生成安全建议
   */
  generateSecurityRecommendations () {
    const recommendations = []

    const vulnTypes = new Set(this.vulnerabilities.map(v => v.type))

    if (vulnTypes.has('SQL_INJECTION_INFO_DISCLOSURE') || vulnTypes.has('SQL_INJECTION_TIMING')) {
      recommendations.push({
        priority: 'HIGH',
        category: 'SQL注入防护',
        suggestion: '使用参数化查询和输入验证来防止SQL注入攻击',
        impact: '防止数据库被恶意访问和数据泄露'
      })
    }

    if (vulnTypes.has('XSS_REFLECTED')) {
      recommendations.push({
        priority: 'HIGH',
        category: 'XSS防护',
        suggestion: '对所有用户输入进行HTML转义和内容安全策略(CSP)实施',
        impact: '防止恶意脚本执行和用户会话劫持'
      })
    }

    if (vulnTypes.has('PRIVILEGE_ESCALATION') || vulnTypes.has('AUTH_BYPASS')) {
      recommendations.push({
        priority: 'CRITICAL',
        category: '权限控制',
        suggestion: '加强API权限验证和用户角色检查机制',
        impact: '防止未授权访问和权限提升攻击'
      })
    }

    if (vulnTypes.has('JWT_INVALID_TOKEN_ACCEPTED')) {
      recommendations.push({
        priority: 'CRITICAL',
        category: 'JWT安全',
        suggestion: '强化JWT令牌验证，包括签名验证和过期时间检查',
        impact: '防止身份伪造和会话劫持'
      })
    }

    if (vulnTypes.has('NO_RATE_LIMITING')) {
      recommendations.push({
        priority: 'MEDIUM',
        category: '速率限制',
        suggestion: '为关键API接口实施速率限制和请求频次控制',
        impact: '防止暴力破解和DoS攻击'
      })
    }

    if (vulnTypes.has('DATA_LEAKAGE')) {
      recommendations.push({
        priority: 'MEDIUM',
        category: '信息泄露',
        suggestion: '规范错误处理，避免在响应中暴露敏感的系统信息',
        impact: '减少攻击面，保护系统内部信息'
      })
    }

    return recommendations
  }
}

module.exports = SecurityTestFramework
