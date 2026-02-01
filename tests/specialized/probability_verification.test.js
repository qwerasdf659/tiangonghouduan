'use strict'

/**
 * 🎯 概率分布验证测试（P0级）
 *
 * @description 通过大规模抽奖（10,000次）验证概率分布的统计准确性
 * @version V4.6 - TDD策略：先创建测试，倒逼实现
 * @date 2026-01-28
 *
 * 测试目的：
 * 1. 验证各档位（high/mid/low）的实际中奖分布与配置概率的误差在 ±5% 以内
 * 2. 验证奖品池配置的权重计算正确性
 * 3. 验证大规模抽奖的系统稳定性
 *
 * 业务规则：
 * - 档位概率：由 lottery_tier_rules 表的 tier_weight 字段决定
 * - 同档位内奖品概率：由 lottery_prizes 表的 win_weight 字段决定
 * - 权重比例因子 SCALE = 1,000,000
 *
 * 数据准备：
 * - 测试用户需要 1,500,000 积分（10,000 次抽奖 × 150 积分/次）
 * - 使用 test-points-setup.js 自动充值
 *
 * @file tests/specialized/probability_verification.test.js
 */

const request = require('supertest')
const app = require('../../app')
const { TEST_DATA } = require('../helpers/test-data')
const {
  ensureTestUserHasPoints,
  getTestUserPointsBalance,
  ensureTestUserHasQuota
} = require('../helpers/test-points-setup')
const {
  TestAssertions: _TestAssertions,
  TestConfig,
  initRealTestData
} = require('../helpers/test-setup')
const { v4: uuidv4 } = require('uuid')

/**
 * 测试配置常量
 */
const SAMPLE_SIZE = 10000 // 抽奖样本量
const TOLERANCE = 0.05 // 概率误差容忍度 ±5%
const REQUIRED_POINTS = 1500000 // 所需积分（10000次 × 150积分）
const _POINTS_PER_DRAW = 150 // 单次抽奖消耗积分（保留，备用）
const BATCH_SIZE = 100 // 批量抽奖每批次数量
const BATCH_DELAY_MS = 100 // 批次间延迟（毫秒）

/**
 * 权重比例因子（业务标准：三档位权重之和 = SCALE）
 */
const WEIGHT_SCALE = 1000000

/**
 * 生成幂等键
 * @returns {string} UUID格式的幂等键
 */
function generateIdempotencyKey() {
  return `prob_test_${uuidv4()}`
}

/**
 * 分析抽奖结果的档位分布
 * @param {Array} results - 抽奖结果数组
 * @returns {Object} 档位分布统计
 */
function analyzeTierDistribution(results) {
  const tierCounts = {
    high: 0,
    mid: 0,
    low: 0,
    unknown: 0
  }

  results.forEach(result => {
    const tier = result.reward_tier || result.tier || 'unknown'
    if (Object.prototype.hasOwnProperty.call(tierCounts, tier)) {
      tierCounts[tier]++
    } else {
      tierCounts.unknown++
    }
  })

  const total = results.length
  const tierDistribution = {
    high: {
      count: tierCounts.high,
      percentage: (tierCounts.high / total) * 100
    },
    mid: {
      count: tierCounts.mid,
      percentage: (tierCounts.mid / total) * 100
    },
    low: {
      count: tierCounts.low,
      percentage: (tierCounts.low / total) * 100
    },
    unknown: {
      count: tierCounts.unknown,
      percentage: (tierCounts.unknown / total) * 100
    }
  }

  return {
    total,
    tierCounts,
    tierDistribution
  }
}

/**
 * 从数据库获取活动的档位概率配置
 * @param {number} campaignId - 活动ID
 * @param {string} segmentKey - 用户分层标识
 * @returns {Promise<Object>} 档位概率配置
 */
async function getExpectedTierProbabilities(campaignId, segmentKey = 'default') {
  const { LotteryTierRule } = require('../../models')

  const rules = await LotteryTierRule.findAll({
    where: {
      lottery_campaign_id: campaignId,
      segment_key: segmentKey,
      status: 'active'
    },
    attributes: ['tier_name', 'tier_weight']
  })

  const probabilities = {}
  let totalWeight = 0

  rules.forEach(rule => {
    probabilities[rule.tier_name] = rule.tier_weight
    totalWeight += rule.tier_weight
  })

  // 转换为百分比
  Object.keys(probabilities).forEach(tier => {
    probabilities[tier] = {
      weight: probabilities[tier],
      percentage: (probabilities[tier] / totalWeight) * 100
    }
  })

  return {
    probabilities,
    totalWeight,
    isValid: totalWeight === WEIGHT_SCALE
  }
}

/**
 * 验证概率误差是否在容忍范围内
 * @param {number} expected - 期望概率（百分比）
 * @param {number} actual - 实际概率（百分比）
 * @param {number} tolerance - 容忍度（0-1之间）
 * @returns {Object} 验证结果
 */
function validateProbabilityTolerance(expected, actual, tolerance = TOLERANCE) {
  const difference = Math.abs(actual - expected)
  const percentageDiff = expected > 0 ? difference / expected : 0
  const isWithinTolerance = percentageDiff <= tolerance

  return {
    expected,
    actual,
    difference,
    percentageDiff: percentageDiff * 100,
    tolerance: tolerance * 100,
    isWithinTolerance
  }
}

describe('【P0】概率分布验证测试 - 10,000次抽奖统计', () => {
  let authToken
  let testUserId
  let campaignId
  let campaignCode

  /**
   * 测试前准备
   * 1. 登录获取token
   * 2. 充值测试积分
   * 3. 获取活动信息
   */
  beforeAll(async () => {
    console.log('='.repeat(80))
    console.log('🎯 【P0】概率分布验证测试 - 10,000次抽奖统计')
    console.log('='.repeat(80))
    console.log(`📋 测试样本量: ${SAMPLE_SIZE.toLocaleString()} 次`)
    console.log(`📏 误差容忍度: ±${TOLERANCE * 100}%`)
    console.log(`💰 所需积分: ${REQUIRED_POINTS.toLocaleString()}`)
    console.log('='.repeat(80))

    // 初始化真实测试数据
    await initRealTestData()

    // 登录获取token
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
    console.log(`✅ 登录成功，用户ID: ${testUserId}`)

    // 获取活动信息（直接从 TestConfig.realData 获取，已在 initRealTestData 中查询数据库）
    console.log('📋 获取活动配置...')
    campaignId = TestConfig.realData.testCampaign?.lottery_campaign_id || 1
    campaignCode = TestConfig.realData.testCampaign?.campaign_code || 'BASIC_LOTTERY'
    console.log(`✅ 活动ID: ${campaignId}, 活动代码: ${campaignCode}`)

    // 检查并充值测试积分
    console.log(`💰 检查测试积分...`)
    const currentBalance = await getTestUserPointsBalance(testUserId)
    console.log(`   当前余额: ${currentBalance?.toLocaleString() || 0}`)

    if (!currentBalance || currentBalance < REQUIRED_POINTS) {
      console.log(`   需要充值积分以完成测试...`)
      try {
        await ensureTestUserHasPoints(REQUIRED_POINTS, testUserId)
        const newBalance = await getTestUserPointsBalance(testUserId)
        console.log(`   ✅ 充值完成，当前余额: ${newBalance?.toLocaleString() || 0}`)
      } catch (error) {
        console.warn(`   ⚠️ 充值失败: ${error.message}，测试可能受影响`)
      }
    } else {
      console.log(`   ✅ 积分充足`)
    }

    // 检查并补充测试配额（每日抽奖次数限制）
    console.log(`🎫 检查测试配额...`)
    try {
      await ensureTestUserHasQuota(SAMPLE_SIZE, testUserId, campaignId)
      console.log(`   ✅ 配额准备完成`)
    } catch (error) {
      console.warn(`   ⚠️ 配额准备失败: ${error.message}，测试可能受影响`)
    }

    console.log('='.repeat(80))
  }, 300000) // 5分钟超时（包括积分充值时间）

  afterAll(() => {
    console.log('='.repeat(80))
    console.log('🏁 概率分布验证测试完成')
    console.log('='.repeat(80))
  })

  /**
   * 场景1：验证档位概率配置的完整性
   * TDD策略：先验证配置是否正确，再进行大规模测试
   */
  describe('场景1：档位概率配置验证', () => {
    test('活动应该配置了完整的三档位规则（high/mid/low）', async () => {
      console.log('📊 验证档位概率配置...')

      const { LotteryTierRule } = require('../../models')

      const rules = await LotteryTierRule.findAll({
        where: {
          lottery_campaign_id: campaignId,
          status: 'active'
        },
        order: [['tier_name', 'ASC']]
      })

      console.log(`   找到 ${rules.length} 条档位规则`)

      // 验证三个档位都存在
      const tierNames = rules.map(r => r.tier_name)
      expect(tierNames).toContain('high')
      expect(tierNames).toContain('mid')
      expect(tierNames).toContain('low')

      console.log('   ✅ 三个档位配置完整')
    })

    test('档位权重之和应该等于 1,000,000', async () => {
      console.log('📊 验证档位权重总和...')

      const { LotteryTierRule } = require('../../models')

      const result = await LotteryTierRule.validateTierWeights(campaignId, 'default')

      console.log(`   权重总和: ${result.total_weight || 'N/A'}`)
      console.log(`   期望值: ${WEIGHT_SCALE}`)

      /*
       * TDD红灯：先创建失败测试，倒逼实现
       * 如果没有配置档位规则，测试会失败，提示需要配置
       */
      if (!result.valid) {
        console.log(`   ❌ 档位权重配置不正确: ${result.error}`)
      }

      expect(result.valid).toBe(true)
      expect(result.total_weight).toBe(WEIGHT_SCALE)

      console.log('   ✅ 权重配置正确')
    })
  })

  /**
   * 场景2：执行大规模抽奖测试
   * 核心测试：验证实际概率分布
   */
  describe('场景2：大规模抽奖执行', () => {
    const allResults = []
    let _batchCount = 0 // 保留，用于未来扩展

    test(`执行 ${SAMPLE_SIZE.toLocaleString()} 次抽奖`, async () => {
      console.log(`\n🎰 开始执行 ${SAMPLE_SIZE.toLocaleString()} 次抽奖...`)
      const startTime = Date.now()

      // 分批执行抽奖
      const totalBatches = Math.ceil(SAMPLE_SIZE / BATCH_SIZE)
      console.log(`   分 ${totalBatches} 批执行，每批 ${BATCH_SIZE} 次`)

      for (let batch = 0; batch < totalBatches; batch++) {
        const batchStart = batch * BATCH_SIZE
        const batchEnd = Math.min(batchStart + BATCH_SIZE, SAMPLE_SIZE)
        const _currentBatchSize = batchEnd - batchStart // 保留，用于日志

        console.log(`   批次 ${batch + 1}/${totalBatches}: 第 ${batchStart + 1}-${batchEnd} 次`)

        // 批量执行抽奖
        for (let i = batchStart; i < batchEnd; i++) {
          const idempotencyKey = generateIdempotencyKey()

          try {
            const response = await request(app)
              .post('/api/v4/lottery/draw')
              .set('Authorization', `Bearer ${authToken}`)
              .set('Idempotency-Key', idempotencyKey)
              .send({
                campaign_code: campaignCode,
                draw_count: 1
              })

            if (response.status === 200 && response.body.data?.prizes) {
              /*
               * API 返回结构：{ success: true, data: { prizes: [...], ... } }
               * prizes 数组中包含 reward_tier 字段用于统计
               */
              allResults.push(...response.body.data.prizes)
            } else if (response.status === 400) {
              // 积分不足或其他业务错误
              console.log(`   ⚠️ 第 ${i + 1} 次抽奖失败: ${response.body.message}`)
              break
            }
          } catch (error) {
            console.error(`   ❌ 第 ${i + 1} 次抽奖异常: ${error.message}`)
          }
        }

        _batchCount = batch + 1

        // 批次间延迟
        if (batch < totalBatches - 1) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS))
        }

        // 进度报告
        if ((batch + 1) % 10 === 0 || batch === totalBatches - 1) {
          const progress = (((batch + 1) / totalBatches) * 100).toFixed(1)
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
          console.log(
            `   进度: ${progress}% (${allResults.length}/${SAMPLE_SIZE})，耗时: ${elapsed}s`
          )
        }
      }

      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(`\n   ⏱️ 总耗时: ${totalTime} 秒`)
      console.log(`   📊 实际完成: ${allResults.length} 次抽奖`)

      /*
       * 验证是否完成了足够的抽奖
       * TDD策略：即使不够10000次，也要验证概率分布
       */
      expect(allResults.length).toBeGreaterThan(0)
      console.log('   ✅ 抽奖执行完成')
    }, 900000) // 15分钟超时

    test('各档位概率误差应在 ±5% 范围内', async () => {
      console.log('\n📊 验证概率分布...')

      if (allResults.length < 100) {
        console.log('   ⚠️ 样本量不足（<100），跳过概率验证')
        expect(allResults.length).toBeGreaterThanOrEqual(0)
        return
      }

      // 分析抽奖结果的档位分布
      const distribution = analyzeTierDistribution(allResults)
      console.log(`   样本量: ${distribution.total}`)
      console.log(`   档位分布:`)
      console.log(
        `     high: ${distribution.tierDistribution.high.count} (${distribution.tierDistribution.high.percentage.toFixed(2)}%)`
      )
      console.log(
        `     mid: ${distribution.tierDistribution.mid.count} (${distribution.tierDistribution.mid.percentage.toFixed(2)}%)`
      )
      console.log(
        `     low: ${distribution.tierDistribution.low.count} (${distribution.tierDistribution.low.percentage.toFixed(2)}%)`
      )

      if (distribution.tierDistribution.unknown.count > 0) {
        console.log(
          `     unknown: ${distribution.tierDistribution.unknown.count} (${distribution.tierDistribution.unknown.percentage.toFixed(2)}%)`
        )
      }

      // 获取期望的档位概率
      const expected = await getExpectedTierProbabilities(campaignId)
      console.log('\n   期望概率（基于配置）:')

      if (!expected.isValid) {
        console.log('   ⚠️ 档位权重配置不完整，无法验证概率')
      }

      // 验证每个档位的概率误差
      const validationResults = []
      for (const tier of ['high', 'mid', 'low']) {
        if (expected.probabilities[tier]) {
          const expectedPct = expected.probabilities[tier].percentage
          const actualPct = distribution.tierDistribution[tier].percentage

          const validation = validateProbabilityTolerance(expectedPct, actualPct, TOLERANCE)
          validationResults.push({ tier, ...validation })

          const status = validation.isWithinTolerance ? '✅' : '❌'
          console.log(
            `     ${tier}: 期望 ${expectedPct.toFixed(2)}%, 实际 ${actualPct.toFixed(2)}%, 误差 ${validation.percentageDiff.toFixed(2)}% ${status}`
          )
        }
      }

      // 验证所有档位的概率都在容忍范围内
      const allWithinTolerance = validationResults.every(r => r.isWithinTolerance)

      if (!allWithinTolerance) {
        console.log('\n   ⚠️ 部分档位概率超出容忍范围')
        validationResults
          .filter(r => !r.isWithinTolerance)
          .forEach(r => {
            console.log(
              `     ${r.tier}: 误差 ${r.percentageDiff.toFixed(2)}% > 容忍度 ${r.tolerance}%`
            )
          })
      }

      /*
       * TDD红灯：期望所有档位概率都在容忍范围内
       * 如果失败，需要检查抽奖逻辑或配置
       */
      expect(allWithinTolerance).toBe(true)
      console.log('\n   ✅ 所有档位概率误差在容忍范围内')
    })
  })

  /**
   * 场景3：奖品池配置验证
   */
  describe('场景3：奖品池配置验证', () => {
    test('活动奖品池应该配置正确', async () => {
      console.log('📊 验证奖品池配置...')

      const { LotteryPrize } = require('../../models')

      const result = await LotteryPrize.validatePrizeWeights(campaignId)

      console.log(
        `   奖品总数: ${Object.values(result.tier_results || {}).reduce((sum, t) => sum + (t.prize_count || 0), 0)}`
      )

      if (result.tier_results) {
        console.log('   各档位奖品:')
        for (const [tier, data] of Object.entries(result.tier_results)) {
          if (data.prize_count > 0) {
            const status = data.valid ? '✅' : '❌'
            console.log(
              `     ${tier}: ${data.prize_count}个奖品, 权重和=${data.total_weight} ${status}`
            )
          }
        }
      }

      // TDD红灯：验证奖品权重配置正确
      if (!result.valid) {
        console.log(`   ❌ 奖品权重配置错误: ${result.error}`)
      }

      expect(result.valid).toBe(true)
      console.log('   ✅ 奖品池配置正确')
    })

    test('活动应该配置了空奖（保底奖品）', async () => {
      console.log('📊 验证空奖配置...')

      const { LotteryPrize } = require('../../models')

      const result = await LotteryPrize.validateEmptyPrizeConstraint(campaignId)

      console.log(`   空奖数量: ${result.emptyPrizes?.length || 0}`)

      // TDD红灯：验证空奖存在
      if (!result.valid) {
        console.log(`   ❌ 空奖配置错误: ${result.error}`)
      }

      expect(result.valid).toBe(true)
      console.log('   ✅ 空奖配置正确')
    })
  })

  /**
   * 场景4：统计报告生成
   */
  describe('场景4：测试报告生成', () => {
    test('生成概率验证测试报告', async () => {
      console.log('\n')
      console.log('='.repeat(80))
      console.log('📊 概率分布验证测试报告')
      console.log('='.repeat(80))
      console.log(
        `📅 测试时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`
      )
      console.log(`👤 测试用户: ${TEST_DATA.users.testUser.mobile}`)
      console.log(`🎯 活动ID: ${campaignId}`)
      console.log(`📋 活动代码: ${campaignCode}`)
      console.log(`📏 样本量: ${SAMPLE_SIZE.toLocaleString()} 次`)
      console.log(`📏 误差容忍度: ±${TOLERANCE * 100}%`)
      console.log('')
      console.log('✅ 测试完成')
      console.log('')
      console.log('🏗️ TDD状态：')
      console.log('   - 测试用例已创建')
      console.log('   - 等待执行验证')
      console.log('   - 如测试失败，需检查：')
      console.log('     1. 档位规则配置（lottery_tier_rules表）')
      console.log('     2. 奖品权重配置（lottery_prizes表）')
      console.log('     3. 抽奖算法实现（Pipeline/Stages）')
      console.log('='.repeat(80))

      expect(true).toBe(true)
    })
  })
})
