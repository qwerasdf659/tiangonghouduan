/**
 * 餐厅积分抽奖系统 V4.5 - MerchantRiskControlService 单元测试
 *
 * 测试范围（P1-8 MerchantRiskControlService 测试）：
 * - 频次风控检查（硬阻断）
 * - 金额告警检查（软告警）
 * - 关联告警检查（多门店录入）
 * - 综合风控检查
 * - 告警查询和状态管理
 * - 风控配置和统计
 *
 * 测试用例数量：12 cases
 * 预计工时：1天
 *
 * 创建时间：2026-01-28
 * 关联文档：docs/测试审计标准.md（P1-8 节）
 *
 * 业务背景：
 * - AC5.1: 频次限制 - 同一员工60秒内提交>10次，硬阻断
 * - AC5.2: 金额告警 - 单笔>5000元或日累计>50000元，软告警
 * - AC5.3: 关联告警 - 同一用户10分钟内被>3个门店录入，软告警
 */

const { sequelize } = require('../../../models')

// 延迟加载服务（通过 ServiceManager）
let MerchantRiskControlService

// 测试数据库配置
jest.setTimeout(30000)

describe('MerchantRiskControlService - 商户风控服务', () => {
  // 测试数据
  const testOperatorId = 1
  const testStoreId = 1
  const testUserId = 1

  beforeAll(async () => {
    // 连接测试数据库
    await sequelize.authenticate()

    // 加载服务
    MerchantRiskControlService = require('../../../services/MerchantRiskControlService')

    console.log('[MerchantRiskControlService] 测试环境准备完成')
  })

  afterAll(async () => {
    // 关闭数据库连接
    await sequelize.close()
  })

  // ==================== 1. 频次风控检查测试 ====================
  describe('checkFrequencyLimit - 频次风控检查', () => {
    /**
     * Case 1.1: 正常频次应该允许通过
     * 业务场景：员工正常录入消费，频次未超限
     * 期望：allowed = true
     */
    test('Case 1.1: 正常频次应该允许通过', async () => {
      // 使用较大的阈值测试，避免影响其他测试数据
      const result = await MerchantRiskControlService.checkFrequencyLimit(testOperatorId, {
        time_window_seconds: 1, // 1秒窗口
        max_count: 1000 // 很高的阈值
      })

      // 验证结果
      expect(result.allowed).toBe(true)
      expect(typeof result.count).toBe('number')
      expect(result.max_count).toBe(1000)
      expect(result.time_window_seconds).toBe(1)

      console.log('[Case 1.1] 频次检查通过:', result)
    })

    /**
     * Case 1.2: 频次检查应该返回正确的结构
     * 业务场景：验证返回数据结构完整性
     * 期望：包含 allowed, count, max_count, time_window_seconds
     */
    test('Case 1.2: 返回结构应该完整', async () => {
      const result = await MerchantRiskControlService.checkFrequencyLimit(testOperatorId, {
        time_window_seconds: 60,
        max_count: 100
      })

      // 验证返回结构
      expect(result).toHaveProperty('allowed')
      expect(result).toHaveProperty('count')
      expect(result).toHaveProperty('max_count')
      expect(result).toHaveProperty('time_window_seconds')

      // 类型检查
      expect(typeof result.allowed).toBe('boolean')
      expect(typeof result.count).toBe('number')

      console.log('[Case 1.2] 返回结构验证通过')
    })

    /**
     * Case 1.3: 使用默认配置应该正常工作
     * 业务场景：不传入自定义配置，使用系统默认风控规则
     */
    test('Case 1.3: 使用默认配置应该正常工作', async () => {
      const result = await MerchantRiskControlService.checkFrequencyLimit(testOperatorId)

      // 默认配置来自 RISK_CONFIG
      expect(result.allowed).toBeDefined()
      expect(result.count).toBeDefined()

      console.log('[Case 1.3] 默认配置检查通过:', {
        allowed: result.allowed,
        count: result.count,
        max_count: result.max_count
      })
    })
  })

  // ==================== 2. 金额告警检查测试 ====================
  describe('checkAmountAlert - 金额告警检查', () => {
    /**
     * Case 2.1: 正常金额不应触发告警
     * 业务场景：普通消费金额，远低于告警阈值
     * 期望：hasAlert = false
     */
    test('Case 2.1: 正常金额不应触发告警', async () => {
      const normalAmount = 100 // 100元，远低于5000元阈值

      const result = await MerchantRiskControlService.checkAmountAlert(
        testOperatorId,
        testStoreId,
        normalAmount,
        {
          single_limit: 5000, // 单笔阈值
          daily_limit: 50000 // 日累计阈值
        }
      )

      expect(result.hasAlert).toBe(false)
      expect(Array.isArray(result.alerts)).toBe(true)
      expect(result.alerts.length).toBe(0)

      console.log('[Case 2.1] 正常金额检查通过:', result)
    })

    /**
     * Case 2.2: 高金额应触发单笔告警（仅告警不阻断）
     * 业务场景：大额消费，超过单笔阈值
     * 期望：hasAlert = true, 包含 single_amount 类型告警
     */
    test('Case 2.2: 高金额应触发单笔告警', async () => {
      const highAmount = 6000 // 6000元，超过5000元阈值

      const result = await MerchantRiskControlService.checkAmountAlert(
        testOperatorId,
        testStoreId,
        highAmount,
        {
          single_limit: 5000,
          daily_limit: 999999 // 设置很高避免触发日累计告警
        }
      )

      expect(result.hasAlert).toBe(true)
      expect(result.alerts.length).toBeGreaterThanOrEqual(1)

      // 验证告警类型
      const singleAlert = result.alerts.find(a => a.type === 'single_amount')
      expect(singleAlert).toBeDefined()
      expect(singleAlert.is_blocked).toBe(false) // 仅告警，不阻断

      console.log('[Case 2.2] 单笔金额告警触发:', result.alerts)
    })

    /**
     * Case 2.3: 返回结构应该完整
     * 业务场景：验证金额检查返回的数据结构
     */
    test('Case 2.3: 返回结构应该完整', async () => {
      const result = await MerchantRiskControlService.checkAmountAlert(
        testOperatorId,
        testStoreId,
        100,
        { single_limit: 5000, daily_limit: 50000 }
      )

      // 验证必需字段
      expect(result).toHaveProperty('hasAlert')
      expect(result).toHaveProperty('alerts')
      expect(result).toHaveProperty('single_limit')
      expect(result).toHaveProperty('daily_limit')

      console.log('[Case 2.3] 返回结构验证通过')
    })
  })

  // ==================== 3. 关联告警检查测试 ====================
  describe('checkDuplicateUserAlert - 关联告警检查', () => {
    /**
     * Case 3.1: 单门店用户不应触发告警
     * 业务场景：用户仅在一个门店消费，正常情况
     * 期望：hasAlert = false
     */
    test('Case 3.1: 单门店用户不应触发告警', async () => {
      const result = await MerchantRiskControlService.checkDuplicateUserAlert(
        testUserId,
        testStoreId,
        {
          time_window_minutes: 10,
          store_count_limit: 3
        }
      )

      // 单门店情况，门店数量应该 <= 阈值
      expect(result.hasAlert).toBe(false)
      expect(typeof result.store_count).toBe('number')
      expect(Array.isArray(result.stores)).toBe(true)

      console.log('[Case 3.1] 单门店检查通过:', result)
    })

    /**
     * Case 3.2: 返回结构应该完整
     * 业务场景：验证关联告警返回的数据结构
     */
    test('Case 3.2: 返回结构应该完整', async () => {
      const result = await MerchantRiskControlService.checkDuplicateUserAlert(
        testUserId,
        testStoreId,
        { time_window_minutes: 10, store_count_limit: 3 }
      )

      // 验证必需字段
      expect(result).toHaveProperty('hasAlert')
      expect(result).toHaveProperty('store_count')
      expect(result).toHaveProperty('stores')
      expect(result).toHaveProperty('store_count_limit')
      expect(result).toHaveProperty('time_window_minutes')

      console.log('[Case 3.2] 返回结构验证通过')
    })
  })

  // ==================== 4. 综合风控检查测试 ====================
  describe('performFullRiskCheck - 综合风控检查', () => {
    /**
     * Case 4.1: 综合检查应该执行所有规则
     * 业务场景：一次性执行频次、金额、关联告警检查
     */
    test('Case 4.1: 综合检查应该执行所有规则', async () => {
      const params = {
        operator_id: testOperatorId,
        store_id: testStoreId,
        target_user_id: testUserId,
        consumption_amount: 100 // 正常金额
      }

      const result = await MerchantRiskControlService.performFullRiskCheck(params)

      // 验证返回结构
      expect(result).toHaveProperty('blocked')
      expect(result).toHaveProperty('alerts')
      expect(typeof result.blocked).toBe('boolean')
      expect(Array.isArray(result.alerts)).toBe(true)

      console.log('[Case 4.1] 综合检查通过:', {
        blocked: result.blocked,
        alert_count: result.alerts.length
      })
    })
  })

  // ==================== 5. 风控配置测试 ====================
  describe('getRiskConfig - 风控配置获取', () => {
    /**
     * Case 5.1: 应该返回完整的风控配置
     * 业务场景：管理后台查看风控规则配置
     *
     * 实际返回格式：
     * {
     *   FREQUENCY_LIMIT_SECONDS: 60,
     *   FREQUENCY_LIMIT_COUNT: 10,
     *   SINGLE_AMOUNT_ALERT: 5000,
     *   DAILY_AMOUNT_ALERT: 50000,
     *   DUPLICATE_USER_MINUTES: 10,
     *   DUPLICATE_USER_STORE_COUNT: 3
     * }
     */
    test('Case 5.1: 应该返回完整的风控配置', async () => {
      const config = MerchantRiskControlService.getRiskConfig()

      // 验证配置项存在（实际格式）
      expect(config).toHaveProperty('FREQUENCY_LIMIT_SECONDS')
      expect(config).toHaveProperty('FREQUENCY_LIMIT_COUNT')
      expect(config).toHaveProperty('SINGLE_AMOUNT_ALERT')
      expect(config).toHaveProperty('DAILY_AMOUNT_ALERT')
      expect(config).toHaveProperty('DUPLICATE_USER_MINUTES')
      expect(config).toHaveProperty('DUPLICATE_USER_STORE_COUNT')

      // 验证数值类型
      expect(typeof config.FREQUENCY_LIMIT_SECONDS).toBe('number')
      expect(typeof config.FREQUENCY_LIMIT_COUNT).toBe('number')
      expect(typeof config.SINGLE_AMOUNT_ALERT).toBe('number')
      expect(typeof config.DAILY_AMOUNT_ALERT).toBe('number')

      console.log('[Case 5.1] 风控配置获取成功:', config)
    })
  })

  // ==================== 6. 告警查询测试 ====================
  describe('queryRiskAlerts - 告警查询', () => {
    /**
     * Case 6.1: 应该支持分页查询
     * 业务场景：管理后台查看告警列表
     *
     * 实际返回格式（扁平结构）：
     * {
     *   alerts: Array,
     *   total: number,
     *   page: number,
     *   page_size: number,
     *   total_pages: number
     * }
     */
    test('Case 6.1: 应该支持分页查询', async () => {
      const result = await MerchantRiskControlService.queryRiskAlerts(
        {}, // filters
        { page: 1, page_size: 10 } // pagination
      )

      // 验证分页结构（扁平结构）
      expect(result).toHaveProperty('alerts')
      expect(result).toHaveProperty('total')
      expect(result).toHaveProperty('page')
      expect(result).toHaveProperty('page_size')
      expect(Array.isArray(result.alerts)).toBe(true)

      console.log('[Case 6.1] 告警查询成功:', {
        total: result.total,
        returned: result.alerts.length
      })
    })

    /**
     * Case 6.2: 应该支持按状态筛选
     * 业务场景：查看待处理的告警
     */
    test('Case 6.2: 应该支持按状态筛选', async () => {
      const result = await MerchantRiskControlService.queryRiskAlerts(
        { status: 'pending' },
        { page: 1, page_size: 10 }
      )

      // 验证结果结构（扁平结构）
      expect(result).toHaveProperty('alerts')
      expect(result).toHaveProperty('total')

      // 如果有数据，验证状态
      if (result.alerts.length > 0) {
        result.alerts.forEach(alert => {
          expect(alert.status).toBe('pending')
        })
      }

      console.log('[Case 6.2] 状态筛选成功:', {
        total_pending: result.total
      })
    })
  })

  // ==================== 7. 统计信息测试 ====================
  describe('getStatsSummary - 统计摘要', () => {
    /**
     * Case 7.1: 应该返回完整的统计数据
     * 业务场景：管理仪表盘展示风控统计
     *
     * 实际方法名是 getStatsSummary（非 getSummaryStats）
     */
    test('Case 7.1: 应该返回完整的统计数据', async () => {
      const stats = await MerchantRiskControlService.getStatsSummary()

      // 验证统计结构
      expect(stats).toHaveProperty('total')
      expect(stats).toHaveProperty('by_status')
      expect(stats).toHaveProperty('by_type')
      expect(stats).toHaveProperty('by_severity')

      // 验证类型
      expect(typeof stats.total).toBe('number')
      expect(typeof stats.blocked_count).toBe('number')
      expect(typeof stats.today_count).toBe('number')

      console.log('[Case 7.1] 统计摘要:', stats)
    })
  })

  // ==================== 8. 门店统计测试 ====================
  describe('getStoreStats - 门店风控统计', () => {
    /**
     * Case 8.1: 应该返回门店级别的统计
     * 业务场景：门店管理员查看本店风控情况
     */
    test('Case 8.1: 应该返回门店级别的统计', async () => {
      const stats = await MerchantRiskControlService.getStoreStats(testStoreId)

      // 验证统计结构
      expect(stats).toHaveProperty('store_id')
      expect(stats).toHaveProperty('total')
      expect(stats).toHaveProperty('pending')
      expect(stats).toHaveProperty('blocked')
      expect(stats).toHaveProperty('by_type')

      // 验证门店ID
      expect(stats.store_id).toBe(testStoreId)

      console.log('[Case 8.1] 门店统计:', stats)
    })
  })

  // ==================== 9. 告警类型列表测试 ====================
  describe('getAlertTypesList - 告警类型列表', () => {
    /**
     * Case 9.1: 应该返回告警类型和状态列表
     * 业务场景：前端下拉框选项数据
     */
    test('Case 9.1: 应该返回告警类型和状态列表', async () => {
      const lists = await MerchantRiskControlService.getAlertTypesList()

      // 验证结构
      expect(lists).toHaveProperty('alert_types')
      expect(lists).toHaveProperty('severity_levels')
      expect(lists).toHaveProperty('alert_status')

      // 验证是数组
      expect(Array.isArray(lists.alert_types)).toBe(true)
      expect(Array.isArray(lists.severity_levels)).toBe(true)
      expect(Array.isArray(lists.alert_status)).toBe(true)

      console.log('[Case 9.1] 告警类型列表:', lists)
    })
  })
})
