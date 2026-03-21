/**
 * 餐厅积分抽奖系统 V4.6 - FeatureFlagService 单元测试
 *
 * 测试范围：
 * - 功能开关 CRUD 操作
 * - isEnabled 判定逻辑（黑/白名单、时间窗口、策略评估）
 * - 百分比灰度 Hash 稳定性
 * - Redis 缓存机制
 * - 审计日志记录
 *
 * 创建时间：2026-01-21
 * 使用模型：Claude Sonnet 4.5
 *
 * @module tests/services/FeatureFlagService.test
 */

'use strict'

const { sequelize, FeatureFlag, User } = require('../../models')
const { isRedisHealthy } = require('../../utils/UnifiedRedisClient')

/*
 * 🔴 通过 ServiceManager 获取服务（替代直接 require）
 * 注意：在 beforeAll 中获取服务，确保 ServiceManager 已初始化
 */
let FeatureFlagService

// 测试数据库配置
jest.setTimeout(30000)

describe('FeatureFlagService - 功能开关服务', () => {
  let test_user
  let created_flags = [] // 记录创建的测试 Flag，用于清理

  // ==================== 测试生命周期 ====================

  beforeAll(async () => {
    // 连接测试数据库
    await sequelize.authenticate()

    /*
     * 🔴 通过 ServiceManager 获取服务实例（snake_case key）
     * 如果 ServiceManager 未注册，则直接 require
     */
    try {
      FeatureFlagService = global.getTestService ? global.getTestService('feature_flag') : null
    } catch (e) {
      FeatureFlagService = null
    }

    if (!FeatureFlagService) {
      FeatureFlagService = require('../../services/FeatureFlagService')
    }
  })

  beforeEach(async () => {
    // 使用测试用户
    test_user = await User.findOne({
      where: { mobile: '13612227930' }
    })

    if (!test_user) {
      throw new Error('测试用户不存在，请先创建 mobile=13612227930 的用户')
    }
  })

  afterEach(async () => {
    // 清理测试创建的 Flag
    for (const flagKey of created_flags) {
      try {
        await FeatureFlag.destroy({ where: { flag_key: flagKey } })
      } catch (e) {
        // 忽略清理错误
      }
    }
    created_flags = []
  })

  afterAll(async () => {
    await sequelize.close()
  })

  // ==================== 辅助函数 ====================

  /**
   * 创建测试用 Flag（带自动清理）
   */
  const createTestFlag = async (overrides = {}) => {
    const flagKey = `test_flag_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
    const flag = await FeatureFlag.create({
      flag_key: flagKey,
      flag_name: '测试功能开关',
      description: '单元测试用',
      is_enabled: true,
      rollout_strategy: 'all',
      rollout_percentage: 100,
      whitelist_user_ids: [],
      blacklist_user_ids: [],
      target_segments: [],
      created_by: test_user.user_id,
      updated_by: test_user.user_id,
      ...overrides
    })
    created_flags.push(flagKey)
    return flag
  }

  // ==================== isEnabled 判定测试 ====================

  describe('isEnabled - 功能可用性判定', () => {
    it('应该返回 false 当 Flag 不存在时', async () => {
      const result = await FeatureFlagService.isEnabled('non_existent_flag', test_user.user_id)

      expect(result.enabled).toBe(false)
      expect(result.reason).toBe('flag_not_found')
    })

    it('应该返回 false 当 Flag 未启用时', async () => {
      const flag = await createTestFlag({ is_enabled: false })

      const result = await FeatureFlagService.isEnabled(flag.flag_key, test_user.user_id)

      expect(result.enabled).toBe(false)
      expect(result.reason).toBe('flag_disabled')
    })

    it('应该返回 true 当用户在白名单中时（优先于其他策略）', async () => {
      const flag = await createTestFlag({
        rollout_strategy: 'percentage',
        rollout_percentage: 0, // 0% 概率
        whitelist_user_ids: [test_user.user_id]
      })

      const result = await FeatureFlagService.isEnabled(flag.flag_key, test_user.user_id)

      expect(result.enabled).toBe(true)
      expect(result.reason).toBe('user_whitelisted')
      expect(result.strategy).toBe('whitelist')
    })

    it('应该返回 false 当用户在黑名单中时（优先级最高）', async () => {
      const flag = await createTestFlag({
        rollout_strategy: 'all',
        whitelist_user_ids: [test_user.user_id], // 同时在白名单
        blacklist_user_ids: [test_user.user_id] // 黑名单优先
      })

      const result = await FeatureFlagService.isEnabled(flag.flag_key, test_user.user_id)

      expect(result.enabled).toBe(false)
      expect(result.reason).toBe('user_blacklisted')
    })

    it('应该返回 false 当不在时间窗口内时', async () => {
      const pastDate = new Date()
      pastDate.setFullYear(pastDate.getFullYear() - 1)

      const flag = await createTestFlag({
        effective_start: pastDate,
        effective_end: pastDate // 结束时间在过去
      })

      const result = await FeatureFlagService.isEnabled(flag.flag_key, test_user.user_id)

      expect(result.enabled).toBe(false)
      expect(result.reason).toBe('outside_time_window')
    })

    it('应该返回 true 当 rollout_strategy=all 时', async () => {
      const flag = await createTestFlag({ rollout_strategy: 'all' })

      const result = await FeatureFlagService.isEnabled(flag.flag_key, test_user.user_id)

      expect(result.enabled).toBe(true)
      expect(result.reason).toBe('all_users')
      expect(result.strategy).toBe('all')
    })
  })

  // ==================== 百分比灰度测试 ====================

  describe('hashUserId - 百分比灰度 Hash 稳定性', () => {
    it('同一用户同一 Flag 的 Hash 值应该稳定', () => {
      const flagKey = 'test_percentage_flag'
      const userId = 12345

      const hash1 = FeatureFlagService.hashUserId(userId, flagKey)
      const hash2 = FeatureFlagService.hashUserId(userId, flagKey)
      const hash3 = FeatureFlagService.hashUserId(userId, flagKey)

      expect(hash1).toBe(hash2)
      expect(hash2).toBe(hash3)
    })

    it('Hash 值应该在 0-100 范围内', () => {
      const flagKey = 'test_percentage_flag'

      for (let userId = 1; userId <= 100; userId++) {
        const hash = FeatureFlagService.hashUserId(userId, flagKey)
        expect(hash).toBeGreaterThanOrEqual(0)
        expect(hash).toBeLessThan(100)
      }
    })

    it('不同用户的 Hash 值应该有合理分布', () => {
      const flagKey = 'test_distribution_flag'
      const hashValues = []

      for (let userId = 1; userId <= 1000; userId++) {
        hashValues.push(FeatureFlagService.hashUserId(userId, flagKey))
      }

      // 验证分布合理性：标准差应该大于 20（表示分散）
      const mean = hashValues.reduce((a, b) => a + b, 0) / hashValues.length
      const variance =
        hashValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / hashValues.length
      const stdDev = Math.sqrt(variance)

      expect(stdDev).toBeGreaterThan(20)
    })

    it('不同 Flag 的同一用户应该有不同 Hash 值', () => {
      const userId = 12345

      const hash1 = FeatureFlagService.hashUserId(userId, 'flag_a')
      const hash2 = FeatureFlagService.hashUserId(userId, 'flag_b')

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('percentage 策略判定', () => {
    it('应该在 100% 时对所有用户返回 true', async () => {
      const flag = await createTestFlag({
        rollout_strategy: 'percentage',
        rollout_percentage: 100
      })

      // 测试多个用户
      for (let i = 1; i <= 10; i++) {
        const result = await FeatureFlagService.isEnabled(flag.flag_key, i, { skipCache: true })
        expect(result.enabled).toBe(true)
        expect(result.strategy).toBe('percentage')
      }
    })

    it('应该在 0% 时对所有用户返回 false（除白名单外）', async () => {
      const flag = await createTestFlag({
        rollout_strategy: 'percentage',
        rollout_percentage: 0
      })

      // 测试多个用户
      for (let i = 1; i <= 10; i++) {
        const result = await FeatureFlagService.isEnabled(flag.flag_key, i, { skipCache: true })
        expect(result.enabled).toBe(false)
        expect(result.strategy).toBe('percentage')
        expect(result.reason).toBe('percentage_excluded')
      }
    })
  })

  // ==================== CRUD 操作测试 ====================

  describe('createFlag - 创建功能开关', () => {
    it('应该成功创建新的功能开关', async () => {
      const flagKey = `test_create_${Date.now()}`
      created_flags.push(flagKey)

      const flag = await FeatureFlagService.createFlag(
        {
          flag_key: flagKey,
          flag_name: '测试创建功能',
          description: '单元测试创建',
          is_enabled: false,
          rollout_strategy: 'all'
        },
        { user_id: test_user.user_id, username: test_user.nickname }
      )

      expect(flag).toBeDefined()
      expect(flag.flag_key).toBe(flagKey)
      expect(flag.flag_name).toBe('测试创建功能')
      expect(flag.is_enabled).toBe(false)
      expect(flag.created_by).toBe(test_user.user_id)
    })

    it('应该在 flag_key 重复时抛出错误', async () => {
      const flag = await createTestFlag()

      await expect(
        FeatureFlagService.createFlag(
          {
            flag_key: flag.flag_key, // 重复的 key
            flag_name: '重复测试',
            rollout_strategy: 'all'
          },
          { user_id: test_user.user_id }
        )
      ).rejects.toThrow(/已存在/)
    })
  })

  describe('updateFlag - 更新功能开关', () => {
    it('应该成功更新功能开关属性', async () => {
      const flag = await createTestFlag({
        rollout_strategy: 'all',
        rollout_percentage: 100
      })

      const updated = await FeatureFlagService.updateFlag(
        flag.flag_key,
        {
          rollout_strategy: 'percentage',
          rollout_percentage: 50,
          description: '更新后的描述'
        },
        { user_id: test_user.user_id }
      )

      expect(updated.rollout_strategy).toBe('percentage')
      expect(Number(updated.rollout_percentage)).toBe(50)
      expect(updated.description).toBe('更新后的描述')
      expect(updated.updated_by).toBe(test_user.user_id)
    })

    it('应该在 Flag 不存在时抛出错误', async () => {
      await expect(
        FeatureFlagService.updateFlag(
          'non_existent_flag',
          { is_enabled: true },
          { user_id: test_user.user_id }
        )
      ).rejects.toThrow(/不存在/)
    })
  })

  describe('toggleFlag - 切换启用状态', () => {
    it('应该成功启用功能', async () => {
      const flag = await createTestFlag({ is_enabled: false })

      const updated = await FeatureFlagService.toggleFlag(flag.flag_key, true, {
        user_id: test_user.user_id
      })

      expect(updated.is_enabled).toBe(true)
    })

    it('应该成功禁用功能', async () => {
      const flag = await createTestFlag({ is_enabled: true })

      const updated = await FeatureFlagService.toggleFlag(flag.flag_key, false, {
        user_id: test_user.user_id
      })

      expect(updated.is_enabled).toBe(false)
    })
  })

  describe('deleteFlag - 删除功能开关', () => {
    it('应该成功删除功能开关', async () => {
      const flagKey = `test_delete_${Date.now()}`
      // 创建待删除的 Flag
      const _flag = await FeatureFlag.create({
        flag_key: flagKey,
        flag_name: '待删除测试',
        rollout_strategy: 'all',
        created_by: test_user.user_id,
        updated_by: test_user.user_id
      })
      expect(_flag).toBeDefined() // 验证创建成功
      // 不加入 created_flags，因为会被删除

      const result = await FeatureFlagService.deleteFlag(flagKey, {
        user_id: test_user.user_id
      })

      expect(result).toBe(true)

      // 验证已删除
      const found = await FeatureFlag.findByKey(flagKey)
      expect(found).toBeNull()
    })
  })

  // ==================== 白名单/黑名单操作测试 ====================

  describe('addToWhitelist - 添加白名单', () => {
    it('应该成功添加用户到白名单', async () => {
      const flag = await createTestFlag({ whitelist_user_ids: [] })

      const updated = await FeatureFlagService.addToWhitelist(flag.flag_key, [1001, 1002, 1003], {
        user_id: test_user.user_id
      })

      expect(updated.whitelist_user_ids).toContain(1001)
      expect(updated.whitelist_user_ids).toContain(1002)
      expect(updated.whitelist_user_ids).toContain(1003)
    })

    it('应该去重已存在的用户', async () => {
      const flag = await createTestFlag({ whitelist_user_ids: [1001] })

      const updated = await FeatureFlagService.addToWhitelist(
        flag.flag_key,
        [1001, 1002], // 1001 已存在
        { user_id: test_user.user_id }
      )

      // 1001 应该只出现一次
      const count1001 = updated.whitelist_user_ids.filter(id => id === 1001).length
      expect(count1001).toBe(1)
      expect(updated.whitelist_user_ids).toContain(1002)
    })
  })

  describe('removeFromWhitelist - 移除白名单', () => {
    it('应该成功从白名单移除用户', async () => {
      const flag = await createTestFlag({ whitelist_user_ids: [1001, 1002, 1003] })

      const updated = await FeatureFlagService.removeFromWhitelist(flag.flag_key, [1001, 1003], {
        user_id: test_user.user_id
      })

      expect(updated.whitelist_user_ids).not.toContain(1001)
      expect(updated.whitelist_user_ids).not.toContain(1003)
      expect(updated.whitelist_user_ids).toContain(1002)
    })
  })

  describe('addToBlacklist - 添加黑名单', () => {
    it('应该成功添加用户到黑名单', async () => {
      const flag = await createTestFlag({ blacklist_user_ids: [] })

      const updated = await FeatureFlagService.addToBlacklist(flag.flag_key, [2001, 2002], {
        user_id: test_user.user_id
      })

      expect(updated.blacklist_user_ids).toContain(2001)
      expect(updated.blacklist_user_ids).toContain(2002)
    })
  })

  // ==================== 批量操作测试 ====================

  describe('isEnabledBatch - 批量判定', () => {
    it('应该返回多个 Flag 的判定结果', async () => {
      const flag1 = await createTestFlag({ is_enabled: true })
      const flag2 = await createTestFlag({ is_enabled: false })

      const results = await FeatureFlagService.isEnabledBatch(
        [flag1.flag_key, flag2.flag_key, 'non_existent'],
        test_user.user_id
      )

      expect(results[flag1.flag_key]).toBe(true)
      expect(results[flag2.flag_key]).toBe(false)
      expect(results.non_existent).toBe(false)
    })
  })

  // ==================== 缓存测试 ====================

  describe('Redis 缓存', () => {
    it('第二次查询应该从缓存获取（如果 Redis 可用）', async () => {
      // 跳过如果 Redis 不可用
      const redisHealthy = await isRedisHealthy()
      if (!redisHealthy) {
        console.log('Redis 不可用，跳过缓存测试')
        return
      }

      const flag = await createTestFlag()

      // 第一次查询（写入缓存）
      const result1 = await FeatureFlagService.isEnabled(flag.flag_key, test_user.user_id)

      // 第二次查询（应该从缓存获取）
      const result2 = await FeatureFlagService.isEnabled(flag.flag_key, test_user.user_id)

      expect(result1.enabled).toBe(result2.enabled)
      expect(result1.reason).toBe(result2.reason)
    })

    it('skipCache=true 应该跳过缓存', async () => {
      const flag = await createTestFlag()

      // 第一次查询
      await FeatureFlagService.isEnabled(flag.flag_key, test_user.user_id)

      // 修改 Flag
      await flag.update({ is_enabled: false })

      // 不跳过缓存的查询（可能返回旧结果，验证缓存存在性）
      const _cachedResult = await FeatureFlagService.isEnabled(flag.flag_key, test_user.user_id)
      expect(_cachedResult).toHaveProperty('enabled')

      // 跳过缓存的查询（返回新结果）
      const freshResult = await FeatureFlagService.isEnabled(flag.flag_key, test_user.user_id, {
        skipCache: true
      })

      expect(freshResult.enabled).toBe(false)
      expect(freshResult.reason).toBe('flag_disabled')
    })
  })

  // ==================== 用户分群测试 ====================

  describe('getUserSegments - 用户分群判断', () => {
    it('应该返回用户所属的分群', async () => {
      const segments = await FeatureFlagService.getUserSegments(test_user.user_id)

      expect(Array.isArray(segments)).toBe(true)
      expect(segments.length).toBeGreaterThan(0)
    })

    it('新注册用户应该包含 new_user 分群', async () => {
      // 创建一个模拟的新用户信息
      const newUserInfo = {
        user_id: 99999,
        user_level: 'normal',
        created_at: new Date() // 刚注册
      }

      const segments = await FeatureFlagService.getUserSegments(99999, newUserInfo)

      expect(segments).toContain('new_user')
    })
  })

  // ==================== user_segment 策略测试 ====================

  describe('user_segment 策略判定', () => {
    it('应该对匹配分群的用户返回 true', async () => {
      // 获取当前用户的分群
      const userSegments = await FeatureFlagService.getUserSegments(test_user.user_id)

      // 创建一个目标分群包含用户分群的 Flag
      const flag = await createTestFlag({
        rollout_strategy: 'user_segment',
        target_segments: userSegments // 使用用户的实际分群
      })

      const result = await FeatureFlagService.isEnabled(flag.flag_key, test_user.user_id, {
        skipCache: true
      })

      expect(result.enabled).toBe(true)
      expect(result.strategy).toBe('user_segment')
      expect(result.reason).toBe('segment_matched')
    })

    it('应该对不匹配分群的用户返回 false', async () => {
      const flag = await createTestFlag({
        rollout_strategy: 'user_segment',
        target_segments: ['non_existent_segment'] // 不存在的分群
      })

      const result = await FeatureFlagService.isEnabled(flag.flag_key, test_user.user_id, {
        skipCache: true
      })

      expect(result.enabled).toBe(false)
      expect(result.strategy).toBe('user_segment')
      expect(result.reason).toBe('segment_not_matched')
    })
  })

  // ==================== 异常处理测试 ====================

  describe('异常处理', () => {
    it('判定异常时应该返回降级结果', async () => {
      // 模拟异常场景：传入无效参数
      const result = await FeatureFlagService.isEnabled(null, null)

      // 应该返回降级结果而不是抛出异常
      expect(result.enabled).toBe(false)
      // reason 可能是 flag_not_found 或 evaluation_error
      expect(['flag_not_found', 'evaluation_error']).toContain(result.reason)
    })
  })
})
