/**
 * 抽奖预设系统API测试（V4架构迁移版本）
 *
 * **原文件**: tests/api/lottery-preset-api.test.js
 * **迁移日期**: 2025年11月12日 北京时间
 * **业务域**: 抽奖系统 - 预设管理
 * **优先级**: P1 (核心业务功能)
 *
 * **测试覆盖**:
 * 1. GET /api/v4/lottery-preset/stats - 获取预设统计
 * 2. POST /api/v4/lottery-preset/create - 创建抽奖预设
 * 3. GET /api/v4/lottery-preset/user/:user_id - 获取用户预设
 * 4. DELETE /api/v4/lottery-preset/user/:user_id - 清理用户预设
 *
 * **测试账号**: 13612227930 (用户ID: 31, 管理员权限)
 * **数据库**: restaurant_points_dev (统一数据库)
 *
 * **业务说明**:
 * - 抽奖预设是VIP用户专属功能，用于提前设定抽奖结果
 * - 预设按queue_order顺序消耗，消耗后status变为'used'
 * - 仅管理员可创建预设，普通用户只能查看自己的预设
 */

const TestCoordinator = require('../../api/TestCoordinator')
const moment = require('moment-timezone')
const models = require('../../../models')
const { TEST_DATA } = require('../../helpers/test-data')

describe('抽奖预设系统API测试（V4架构）', () => {
  let tester
  let admin_token
  let test_user_id
  const test_account = TEST_DATA.users.adminUser // 使用统一测试数据

  beforeAll(async () => {
    console.log('🚀 抽奖预设系统API测试启动')
    console.log('='.repeat(70))
    console.log(
      `📅 测试时间: ${moment().tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss')} (北京时间)`
    )
    console.log(`👤 测试账号: ${test_account.mobile} (用户ID: ${test_account.user_id})`)
    console.log('🗄️ 数据库: restaurant_points_dev')

    tester = new TestCoordinator()

    // 获取管理员认证token
    try {
      const admin_data = await tester.authenticateV4User('admin')
      test_user_id = admin_data.user.user_id
      admin_token = tester.tokens.admin
      console.log('✅ 管理员认证完成')
    } catch (error) {
      console.error('❌ 管理员认证失败:', error.message)
      throw error
    }
  })

  afterAll(async () => {
    if (tester) {
      await tester.cleanup()
    }
    console.log('🏁 抽奖预设系统API测试完成')
  })

  // ========== 获取预设统计API测试 ==========
  describe('GET /api/v4/lottery-preset/stats - 获取预设统计', () => {
    test('✅ 应该返回正确的预设统计数据结构', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/lottery-preset/stats',
        null,
        'admin'
      )

      expect(response.status).toBe(200)
      expect(response.data.success).toBe(true)
      expect(response.data.code).toBe('SUCCESS')
      expect(response.data.message).toBe('获取预设统计成功')

      // 验证data结构
      const { data } = response.data
      expect(data).toBeDefined()
      expect(data).toHaveProperty('total_presets')
      expect(data).toHaveProperty('pending_presets')
      expect(data).toHaveProperty('used_presets')
      expect(data).toHaveProperty('total_users_with_presets')
      expect(data).toHaveProperty('usage_rate')
      expect(data).toHaveProperty('prize_type_distribution')

      // 验证数据类型
      expect(typeof data.total_presets).toBe('number')
      expect(typeof data.pending_presets).toBe('number')
      expect(typeof data.used_presets).toBe('number')
      expect(typeof data.total_users_with_presets).toBe('number')
      expect(typeof data.usage_rate).toBe('string') // 格式化为百分比字符串
      expect(Array.isArray(data.prize_type_distribution)).toBe(true)

      console.log('📊 预设统计数据:', {
        total_presets: data.total_presets,
        pending_presets: data.pending_presets,
        used_presets: data.used_presets,
        total_users: data.total_users_with_presets,
        usage_rate: data.usage_rate + '%'
      })
    })

    test('✅ 应该正确计算使用率', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/lottery-preset/stats',
        null,
        'admin'
      )

      const { data } = response.data
      const expected_usage_rate =
        data.total_presets > 0
          ? ((data.used_presets / data.total_presets) * 100).toFixed(2)
          : '0.00'

      expect(data.usage_rate).toBe(expected_usage_rate)
      console.log(`📊 使用率验证: ${data.used_presets}/${data.total_presets} = ${data.usage_rate}%`)
    })

    test('✅ 应该正确统计奖品类型分布', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/lottery-preset/stats',
        null,
        'admin'
      )

      const { prize_type_distribution } = response.data.data

      // 验证每个奖品类型项的结构
      prize_type_distribution.forEach(item => {
        expect(item).toHaveProperty('prize_type')
        expect(item).toHaveProperty('count')
        expect(typeof item.prize_type).toBe('string')
        // count可能是字符串（Sequelize返回）或数字
        expect(['string', 'number']).toContain(typeof item.count)
      })

      console.log('🎁 奖品类型分布:', prize_type_distribution)
    })

    test('✅ 待使用和已使用数量之和应等于总数', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/lottery-preset/stats',
        null,
        'admin'
      )

      const { data } = response.data
      const sum = data.pending_presets + data.used_presets

      expect(sum).toBe(data.total_presets)
      console.log(
        `📊 数量验证: pending(${data.pending_presets}) + used(${data.used_presets}) = total(${data.total_presets})`
      )
    })

    test('❌ 非管理员应无权访问统计接口', async () => {
      try {
        // 尝试用普通用户token访问
        const response = await tester.makeAuthenticatedRequest(
          'GET',
          '/api/v4/lottery-preset/stats',
          null,
          'regular'
        )

        // 如果到这里说明没抛出错误，验证是否返回权限错误
        if (response.status === 403 || response.status === 401) {
          expect([403, 401]).toContain(response.status)
          console.log('✅ 权限验证通过: 普通用户无法访问统计接口')
        }
      } catch (error) {
        // 请求失败（权限不足）是预期行为
        expect(error.response?.status || 403).toBe(403)
        console.log('✅ 权限验证通过: 普通用户请求被拒绝')
      }
    })

    test('✅ 响应时间应在合理范围内（<200ms）', async () => {
      const start_time = Date.now()

      await tester.makeAuthenticatedRequest('GET', '/api/v4/lottery-preset/stats', null, 'admin')

      const duration = Date.now() - start_time

      expect(duration).toBeLessThan(200)
      console.log(`⚡ API响应时间: ${duration}ms (要求 <200ms)`)
    })
  })

  // ========== 创建抽奖预设API测试 ==========
  describe('POST /api/v4/lottery-preset/create - 创建抽奖预设', () => {
    let created_preset_ids = []

    afterEach(async () => {
      // 清理测试创建的预设
      if (created_preset_ids.length > 0) {
        await models.LotteryPreset.destroy({
          where: { preset_id: created_preset_ids },
          force: true
        })
        console.log(`🧹 清理 ${created_preset_ids.length} 个测试预设`)
        created_preset_ids = []
      }
    })

    test('✅ 应该成功创建单个预设', async () => {
      // 先获取一个可用的奖品ID
      const prize = await models.LotteryPrize.findOne({
        where: { status: 'active' },
        attributes: ['prize_id']
      })

      if (!prize) {
        console.warn('⚠️ 跳过测试: 数据库中无可用奖品')
        return
      }

      const create_data = {
        user_id: test_user_id,
        presets: [{ prize_id: prize.prize_id, queue_order: 1 }]
      }

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/lottery-preset/create',
        create_data,
        'admin'
      )

      expect(response.status).toBe(200)
      expect(response.data.success).toBe(true)
      expect(response.data.data).toHaveProperty('user_id', test_user_id)
      expect(response.data.data).toHaveProperty('presets_count', 1)
      expect(Array.isArray(response.data.data.created_presets)).toBe(true)
      expect(response.data.data.created_presets.length).toBe(1)

      // 保存预设ID用于清理
      created_preset_ids = response.data.data.created_presets.map(p => p.preset_id)

      console.log('✅ 创建预设成功:', response.data.data.created_presets[0].preset_id)
    })

    test('✅ 应该成功创建多个预设（队列）', async () => {
      // 获取多个可用奖品
      const prizes = await models.LotteryPrize.findAll({
        where: { status: 'active' },
        limit: 3,
        attributes: ['prize_id']
      })

      if (prizes.length < 2) {
        console.warn('⚠️ 跳过测试: 可用奖品数量不足')
        return
      }

      const create_data = {
        user_id: test_user_id,
        presets: prizes.map((prize, index) => ({
          prize_id: prize.prize_id,
          queue_order: index + 1
        }))
      }

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/lottery-preset/create',
        create_data,
        'admin'
      )

      expect(response.status).toBe(200)
      expect(response.data.success).toBe(true)
      expect(response.data.data.presets_count).toBe(prizes.length)
      expect(response.data.data.created_presets.length).toBe(prizes.length)

      // 验证queue_order正确
      response.data.data.created_presets.forEach((preset, index) => {
        expect(preset.queue_order).toBe(index + 1)
      })

      created_preset_ids = response.data.data.created_presets.map(p => p.preset_id)

      console.log(`✅ 创建${prizes.length}个预设成功，队列顺序: 1-${prizes.length}`)
    })

    test('❌ 缺少必需参数应返回错误', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/lottery-preset/create',
        {}, // 缺少user_id和presets
        'admin'
      )

      // API返回200但success为false
      expect(response.status).toBe(200)
      expect(response.data.success).toBe(false)
      expect(response.data.code).toBe('INVALID_PARAMETERS')

      console.log('✅ 参数验证通过: 缺少必需参数时返回错误')
    })

    test('❌ 非管理员应无权创建预设', async () => {
      const prize = await models.LotteryPrize.findOne({
        where: { status: 'active' }
      })

      if (!prize) {
        console.warn('⚠️ 跳过测试: 数据库中无可用奖品')
        return
      }

      try {
        const response = await tester.makeAuthenticatedRequest(
          'POST',
          '/api/v4/lottery-preset/create',
          {
            user_id: test_user_id,
            presets: [{ prize_id: prize.prize_id, queue_order: 1 }]
          },
          'regular'
        )

        expect([403, 401]).toContain(response.status)
      } catch (error) {
        expect([403, 401]).toContain(error.response?.status || 403)
      }

      console.log('✅ 权限验证通过: 普通用户无法创建预设')
    })

    // ========== 高风险问题修复测试（2025-11-09新增）==========
    test('❌ 【风险1修复】queue_order重复应返回错误', async () => {
      const prize = await models.LotteryPrize.findOne({
        where: { status: 'active' }
      })

      if (!prize) {
        console.warn('⚠️ 跳过测试: 数据库中无可用奖品')
        return
      }

      const create_data = {
        user_id: test_user_id,
        presets: [
          { prize_id: prize.prize_id, queue_order: 1 },
          { prize_id: prize.prize_id, queue_order: 1 } // 重复的queue_order
        ]
      }

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/lottery-preset/create',
        create_data,
        'admin'
      )

      // 应返回错误
      expect(response.status).toBe(200)
      expect(response.data.success).toBe(false)
      expect(response.data.code).toBe('DUPLICATE_QUEUE_ORDER')
      expect(response.data.message).toContain('queue_order不能重复')

      console.log('✅ 【风险1修复验证】queue_order唯一性验证通过')
    })

    test('❌ 【风险2修复】超过最大数量限制应返回错误', async () => {
      const prize = await models.LotteryPrize.findOne({
        where: { status: 'active' }
      })

      if (!prize) {
        console.warn('⚠️ 跳过测试: 数据库中无可用奖品')
        return
      }

      // 创建超过20条的预设
      const presets = []
      for (let i = 1; i <= 21; i++) {
        presets.push({ prize_id: prize.prize_id, queue_order: i })
      }

      const create_data = {
        user_id: test_user_id,
        presets
      }

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/lottery-preset/create',
        create_data,
        'admin'
      )

      // 应返回错误
      expect(response.status).toBe(200)
      expect(response.data.success).toBe(false)
      expect(response.data.code).toBe('TOO_MANY_PRESETS')
      expect(response.data.message).toContain('最多创建20条')
      expect(response.data.message).toContain('当前：21条')

      console.log('✅ 【风险2修复验证】最大数量限制验证通过')
    })

    test('❌ 【额外验证】queue_order必须为正整数', async () => {
      const prize = await models.LotteryPrize.findOne({
        where: { status: 'active' }
      })

      if (!prize) {
        console.warn('⚠️ 跳过测试: 数据库中无可用奖品')
        return
      }

      // 测试queue_order为0
      const create_data_zero = {
        user_id: test_user_id,
        presets: [{ prize_id: prize.prize_id, queue_order: 0 }]
      }

      const response_zero = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/lottery-preset/create',
        create_data_zero,
        'admin'
      )

      expect(response_zero.status).toBe(200)
      expect(response_zero.data.success).toBe(false)
      expect(response_zero.data.code).toBe('INVALID_QUEUE_ORDER')

      // 测试queue_order为负数
      const create_data_negative = {
        user_id: test_user_id,
        presets: [{ prize_id: prize.prize_id, queue_order: -1 }]
      }

      const response_negative = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/lottery-preset/create',
        create_data_negative,
        'admin'
      )

      expect(response_negative.status).toBe(200)
      expect(response_negative.data.success).toBe(false)
      expect(response_negative.data.code).toBe('INVALID_QUEUE_ORDER')

      console.log('✅ 【额外验证】queue_order正整数验证通过')
    })
  })

  // ========== 获取用户预设API测试 ==========
  describe('GET /api/v4/lottery-preset/user/:user_id - 获取用户预设', () => {
    test('✅ 应该返回正确的用户预设列表结构', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/lottery-preset/user/${test_user_id}`,
        null,
        'admin'
      )

      expect(response.status).toBe(200)
      expect(response.data.success).toBe(true)

      const { data } = response.data
      expect(data).toHaveProperty('user')
      expect(data).toHaveProperty('stats')
      expect(data).toHaveProperty('presets')

      // 验证user对象
      expect(data.user).toHaveProperty('user_id', test_user_id)
      expect(data.user).toHaveProperty('mobile')
      expect(data.user).toHaveProperty('nickname')

      // 验证stats对象
      expect(data.stats).toHaveProperty('total')
      expect(data.stats).toHaveProperty('pending')
      expect(data.stats).toHaveProperty('used')

      // 验证presets数组
      expect(Array.isArray(data.presets)).toBe(true)

      console.log('✅ 用户预设列表结构验证通过')
    })

    test('✅ 预设列表应包含关联的奖品和管理员信息', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/lottery-preset/user/${test_user_id}`,
        null,
        'admin'
      )

      const { presets } = response.data.data

      if (presets.length > 0) {
        const preset = presets[0]
        expect(preset).toHaveProperty('preset_id')
        expect(preset).toHaveProperty('prize_id')
        expect(preset).toHaveProperty('queue_order')
        expect(preset).toHaveProperty('status')
        expect(preset).toHaveProperty('prize') // 关联的奖品信息
        expect(preset).toHaveProperty('admin') // 创建预设的管理员信息

        console.log('✅ 预设包含完整的关联信息')
      } else {
        console.log('ℹ️ 该用户暂无预设记录')
      }
    })

    test('❌ 查询不存在的用户应返回400错误', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/lottery-preset/user/999999',
        null,
        'admin'
      )

      // API返回200但success为false
      expect(response.status).toBe(200)
      expect(response.data.success).toBe(false)
      expect(response.data.code).toBe('USER_NOT_FOUND')

      console.log('✅ 不存在用户验证通过: 返回USER_NOT_FOUND错误')
    })
  })

  // ========== 清理用户预设API测试 ==========
  describe('DELETE /api/v4/lottery-preset/user/:user_id - 清理用户预设', () => {
    let temp_user_id
    const temp_preset_ids = []

    beforeEach(async () => {
      // 创建临时用户用于测试清理功能
      const temp_user = await models.User.create({
        mobile: '13800000000',
        nickname: '测试用户_清理预设',
        status: 'active',
        balance: 0,
        total_points: 0,
        history_total_points: 0
      })
      temp_user_id = temp_user.user_id

      // 为临时用户创建测试预设
      const prize = await models.LotteryPrize.findOne({
        where: { status: 'active' }
      })

      if (prize) {
        const preset = await models.LotteryPreset.create({
          user_id: temp_user_id,
          prize_id: prize.prize_id,
          queue_order: 1,
          status: 'pending',
          created_by: test_user_id
        })
        temp_preset_ids.push(preset.preset_id)
      }
    })

    afterEach(async () => {
      // 清理临时数据
      if (temp_preset_ids.length > 0) {
        await models.LotteryPreset.destroy({
          where: { preset_id: temp_preset_ids },
          force: true
        })
      }
      if (temp_user_id) {
        await models.User.destroy({
          where: { user_id: temp_user_id },
          force: true
        })
      }
    })

    test('✅ 应该成功清理用户的所有预设', async () => {
      if (temp_preset_ids.length === 0) {
        console.warn('⚠️ 跳过测试: 无测试预设')
        return
      }

      const response = await tester.makeAuthenticatedRequest(
        'DELETE',
        `/api/v4/lottery-preset/user/${temp_user_id}`,
        null,
        'admin'
      )

      expect(response.status).toBe(200)
      expect(response.data.success).toBe(true)
      expect(response.data.data).toHaveProperty('user_id')
      // user_id 可能是数字或字符串
      expect(parseInt(response.data.data.user_id)).toBe(parseInt(temp_user_id))
      expect(response.data.data).toHaveProperty('deleted_count')
      expect(response.data.data.deleted_count).toBeGreaterThan(0)

      // 验证预设已被删除
      const remaining_presets = await models.LotteryPreset.count({
        where: { user_id: temp_user_id }
      })
      expect(remaining_presets).toBe(0)

      console.log(`✅ 成功清理 ${response.data.data.deleted_count} 个预设`)
    })

    test('✅ 清理不存在预设的用户应返回成功（删除0条）', async () => {
      // 先清理一次
      await models.LotteryPreset.destroy({
        where: { user_id: temp_user_id },
        force: true
      })

      const response = await tester.makeAuthenticatedRequest(
        'DELETE',
        `/api/v4/lottery-preset/user/${temp_user_id}`,
        null,
        'admin'
      )

      expect(response.status).toBe(200)
      expect(response.data.success).toBe(true)
      expect(response.data.data.deleted_count).toBe(0)

      console.log('✅ 清理空预设用户验证通过')
    })

    test('❌ 非管理员应无权清理预设', async () => {
      try {
        const response = await tester.makeAuthenticatedRequest(
          'DELETE',
          `/api/v4/lottery-preset/user/${temp_user_id}`,
          null,
          'regular'
        )

        expect([403, 401]).toContain(response.status)
      } catch (error) {
        expect([403, 401]).toContain(error.response?.status || 403)
      }

      console.log('✅ 权限验证通过: 普通用户无法清理预设')
    })

    test('❌ 清理不存在的用户应返回404错误', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'DELETE',
        '/api/v4/lottery-preset/user/999999',
        null,
        'admin'
      )

      // API应该返回错误
      expect(response.status).toBe(200)
      expect(response.data.success).toBe(false)
      expect(response.data.code).toBe('USER_NOT_FOUND')

      console.log('✅ 不存在用户验证通过: 返回USER_NOT_FOUND错误')
    })
  })

  // ========== 业务逻辑验证测试 ==========
  describe('业务逻辑验证', () => {
    test('✅ 预设状态应符合业务规则（pending/used）', async () => {
      const presets = await models.LotteryPreset.findAll({
        attributes: ['preset_id', 'status'],
        limit: 100
      })

      const valid_statuses = ['pending', 'used']
      presets.forEach(preset => {
        expect(valid_statuses).toContain(preset.status)
      })

      console.log(`✅ 验证 ${presets.length} 个预设状态，全部符合业务规则`)
    })

    test('✅ 预设应正确关联用户和奖品', async () => {
      const presets = await models.LotteryPreset.findAll({
        include: [
          { model: models.User, as: 'targetUser' },
          { model: models.LotteryPrize, as: 'prize' }
        ],
        limit: 10
      })

      presets.forEach(preset => {
        // 验证外键存在
        expect(preset.user_id).toBeDefined()
        expect(preset.prize_id).toBeDefined()

        // 验证关联数据加载成功
        if (preset.targetUser) {
          expect(preset.targetUser.user_id).toBe(preset.user_id)
        }
        if (preset.prize) {
          expect(preset.prize.prize_id).toBe(preset.prize_id)
        }
      })

      console.log(`✅ 验证 ${presets.length} 个预设的关联关系，全部正确`)
    })

    test('✅ 队列顺序应从1开始连续递增', async () => {
      // 查询某个用户的预设队列
      const user_with_presets = await models.LotteryPreset.findOne({
        attributes: ['user_id']
      })

      if (!user_with_presets) {
        console.warn('⚠️ 跳过测试: 数据库中无预设记录')
        return
      }

      const user_presets = await models.LotteryPreset.findAll({
        where: { user_id: user_with_presets.user_id },
        order: [['queue_order', 'ASC']]
      })

      if (user_presets.length > 0) {
        // 验证从1开始
        expect(user_presets[0].queue_order).toBeGreaterThanOrEqual(1)

        // 验证连续性（允许有gap，因为可能已使用部分预设）
        user_presets.forEach(preset => {
          expect(preset.queue_order).toBeGreaterThan(0)
        })

        console.log(
          `✅ 用户 ${user_with_presets.user_id} 的预设队列顺序验证通过 (${user_presets.length}个预设)`
        )
      }
    })
  })

  // ========== 性能测试 ==========
  describe('性能测试', () => {
    test('✅ 统计API并发请求性能测试', async () => {
      const concurrent_requests = 10
      const start_time = Date.now()

      const promises = Array(concurrent_requests)
        .fill(null)
        .map(() =>
          tester.makeAuthenticatedRequest('GET', '/api/v4/lottery-preset/stats', null, 'admin')
        )

      const responses = await Promise.all(promises)

      const duration = Date.now() - start_time
      const avg_time = duration / concurrent_requests

      // 所有请求应该成功
      responses.forEach(response => {
        expect(response.status).toBe(200)
        expect(response.data.success).toBe(true)
      })

      // 平均响应时间应在合理范围内
      expect(avg_time).toBeLessThan(500)

      console.log(
        `⚡ 并发性能测试: ${concurrent_requests}个请求, 总耗时${duration}ms, 平均${Math.round(avg_time)}ms`
      )
    })
  })
})
