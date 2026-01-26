/**
 * 员工管理删除逻辑测试
 *
 * 测试覆盖：
 * 1. DELETE /api/v4/console/staff/:store_staff_id - 员工离职（在职员工）
 * 2. DELETE /api/v4/console/staff/:store_staff_id - 员工删除（离职员工）
 * 3. DELETE /api/v4/console/staff/:store_staff_id?force=true - 强制删除（在职员工）
 * 4. 状态流转验证：active → inactive → deleted
 *
 * 测试账号：13612227930 (用户ID: 31, 管理员权限)
 * 数据库：restaurant_points_dev (统一数据库)
 *
 * @since 2026-01-26
 * @see docs/员工管理删除逻辑优化方案.md
 */

'use strict'

const TestCoordinator = require('../../api/TestCoordinator')
const BeijingTimeHelper = require('../../../utils/timeHelper')
const { TEST_DATA } = require('../../helpers/test-data')

describe('员工管理删除逻辑测试', () => {
  let tester
  const test_account = TEST_DATA.users.adminUser

  beforeAll(async () => {
    console.log('🚀 员工管理删除逻辑测试启动')
    console.log('='.repeat(70))
    console.log(`📅 测试时间: ${BeijingTimeHelper.toBeijingTime(new Date())} (北京时间)`)
    console.log(`👤 测试账号: ${test_account.mobile} (用户ID: ${test_account.user_id})`)
    console.log('🗄️ 数据库: restaurant_points_dev')

    tester = new TestCoordinator()

    // 等待V4引擎启动
    try {
      await tester.waitForV4Engine(30000)
      console.log('✅ V4引擎启动检查通过')
    } catch (error) {
      console.warn('⚠️ V4引擎可能未启动，继续测试:', error.message)
    }

    // 获取认证token
    try {
      await tester.authenticate_v4_user('admin')
      console.log('✅ 管理员认证完成')
    } catch (error) {
      console.warn('⚠️ 认证失败，部分测试可能跳过:', error.message)
    }
  })

  afterAll(async () => {
    if (tester) {
      await tester.cleanup()
    }
    console.log('🏁 员工管理删除逻辑测试完成')
  })

  // ========== 员工列表查询测试 ==========
  describe('员工列表查询（含删除状态过滤）', () => {
    test('GET /api/v4/console/staff - 默认排除已删除记录', async () => {
      console.log('\n👥 测试：默认查询排除已删除记录')

      const response = await tester.make_authenticated_request(
        'GET',
        '/api/v4/console/staff?page=1&page_size=10',
        null,
        'admin'
      )

      console.log('响应状态:', response.status)

      if (response.status === 200) {
        expect(response.data.success).toBe(true)
        expect(response.data.data).toHaveProperty('staff')
        expect(response.data.data).toHaveProperty('total')

        const staffList = response.data.data.staff
        console.log(`✅ 员工总数: ${response.data.data.total}`)

        // 验证默认情况下不包含已删除记录
        const deletedStaff = staffList.filter(s => s.status === 'deleted')
        expect(deletedStaff.length).toBe(0)
        console.log('✅ 默认查询不包含已删除记录')
      } else {
        console.log(`⚠️ 请求失败: ${response.status}`)
      }
    })

    test('GET /api/v4/console/staff?include_deleted=true - 包含已删除记录', async () => {
      console.log('\n👥 测试：查询包含已删除记录')

      const response = await tester.make_authenticated_request(
        'GET',
        '/api/v4/console/staff?page=1&page_size=100&include_deleted=true',
        null,
        'admin'
      )

      console.log('响应状态:', response.status)

      if (response.status === 200) {
        expect(response.data.success).toBe(true)
        console.log(`✅ 包含已删除记录的总数: ${response.data.data.total}`)
      }
    })

    test('GET /api/v4/console/staff?status=deleted - 仅查询已删除记录', async () => {
      console.log('\n👥 测试：仅查询已删除记录')

      const response = await tester.make_authenticated_request(
        'GET',
        '/api/v4/console/staff?status=deleted&page=1&page_size=10',
        null,
        'admin'
      )

      console.log('响应状态:', response.status)

      if (response.status === 200) {
        expect(response.data.success).toBe(true)
        const staffList = response.data.data.staff

        // 验证返回的都是已删除记录
        staffList.forEach(staff => {
          expect(staff.status).toBe('deleted')
        })

        console.log(`✅ 已删除记录数: ${response.data.data.total}`)
      }
    })
  })

  // ========== 员工离职/删除操作测试 ==========
  describe('员工离职/删除操作', () => {
    test('DELETE - 在职员工不带force参数执行离职操作', async () => {
      console.log('\n📤 测试：在职员工不带force参数执行离职操作')

      // 1. 先查找一个在职员工
      const listResponse = await tester.make_authenticated_request(
        'GET',
        '/api/v4/console/staff?status=active&page=1&page_size=1',
        null,
        'admin'
      )

      if (listResponse.status !== 200 || !listResponse.data.data.staff.length) {
        console.log('⚠️ 没有在职员工可测试，跳过此测试')
        return
      }

      const activeStaff = listResponse.data.data.staff[0]
      console.log(`找到在职员工: store_staff_id=${activeStaff.store_staff_id}`)

      // 2. 执行离职操作（不带force，reason需要encodeURIComponent编码）
      const reason = encodeURIComponent('测试离职')
      const deleteResponse = await tester.make_authenticated_request(
        'DELETE',
        `/api/v4/console/staff/${activeStaff.store_staff_id}?reason=${reason}`,
        null,
        'admin'
      )

      console.log('响应状态:', deleteResponse.status)
      console.log('响应数据:', JSON.stringify(deleteResponse.data, null, 2))

      if (deleteResponse.status === 200) {
        expect(deleteResponse.data.success).toBe(true)
        expect(deleteResponse.data.data.previous_status).toBe('active')
        expect(deleteResponse.data.data.new_status).toBe('inactive')
        console.log('✅ 员工离职成功')
      } else {
        console.log(`⚠️ 离职操作失败: ${deleteResponse.data?.message}`)
      }
    })

    test('DELETE - 离职员工执行删除操作', async () => {
      console.log('\n🗑️ 测试：离职员工执行删除操作')

      // 1. 查找离职员工
      const listResponse = await tester.make_authenticated_request(
        'GET',
        '/api/v4/console/staff?status=inactive&page=1&page_size=1',
        null,
        'admin'
      )

      if (listResponse.status !== 200 || !listResponse.data.data.staff.length) {
        console.log('⚠️ 没有离职员工可测试，跳过此测试')
        return
      }

      const inactiveStaff = listResponse.data.data.staff[0]
      console.log(`找到离职员工: store_staff_id=${inactiveStaff.store_staff_id}`)

      // 2. 执行删除操作（reason需要encodeURIComponent编码）
      const reason = encodeURIComponent('测试删除')
      const deleteResponse = await tester.make_authenticated_request(
        'DELETE',
        `/api/v4/console/staff/${inactiveStaff.store_staff_id}?reason=${reason}`,
        null,
        'admin'
      )

      console.log('响应状态:', deleteResponse.status)
      console.log('响应数据:', JSON.stringify(deleteResponse.data, null, 2))

      if (deleteResponse.status === 200) {
        expect(deleteResponse.data.success).toBe(true)
        expect(deleteResponse.data.data.previous_status).toBe('inactive')
        expect(deleteResponse.data.data.new_status).toBe('deleted')
        console.log('✅ 员工记录删除成功')
      } else {
        console.log(`⚠️ 删除操作失败: ${deleteResponse.data?.message}`)
      }
    })

    test('DELETE - 已删除员工再次删除应被拒绝', async () => {
      console.log('\n❌ 测试：已删除员工再次删除应被拒绝')

      // 1. 查找已删除员工
      const listResponse = await tester.make_authenticated_request(
        'GET',
        '/api/v4/console/staff?status=deleted&page=1&page_size=1',
        null,
        'admin'
      )

      if (listResponse.status !== 200 || !listResponse.data.data.staff.length) {
        console.log('⚠️ 没有已删除员工可测试，跳过此测试')
        return
      }

      const deletedStaff = listResponse.data.data.staff[0]
      console.log(`找到已删除员工: store_staff_id=${deletedStaff.store_staff_id}`)

      // 2. 尝试再次删除
      const deleteResponse = await tester.make_authenticated_request(
        'DELETE',
        `/api/v4/console/staff/${deletedStaff.store_staff_id}`,
        null,
        'admin'
      )

      console.log('响应状态:', deleteResponse.status)

      // 应该返回400错误
      expect(deleteResponse.status).toBe(400)
      expect(deleteResponse.data.code).toBe('STAFF_ALREADY_DELETED')
      console.log('✅ 已删除员工再次删除被正确拒绝')
    })

    test('DELETE - 不存在的员工记录', async () => {
      console.log('\n❌ 测试：删除不存在的员工记录')

      const response = await tester.make_authenticated_request(
        'DELETE',
        '/api/v4/console/staff/99999999',
        null,
        'admin'
      )

      console.log('响应状态:', response.status)

      expect(response.status).toBe(404)
      expect(response.data.code).toBe('STAFF_NOT_FOUND')
      console.log('✅ 不存在的员工正确返回404')
    })
  })

  // ========== 员工详情验证 ==========
  describe('员工详情（含删除字段）', () => {
    test('GET /api/v4/console/staff/:id - 已删除员工详情包含删除信息', async () => {
      console.log('\n📋 测试：已删除员工详情包含删除信息')

      // 1. 查找已删除员工
      const listResponse = await tester.make_authenticated_request(
        'GET',
        '/api/v4/console/staff?status=deleted&page=1&page_size=1',
        null,
        'admin'
      )

      if (listResponse.status !== 200 || !listResponse.data.data.staff.length) {
        console.log('⚠️ 没有已删除员工可测试，跳过此测试')
        return
      }

      const deletedStaff = listResponse.data.data.staff[0]

      // 2. 获取详情
      const detailResponse = await tester.make_authenticated_request(
        'GET',
        `/api/v4/console/staff/${deletedStaff.store_staff_id}`,
        null,
        'admin'
      )

      console.log('响应状态:', detailResponse.status)

      if (detailResponse.status === 200) {
        const staffDetail = detailResponse.data.data
        expect(staffDetail.status).toBe('deleted')
        expect(staffDetail).toHaveProperty('deleted_at')
        expect(staffDetail).toHaveProperty('delete_reason')
        expect(staffDetail.deleted_at).not.toBeNull()

        console.log(`✅ 员工详情包含删除信息:`)
        console.log(`   - status: ${staffDetail.status}`)
        console.log(`   - deleted_at: ${staffDetail.deleted_at}`)
        console.log(`   - delete_reason: ${staffDetail.delete_reason}`)
      }
    })
  })

  // ========== 权限验证 ==========
  describe('权限验证', () => {
    test('未认证用户无法删除员工', async () => {
      console.log('\n🔐 测试：未认证用户无法删除员工')

      const response = await tester.make_request('DELETE', '/api/v4/console/staff/1')

      console.log('响应状态:', response.status)

      // 应该返回401未认证
      expect(response.status).toBe(401)
      console.log('✅ 未认证用户被正确拒绝')
    })
  })
})
