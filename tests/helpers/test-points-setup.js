/**
 * 🎰 大规模测试积分充值工具
 *
 * 创建时间: 2026-01-28
 * 
 * 业务背景：
 * - 概率验证测试需要 10000+ 次抽奖
 * - 每次抽奖消耗 100 POINTS (system_settings.lottery_cost_points)
 * - 需要在测试前为测试用户充值足够积分
 *
 * 积分消耗计算：
 * - 10000 次单抽 = 10000 × 100 = 1,000,000 POINTS
 * - 10000 次(10连抽×1000次) = 1000 × 900 = 900,000 POINTS (九折)
 * - 建议充值量 = 1,500,000 POINTS (预留余量)
 *
 * 使用方式：
 * ```javascript
 * const { ensureTestUserHasPoints } = require('./test-points-setup')
 * 
 * beforeAll(async () => {
 *   await ensureTestUserHasPoints(1500000) // 150万积分
 * }, 120000)
 * ```
 *
 * @file tests/helpers/test-points-setup.js
 */

'use strict'

const { v4: uuidv4 } = require('uuid')
const { getRealTestUserId, initRealTestData } = require('./test-setup')

/**
 * 确保测试用户有足够积分
 * 
 * 功能：
 * 1. 查询测试用户当前 POINTS 余额
 * 2. 如果不足，充值差额
 * 3. 使用幂等键防止重复充值
 *
 * @param {number} requiredPoints - 需要的积分数量（默认 1,500,000）
 * @param {Object} options - 选项
 * @param {string} options.testName - 测试名称（用于审计日志）
 * @returns {Promise<{user_id: number, before: number, after: number, added: number}>}
 * 
 * @example
 * // 概率验证测试前充值
 * const result = await ensureTestUserHasPoints(1500000)
 * console.log(`充值完成: ${result.before} -> ${result.after}`)
 * 
 * @example
 * // 并发测试前充值
 * const result = await ensureTestUserHasPoints(100000, { testName: 'concurrent_lottery' })
 */
async function ensureTestUserHasPoints(requiredPoints = 1500000, options = {}) {
  const { testName = 'large_scale_test' } = options

  // 延迟加载，避免循环依赖
  const { sequelize } = require('../../config/database')
  const AssetService = require('../../services/AssetService')

  // 确保测试数据已初始化
  await initRealTestData()

  const user_id = await getRealTestUserId()
  if (!user_id) {
    throw new Error('测试用户未初始化，请确保 jest.setup.js 已执行')
  }

  console.log(`\n🎰 [test-points-setup] 开始为测试用户充值积分`)
  console.log(`   用户ID: ${user_id}`)
  console.log(`   目标积分: ${requiredPoints.toLocaleString()}`)
  console.log(`   测试名称: ${testName}`)

  const transaction = await sequelize.transaction()

  try {
    // 1. 查询当前余额
    const currentBalance = await AssetService.getBalance(user_id, 'POINTS', { transaction })
    console.log(`   当前余额: ${(currentBalance || 0).toLocaleString()}`)

    // 2. 计算需要充值的金额
    const shortage = requiredPoints - (currentBalance || 0)

    if (shortage <= 0) {
      await transaction.commit()
      console.log(`✅ [test-points-setup] 积分充足，无需充值`)
      console.log(`   当前余额 ${currentBalance.toLocaleString()} >= 目标 ${requiredPoints.toLocaleString()}\n`)
      return {
        user_id,
        before: currentBalance,
        after: currentBalance,
        added: 0
      }
    }

    console.log(`   需要充值: ${shortage.toLocaleString()}`)

    // 3. 生成幂等键（包含日期，每天可重新充值）
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const idempotency_key = `test_topup_${user_id}_${testName}_${today}_${uuidv4().slice(0, 8)}`

    // 4. 执行充值
    await AssetService.changeBalance(
      {
        user_id,
        asset_code: 'POINTS',
        delta_amount: shortage,
        business_type: 'test_topup',
        idempotency_key,
        meta: {
          reason: '测试积分充值',
          test_name: testName,
          target_amount: requiredPoints,
          shortage,
          timestamp: new Date().toISOString()
        }
      },
      { transaction }
    )

    await transaction.commit()

    const newBalance = (currentBalance || 0) + shortage
    console.log(`✅ [test-points-setup] 积分充值完成`)
    console.log(`   充值金额: +${shortage.toLocaleString()}`)
    console.log(`   新余额: ${newBalance.toLocaleString()}\n`)

    return {
      user_id,
      before: currentBalance || 0,
      after: newBalance,
      added: shortage
    }
  } catch (error) {
    await transaction.rollback()
    console.error(`❌ [test-points-setup] 积分充值失败: ${error.message}`)
    throw error
  }
}

/**
 * 查询测试用户当前积分余额
 * 
 * @returns {Promise<{user_id: number, balance: number}>}
 */
async function getTestUserPointsBalance() {
  const AssetService = require('../../services/AssetService')

  await initRealTestData()
  const user_id = await getRealTestUserId()

  if (!user_id) {
    throw new Error('测试用户未初始化')
  }

  const balance = await AssetService.getBalance(user_id, 'POINTS')

  return {
    user_id,
    balance: balance || 0
  }
}

/**
 * 计算指定抽奖次数需要的积分
 * 
 * @param {number} drawCount - 抽奖次数
 * @param {number} costPerDraw - 单次抽奖成本（默认 100）
 * @param {number} multiDrawDiscount - 连抽折扣（默认 0.9，即九折）
 * @param {boolean} useMultiDraw - 是否使用连抽（默认 true）
 * @returns {{totalCost: number, recommendedPoints: number, breakdown: string}}
 */
function calculateRequiredPoints(
  drawCount,
  costPerDraw = 100,
  multiDrawDiscount = 0.9,
  useMultiDraw = true
) {
  let totalCost

  if (useMultiDraw && drawCount >= 10) {
    // 使用 10 连抽
    const multiDrawBatches = Math.floor(drawCount / 10)
    const remainingSingleDraws = drawCount % 10
    const multiDrawCost = multiDrawBatches * 10 * costPerDraw * multiDrawDiscount
    const singleDrawCost = remainingSingleDraws * costPerDraw
    totalCost = Math.floor(multiDrawCost + singleDrawCost)
  } else {
    // 全部单抽
    totalCost = drawCount * costPerDraw
  }

  // 建议充值量 = 实际需要 × 1.5（预留余量）
  const recommendedPoints = Math.ceil(totalCost * 1.5)

  const breakdown = useMultiDraw && drawCount >= 10
    ? `${Math.floor(drawCount / 10)}批10连抽 + ${drawCount % 10}次单抽`
    : `${drawCount}次单抽`

  return {
    totalCost,
    recommendedPoints,
    breakdown
  }
}

module.exports = {
  ensureTestUserHasPoints,
  getTestUserPointsBalance,
  calculateRequiredPoints
}

