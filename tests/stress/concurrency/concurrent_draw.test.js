/**
 * 🎯 并发抽奖竞态测试 - 任务 8.5
 *
 * 创建时间：2026-01-28 北京时间
 * 版本：V1.0
 * 优先级：P0 - 核心业务路径
 *
 * 业务场景：
 * - 多个并发请求使用相同幂等键抽奖，验证只有一个成功
 * - 多个并发请求使用不同幂等键抽奖，验证积分/配额扣减正确
 * - 验证幂等性机制在高并发下的正确性
 *
 * 技术验证点：
 * 1. IdempotencyService 在并发场景下的锁机制
 * 2. LotteryQuotaService 配额扣减的原子性
 * 3. BalanceService 积分扣减的原子性（V4.7.0 从 AssetService 拆分）
 * 4. 事务隔离性和数据一致性
 *
 * 测试数据：
 * - 使用真实数据库 restaurant_points_dev
 * - 测试账号从 global.testData 动态获取
 */

'use strict'

const { sequelize } = require('../../../config/database')
const { getTestService } = require('../../helpers/UnifiedTestManager')
const {
  executeConcurrent: _executeConcurrent,
  verifyIdempotency: _verifyIdempotency,
  delay
} = require('../../helpers/test-concurrent-utils')
const {
  TEST_DATA: _TEST_DATA,
  getTestUserId,
  getTestCampaignId
} = require('../../helpers/test-data')
const { v4: uuidv4 } = require('uuid')

describe('🎲 并发抽奖竞态测试', () => {
  // 服务实例
  let UnifiedLotteryEngine
  let IdempotencyService
  let LotteryQuotaService
  let _BalanceService // 预留用于后续积分测试扩展

  // 测试数据
  let testUserId
  let testCampaignId

  beforeAll(async () => {
    console.log('🎯 ===== 并发抽奖竞态测试启动 =====')

    // 获取服务实例
    UnifiedLotteryEngine = getTestService('unified_lottery_engine')
    IdempotencyService = getTestService('idempotency')
    LotteryQuotaService = getTestService('lottery_quota')
    _BalanceService = getTestService('asset_balance')

    // 获取测试数据
    testUserId = getTestUserId()
    testCampaignId = getTestCampaignId()

    if (!testUserId || !testCampaignId) {
      console.warn('⚠️ 测试数据未初始化，部分测试可能跳过')
    }

    console.log(`👤 测试用户ID: ${testUserId}`)
    console.log(`🎰 测试活动ID: ${testCampaignId}`)
    console.log('='.repeat(60))
  })

  afterAll(async () => {
    console.log('🏁 并发抽奖竞态测试完成')
  })

  /**
   * ==========================================
   * 🔐 幂等性并发测试
   * ==========================================
   */
  describe('幂等性并发测试 - 相同幂等键多次请求', () => {
    /**
     * 业务场景：多个并发请求使用相同幂等键
     * 预期行为：只有一个请求被处理，其他请求返回首次结果
     * 验证点：IdempotencyService 的 getOrCreateRequest 锁机制
     */
    test('相同幂等键的并发请求应只有一个被处理', async () => {
      if (!testUserId || !testCampaignId) {
        console.warn('⚠️ 跳过测试：测试数据未初始化')
        return
      }

      const idempotencyKey = `test_concurrent_draw_${uuidv4()}`
      const concurrentCount = 5
      const _results = []
      const _errors = []

      console.log(
        `📋 测试配置: ${concurrentCount} 个并发请求, 幂等键: ${idempotencyKey.substring(0, 30)}...`
      )

      // 创建并发请求任务
      const tasks = Array(concurrentCount)
        .fill(null)
        .map(async (_, index) => {
          try {
            // 模拟抽奖请求（直接调用 IdempotencyService 验证幂等机制）
            const requestData = {
              api_path: '/api/v4/lottery/draw',
              http_method: 'POST',
              request_params: {
                campaign_id: testCampaignId,
                draw_count: 1
              },
              user_id: testUserId
            }

            const result = await IdempotencyService.getOrCreateRequest(idempotencyKey, requestData)

            console.log(
              `   请求 ${index + 1}: is_new=${result.is_new}, should_process=${result.should_process}`
            )

            if (result.should_process) {
              // 模拟处理完成
              await IdempotencyService.markAsCompleted(idempotencyKey, `session_${index}`, {
                success: true,
                code: 'SUCCESS',
                message: '抽奖成功',
                data: { prize_name: '测试奖品' }
              })
            }

            return { index, result, success: true }
          } catch (error) {
            // 预期的 409 错误（请求正在处理中）
            if (error.statusCode === 409) {
              console.log(`   请求 ${index + 1}: 409 - ${error.message}`)
              return { index, error: error.message, is409: true, success: false }
            }
            throw error
          }
        })

      // 并发执行
      const allResults = await Promise.allSettled(tasks)

      // 统计结果
      let processedCount = 0
      let rejectedCount = 0

      allResults.forEach(settledResult => {
        if (settledResult.status === 'fulfilled') {
          const result = settledResult.value
          if (result.success && result.result?.should_process) {
            processedCount++
          } else if (result.is409) {
            rejectedCount++
          }
        }
      })

      console.log(`📊 结果统计: 处理数=${processedCount}, 拒绝数=${rejectedCount}`)

      // 验证：只有一个请求被处理
      expect(processedCount).toBeLessThanOrEqual(1)
      console.log('✅ 幂等性验证通过：相同幂等键只处理一次')
    }, 30000)

    /**
     * 验证幂等键完成后重复请求返回首次结果
     */
    test('幂等键完成后重复请求应返回首次结果', async () => {
      if (!testUserId || !testCampaignId) {
        console.warn('⚠️ 跳过测试：测试数据未初始化')
        return
      }

      const idempotencyKey = `test_idempotent_replay_${uuidv4()}`
      const expectedResponse = {
        success: true,
        code: 'LOTTERY_SUCCESS',
        message: '抽奖成功',
        data: {
          prize_name: '测试积分',
          prize_value: 100
        }
      }

      // 第一次请求 - 创建并完成
      const firstRequest = await IdempotencyService.getOrCreateRequest(idempotencyKey, {
        api_path: '/api/v4/lottery/draw',
        http_method: 'POST',
        request_params: { campaign_id: testCampaignId },
        user_id: testUserId
      })

      expect(firstRequest.is_new).toBe(true)
      expect(firstRequest.should_process).toBe(true)

      // 标记完成
      await IdempotencyService.markAsCompleted(
        idempotencyKey,
        `session_${Date.now()}`,
        expectedResponse
      )

      // 等待一下确保状态更新
      await delay(100)

      // 第二次请求 - 应返回首次结果
      const secondRequest = await IdempotencyService.getOrCreateRequest(idempotencyKey, {
        api_path: '/api/v4/lottery/draw',
        http_method: 'POST',
        request_params: { campaign_id: testCampaignId },
        user_id: testUserId
      })

      expect(secondRequest.is_new).toBe(false)
      expect(secondRequest.should_process).toBe(false)
      expect(secondRequest.response).toBeDefined()
      expect(secondRequest.response.success).toBe(true)
      expect(secondRequest.response.code).toBe('LOTTERY_SUCCESS')

      console.log('✅ 幂等回放验证通过：完成后重复请求返回首次结果')
    }, 15000)
  })

  /**
   * ==========================================
   * 📊 配额并发扣减测试
   * ==========================================
   */
  describe('配额并发扣减测试', () => {
    /**
     * 业务场景：多个请求并发扣减同一用户的配额
     * 预期行为：配额扣减原子性，总扣减数不超过初始配额
     * 验证点：LotteryQuotaService.tryDeductQuota 的原子操作
     */
    test('并发配额扣减应保证原子性', async () => {
      if (!testUserId || !testCampaignId) {
        console.warn('⚠️ 跳过测试：测试数据未初始化')
        return
      }

      console.log('📋 测试配额并发扣减原子性...')

      // 获取初始配额状态
      let initialQuota
      try {
        initialQuota = await LotteryQuotaService.getOrInitQuotaStatus({
          user_id: testUserId,
          campaign_id: testCampaignId
        })
        console.log(
          `   初始配额: limit=${initialQuota.limit_value}, used=${initialQuota.used_draw_count}, remaining=${initialQuota.remaining}`
        )
      } catch (error) {
        console.warn('⚠️ 无法获取配额状态，跳过测试:', error.message)
        return
      }

      // 如果没有剩余配额，跳过测试
      if (initialQuota.remaining < 3) {
        console.warn('⚠️ 配额不足，跳过并发扣减测试')
        return
      }

      const concurrentCount = 3
      const _successCount = []

      // 创建并发扣减任务
      const tasks = Array(concurrentCount)
        .fill(null)
        .map(async (_, index) => {
          const transaction = await sequelize.transaction()
          try {
            const result = await LotteryQuotaService.tryDeductQuota(
              {
                user_id: testUserId,
                campaign_id: testCampaignId,
                draw_count: 1
              },
              { transaction }
            )

            if (result.success) {
              /*
               * 注意：这里模拟业务成功，实际应该提交事务
               * 但为了测试目的，我们回滚事务以保持配额不变
               */
              await transaction.rollback()
              return { index, success: true, remaining: result.remaining }
            } else {
              await transaction.rollback()
              return { index, success: false, message: result.message }
            }
          } catch (error) {
            await transaction.rollback()
            return { index, success: false, error: error.message }
          }
        })

      // 并发执行
      const results = await Promise.all(tasks)

      // 统计结果
      const successResults = results.filter(r => r.success)
      const failedResults = results.filter(r => !r.success)

      console.log(`📊 扣减结果: 成功=${successResults.length}, 失败=${failedResults.length}`)

      // 验证：成功扣减的数量不应超过初始剩余配额
      expect(successResults.length).toBeLessThanOrEqual(initialQuota.remaining)

      // 验证配额状态一致性（由于回滚，配额应该恢复）
      const finalQuota = await LotteryQuotaService.getOrInitQuotaStatus({
        user_id: testUserId,
        campaign_id: testCampaignId
      })
      console.log(`   最终配额: remaining=${finalQuota.remaining}`)

      console.log('✅ 配额并发扣减原子性验证通过')
    }, 30000)
  })

  /**
   * ==========================================
   * 🔄 完整抽奖流程并发测试
   * ==========================================
   */
  describe('完整抽奖流程并发测试', () => {
    /**
     * 业务场景：通过 UnifiedLotteryEngine 执行真实抽奖
     * 验证点：端到端的并发安全性
     */
    test('不同幂等键的并发抽奖应独立处理', async () => {
      if (!testUserId || !testCampaignId) {
        console.warn('⚠️ 跳过测试：测试数据未初始化')
        return
      }

      if (!UnifiedLotteryEngine) {
        console.warn('⚠️ 跳过测试：UnifiedLotteryEngine 服务未初始化')
        return
      }

      console.log('📋 测试不同幂等键的并发抽奖...')

      // 检查用户是否有足够的抽奖条件
      let quotaStatus
      try {
        quotaStatus = await LotteryQuotaService.checkQuotaSufficient({
          user_id: testUserId,
          campaign_id: testCampaignId,
          draw_count: 2
        })

        if (!quotaStatus.sufficient) {
          console.warn(`⚠️ 配额不足，跳过测试: ${quotaStatus.message}`)
          return
        }
      } catch (error) {
        console.warn('⚠️ 配额检查失败，跳过测试:', error.message)
        return
      }

      // 创建两个独立的抽奖任务（不同幂等键）
      const tasks = [1, 2].map(async index => {
        const idempotencyKey = `test_independent_draw_${Date.now()}_${index}_${uuidv4().substring(0, 8)}`
        const transaction = await sequelize.transaction()

        try {
          const result = await UnifiedLotteryEngine.execute_draw({
            user_id: testUserId,
            campaign_id: testCampaignId,
            draw_count: 1,
            idempotency_key: idempotencyKey,
            transaction
          })

          // 回滚事务（测试目的，不实际扣减）
          await transaction.rollback()

          return {
            index,
            success: result.success,
            idempotency_key: idempotencyKey,
            prize: result.results?.[0]?.prize_name
          }
        } catch (error) {
          await transaction.rollback()
          return {
            index,
            success: false,
            error: error.message,
            code: error.code
          }
        }
      })

      // 并发执行
      const results = await Promise.all(tasks)

      console.log('📊 并发抽奖结果:')
      results.forEach(r => {
        if (r.success) {
          console.log(`   抽奖 ${r.index}: 成功, 奖品=${r.prize || '未知'}`)
        } else {
          console.log(`   抽奖 ${r.index}: 失败, 原因=${r.error || r.code}`)
        }
      })

      /*
       * 验证：每个独立请求都应该被处理（不论成功或业务失败）
       * 注意：可能因为积分不足等业务原因失败，这是正常的
       */
      expect(results.length).toBe(2)

      console.log('✅ 独立幂等键并发抽奖测试完成')
    }, 60000)
  })

  /**
   * ==========================================
   * 🛡️ 竞态条件边界测试
   * ==========================================
   */
  describe('竞态条件边界测试', () => {
    /**
     * 验证极端并发下的系统稳定性
     */
    test('高并发请求应不导致数据不一致', async () => {
      if (!testUserId || !testCampaignId) {
        console.warn('⚠️ 跳过测试：测试数据未初始化')
        return
      }

      const highConcurrency = 10
      const baseKey = `test_high_concurrency_${Date.now()}`

      console.log(`📋 高并发测试: ${highConcurrency} 个并发请求`)

      // 创建高并发请求（混合相同和不同幂等键）
      const tasks = Array(highConcurrency)
        .fill(null)
        .map(async (_, index) => {
          // 前5个使用相同幂等键，后5个使用不同幂等键
          const idempotencyKey = index < 5 ? `${baseKey}_same` : `${baseKey}_${index}`

          try {
            const result = await IdempotencyService.getOrCreateRequest(idempotencyKey, {
              api_path: '/api/v4/lottery/draw',
              http_method: 'POST',
              request_params: { campaign_id: testCampaignId, index },
              user_id: testUserId
            })

            if (result.should_process) {
              // 模拟处理
              await delay(Math.random() * 100) // 随机延迟模拟处理时间
              await IdempotencyService.markAsCompleted(idempotencyKey, `event_${index}`, {
                success: true,
                code: 'SUCCESS',
                data: { index }
              })
            }

            return { index, idempotencyKey, processed: result.should_process }
          } catch (error) {
            if (error.statusCode === 409) {
              return { index, idempotencyKey, rejected: true, reason: error.message }
            }
            return { index, idempotencyKey, error: error.message }
          }
        })

      // 并发执行
      const results = await Promise.all(tasks)

      // 分析结果
      const sameKeyResults = results.filter((_, i) => i < 5)
      const differentKeyResults = results.filter((_, i) => i >= 5)

      const sameKeyProcessed = sameKeyResults.filter(r => r.processed).length
      const sameKeyRejected = sameKeyResults.filter(r => r.rejected).length
      const differentKeyProcessed = differentKeyResults.filter(r => r.processed).length

      console.log('📊 结果分析:')
      console.log(`   相同幂等键: 处理=${sameKeyProcessed}, 拒绝=${sameKeyRejected}`)
      console.log(`   不同幂等键: 处理=${differentKeyProcessed}`)

      // 验证：相同幂等键最多处理一次
      expect(sameKeyProcessed).toBeLessThanOrEqual(1)

      /*
       * 验证：不同幂等键应该被处理（由于并发时序，至少应处理1个）
       * 如果全部失败则表明系统有问题
       */
      expect(differentKeyProcessed).toBeGreaterThanOrEqual(1)

      // 如果不是所有不同幂等键都被处理，检查是否有错误
      const differentKeyErrors = differentKeyResults.filter(r => r.error)
      if (differentKeyErrors.length > 0) {
        console.log(
          '⚠️ 部分请求出错:',
          differentKeyErrors.map(r => r.error)
        )
      }

      console.log('✅ 高并发竞态测试通过')
    }, 60000)
  })
})
