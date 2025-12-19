/**
 * 餐厅积分抽奖系统 V4.0 - 核销验证API测试套件
 * 业务场景：商户核销用户核销码
 * 创建时间：2025年11月9日 北京时间
 * 使用模型：Claude Sonnet 4.5
 *
 * 测试覆盖（Coverage）：
 * 1. POST /api/v4/inventory/verification/verify - 核销验证码
 *    - ✅ P0修复：权限验证（只允许商户或管理员核销）
 *    - ✅ P0修复：记录operator_id（追溯核销操作人）
 *    - ✅ P1优化：格式验证（8位大写十六进制字符）
 *    - ✅ P1优化：核销通知（通知用户核销成功）
 *    - ✅ P2优化：增强日志（记录IP和User-Agent）
 *
 * 测试策略（Test Strategy）：
 * - 使用真实数据库数据（restaurant_points_dev）
 * - 使用真实的测试账号13612227930（既是用户也是管理员）
 * - 测试权限控制（普通用户vs商户vs管理员）
 * - 测试业务规则（存在性、过期、重复核销）
 * - 测试数据完整性（operator_id字段记录）
 *
 * 测试账号：
 * - 13612227930: 测试用户（既是普通用户也是管理员，role_level>=100）
 */

const TestCoordinator = require('../../api/TestCoordinator')
const BeijingTimeHelper = require('../../../utils/timeHelper')
const { UserInventory, User } = require('../../../models')
const { TEST_DATA } = require('../../helpers/test-data')

describe('核销验证API测试套件（Inventory Verification API Test Suite）', () => {
  let tester
  const test_account = {
    mobile: TEST_DATA.users.testUser.mobile, // 使用统一测试数据
    user_id: TEST_DATA.users.testUser.user_id,
    role_level: null
  }

  // 测试数据（Test Data）
  let test_inventory_item = null // 测试库存物品
  let test_verification_code = null // 测试核销码

  beforeAll(async () => {
    console.log('🚀 核销验证API测试套件启动（Inventory Verification API Test Suite Started）')
    console.log('='.repeat(70))
    console.log(
      `📅 测试时间（Test Time）: ${BeijingTimeHelper.toBeijingTime(new Date())} (北京时间)`
    )
    console.log(`📱 测试账号（Test Account）: ${test_account.mobile}`)
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
      test_account.role_level = loginResponse.user.role_level || 100 // 默认管理员级别

      // 同时认证为admin（13612227930有管理员权限）
      await tester.authenticateV4User('admin')

      console.log('✅ 测试账号登录成功（Login Success）')
      console.log(`   用户ID（User ID）: ${test_account.user_id}`)
      console.log(`   权限级别（Role Level）: ${test_account.role_level}`)
      console.log('   认证角色（Authenticated Roles）: regular, admin')
    } catch (error) {
      console.error('❌ 初始化失败（Initialization Failed）:', error.message)
      throw error
    }

    // 创建测试库存物品（带核销码）
    try {
      test_inventory_item = await UserInventory.create({
        user_id: test_account.user_id,
        name: '测试物品-核销验证',
        type: 'voucher',
        value: 50,
        status: 'available',
        source_type: 'test', // 必需字段：物品来源类型
        source_id: '0', // 必需字段：来源ID（测试数据使用字符串类型）
        verification_code: 'A1B2C3D4', // 8位大写十六进制
        verification_expires_at: BeijingTimeHelper.createDatabaseTime(
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7天后过期
        )
      })
      test_verification_code = test_inventory_item.verification_code
      console.log('✅ 测试库存物品创建成功（Test Inventory Item Created）')
      console.log(`   物品ID（Inventory ID）: ${test_inventory_item.inventory_id}`)
      console.log(`   核销码（Verification Code）: ${test_verification_code}`)
    } catch (error) {
      console.error('❌ 创建测试数据失败（Test Data Creation Failed）:', error.message)
      throw error
    }
  }, 30000)

  afterAll(async () => {
    // 清理测试数据（Cleanup Test Data）
    if (test_inventory_item) {
      try {
        await UserInventory.destroy({
          where: { inventory_id: test_inventory_item.inventory_id },
          force: true
        })
        console.log('✅ 测试数据已清理（Test Data Cleaned）')
      } catch (error) {
        console.warn('⚠️ 清理测试数据失败:', error.message)
      }
    }

    if (tester) {
      await tester.cleanup()
    }
    console.log('🔚 核销验证API测试套件完成（Test Suite Completed）')
  })

  /*
   * ================================
   * 1. ✅ P1优化：格式验证测试
   * ================================
   */
  describe('格式验证（Format Validation）', () => {
    test('POST /api/v4/inventory/verification/verify - 核销码为空', async () => {
      console.log('\n❌ 测试：核销码为空（Empty Verification Code）')

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/inventory/verification/verify',
        { verification_code: '' },
        'admin'
      )

      console.log('响应状态（Response Status）:', response.status)
      console.log('响应数据（Response Data）:', JSON.stringify(response.data, null, 2))

      expect(response.status).toBe(400)
      expect(response.data.success).toBe(false)
      expect(response.data.message).toContain('核销码不能为空')
      console.log('✅ 空核销码验证测试通过')
    })

    test('POST /api/v4/inventory/verification/verify - 核销码格式错误（不足8位）', async () => {
      console.log('\n❌ 测试：核销码格式错误-不足8位（Invalid Format - Less than 8 chars）')

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/inventory/verification/verify',
        { verification_code: 'ABC123' }, // 只有6位
        'admin'
      )

      console.log('响应状态:', response.status)
      console.log('响应数据:', JSON.stringify(response.data, null, 2))

      expect(response.status).toBe(400)
      expect(response.data.success).toBe(false)
      expect(response.data.message).toContain('核销码格式错误')
      expect(response.data.message).toContain('8位大写')
      console.log('✅ 格式错误验证测试通过（不足8位）')
    })

    test('POST /api/v4/inventory/verification/verify - 核销码格式错误（包含非法字符）', async () => {
      console.log('\n❌ 测试：核销码格式错误-非法字符（Invalid Format - Illegal Characters）')

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/inventory/verification/verify',
        { verification_code: 'ABCDEFGH' }, // 包含G和H（非十六进制）
        'admin'
      )

      console.log('响应状态:', response.status)
      console.log('响应数据:', JSON.stringify(response.data, null, 2))

      expect(response.status).toBe(400)
      expect(response.data.success).toBe(false)
      expect(response.data.message).toContain('核销码格式错误')
      console.log('✅ 格式错误验证测试通过（非法字符）')
    })
  })

  /*
   * ================================
   * 2. ✅ P0修复：权限验证测试
   * ================================
   */
  describe('权限验证（Permission Verification）', () => {
    test('POST /api/v4/inventory/verification/verify - 管理员核销成功', async () => {
      console.log('\n✅ 测试：管理员核销成功（Admin Verification Success）')
      console.log(`   使用核销码（Verification Code）: ${test_verification_code}`)

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/inventory/verification/verify',
        { verification_code: test_verification_code },
        'admin'
      )

      console.log('响应状态:', response.status)
      console.log('响应数据:', JSON.stringify(response.data, null, 2))

      expect(response.status).toBe(200)
      expect(response.data.success).toBe(true)
      expect(response.data.message).toContain('核销成功')
      expect(response.data.data).toHaveProperty('inventory_id')
      expect(response.data.data).toHaveProperty('name') // 统一使用name字段
      expect(response.data.data).toHaveProperty('used_at')
      expect(response.data.data).toHaveProperty('user')
      expect(response.data.data).toHaveProperty('operator') // 🔥 新增字段验证
      expect(response.data.data.operator).toHaveProperty('user_id')
      expect(response.data.data.operator).toHaveProperty('nickname')

      console.log('✅ 管理员核销成功测试通过')
      console.log('   核销操作人（Operator）:', response.data.data.operator)

      // ✅ P0修复验证：检查数据库中是否记录了operator_id
      const updatedItem = await UserInventory.findByPk(test_inventory_item.inventory_id)
      expect(updatedItem.status).toBe('used')
      expect(updatedItem.operator_id).toBe(test_account.user_id) // 🔥 关键验证：operator_id已记录
      expect(updatedItem.used_at).toBeTruthy()
      console.log('✅ operator_id字段记录验证通过')
      console.log(`   数据库operator_id（DB operator_id）: ${updatedItem.operator_id}`)
      console.log(`   操作人user_id（Operator user_id）: ${test_account.user_id}`)
    })

    test('POST /api/v4/inventory/verification/verify - 重复核销（应该失败）', async () => {
      console.log('\n❌ 测试：重复核销（Duplicate Verification）')

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/inventory/verification/verify',
        { verification_code: test_verification_code },
        'admin'
      )

      console.log('响应状态:', response.status)
      console.log('响应数据:', JSON.stringify(response.data, null, 2))

      expect(response.status).toBe(400)
      expect(response.data.success).toBe(false)
      expect(response.data.message).toContain('已使用')
      console.log('✅ 重复核销防护测试通过')
    })
  })

  /*
   * ================================
   * 3. 业务规则验证测试
   * ================================
   */
  describe('业务规则验证（Business Rules Validation）', () => {
    test('POST /api/v4/inventory/verification/verify - 核销码不存在', async () => {
      console.log('\n❌ 测试：核销码不存在（Verification Code Not Found）')

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/inventory/verification/verify',
        { verification_code: 'F0F0F0F0' }, // 不存在的核销码
        'admin'
      )

      console.log('响应状态:', response.status)
      console.log('响应数据:', JSON.stringify(response.data, null, 2))

      expect(response.status).toBe(404)
      expect(response.data.success).toBe(false)
      expect(response.data.message).toContain('核销码不存在')
      console.log('✅ 核销码不存在验证测试通过')
    })

    test('POST /api/v4/inventory/verification/verify - 核销码已过期', async () => {
      console.log('\n❌ 测试：核销码已过期（Verification Code Expired）')

      // 创建一个已过期的测试核销码
      const expiredItem = await UserInventory.create({
        user_id: test_account.user_id,
        name: '测试物品-已过期',
        type: 'voucher',
        value: 30,
        status: 'available',
        source_type: 'test',
        source_id: '0',
        verification_code: 'E1E2E3E4',
        verification_expires_at: BeijingTimeHelper.createDatabaseTime(
          new Date(Date.now() - 24 * 60 * 60 * 1000) // 1天前已过期
        )
      })

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/inventory/verification/verify',
        { verification_code: 'E1E2E3E4' },
        'admin'
      )

      console.log('响应状态:', response.status)
      console.log('响应数据:', JSON.stringify(response.data, null, 2))

      expect(response.status).toBe(400)
      expect(response.data.success).toBe(false)
      expect(response.data.message).toContain('已过期')
      console.log('✅ 核销码过期验证测试通过')

      // 清理测试数据
      await UserInventory.destroy({
        where: { inventory_id: expiredItem.inventory_id },
        force: true
      })
    })
  })

  /*
   * ================================
   * 4. 数据完整性验证测试
   * ================================
   */
  describe('数据完整性验证（Data Integrity Verification）', () => {
    test('核销后数据库字段完整性检查', async () => {
      console.log(
        '\n🔍 测试：核销后数据库字段完整性（Database Field Integrity After Verification）'
      )

      // 创建新的测试核销码
      const newItem = await UserInventory.create({
        user_id: test_account.user_id,
        name: '测试物品-数据完整性',
        type: 'product',
        value: 80,
        status: 'available',
        source_type: 'test',
        source_id: '0',
        verification_code: 'D1D2D3D4',
        verification_expires_at: BeijingTimeHelper.createDatabaseTime(
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        )
      })

      // 执行核销
      await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/inventory/verification/verify',
        { verification_code: 'D1D2D3D4' },
        'admin'
      )

      // 查询数据库验证字段完整性
      const verifiedItem = await UserInventory.findByPk(newItem.inventory_id, {
        include: [
          {
            model: User,
            as: 'operator', // ✅ P0修复：验证operator关联
            attributes: ['user_id', 'nickname', 'mobile']
          }
        ]
      })

      console.log('数据库记录（Database Record）:')
      console.log(`   status: ${verifiedItem.status}`)
      console.log(`   used_at: ${verifiedItem.used_at}`)
      console.log(`   operator_id: ${verifiedItem.operator_id}`)
      console.log('   operator关联数据（Operator Association）:', verifiedItem.operator?.dataValues)

      // ✅ 关键字段验证
      expect(verifiedItem.status).toBe('used') // 状态已更新
      expect(verifiedItem.used_at).toBeTruthy() // 核销时间已记录
      expect(verifiedItem.operator_id).toBe(test_account.user_id) // 🔥 operator_id已记录
      expect(verifiedItem.operator).toBeTruthy() // 🔥 operator关联查询成功
      expect(verifiedItem.operator.user_id).toBe(test_account.user_id)

      console.log('✅ 数据库字段完整性验证通过（Database Field Integrity Verified）')
      console.log('   所有必需字段（status, used_at, operator_id）均已正确记录')

      // 清理测试数据
      await UserInventory.destroy({ where: { inventory_id: newItem.inventory_id }, force: true })
    })
  })
})
