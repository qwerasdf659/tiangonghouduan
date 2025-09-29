/**
 * �� V4架构安全测试套件
 * 基于UnifiedAPITestManager的安全测试功能
 * 测试范围：SQL注入、XSS、JWT安全、API权限等
 */

const UnifiedAPITestManager = require('../api/UnifiedAPITestManager')
const testLogger = require('../api/helpers/testLogger')

describe('🔒 V4架构安全测试', () => {
  let apiTestManager

  beforeAll(() => {
    apiTestManager = new UnifiedAPITestManager()
    testLogger.info('🔒 统一API测试管理器初始化完成')
  })

  afterAll(async () => {
    await apiTestManager.cleanup()
  })

  describe('🛡️ 核心安全测试', () => {
    test('SQL注入防护测试', async () => {
      await apiTestManager.runSQLInjectionTests()
      const vulnerabilities = apiTestManager.vulnerabilities.filter(v =>
        v.type.includes('SQL_INJECTION')
      )

      // 检查是否有SQL注入漏洞
      expect(vulnerabilities.length).toBe(0) // 期望没有SQL注入漏洞
      testLogger.info(`SQL注入测试完成，发现 ${vulnerabilities.length} 个漏洞`)
    }, 30000)

    test('XSS攻击防护测试', async () => {
      await apiTestManager.runXSSTests()
      const xssVulnerabilities = apiTestManager.vulnerabilities.filter(v => v.type.includes('XSS'))

      // 检查是否有XSS漏洞
      expect(xssVulnerabilities.length).toBe(0) // 期望没有XSS漏洞
      testLogger.info(`XSS测试完成，发现 ${xssVulnerabilities.length} 个漏洞`)
    }, 20000)

    test('JWT令牌安全测试', async () => {
      await apiTestManager.runJWTSecurityTests()
      const jwtVulnerabilities = apiTestManager.vulnerabilities.filter(v => v.type.includes('JWT'))

      // 检查是否有JWT安全问题
      expect(jwtVulnerabilities.length).toBe(0) // 期望没有JWT漏洞
      testLogger.info(`JWT安全测试完成，发现 ${jwtVulnerabilities.length} 个漏洞`)
    }, 15000)
  })

  describe('🔐 权限和认证安全', () => {
    test('API权限验证测试', async () => {
      await apiTestManager.runAPIPermissionTests()
      const authVulnerabilities = apiTestManager.vulnerabilities.filter(v =>
        v.type.includes('UNAUTHORIZED')
      )

      // 检查是否有未授权访问问题
      expect(authVulnerabilities.length).toBe(0) // 期望没有未授权访问漏洞
      testLogger.info(`API权限测试完成，发现 ${authVulnerabilities.length} 个漏洞`)
    }, 20000)

    test('输入验证安全测试', async () => {
      await apiTestManager.runInputValidationTests()
      const inputVulnerabilities = apiTestManager.vulnerabilities.filter(v =>
        v.type.includes('INPUT_VALIDATION')
      )

      // 检查是否有输入验证问题
      expect(inputVulnerabilities.length).toBe(0) // 期望没有输入验证漏洞
      testLogger.info(`输入验证测试完成，发现 ${inputVulnerabilities.length} 个漏洞`)
    }, 15000)
  })

  describe('📊 安全测试总结', () => {
    test('生成完整安全报告', async () => {
      const completeResult = await apiTestManager.runCompleteSecurityTests()

      expect(completeResult).toBeDefined()
      expect(completeResult.securityScore).toBeGreaterThanOrEqual(0)
      expect(completeResult.securityScore).toBeLessThanOrEqual(100)
      expect(Array.isArray(completeResult.vulnerabilities)).toBe(true)
      expect(Array.isArray(completeResult.testResults)).toBe(true)

      testLogger.info(`🔒 安全测试完成 - 安全评分: ${completeResult.securityScore}/100`)

      if (completeResult.vulnerabilities.length > 0) {
        testLogger.warn(`⚠️ 发现 ${completeResult.vulnerabilities.length} 个安全问题`)
        completeResult.vulnerabilities.forEach(vuln => {
          testLogger.warn(`   - ${vuln.type}: ${vuln.description} (严重程度: ${vuln.severity})`)
        })
      } else {
        testLogger.info('✅ 未发现安全漏洞')
      }
    }, 60000)
  })
})
