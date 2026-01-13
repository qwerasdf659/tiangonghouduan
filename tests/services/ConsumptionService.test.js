/**
 * 餐厅积分抽奖系统 V4.5 - ConsumptionService 单元测试
 *
 * 测试范围：
 * - 架构决策1验证：二维码验证唯一真相源（路由层），服务层契约断言
 * - 架构决策2验证：分层参数校验（合约校验 + 业务校验）
 * - 架构决策3验证：UUID 到 ID 转换（user_uuid → user_id）
 * - 架构决策4验证：BusinessError 类使用
 * - 幂等性控制：idempotency_key 防重复提交
 * - 事务边界：强制 transaction 参数
 *
 * 创建时间：2026-01-13
 * 关联文档：docs/消费服务层QR码验证兼容模式清理方案-2026-01-13.md
 *
 * P1-9 重构说明：
 * - 服务通过 global.getTestService() 获取（J2-RepoWide）
 * - 使用 snake_case service key（E2-Strict）
 * - 模型仍直接 require（测试需要直接数据库操作）
 */

const { sequelize, User, Store } = require('../../models')
const BusinessError = require('../../utils/BusinessError')

/*
 * 🔴 P1-9：通过 ServiceManager 获取服务（替代直接 require）
 * 注意：在 beforeAll 中获取服务，确保 ServiceManager 已初始化
 */
let ConsumptionService

// 测试数据库配置
jest.setTimeout(30000)

describe('ConsumptionService - 消费记录服务', () => {
  let test_user
  let test_store_id
  let transaction

  // 测试前准备
  beforeAll(async () => {
    // 连接测试数据库
    await sequelize.authenticate()

    // 🔴 P1-9：通过 ServiceManager 获取服务实例（snake_case key）
    ConsumptionService = global.getTestService('consumption')

    // 获取一个可用的测试门店（用于创建记录的测试）
    const store = await Store.findOne({
      attributes: ['store_id', 'store_name']
    })
    if (store) {
      test_store_id = store.store_id
      console.log(`✅ 测试门店: store_id=${test_store_id}`)
    } else {
      console.warn('⚠️ 未找到测试门店，部分测试可能跳过')
    }
  })

  // 每个测试前创建测试数据
  beforeEach(async () => {
    // 使用测试用户
    test_user = await User.findOne({
      where: { mobile: '13612227930' }
    })

    if (!test_user) {
      throw new Error('测试用户不存在，请先创建 mobile=13612227930 的用户')
    }

    // 创建测试事务
    transaction = await sequelize.transaction()
  })

  // 每个测试后回滚事务
  afterEach(async () => {
    if (transaction && !transaction.finished) {
      await transaction.rollback()
    }
  })

  // 测试后关闭连接
  afterAll(async () => {
    await sequelize.close()
  })

  // ==================== 架构决策1：二维码验证唯一真相源 ====================

  describe('架构决策1：user_uuid 必须由路由层传入', () => {
    it('缺少 user_uuid 时应抛出 CONSUMPTION_MISSING_USER_UUID 错误', async () => {
      /**
       * 测试场景：调用方未传入 user_uuid
       * 预期结果：抛出 BusinessError，错误码为 CONSUMPTION_MISSING_USER_UUID
       * 架构意义：确保服务层不再自行验证二维码，强制要求路由层传入 user_uuid
       */
      const data = {
        qr_code: 'QRV2_test_qr_code',
        consumption_amount: 100,
        merchant_id: test_user.user_id,
        idempotency_key: `test_missing_uuid_${Date.now()}`
        // 故意不传 user_uuid
      }

      await expect(
        ConsumptionService.merchantSubmitConsumption(data, { transaction })
      ).rejects.toThrow('user_uuid 必须由路由层验证二维码后传入')

      // 验证抛出的是 BusinessError
      try {
        await ConsumptionService.merchantSubmitConsumption(data, { transaction })
      } catch (error) {
        expect(error).toBeInstanceOf(BusinessError)
        expect(error.code).toBe('CONSUMPTION_MISSING_USER_UUID')
        expect(error.statusCode).toBe(400)
        // 验证 details 包含诊断信息（仅用于日志）
        expect(error.details).toHaveProperty('received_data_keys')
        expect(error.details.received_data_keys).not.toContain('user_uuid')
      }
    })

    it('传入无效的 user_uuid 时应抛出 CONSUMPTION_USER_NOT_FOUND 错误', async () => {
      /**
       * 测试场景：传入不存在的 user_uuid
       * 预期结果：抛出 BusinessError，错误码为 CONSUMPTION_USER_NOT_FOUND
       * 架构意义：验证 UUID 到 ID 转换失败的处理
       */
      const data = {
        qr_code: 'QRV2_test_qr_code',
        user_uuid: 'non-existent-uuid-12345678',
        consumption_amount: 100,
        merchant_id: test_user.user_id,
        idempotency_key: `test_invalid_uuid_${Date.now()}`
      }

      await expect(
        ConsumptionService.merchantSubmitConsumption(data, { transaction })
      ).rejects.toThrow('用户不存在')

      try {
        await ConsumptionService.merchantSubmitConsumption(data, { transaction })
      } catch (error) {
        expect(error).toBeInstanceOf(BusinessError)
        expect(error.code).toBe('CONSUMPTION_USER_NOT_FOUND')
        expect(error.statusCode).toBe(404)
      }
    })

    it('传入有效的 user_uuid 时应成功创建消费记录', async () => {
      /**
       * 测试场景：正常流程 - 路由层已验证二维码并传入 user_uuid
       * 预期结果：成功创建消费记录
       * 架构意义：验证新架构下的正常工作流程
       */
      if (!test_store_id) {
        console.warn('⚠️ 跳过测试：未找到测试门店')
        return
      }

      const data = {
        qr_code: 'QRV2_test_valid_qr_code',
        user_uuid: test_user.user_uuid, // 使用测试用户的真实 user_uuid
        consumption_amount: 100,
        merchant_id: test_user.user_id,
        store_id: test_store_id, // 使用测试门店
        idempotency_key: `test_valid_uuid_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
      }

      const result = await ConsumptionService.merchantSubmitConsumption(data, { transaction })

      // 验证返回结果
      expect(result).toBeDefined()
      expect(result.record || result).toHaveProperty('record_id')
      expect(result.record || result).toHaveProperty('user_id', test_user.user_id)
      expect(result.record || result).toHaveProperty('status', 'pending')
      expect(result.record || result).toHaveProperty('points_to_award', 100)
    })
  })

  // ==================== 架构决策2：分层参数校验 ====================

  describe('架构决策2：服务层合约校验', () => {
    it('缺少 qr_code 时应抛出 MISSING_REQUIRED_PARAM 错误', async () => {
      /**
       * 测试场景：缺少必需参数 qr_code
       * 预期结果：抛出 BusinessError，错误码为 MISSING_REQUIRED_PARAM
       */
      const data = {
        user_uuid: test_user.user_uuid,
        consumption_amount: 100,
        merchant_id: test_user.user_id,
        idempotency_key: `test_no_qrcode_${Date.now()}`
        // 故意不传 qr_code
      }

      await expect(
        ConsumptionService.merchantSubmitConsumption(data, { transaction })
      ).rejects.toThrow('二维码不能为空')
    })

    it('消费金额为0或负数时应抛出 CONSUMPTION_INVALID_AMOUNT 错误', async () => {
      /**
       * 测试场景：消费金额无效（0或负数）
       * 预期结果：抛出 BusinessError，错误码为 CONSUMPTION_INVALID_AMOUNT
       * 业务规则：消费金额必须大于0
       */
      const data = {
        qr_code: 'QRV2_test_qr_code',
        user_uuid: test_user.user_uuid,
        consumption_amount: 0, // 无效金额
        merchant_id: test_user.user_id,
        idempotency_key: `test_zero_amount_${Date.now()}`
      }

      await expect(
        ConsumptionService.merchantSubmitConsumption(data, { transaction })
      ).rejects.toThrow('消费金额必须大于0')

      try {
        await ConsumptionService.merchantSubmitConsumption(data, { transaction })
      } catch (error) {
        expect(error).toBeInstanceOf(BusinessError)
        expect(error.code).toBe('CONSUMPTION_INVALID_AMOUNT')
      }
    })

    it('消费金额超过上限时应抛出 CONSUMPTION_AMOUNT_EXCEEDED 错误', async () => {
      /**
       * 测试场景：消费金额超过业务上限（99999.99元）
       * 预期结果：抛出 BusinessError，错误码为 CONSUMPTION_AMOUNT_EXCEEDED
       */
      const data = {
        qr_code: 'QRV2_test_qr_code',
        user_uuid: test_user.user_uuid,
        consumption_amount: 100000, // 超过上限
        merchant_id: test_user.user_id,
        idempotency_key: `test_exceed_amount_${Date.now()}`
      }

      await expect(
        ConsumptionService.merchantSubmitConsumption(data, { transaction })
      ).rejects.toThrow('消费金额超过上限')

      try {
        await ConsumptionService.merchantSubmitConsumption(data, { transaction })
      } catch (error) {
        expect(error).toBeInstanceOf(BusinessError)
        expect(error.code).toBe('CONSUMPTION_AMOUNT_EXCEEDED')
        expect(error.details).toHaveProperty('max_amount', 99999.99)
      }
    })

    it('缺少 idempotency_key 时应抛出 CONSUMPTION_MISSING_IDEMPOTENCY_KEY 错误', async () => {
      /**
       * 测试场景：缺少幂等键
       * 预期结果：抛出 BusinessError，错误码为 CONSUMPTION_MISSING_IDEMPOTENCY_KEY
       * 业务规则：业界标准形态 - 幂等键必须由调用方提供
       */
      const data = {
        qr_code: 'QRV2_test_qr_code',
        user_uuid: test_user.user_uuid,
        consumption_amount: 100,
        merchant_id: test_user.user_id
        // 故意不传 idempotency_key
      }

      await expect(
        ConsumptionService.merchantSubmitConsumption(data, { transaction })
      ).rejects.toThrow('缺少幂等键')

      try {
        await ConsumptionService.merchantSubmitConsumption(data, { transaction })
      } catch (error) {
        expect(error).toBeInstanceOf(BusinessError)
        expect(error.code).toBe('CONSUMPTION_MISSING_IDEMPOTENCY_KEY')
      }
    })
  })

  // ==================== 架构决策3：UUID 到 ID 转换 ====================

  describe('架构决策3：UUID 到 ID 转换', () => {
    it('应正确将 user_uuid 转换为内部 user_id', async () => {
      /**
       * 测试场景：验证 UUID 到 ID 的转换
       * 预期结果：消费记录中使用内部 user_id，而非 user_uuid
       * 架构意义：外部 API 使用 user_uuid（安全），内部使用 user_id（性能）
       */
      if (!test_store_id) {
        console.warn('⚠️ 跳过测试：未找到测试门店')
        return
      }

      const data = {
        qr_code: 'QRV2_test_uuid_conversion',
        user_uuid: test_user.user_uuid,
        consumption_amount: 50,
        merchant_id: test_user.user_id,
        store_id: test_store_id, // 使用测试门店
        idempotency_key: `test_uuid_conversion_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
      }

      const result = await ConsumptionService.merchantSubmitConsumption(data, { transaction })
      const record = result.record || result

      // 验证 user_id 正确转换
      expect(record.user_id).toBe(test_user.user_id)
      expect(typeof record.user_id).toBe('number')

      /*
       * 验证记录中不直接存储 user_uuid（存储的是 user_id）
       * 注意：ConsumptionRecord 模型不包含 user_uuid 字段
       */
    })
  })

  // ==================== 架构决策4：BusinessError 使用 ====================

  describe('架构决策4：BusinessError 类使用', () => {
    it('所有业务错误应使用 BusinessError 类', async () => {
      /**
       * 测试场景：验证服务层抛出的错误类型
       * 预期结果：所有业务错误都是 BusinessError 实例
       * 架构意义：统一错误处理，区分业务错误和系统错误
       */
      const testCases = [
        {
          name: '缺少 user_uuid',
          data: {
            qr_code: 'QRV2_test',
            consumption_amount: 100,
            merchant_id: test_user.user_id,
            idempotency_key: 'test_1'
          },
          expectedCode: 'CONSUMPTION_MISSING_USER_UUID'
        },
        {
          name: '用户不存在',
          data: {
            qr_code: 'QRV2_test',
            user_uuid: 'invalid-uuid',
            consumption_amount: 100,
            merchant_id: test_user.user_id,
            idempotency_key: 'test_2'
          },
          expectedCode: 'CONSUMPTION_USER_NOT_FOUND'
        },
        {
          name: '金额无效',
          data: {
            qr_code: 'QRV2_test',
            user_uuid: test_user.user_uuid,
            consumption_amount: -1,
            merchant_id: test_user.user_id,
            idempotency_key: 'test_3'
          },
          expectedCode: 'CONSUMPTION_INVALID_AMOUNT'
        }
      ]

      for (const testCase of testCases) {
        await expect(
          ConsumptionService.merchantSubmitConsumption(testCase.data, { transaction })
        ).rejects.toMatchObject({
          code: testCase.expectedCode
        })
      }
    })

    it('BusinessError 应支持 toAPIResponse 方法', async () => {
      /**
       * 测试场景：验证 BusinessError.toAPIResponse() 方法
       * 预期结果：返回标准 API 响应格式
       */
      const data = {
        qr_code: 'QRV2_test',
        consumption_amount: 100,
        merchant_id: test_user.user_id,
        idempotency_key: 'test_api_response'
        // 故意不传 user_uuid
      }

      try {
        await ConsumptionService.merchantSubmitConsumption(data, { transaction })
      } catch (error) {
        const apiResponse = error.toAPIResponse('req_test_123')

        expect(apiResponse).toHaveProperty('success', false)
        expect(apiResponse).toHaveProperty('code', 'CONSUMPTION_MISSING_USER_UUID')
        expect(apiResponse).toHaveProperty('message')
        expect(apiResponse).toHaveProperty('data', null)
        expect(apiResponse).toHaveProperty('timestamp')
        expect(apiResponse).toHaveProperty('request_id', 'req_test_123')
      }
    })

    it('BusinessError 应支持 toLogFormat 方法', async () => {
      /**
       * 测试场景：验证 BusinessError.toLogFormat() 方法
       * 预期结果：返回结构化日志格式（包含 details）
       */
      const data = {
        qr_code: 'QRV2_test',
        consumption_amount: 100,
        merchant_id: test_user.user_id,
        idempotency_key: 'test_log_format'
        // 故意不传 user_uuid
      }

      try {
        await ConsumptionService.merchantSubmitConsumption(data, { transaction })
      } catch (error) {
        const logFormat = error.toLogFormat('req_test_456')

        expect(logFormat).toHaveProperty('error_type', 'BusinessError')
        expect(logFormat).toHaveProperty('code', 'CONSUMPTION_MISSING_USER_UUID')
        expect(logFormat).toHaveProperty('message')
        expect(logFormat).toHaveProperty('status_code', 400)
        expect(logFormat).toHaveProperty('details')
        expect(logFormat).toHaveProperty('request_id', 'req_test_456')
        expect(logFormat).toHaveProperty('stack')
      }
    })
  })

  // ==================== 幂等性控制 ====================

  describe('幂等性控制', () => {
    it('相同 idempotency_key 应返回已有记录', async () => {
      /**
       * 测试场景：重复提交相同幂等键
       * 预期结果：返回已有记录，is_duplicate = true
       * 业务规则：幂等性保护，防止重复提交
       */
      if (!test_store_id) {
        console.warn('⚠️ 跳过测试：未找到测试门店')
        return
      }

      const idempotencyKey = `test_idempotency_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
      const data = {
        qr_code: 'QRV2_test_idempotent',
        user_uuid: test_user.user_uuid,
        consumption_amount: 88,
        merchant_id: test_user.user_id,
        store_id: test_store_id, // 使用测试门店
        idempotency_key: idempotencyKey
      }

      // 第一次提交
      const result1 = await ConsumptionService.merchantSubmitConsumption(data, { transaction })
      const record1 = result1.record || result1

      // 第二次提交（相同幂等键）
      const result2 = await ConsumptionService.merchantSubmitConsumption(data, { transaction })

      // 验证返回相同记录
      expect(result2.is_duplicate).toBe(true)
      // 使用 == 进行宽松比较，因为数据库返回可能是字符串
      expect(String(result2.record.record_id)).toBe(String(record1.record_id))
    })
  })

  // ==================== 事务边界 ====================

  describe('事务边界强制要求', () => {
    it('缺少 transaction 参数时应抛出错误', async () => {
      /**
       * 测试场景：未传入事务参数
       * 预期结果：抛出事务边界错误
       * 架构意义：强制事务边界，确保数据一致性
       */
      const data = {
        qr_code: 'QRV2_test_no_transaction',
        user_uuid: test_user.user_uuid,
        consumption_amount: 100,
        merchant_id: test_user.user_id,
        idempotency_key: `test_no_transaction_${Date.now()}`
      }

      // 不传 transaction
      await expect(ConsumptionService.merchantSubmitConsumption(data, {})).rejects.toThrow()
    })
  })

  // ==================== 积分计算验证 ====================

  describe('积分计算规则', () => {
    it('应按 1元=1分 规则计算积分（四舍五入）', async () => {
      /**
       * 测试场景：验证积分计算规则
       * 预期结果：points_to_award = Math.round(consumption_amount)
       */
      if (!test_store_id) {
        console.warn('⚠️ 跳过测试：未找到测试门店')
        return
      }

      const testCases = [
        { amount: 100, expectedPoints: 100 },
        { amount: 88.5, expectedPoints: 89 }, // 四舍五入
        { amount: 88.4, expectedPoints: 88 }, // 四舍五入
        { amount: 0.5, expectedPoints: 1 } // 最小积分
      ]

      for (const testCase of testCases) {
        const localTransaction = await sequelize.transaction()
        try {
          const data = {
            qr_code: `QRV2_test_points_${testCase.amount}`,
            user_uuid: test_user.user_uuid,
            consumption_amount: testCase.amount,
            merchant_id: test_user.user_id,
            store_id: test_store_id, // 使用测试门店
            idempotency_key: `test_points_${testCase.amount}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
          }

          const result = await ConsumptionService.merchantSubmitConsumption(data, {
            transaction: localTransaction
          })
          const record = result.record || result

          expect(record.points_to_award).toBe(testCase.expectedPoints)
        } finally {
          await localTransaction.rollback()
        }
      }
    })
  })
})
