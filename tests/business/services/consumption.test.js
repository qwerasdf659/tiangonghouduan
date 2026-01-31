/**
 * 消费服务层单元测试
 *
 * 测试场景：
 * 1. 契约断言 - user_uuid 必填验证
 * 2. BusinessError 使用验证
 * 3. 消费域错误码使用验证
 * 4. merchantSubmitConsumption 核心流程
 *
 * 架构决策验证：
 * - 决策1：删除服务层兼容分支（user_uuid 必须由路由层传入）
 * - 决策4：BusinessError + 统一错误码体系
 *
 * 创建时间：2026年01月13日
 * 业务场景：消费服务层QR码验证兼容模式清理方案
 *
 * P1-9 改造说明：
 * - ConsumptionService 通过 ServiceManager 获取（snake_case: consumption）
 * - 模型直接引用用于测试数据准备/验证
 */

const { User, ConsumptionRecord, Store } = require('../../../models')
const BusinessError = require('../../../utils/BusinessError')
const ErrorCodes = require('../../../constants/ErrorCodes')
const TransactionManager = require('../../../utils/TransactionManager')
const { TEST_DATA } = require('../../helpers/test-data')

// 通过 ServiceManager 获取服务
let ConsumptionService

describe('ConsumptionService - 消费服务层单元测试', () => {
  let testUser
  let testMerchantId
  let testStoreId // 真实门店ID（从数据库获取）

  beforeAll(async () => {
    // 通过 ServiceManager 获取服务实例（snake_case key）
    ConsumptionService = global.getTestService('consumption_core')

    // 获取测试用户（既是用户也是管理员）
    testUser = await User.findOne({
      where: { mobile: TEST_DATA.users.testUser.mobile }
    })

    if (!testUser) {
      throw new Error('测试用户不存在，请确保数据库有测试数据')
    }

    // 获取真实门店ID（外键约束要求门店必须存在）
    const store = await Store.findOne({
      order: [['store_id', 'ASC']]
    })

    if (!store) {
      throw new Error('没有可用的门店数据，请确保数据库有门店记录')
    }

    testStoreId = store.store_id
    testMerchantId = testUser.user_id
    console.log(`✅ 测试用户加载成功，user_id: ${testUser.user_id}`)
    console.log(`✅ 测试门店加载成功，store_id: ${testStoreId}`)
  })

  afterAll(async () => {
    // 清理测试数据（如有必要）
    console.log('🔚 消费服务层单元测试完成')
  })

  /*
   * ================================
   * 1. 架构决策1验证：契约断言
   * ================================
   */
  describe('架构决策1验证 - 契约断言（user_uuid 必填）', () => {
    // 测试用的模拟二维码（用于满足 qr_code 必填要求）
    const mockQrCode = 'QRV2_test_mock_code_for_unit_test'

    it('缺少 user_uuid 时应抛出 BusinessError', async () => {
      // 准备：传 qr_code 但不传 user_uuid
      const consumptionData = {
        qr_code: mockQrCode,
        consumption_amount: 100,
        merchant_id: testMerchantId,
        store_id: testStoreId, // 使用真实门店ID
        idempotency_key: `test_no_uuid_${Date.now()}`
        // 故意不传 user_uuid
      }

      // 执行 & 验证
      await expect(
        TransactionManager.execute(async transaction => {
          return await ConsumptionService.merchantSubmitConsumption(consumptionData, {
            transaction
          })
        })
      ).rejects.toThrow(BusinessError)
    })

    it('缺少 user_uuid 时错误码应为 CONSUMPTION_MISSING_USER_UUID', async () => {
      const consumptionData = {
        qr_code: mockQrCode,
        consumption_amount: 100,
        merchant_id: testMerchantId,
        store_id: testStoreId, // 使用真实门店ID
        idempotency_key: `test_no_uuid_code_${Date.now()}`
      }

      try {
        await TransactionManager.execute(async transaction => {
          return await ConsumptionService.merchantSubmitConsumption(consumptionData, {
            transaction
          })
        })
        // 不应该到达这里
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(BusinessError)
        expect(error.code).toBe(ErrorCodes.CONSUMPTION_MISSING_USER_UUID)
        expect(error.statusCode).toBe(400)
        console.log(`✅ 错误码验证通过: ${error.code}`)
      }
    })

    it('空字符串 user_uuid 也应抛出 BusinessError', async () => {
      const consumptionData = {
        qr_code: mockQrCode,
        user_uuid: '', // 空字符串
        consumption_amount: 100,
        merchant_id: testMerchantId,
        store_id: testStoreId, // 使用真实门店ID
        idempotency_key: `test_empty_uuid_${Date.now()}`
      }

      await expect(
        TransactionManager.execute(async transaction => {
          return await ConsumptionService.merchantSubmitConsumption(consumptionData, {
            transaction
          })
        })
      ).rejects.toThrow(BusinessError)
    })
  })

  /*
   * ================================
   * 2. 架构决策4验证：用户不存在错误
   * ================================
   */
  describe('架构决策4验证 - 用户不存在处理', () => {
    // 测试用的模拟二维码
    const mockQrCode = 'QRV2_test_mock_code_for_user_not_found'

    it('不存在的 user_uuid 应抛出 CONSUMPTION_USER_NOT_FOUND', async () => {
      // 使用一个肯定不存在的 UUID
      const nonExistentUuid = 'non-existent-uuid-12345678'

      const consumptionData = {
        qr_code: mockQrCode,
        user_uuid: nonExistentUuid,
        consumption_amount: 100,
        merchant_id: testMerchantId,
        store_id: testStoreId, // 使用真实门店ID
        idempotency_key: `test_not_found_${Date.now()}`
      }

      try {
        await TransactionManager.execute(async transaction => {
          return await ConsumptionService.merchantSubmitConsumption(consumptionData, {
            transaction
          })
        })
        expect(true).toBe(false) // 不应到达
      } catch (error) {
        expect(error).toBeInstanceOf(BusinessError)
        expect(error.code).toBe(ErrorCodes.CONSUMPTION_USER_NOT_FOUND)
        expect(error.statusCode).toBe(404)
        console.log(`✅ 用户不存在错误码验证通过: ${error.code}`)
      }
    })
  })

  /*
   * ================================
   * 3. 正常业务流程验证
   * ================================
   */
  describe('正常业务流程验证', () => {
    // 测试用的模拟二维码（路由层验证后保存的完整二维码）
    const mockQrCode = 'QRV2_test_business_flow_mock'
    // 用于清理测试数据的记录ID列表
    const recordsToClean = []

    it('正确传入 user_uuid 应成功创建消费记录', async () => {
      // 使用真实用户的 user_uuid
      const consumptionData = {
        qr_code: mockQrCode,
        user_uuid: testUser.user_uuid,
        consumption_amount: 88.5,
        merchant_id: testMerchantId,
        store_id: testStoreId, // 使用真实门店ID
        merchant_notes: '单元测试消费记录',
        idempotency_key: `test_success_${Date.now()}_${Math.random().toString(36).substring(7)}`
      }

      const result = await TransactionManager.execute(async transaction => {
        return await ConsumptionService.merchantSubmitConsumption(consumptionData, { transaction })
      })

      // 处理返回格式（可能是 { record, is_duplicate } 或直接是 record）
      const record = result.record || result

      expect(record).toBeDefined()
      expect(record.record_id).toBeDefined()
      expect(record.user_id).toBe(testUser.user_id)
      expect(record.status).toBe('pending')
      expect(record.points_to_award).toBe(89) // 88.5 四舍五入 = 89

      recordsToClean.push(record.record_id)
      console.log(`✅ 消费记录创建成功，record_id: ${record.record_id}`)
    })

    it('幂等键重复时应返回 is_duplicate: true', async () => {
      // 复用上一个测试的幂等键
      const idempotencyKey = `test_duplicate_${Date.now()}`

      const consumptionData = {
        qr_code: mockQrCode,
        user_uuid: testUser.user_uuid,
        consumption_amount: 50,
        merchant_id: testMerchantId,
        store_id: testStoreId, // 使用真实门店ID
        idempotency_key: idempotencyKey
      }

      // 第一次调用
      const result1 = await TransactionManager.execute(async transaction => {
        return await ConsumptionService.merchantSubmitConsumption(consumptionData, { transaction })
      })

      const record1 = result1.record || result1
      recordsToClean.push(record1.record_id)

      // 第二次调用（相同幂等键）
      const result2 = await TransactionManager.execute(async transaction => {
        return await ConsumptionService.merchantSubmitConsumption(consumptionData, { transaction })
      })

      // 验证幂等性
      if (result2.is_duplicate !== undefined) {
        expect(result2.is_duplicate).toBe(true)
        const record2 = result2.record || result2
        // BIGINT类型可能导致字符串/数字类型不一致，转换为字符串比较
        expect(String(record2.record_id)).toBe(String(record1.record_id))
        console.log('✅ 幂等性验证通过，重复请求返回原记录')
      } else {
        // 如果服务层不返回 is_duplicate，验证记录ID相同
        expect(String(result2.record_id)).toBe(String(record1.record_id))
        console.log('✅ 幂等性验证通过（通过记录ID匹配）')
      }
    })

    afterAll(async () => {
      // 清理测试创建的消费记录
      for (const recordId of recordsToClean) {
        if (recordId) {
          try {
            await ConsumptionRecord.destroy({
              where: { record_id: recordId },
              force: true
            })
            console.log(`🧹 清理测试消费记录: ${recordId}`)
          } catch (error) {
            console.warn(`⚠️ 清理测试消费记录失败: ${error.message}`)
          }
        }
      }
    })
  })

  /*
   * ================================
   * 4. 金额验证
   * ================================
   */
  describe('消费金额验证', () => {
    const mockQrCode = 'QRV2_test_amount_validation'

    it('消费金额为0时应抛出错误', async () => {
      const consumptionData = {
        qr_code: mockQrCode,
        user_uuid: testUser.user_uuid,
        consumption_amount: 0,
        merchant_id: testMerchantId,
        store_id: testStoreId, // 使用真实门店ID
        idempotency_key: `test_zero_amount_${Date.now()}`
      }

      await expect(
        TransactionManager.execute(async transaction => {
          return await ConsumptionService.merchantSubmitConsumption(consumptionData, {
            transaction
          })
        })
      ).rejects.toThrow()
    })

    it('消费金额为负数时应抛出错误', async () => {
      const consumptionData = {
        qr_code: mockQrCode,
        user_uuid: testUser.user_uuid,
        consumption_amount: -50,
        merchant_id: testMerchantId,
        store_id: testStoreId, // 使用真实门店ID
        idempotency_key: `test_negative_amount_${Date.now()}`
      }

      await expect(
        TransactionManager.execute(async transaction => {
          return await ConsumptionService.merchantSubmitConsumption(consumptionData, {
            transaction
          })
        })
      ).rejects.toThrow()
    })
  })
})
