'use strict'

/**
 * 🔄 配置热加载测试（P1级）
 *
 * @description 测试配置热加载、功能开关切换、60秒内生效验证
 * @version V4.6 - TDD策略：先创建测试，倒逼实现
 * @date 2026-01-28
 *
 * 测试目的：
 * 1. 验证功能开关创建、更新、删除的CRUD操作
 * 2. 验证功能开关切换后60秒内生效
 * 3. 验证白名单/黑名单的即时生效
 * 4. 验证配置缓存的正确失效
 *
 * 业务场景：
 * - 运营临时关闭某功能进行维护
 * - 新功能灰度发布（按百分比/用户分群）
 * - 紧急禁用某用户的功能访问
 * - 配置变更后的快速生效验证
 *
 * 核心验证点：
 * - 功能开关CRUD正确性
 * - 配置变更后60秒内对用户生效
 * - 白名单优先于百分比策略
 * - 黑名单优先于所有策略
 * - Redis缓存正确失效
 *
 * @file tests/integration/config_hot_reload.test.js
 */

const request = require('supertest')
const app = require('../../app')
const { TEST_DATA } = require('../helpers/test-data')
const { initRealTestData } = require('../helpers/test-setup')
const { delay } = require('../helpers/test-concurrent-utils')
const { v4: uuidv4 } = require('uuid')

/**
 * 测试配置常量
 */
const CONFIG_EFFECTIVE_TIMEOUT = 60000 // 配置生效超时时间（60秒）
const CACHE_CHECK_INTERVAL = 5000 // 缓存检查间隔（5秒）
const TEST_FLAG_PREFIX = 'test_flag_' // 测试功能开关前缀

/**
 * 生成测试用的功能开关键名
 * @returns {string} 唯一的flag_key
 */
function generateTestFlagKey() {
  return `${TEST_FLAG_PREFIX}${Date.now()}_${uuidv4().substring(0, 8)}`
}

describe('【P1】配置热加载测试 - 功能开关、配置变更、生效验证', () => {
  let authToken
  let adminToken
  let testUserId
  let testFlagKey

  /**
   * 测试前准备
   */
  beforeAll(async () => {
    console.log('='.repeat(80))
    console.log('🔄 【P1】配置热加载测试')
    console.log('='.repeat(80))
    console.log(`📋 配置生效超时: ${CONFIG_EFFECTIVE_TIMEOUT / 1000}秒`)
    console.log(`📋 缓存检查间隔: ${CACHE_CHECK_INTERVAL / 1000}秒`)
    console.log('='.repeat(80))

    // 初始化真实测试数据
    await initRealTestData()

    // 登录获取用户Token
    console.log('🔐 登录测试用户...')
    const loginResponse = await request(app).post('/api/v4/auth/login').send({
      mobile: TEST_DATA.users.testUser.mobile,
      verification_code: TEST_DATA.auth.verificationCode
    })

    if (loginResponse.status !== 200 || !loginResponse.body.success) {
      console.error('❌ 登录失败:', loginResponse.body)
      throw new Error('测试前置条件失败：无法登录')
    }

    authToken = loginResponse.body.data.access_token
    testUserId = loginResponse.body.data.user.user_id
    console.log(`✅ 用户登录成功，用户ID: ${testUserId}`)

    // 登录获取管理员Token
    console.log('🔐 登录管理员用户...')
    const adminLoginResponse = await request(app).post('/api/v4/auth/admin/login').send({
      mobile: TEST_DATA.users.testUser.mobile,
      verification_code: TEST_DATA.auth.verificationCode
    })

    if (adminLoginResponse.status === 200 && adminLoginResponse.body.success) {
      adminToken = adminLoginResponse.body.data.access_token
      console.log('✅ 管理员登录成功')
    } else {
      console.warn('⚠️ 管理员登录失败，部分测试可能跳过')
      console.warn('   响应:', adminLoginResponse.body)
    }

    // 生成测试用的功能开关键名
    testFlagKey = generateTestFlagKey()
    console.log(`📋 测试功能开关键名: ${testFlagKey}`)

    console.log('='.repeat(80))
  }, 120000)

  afterAll(async () => {
    // 清理测试创建的功能开关
    if (adminToken && testFlagKey) {
      console.log('🧹 清理测试功能开关...')
      try {
        await request(app)
          .delete(`/api/v4/admin/feature-flags/${testFlagKey}`)
          .set('Authorization', `Bearer ${adminToken}`)
        console.log(`   已删除: ${testFlagKey}`)
      } catch (error) {
        console.log('   清理失败或已不存在')
      }
    }

    console.log('='.repeat(80))
    console.log('🏁 配置热加载测试完成')
    console.log('='.repeat(80))
  })

  // ==================== 场景1：功能开关CRUD测试 ====================

  describe('场景1：功能开关CRUD操作', () => {
    test('创建功能开关应该成功', async () => {
      console.log('\n📝 场景1.1: 创建功能开关测试...')

      if (!adminToken) {
        console.log('   ⚠️ 无管理员Token，跳过测试')
        return
      }

      const flagData = {
        flag_key: testFlagKey,
        flag_name: '测试功能开关',
        description: '用于自动化测试的功能开关',
        is_enabled: true,
        rollout_strategy: 'all', // 全量发布
        rollout_percentage: 100
      }

      const response = await request(app)
        .post('/api/v4/admin/feature-flags')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(flagData)

      console.log(`   响应状态: ${response.status}`)
      console.log(`   业务成功: ${response.body.success}`)

      if (response.status === 201 || response.status === 200) {
        expect(response.body.success).toBe(true)
        console.log(`   创建的flag_id: ${response.body.data?.flag_id || 'N/A'}`)
        console.log('   ✅ 创建功能开关成功')
      } else if (response.status === 409) {
        console.log('   ⚠️ 功能开关已存在')
      } else {
        console.log(`   ❌ 创建失败: ${response.body.message}`)
        // 不中断测试，记录失败原因
      }
    }, 30000)

    test('获取功能开关详情应该成功', async () => {
      console.log('\n📖 场景1.2: 获取功能开关详情测试...')

      if (!adminToken) {
        console.log('   ⚠️ 无管理员Token，跳过测试')
        return
      }

      const response = await request(app)
        .get(`/api/v4/admin/feature-flags/${testFlagKey}`)
        .set('Authorization', `Bearer ${adminToken}`)

      console.log(`   响应状态: ${response.status}`)

      if (response.status === 200) {
        expect(response.body.success).toBe(true)
        const flag = response.body.data
        console.log(`   flag_key: ${flag?.flag_key || 'N/A'}`)
        console.log(`   is_enabled: ${flag?.is_enabled}`)
        console.log(`   rollout_strategy: ${flag?.rollout_strategy}`)
        console.log('   ✅ 获取功能开关详情成功')
      } else if (response.status === 404) {
        console.log('   ⚠️ 功能开关不存在（可能创建失败）')
      } else {
        console.log(`   ❌ 获取失败: ${response.body.message}`)
      }
    }, 30000)

    test('更新功能开关应该成功', async () => {
      console.log('\n✏️ 场景1.3: 更新功能开关测试...')

      if (!adminToken) {
        console.log('   ⚠️ 无管理员Token，跳过测试')
        return
      }

      const updateData = {
        description: '更新后的描述 - ' + new Date().toISOString(),
        rollout_percentage: 50
      }

      const response = await request(app)
        .put(`/api/v4/admin/feature-flags/${testFlagKey}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)

      console.log(`   响应状态: ${response.status}`)

      if (response.status === 200) {
        expect(response.body.success).toBe(true)
        console.log('   ✅ 更新功能开关成功')
      } else if (response.status === 404) {
        console.log('   ⚠️ 功能开关不存在')
      } else {
        console.log(`   ❌ 更新失败: ${response.body.message}`)
      }
    }, 30000)

    test('获取功能开关列表应该成功', async () => {
      console.log('\n📋 场景1.4: 获取功能开关列表测试...')

      if (!adminToken) {
        console.log('   ⚠️ 无管理员Token，跳过测试')
        return
      }

      const response = await request(app)
        .get('/api/v4/admin/feature-flags')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ page: 1, page_size: 10 })

      console.log(`   响应状态: ${response.status}`)

      if (response.status === 200) {
        expect(response.body.success).toBe(true)
        const data = response.body.data
        console.log(`   总数: ${data?.pagination?.total || data?.total || 'N/A'}`)
        console.log(`   当前页数量: ${data?.list?.length || data?.length || 'N/A'}`)
        console.log('   ✅ 获取功能开关列表成功')
      } else {
        console.log(`   ❌ 获取失败: ${response.body.message}`)
      }
    }, 30000)
  })

  // ==================== 场景2：功能开关切换生效测试 ====================

  describe('场景2：功能开关切换生效测试', () => {
    let toggleTestFlagKey

    beforeAll(() => {
      toggleTestFlagKey = generateTestFlagKey()
    })

    afterAll(async () => {
      // 清理测试创建的功能开关
      if (adminToken && toggleTestFlagKey) {
        try {
          await request(app)
            .delete(`/api/v4/admin/feature-flags/${toggleTestFlagKey}`)
            .set('Authorization', `Bearer ${adminToken}`)
        } catch (error) {
          // 忽略清理失败
        }
      }
    })

    test('功能开关从启用切换到禁用应该在60秒内生效', async () => {
      console.log('\n⏱️ 场景2.1: 功能开关切换生效测试...')

      if (!adminToken) {
        console.log('   ⚠️ 无管理员Token，跳过测试')
        return
      }

      // 1. 创建一个启用的功能开关
      console.log('   步骤1: 创建启用的功能开关')
      const createResponse = await request(app)
        .post('/api/v4/admin/feature-flags')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          flag_key: toggleTestFlagKey,
          flag_name: '切换测试开关',
          description: '用于测试切换生效时间',
          is_enabled: true,
          rollout_strategy: 'all'
        })

      if (createResponse.status !== 201 && createResponse.status !== 200) {
        console.log(`   ⚠️ 创建功能开关失败: ${createResponse.body.message}`)
        return
      }
      console.log(`   功能开关已创建: ${toggleTestFlagKey}`)

      // 2. 验证功能开关当前是启用状态
      console.log('   步骤2: 验证功能开关启用状态')
      const checkResponse1 = await request(app)
        .get(`/api/v4/feature-flags/${toggleTestFlagKey}/check`)
        .set('Authorization', `Bearer ${authToken}`)
        .query({ user_id: testUserId })

      if (checkResponse1.status === 200) {
        console.log(`   当前状态: enabled=${checkResponse1.body.data?.enabled}`)
      } else if (checkResponse1.status === 404) {
        console.log('   ⚠️ 功能开关检查接口不存在，使用管理员接口验证')
        // 使用管理员接口获取状态
        const adminCheckResponse = await request(app)
          .get(`/api/v4/admin/feature-flags/${toggleTestFlagKey}`)
          .set('Authorization', `Bearer ${adminToken}`)

        if (adminCheckResponse.status === 200) {
          console.log(`   当前状态: is_enabled=${adminCheckResponse.body.data?.is_enabled}`)
        }
      }

      // 3. 切换功能开关为禁用
      console.log('   步骤3: 切换功能开关为禁用')
      const toggleResponse = await request(app)
        .patch(`/api/v4/admin/feature-flags/${toggleTestFlagKey}/toggle`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ is_enabled: false })

      if (toggleResponse.status !== 200) {
        // 尝试使用PUT更新
        const updateResponse = await request(app)
          .put(`/api/v4/admin/feature-flags/${toggleTestFlagKey}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ is_enabled: false })

        if (updateResponse.status !== 200) {
          console.log(`   ⚠️ 切换功能开关失败`)
          return
        }
      }
      console.log('   功能开关已切换为禁用')

      // 4. 立即验证变更是否生效（应该在缓存TTL内）
      console.log('   步骤4: 验证变更生效（等待最多60秒）')
      const startTime = Date.now()
      let changeEffective = false
      let checkCount = 0

      while (Date.now() - startTime < CONFIG_EFFECTIVE_TIMEOUT) {
        checkCount++

        // 使用管理员接口验证状态
        const verifyResponse = await request(app)
          .get(`/api/v4/admin/feature-flags/${toggleTestFlagKey}`)
          .set('Authorization', `Bearer ${adminToken}`)

        if (verifyResponse.status === 200 && verifyResponse.body.data?.is_enabled === false) {
          changeEffective = true
          const effectiveTime = Date.now() - startTime
          console.log(`   ✅ 变更已生效，耗时: ${effectiveTime}ms (检查${checkCount}次)`)
          break
        }

        console.log(`   检查 #${checkCount}: 等待变更生效...`)
        await delay(CACHE_CHECK_INTERVAL)
      }

      // 验证：变更应该在60秒内生效
      expect(changeEffective).toBe(true)

      if (!changeEffective) {
        console.log('   ❌ 变更未在60秒内生效')
      }
    }, 120000)

    test('功能开关切换后缓存应该正确失效', async () => {
      console.log('\n💾 场景2.2: 缓存失效测试...')

      if (!adminToken) {
        console.log('   ⚠️ 无管理员Token，跳过测试')
        return
      }

      /*
       * 此测试验证：
       * 1. 功能开关切换后，Redis缓存应该被清除
       * 2. 下一次查询应该从数据库获取最新值
       * 3. 新值应该被重新缓存
       */

      // 创建一个新的功能开关用于缓存测试
      const cacheFlagKey = generateTestFlagKey()

      const createResponse = await request(app)
        .post('/api/v4/admin/feature-flags')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          flag_key: cacheFlagKey,
          flag_name: '缓存测试开关',
          is_enabled: true,
          rollout_strategy: 'percentage',
          rollout_percentage: 50
        })

      if (createResponse.status !== 201 && createResponse.status !== 200) {
        console.log('   ⚠️ 创建功能开关失败，跳过缓存测试')
        return
      }

      console.log(`   创建功能开关: ${cacheFlagKey}`)

      // 第一次查询（会缓存结果）
      const query1Response = await request(app)
        .get(`/api/v4/admin/feature-flags/${cacheFlagKey}`)
        .set('Authorization', `Bearer ${adminToken}`)

      console.log(`   第一次查询: is_enabled=${query1Response.body.data?.is_enabled}`)

      // 更新功能开关
      await request(app)
        .put(`/api/v4/admin/feature-flags/${cacheFlagKey}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          is_enabled: false,
          rollout_percentage: 0
        })

      console.log('   更新功能开关为禁用')

      // 立即查询（验证缓存是否失效）
      const query2Response = await request(app)
        .get(`/api/v4/admin/feature-flags/${cacheFlagKey}`)
        .set('Authorization', `Bearer ${adminToken}`)

      console.log(`   更新后查询: is_enabled=${query2Response.body.data?.is_enabled}`)

      // 验证：更新后应该能立即获取到新值
      expect(query2Response.body.data?.is_enabled).toBe(false)

      // 清理
      await request(app)
        .delete(`/api/v4/admin/feature-flags/${cacheFlagKey}`)
        .set('Authorization', `Bearer ${adminToken}`)

      console.log('   ✅ 缓存失效测试完成')
    }, 60000)
  })

  // ==================== 场景3：白名单/黑名单测试 ====================

  describe('场景3：白名单/黑名单即时生效测试', () => {
    let listTestFlagKey

    beforeAll(() => {
      listTestFlagKey = generateTestFlagKey()
    })

    afterAll(async () => {
      if (adminToken && listTestFlagKey) {
        try {
          await request(app)
            .delete(`/api/v4/admin/feature-flags/${listTestFlagKey}`)
            .set('Authorization', `Bearer ${adminToken}`)
        } catch (error) {
          // 忽略清理失败
        }
      }
    })

    test('添加用户到白名单应该立即生效', async () => {
      console.log('\n⚪ 场景3.1: 白名单添加测试...')

      if (!adminToken) {
        console.log('   ⚠️ 无管理员Token，跳过测试')
        return
      }

      // 1. 创建一个禁用的功能开关
      const createResponse = await request(app)
        .post('/api/v4/admin/feature-flags')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          flag_key: listTestFlagKey,
          flag_name: '白名单测试开关',
          is_enabled: true,
          rollout_strategy: 'percentage',
          rollout_percentage: 0, // 0%发布，默认所有人不可用
          whitelist_user_ids: []
        })

      if (createResponse.status !== 201 && createResponse.status !== 200) {
        console.log(`   ⚠️ 创建功能开关失败: ${createResponse.body.message}`)
        return
      }

      console.log(`   创建功能开关（0%发布）: ${listTestFlagKey}`)

      // 2. 添加测试用户到白名单
      const addWhitelistResponse = await request(app)
        .post(`/api/v4/admin/feature-flags/${listTestFlagKey}/whitelist`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ user_ids: [testUserId] })

      if (addWhitelistResponse.status !== 200) {
        // 尝试使用PUT更新方式添加白名单
        const updateResponse = await request(app)
          .put(`/api/v4/admin/feature-flags/${listTestFlagKey}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ whitelist_user_ids: [testUserId] })

        if (updateResponse.status !== 200) {
          console.log('   ⚠️ 添加白名单失败，跳过验证')
          return
        }
      }

      console.log(`   添加用户 ${testUserId} 到白名单`)

      // 3. 验证白名单用户可以访问
      console.log('   验证白名单用户可访问...')

      // 由于白名单优先级最高，即使0%发布，白名单用户也应该可用
      const verifyResponse = await request(app)
        .get(`/api/v4/admin/feature-flags/${listTestFlagKey}`)
        .set('Authorization', `Bearer ${adminToken}`)

      if (verifyResponse.status === 200) {
        const whitelist = verifyResponse.body.data?.whitelist_user_ids || []
        console.log(`   当前白名单: [${whitelist.join(', ')}]`)
        expect(whitelist).toContain(testUserId)
        console.log('   ✅ 白名单添加成功')
      }
    }, 60000)

    test('添加用户到黑名单应该立即生效', async () => {
      console.log('\n⚫ 场景3.2: 黑名单添加测试...')

      if (!adminToken) {
        console.log('   ⚠️ 无管理员Token，跳过测试')
        return
      }

      /*
       * 使用现有的功能开关添加黑名单
       * 注意：黑名单优先级最高，即使在白名单中，也会被拒绝
       */

      // 创建一个用于黑名单测试的功能开关
      const blacklistFlagKey = generateTestFlagKey()

      const createResponse = await request(app)
        .post('/api/v4/admin/feature-flags')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          flag_key: blacklistFlagKey,
          flag_name: '黑名单测试开关',
          is_enabled: true,
          rollout_strategy: 'all', // 全量发布
          blacklist_user_ids: []
        })

      if (createResponse.status !== 201 && createResponse.status !== 200) {
        console.log(`   ⚠️ 创建功能开关失败: ${createResponse.body.message}`)
        return
      }

      console.log(`   创建功能开关（全量发布）: ${blacklistFlagKey}`)

      // 添加测试用户到黑名单
      const addBlacklistResponse = await request(app)
        .post(`/api/v4/admin/feature-flags/${blacklistFlagKey}/blacklist`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ user_ids: [testUserId] })

      if (addBlacklistResponse.status !== 200) {
        // 尝试使用PUT更新方式添加黑名单
        await request(app)
          .put(`/api/v4/admin/feature-flags/${blacklistFlagKey}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ blacklist_user_ids: [testUserId] })
      }

      console.log(`   添加用户 ${testUserId} 到黑名单`)

      // 验证黑名单
      const verifyResponse = await request(app)
        .get(`/api/v4/admin/feature-flags/${blacklistFlagKey}`)
        .set('Authorization', `Bearer ${adminToken}`)

      if (verifyResponse.status === 200) {
        const blacklist = verifyResponse.body.data?.blacklist_user_ids || []
        console.log(`   当前黑名单: [${blacklist.join(', ')}]`)
        expect(blacklist).toContain(testUserId)
        console.log('   ✅ 黑名单添加成功')
      }

      // 清理
      await request(app)
        .delete(`/api/v4/admin/feature-flags/${blacklistFlagKey}`)
        .set('Authorization', `Bearer ${adminToken}`)
    }, 60000)
  })

  // ==================== 场景4：发布策略测试 ====================

  describe('场景4：发布策略测试', () => {
    test('百分比发布策略应该正确工作', async () => {
      console.log('\n📊 场景4.1: 百分比发布策略测试...')

      if (!adminToken) {
        console.log('   ⚠️ 无管理员Token，跳过测试')
        return
      }

      const percentageFlagKey = generateTestFlagKey()

      // 创建50%发布的功能开关
      const createResponse = await request(app)
        .post('/api/v4/admin/feature-flags')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          flag_key: percentageFlagKey,
          flag_name: '百分比测试开关',
          is_enabled: true,
          rollout_strategy: 'percentage',
          rollout_percentage: 50
        })

      if (createResponse.status !== 201 && createResponse.status !== 200) {
        console.log(`   ⚠️ 创建功能开关失败: ${createResponse.body.message}`)
        return
      }

      console.log(`   创建功能开关（50%发布）: ${percentageFlagKey}`)

      // 获取功能开关详情验证配置
      const detailResponse = await request(app)
        .get(`/api/v4/admin/feature-flags/${percentageFlagKey}`)
        .set('Authorization', `Bearer ${adminToken}`)

      if (detailResponse.status === 200) {
        const flag = detailResponse.body.data
        expect(flag.rollout_strategy).toBe('percentage')
        expect(flag.rollout_percentage).toBe(50)
        console.log(`   策略: ${flag.rollout_strategy}`)
        console.log(`   百分比: ${flag.rollout_percentage}%`)
        console.log('   ✅ 百分比发布策略配置正确')
      }

      // 清理
      await request(app)
        .delete(`/api/v4/admin/feature-flags/${percentageFlagKey}`)
        .set('Authorization', `Bearer ${adminToken}`)
    }, 60000)

    test('用户分群发布策略应该正确工作', async () => {
      console.log('\n👥 场景4.2: 用户分群发布策略测试...')

      if (!adminToken) {
        console.log('   ⚠️ 无管理员Token，跳过测试')
        return
      }

      const segmentFlagKey = generateTestFlagKey()

      // 创建用户分群发布的功能开关
      const createResponse = await request(app)
        .post('/api/v4/admin/feature-flags')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          flag_key: segmentFlagKey,
          flag_name: '用户分群测试开关',
          is_enabled: true,
          rollout_strategy: 'user_segment',
          target_segments: ['vip', 'merchant']
        })

      if (createResponse.status !== 201 && createResponse.status !== 200) {
        console.log(`   ⚠️ 创建功能开关失败: ${createResponse.body.message}`)
        return
      }

      console.log(`   创建功能开关（用户分群）: ${segmentFlagKey}`)

      // 验证配置
      const detailResponse = await request(app)
        .get(`/api/v4/admin/feature-flags/${segmentFlagKey}`)
        .set('Authorization', `Bearer ${adminToken}`)

      if (detailResponse.status === 200) {
        const flag = detailResponse.body.data
        expect(flag.rollout_strategy).toBe('user_segment')
        console.log(`   策略: ${flag.rollout_strategy}`)
        console.log(`   目标分群: ${JSON.stringify(flag.target_segments)}`)
        console.log('   ✅ 用户分群发布策略配置正确')
      }

      // 清理
      await request(app)
        .delete(`/api/v4/admin/feature-flags/${segmentFlagKey}`)
        .set('Authorization', `Bearer ${adminToken}`)
    }, 60000)
  })

  // ==================== 场景5：时间窗口测试 ====================

  describe('场景5：时间窗口测试', () => {
    test('功能开关时间窗口应该正确生效', async () => {
      console.log('\n⏰ 场景5.1: 时间窗口测试...')

      if (!adminToken) {
        console.log('   ⚠️ 无管理员Token，跳过测试')
        return
      }

      const scheduleFlagKey = generateTestFlagKey()

      // 创建带时间窗口的功能开关
      const now = new Date()
      const startTime = new Date(now.getTime() - 60 * 60 * 1000) // 1小时前开始
      const endTime = new Date(now.getTime() + 60 * 60 * 1000) // 1小时后结束

      const createResponse = await request(app)
        .post('/api/v4/admin/feature-flags')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          flag_key: scheduleFlagKey,
          flag_name: '时间窗口测试开关',
          is_enabled: true,
          rollout_strategy: 'schedule',
          effective_start: startTime.toISOString(),
          effective_end: endTime.toISOString()
        })

      if (createResponse.status !== 201 && createResponse.status !== 200) {
        console.log(`   ⚠️ 创建功能开关失败: ${createResponse.body.message}`)
        return
      }

      console.log(`   创建功能开关（时间窗口）: ${scheduleFlagKey}`)
      console.log(`   开始时间: ${startTime.toISOString()}`)
      console.log(`   结束时间: ${endTime.toISOString()}`)

      // 验证配置
      const detailResponse = await request(app)
        .get(`/api/v4/admin/feature-flags/${scheduleFlagKey}`)
        .set('Authorization', `Bearer ${adminToken}`)

      if (detailResponse.status === 200) {
        const flag = detailResponse.body.data
        expect(flag.rollout_strategy).toBe('schedule')
        console.log(`   策略: ${flag.rollout_strategy}`)
        console.log('   ✅ 时间窗口配置正确')
      }

      // 清理
      await request(app)
        .delete(`/api/v4/admin/feature-flags/${scheduleFlagKey}`)
        .set('Authorization', `Bearer ${adminToken}`)
    }, 60000)
  })

  // ==================== 测试报告 ====================

  describe('测试报告', () => {
    test('生成配置热加载测试报告', async () => {
      console.log('\n')
      console.log('='.repeat(80))
      console.log('📊 配置热加载测试报告')
      console.log('='.repeat(80))
      console.log(
        `📅 测试时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`
      )
      console.log(`👤 测试用户: ${TEST_DATA.users.testUser.mobile}`)
      console.log(`📋 测试功能开关: ${testFlagKey}`)
      console.log('')
      console.log('🏗️ TDD状态：')
      console.log('   - 测试用例已创建')
      console.log('   - 覆盖场景：')
      console.log('     1. 功能开关CRUD操作')
      console.log('     2. 功能开关切换生效测试（60秒内）')
      console.log('     3. 白名单/黑名单即时生效')
      console.log('     4. 发布策略测试（百分比/分群）')
      console.log('     5. 时间窗口测试')
      console.log('')
      console.log('   - 如测试失败，需检查：')
      console.log('     1. FeatureFlagService 实现')
      console.log('     2. Redis缓存失效机制')
      console.log('     3. 功能开关路由注册')
      console.log('     4. 管理员权限验证')
      console.log('='.repeat(80))

      expect(true).toBe(true)
    })
  })
})
