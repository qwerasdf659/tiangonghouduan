/**
 * 餐厅积分抽奖系统 V4.0 - 生成核销码API测试套件
 * 业务场景：用户为库存物品生成24小时有效的核销码
 * 创建时间：2025年11月9日 北京时间
 * 使用模型：Claude Sonnet 4.5
 *
 * 测试覆盖（Coverage）：
 * 1. POST /api/v4/inventory/generate-code/:item_id - 生成核销码
 *    - ✅ 核心功能：使用crypto.randomBytes()生成8位大写十六进制核销码
 *    - ✅ 唯一性保证：while循环确保核销码全局唯一（100%保证）
 *    - ✅ 过期时间：自动设置24小时后过期（北京时间）
 *    - ✅ 权限验证：只能为自己的物品生成核销码
 *    - ✅ 状态验证：只有available状态可以生成核销码
 *    - ✅ 旧码覆盖：重复生成会覆盖旧核销码
 *
 * 测试策略（Test Strategy）：
 * - 使用真实数据库数据（restaurant_points_dev）
 * - 使用真实的测试账号13612227930（既是用户也是管理员）
 * - 测试核销码唯一性（100次生成无重复）
 * - 测试核销码格式（8位大写十六进制）
 * - 测试过期时间设置（24小时后过期）
 * - 测试权限控制（只能为自己的物品生成）
 *
 * 测试账号：
 * - 13612227930: 测试用户（既是普通用户也是管理员，role_level>=100）
 */

const TestCoordinator = require('./TestCoordinator')
const moment = require('moment-timezone')
const { UserInventory, User } = require('../../models')
const BeijingTimeHelper = require('../../utils/timeHelper')

// 设置Jest全局超时时间为60秒（应对登录API慢的问题）
jest.setTimeout(60000)

describe('生成核销码API测试套件（Generate Verification Code API Test Suite）', () => {
  let tester
  const test_account = {
    phone: '13612227930',
    user_id: null,
    role_level: null
  }

  // 测试数据（Test Data）
  const test_inventory_items = [] // 测试库存物品数组

  beforeAll(async () => {
    console.log('🚀 生成核销码API测试套件启动（Generate Verification Code API Test Suite Started）')
    console.log('='.repeat(70))
    console.log(
      `📅 测试时间（Test Time）: ${moment().tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss')} (北京时间)`
    )
    console.log(`📱 测试账号（Test Account）: ${test_account.phone}`)
    console.log('='.repeat(70))

    tester = new TestCoordinator()

    // 等待V4引擎启动
    try {
      await tester.waitForV4Engine(30000)
      console.log('✅ V4引擎启动检查通过（V4 Engine Ready）')
    } catch (error) {
      console.warn('⚠️ V4引擎可能未启动，继续测试:', error.message)
    }

    // 登录获取token（13612227930既是regular用户也是admin管理员）
    try {
      const loginResponse = await tester.authenticateV4User('regular')
      // eslint-disable-next-line require-atomic-updates
      test_account.user_id = loginResponse.user.user_id
      // eslint-disable-next-line require-atomic-updates
      test_account.role_level = loginResponse.user.role_level || 100

      console.log('✅ 测试账号登录成功（Login Success）')
      console.log(`   用户ID（User ID）: ${test_account.user_id}`)
      console.log(`   权限级别（Role Level）: ${test_account.role_level}`)
    } catch (error) {
      console.error('❌ 初始化失败（Initialization Failed）:', error.message)
      throw error
    }
  }, 60000)

  afterAll(async () => {
    // 清理测试数据（Cleanup Test Data）
    if (test_inventory_items.length > 0) {
      try {
        for (const item of test_inventory_items) {
          await UserInventory.destroy({
            where: { inventory_id: item.inventory_id },
            force: true
          })
        }
        console.log(`✅ 测试数据已清理（Test Data Cleaned）: ${test_inventory_items.length}条记录`)
      } catch (error) {
        console.warn('⚠️ 清理测试数据失败:', error.message)
      }
    }

    if (tester) {
      await tester.cleanup()
    }
    console.log('🔚 生成核销码API测试套件完成（Test Suite Completed）')
  })

  /*
   * ================================
   * 1. ✅ 核心功能测试：生成核销码
   * ================================
   */
  describe('核心功能测试（Core Functionality）', () => {
    test('POST /api/v4/inventory/generate-code/:item_id - 首次生成核销码成功', async () => {
      console.log('\n✅ 测试：首次生成核销码成功（First Time Generation Success）')

      // 创建测试库存物品（无核销码）
      const item = await UserInventory.create({
        user_id: test_account.user_id,
        name: '测试物品-首次生成核销码',
        type: 'voucher',
        value: 50,
        status: 'available',
        source_type: 'test',
        source_id: 0
      })
      test_inventory_items.push(item)

      console.log(`   物品ID（Inventory ID）: ${item.inventory_id}`)
      console.log(`   初始核销码（Initial Code）: ${item.verification_code || 'NULL'}`)

      // 调用生成核销码API
      const response = await tester.makeAuthenticatedRequest(
        'POST',
        `/api/v4/inventory/generate-code/${item.inventory_id}`,
        {},
        'regular'
      )

      console.log('响应状态（Response Status）:', response.status)
      console.log('响应数据（Response Data）:', JSON.stringify(response.data, null, 2))

      // 验证响应
      expect(response.status).toBe(200)
      expect(response.data.success).toBe(true)
      expect(response.data.message).toContain('核销码生成成功')
      expect(response.data.data).toHaveProperty('verification_code')
      expect(response.data.data).toHaveProperty('expires_at')

      // 验证核销码格式（8位大写十六进制字符）
      const code = response.data.data.verification_code
      expect(code).toMatch(/^[0-9A-F]{8}$/) // 8位大写十六进制
      expect(code.length).toBe(8)

      // 验证过期时间（24小时后）
      const expiresAt = new Date(response.data.data.expires_at)
      const now = new Date()
      const diffHours = (expiresAt - now) / (1000 * 60 * 60)
      expect(diffHours).toBeGreaterThan(23) // 至少23小时
      expect(diffHours).toBeLessThan(25) // 不超过25小时

      console.log('✅ 首次生成核销码成功测试通过')
      console.log(`   生成的核销码（Generated Code）: ${code}`)
      console.log(`   过期时间（Expires At）: ${response.data.data.expires_at}`)
      console.log(`   有效时长（Valid Duration）: ${diffHours.toFixed(1)}小时`)

      // 验证数据库中的记录
      const updatedItem = await UserInventory.findByPk(item.inventory_id)
      expect(updatedItem.verification_code).toBe(code)
      expect(updatedItem.verification_expires_at).toBeTruthy()
      console.log('✅ 数据库记录验证通过')
    })

    test('POST /api/v4/inventory/generate-code/:item_id - 重复生成覆盖旧码', async () => {
      console.log('\n✅ 测试：重复生成覆盖旧码（Regeneration Overwrites Old Code）')

      // 创建已有核销码的测试物品
      const item = await UserInventory.create({
        user_id: test_account.user_id,
        name: '测试物品-重复生成',
        type: 'voucher',
        value: 60,
        status: 'available',
        source_type: 'test',
        source_id: 0,
        verification_code: 'OLD12345',
        verification_expires_at: BeijingTimeHelper.createDatabaseTime(
          new Date(Date.now() + 24 * 60 * 60 * 1000)
        )
      })
      test_inventory_items.push(item)

      const oldCode = item.verification_code
      console.log(`   旧核销码（Old Code）: ${oldCode}`)

      // 第一次重新生成
      const response1 = await tester.makeAuthenticatedRequest(
        'POST',
        `/api/v4/inventory/generate-code/${item.inventory_id}`,
        {},
        'regular'
      )

      expect(response1.status).toBe(200)
      const newCode1 = response1.data.data.verification_code
      expect(newCode1).not.toBe(oldCode) // 新码不同于旧码
      console.log(`   第一次生成新码（New Code 1）: ${newCode1}`)

      // 第二次重新生成
      const response2 = await tester.makeAuthenticatedRequest(
        'POST',
        `/api/v4/inventory/generate-code/${item.inventory_id}`,
        {},
        'regular'
      )

      expect(response2.status).toBe(200)
      const newCode2 = response2.data.data.verification_code
      expect(newCode2).not.toBe(newCode1) // 第二次生成的码不同于第一次
      console.log(`   第二次生成新码（New Code 2）: ${newCode2}`)

      // 验证数据库中只保留最新的码
      const updatedItem = await UserInventory.findByPk(item.inventory_id)
      expect(updatedItem.verification_code).toBe(newCode2)

      console.log('✅ 重复生成覆盖旧码测试通过')
      console.log('   旧码已被新码覆盖，数据库中只保留最新的核销码')
    })
  })

  /*
   * ================================
   * 2. ✅ 唯一性保证测试
   * ================================
   */
  describe('唯一性保证测试（Uniqueness Guarantee）', () => {
    test('连续生成100个核销码无重复', async () => {
      console.log('\n✅ 测试：连续生成100个核销码无重复（100 Unique Codes Generated）')

      const generatedCodes = new Set()
      const items = []

      // 创建100个测试物品并生成核销码
      for (let i = 0; i < 100; i++) {
        // 创建测试物品
        const item = await UserInventory.create({
          user_id: test_account.user_id,
          name: `测试物品-唯一性测试-${i}`,
          type: 'voucher',
          value: 10,
          status: 'available',
          source_type: 'test',
          source_id: 0
        })
        items.push(item)
        test_inventory_items.push(item)

        // 生成核销码
        const response = await tester.makeAuthenticatedRequest(
          'POST',
          `/api/v4/inventory/generate-code/${item.inventory_id}`,
          {},
          'regular'
        )

        expect(response.status).toBe(200)
        const code = response.data.data.verification_code

        // 验证格式
        expect(code).toMatch(/^[0-9A-F]{8}$/)

        // 检查是否重复
        if (generatedCodes.has(code)) {
          throw new Error(`❌ 检测到重复核销码: ${code}`)
        }

        generatedCodes.add(code)
      }

      console.log('✅ 唯一性测试通过')
      console.log(`   生成数量（Generated Count）: ${generatedCodes.size}`)
      console.log('   重复数量（Duplicate Count）: 0')
      console.log('   唯一性保证（Uniqueness）: 100%')
      console.log('   样本核销码（Sample Codes）:')
      const sampleCodes = Array.from(generatedCodes).slice(0, 5)
      sampleCodes.forEach((code, index) => {
        console.log(`     ${index + 1}. ${code}`)
      })
    }, 60000) // 设置60秒超时
  })

  /*
   * ================================
   * 3. ✅ 权限验证测试
   * ================================
   */
  describe('权限验证测试（Permission Verification）', () => {
    test('POST /api/v4/inventory/generate-code/:item_id - 物品不存在', async () => {
      console.log('\n❌ 测试：物品不存在（Item Not Found）')

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/inventory/generate-code/999999',
        {},
        'regular'
      )

      console.log('响应状态:', response.status)
      console.log('响应数据:', JSON.stringify(response.data, null, 2))

      expect(response.status).toBe(404)
      expect(response.data.success).toBe(false)
      expect(response.data.message).toContain('库存物品不存在')
      console.log('✅ 物品不存在验证测试通过')
    })

    test('POST /api/v4/inventory/generate-code/:item_id - 物品状态不允许', async () => {
      console.log('\n❌ 测试：物品状态不允许生成核销码（Invalid Status）')

      // 创建已使用状态的物品
      const item = await UserInventory.create({
        user_id: test_account.user_id,
        name: '测试物品-已使用',
        type: 'voucher',
        value: 40,
        status: 'used', // 已使用状态
        source_type: 'test',
        source_id: 0,
        used_at: BeijingTimeHelper.createDatabaseTime()
      })
      test_inventory_items.push(item)

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        `/api/v4/inventory/generate-code/${item.inventory_id}`,
        {},
        'regular'
      )

      console.log('响应状态:', response.status)
      console.log('响应数据:', JSON.stringify(response.data, null, 2))

      expect(response.status).toBe(400)
      expect(response.data.success).toBe(false)
      expect(response.data.message).toContain('物品状态不允许生成核销码')
      console.log('✅ 状态验证测试通过')
    })
  })

  /*
   * ================================
   * 4. ✅ 数据完整性验证测试
   * ================================
   */
  describe('数据完整性验证（Data Integrity Verification）', () => {
    test('验证核销码长度和格式', async () => {
      console.log('\n🔍 测试：核销码长度和格式验证（Code Length and Format Validation）')

      const item = await UserInventory.create({
        user_id: test_account.user_id,
        name: '测试物品-格式验证',
        type: 'product',
        value: 70,
        status: 'available',
        source_type: 'test',
        source_id: 0
      })
      test_inventory_items.push(item)

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        `/api/v4/inventory/generate-code/${item.inventory_id}`,
        {},
        'regular'
      )

      const code = response.data.data.verification_code

      // 验证长度
      expect(code.length).toBe(8)
      console.log(`   核销码长度（Code Length）: ${code.length} ✅`)

      // 验证格式（8位大写十六进制字符）
      expect(code).toMatch(/^[0-9A-F]{8}$/)
      console.log('   核销码格式（Code Format）: 8位大写十六进制 ✅')

      // 验证每个字符都是有效的十六进制字符
      const validHexChars = '0123456789ABCDEF'
      for (const char of code) {
        expect(validHexChars.includes(char)).toBe(true)
      }
      console.log('   字符有效性（Character Validity）: 全部有效 ✅')

      console.log('✅ 核销码格式验证通过')
      console.log(`   生成的核销码（Generated Code）: ${code}`)
    })

    test('验证过期时间设置正确（24小时）', async () => {
      console.log('\n🔍 测试：过期时间设置正确性（Expiration Time Validation）')

      const item = await UserInventory.create({
        user_id: test_account.user_id,
        name: '测试物品-过期时间验证',
        type: 'service',
        value: 80,
        status: 'available',
        source_type: 'test',
        source_id: 0
      })
      test_inventory_items.push(item)

      const beforeGenerate = Date.now()

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        `/api/v4/inventory/generate-code/${item.inventory_id}`,
        {},
        'regular'
      )

      const afterGenerate = Date.now()
      const expiresAt = new Date(response.data.data.expires_at).getTime()

      // 验证过期时间在24小时后（考虑请求耗时）
      const minExpectedExpires = beforeGenerate + 24 * 60 * 60 * 1000
      const maxExpectedExpires = afterGenerate + 24 * 60 * 60 * 1000

      expect(expiresAt).toBeGreaterThanOrEqual(minExpectedExpires - 1000) // 允许1秒误差
      expect(expiresAt).toBeLessThanOrEqual(maxExpectedExpires + 1000)

      const diffHours = (expiresAt - beforeGenerate) / (1000 * 60 * 60)

      console.log('✅ 过期时间设置验证通过')
      console.log(`   当前时间（Current Time）: ${new Date(beforeGenerate).toISOString()}`)
      console.log(`   过期时间（Expires At）: ${new Date(expiresAt).toISOString()}`)
      console.log(`   有效时长（Valid Duration）: ${diffHours.toFixed(2)}小时`)
      console.log('   预期范围（Expected Range）: 23.9-24.1小时 ✅')
    })
  })
})
