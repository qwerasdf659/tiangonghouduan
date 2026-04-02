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
  // V4.7.0 AssetService 拆分：使用 BalanceService（2026-01-31）
  const BalanceService = require('../../services/asset/BalanceService')

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
    /*
     * 1. 查询当前余额
     * 🔴 修复：getBalance 返回对象 { available_amount, frozen_amount, ... }
     */
    const currentBalanceResult = await BalanceService.getBalance(
      { user_id, asset_code: 'points' },
      { transaction }
    )
    // 提取 available_amount，确保为数字类型
    const currentBalance = Number(currentBalanceResult?.available_amount) || 0
    console.log(`   当前余额: ${currentBalance.toLocaleString()}`)

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

    // 4. 执行充值（counterpart 指向 SYSTEM_MINT，确保双录 SUM=0）
    await BalanceService.changeBalance(
      {
        user_id,
        asset_code: 'points',
        delta_amount: shortage,
        business_type: 'test_topup',
        idempotency_key,
        counterpart_account_id: 2,
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
 * @param {number} [userId] - 可选的用户ID，不传则使用测试用户
 * @returns {Promise<number>} 返回积分余额数字（直接返回数字，方便测试计算）
 * 
 * @example
 * // 获取默认测试用户的积分
 * const balance = await getTestUserPointsBalance()
 * console.log(`余额: ${balance}`)  // 输出: 余额: 150000
 * 
 * // 获取指定用户的积分
 * const balance2 = await getTestUserPointsBalance(31)
 */
async function getTestUserPointsBalance(userId = null) {
  // V4.7.0 AssetService 拆分：使用 BalanceService（2026-01-31）
  const BalanceService = require('../../services/asset/BalanceService')

  let user_id = userId

  if (!user_id) {
    await initRealTestData()
    user_id = await getRealTestUserId()
  }

  if (!user_id) {
    throw new Error('测试用户未初始化')
  }

  // 获取积分余额
  const balanceResult = await BalanceService.getBalance({ user_id, asset_code: 'points' })

  // 直接返回数字余额（方便测试中进行数学计算）
  return Number(balanceResult?.available_amount) || 0
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

/**
 * 为测试用户重置/增加配额
 * 
 * 业务背景：
 * - 每日配额限制为20次（+bonus_draw_count），大规模测试需要更多配额
 * - 此函数为测试用户添加足够的bonus_draw_count
 *
 * @param {number} requiredDraws - 需要的抽奖次数
 * @param {number} [userId] - 可选的用户ID，不传则使用测试用户
 * @param {number} [campaignId] - 可选的活动ID，默认为1
 * @returns {Promise<Object>} 配额状态
 * 
 * @example
 * // 为10000次抽奖准备配额
 * await ensureTestUserHasQuota(10000, userId, campaignId)
 */
async function ensureTestUserHasQuota(requiredDraws = 10000, userId = null, campaignId = 1) {
  const LotteryQuotaService = require('../../services/lottery/LotteryQuotaService')
  
  // 确保测试数据已初始化
  await initRealTestData()
  
  let user_id = userId
  if (!user_id) {
    user_id = await getRealTestUserId()
  }
  
  if (!user_id) {
    throw new Error('测试用户未初始化')
  }

  console.log(`\n🎫 [test-points-setup] 开始为测试用户准备配额`)
  console.log(`   用户ID: ${user_id}`)
  console.log(`   活动ID: ${campaignId}`)
  console.log(`   目标配额: ${requiredDraws.toLocaleString()} 次`)

  try {
    // 1. 获取当前配额状态
    const currentStatus = await LotteryQuotaService.getOrInitQuotaStatus({
      user_id,
      lottery_campaign_id: campaignId
    })

    const currentRemaining = currentStatus.remaining || 0
    const currentLimit = currentStatus.limit_value || 20
    const currentBonus = currentStatus.bonus_draw_count || 0
    const currentUsed = currentStatus.used_draw_count || 0

    console.log(`   当前配额状态:`)
    console.log(`     - 每日上限: ${currentLimit}`)
    console.log(`     - 已用次数: ${currentUsed}`)
    console.log(`     - 奖励次数: ${currentBonus}`)
    console.log(`     - 剩余次数: ${currentRemaining}`)

    // 2. 计算需要补充的配额
    const shortage = requiredDraws - currentRemaining
    
    if (shortage <= 0) {
      console.log(`✅ [test-points-setup] 配额充足，无需补充`)
      console.log(`   剩余配额 ${currentRemaining.toLocaleString()} >= 目标 ${requiredDraws.toLocaleString()}\n`)
      return {
        user_id,
        lottery_campaign_id: campaignId,
        before_remaining: currentRemaining,
        after_remaining: currentRemaining,
        added_bonus: 0
      }
    }

    console.log(`   需要补充: ${shortage.toLocaleString()} 次`)

    // 3. 添加bonus配额
    const { sequelize } = require('../../config/database')
    const transaction = await sequelize.transaction()

    try {
      await LotteryQuotaService.addBonusDrawCount({
        user_id,
        lottery_campaign_id: campaignId,
        bonus_count: shortage,
        reason: '大规模测试配额补充'
      }, { transaction })

      await transaction.commit()

      // 4. 验证配额
      const newStatus = await LotteryQuotaService.getOrInitQuotaStatus({
        user_id,
        lottery_campaign_id: campaignId
      })

      const newRemaining = newStatus.remaining || 0

      console.log(`✅ [test-points-setup] 配额补充完成`)
      console.log(`   补充次数: +${shortage.toLocaleString()}`)
      console.log(`   新剩余次数: ${newRemaining.toLocaleString()}\n`)

      return {
        user_id,
        lottery_campaign_id: campaignId,
        before_remaining: currentRemaining,
        after_remaining: newRemaining,
        added_bonus: shortage
      }
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  } catch (error) {
    console.error(`❌ [test-points-setup] 配额准备失败: ${error.message}`)
    throw error
  }
}

/**
 * 重置测试用户当日配额（删除当日配额记录，使其从0开始）
 * 
 * 警告：此函数会删除用户当日的配额记录，仅用于测试环境
 *
 * @param {number} [userId] - 可选的用户ID，不传则使用测试用户
 * @param {number} [campaignId] - 可选的活动ID，默认为1
 * @returns {Promise<boolean>} 是否成功重置
 */
async function resetTestUserDailyQuota(userId = null, campaignId = 1) {
  const { LotteryUserDailyDrawQuota } = require('../../models')
  const BeijingTimeHelper = require('../../utils/timeHelper')
  
  // 确保测试数据已初始化
  await initRealTestData()
  
  let user_id = userId
  if (!user_id) {
    user_id = await getRealTestUserId()
  }
  
  if (!user_id) {
    throw new Error('测试用户未初始化')
  }

  const today = BeijingTimeHelper.todayStart().toISOString().split('T')[0]

  console.log(`\n🔄 [test-points-setup] 重置用户当日配额`)
  console.log(`   用户ID: ${user_id}`)
  console.log(`   活动ID: ${campaignId}`)
  console.log(`   日期: ${today}`)

  try {
    const deleted = await LotteryUserDailyDrawQuota.destroy({
      where: {
        user_id,
        lottery_campaign_id: campaignId,
        quota_date: today
      }
    })

    if (deleted > 0) {
      console.log(`✅ [test-points-setup] 已重置 ${deleted} 条配额记录\n`)
    } else {
      console.log(`⚠️ [test-points-setup] 无配额记录需要重置\n`)
    }

    return deleted > 0
  } catch (error) {
    console.error(`❌ [test-points-setup] 配额重置失败: ${error.message}`)
    throw error
  }
}

/**
 * 清理测试用户当日挂牌记录（重置每日挂牌计数）
 * 
 * 业务背景：
 * - MarketListingService 限制每用户每日最多 20 次挂牌
 * - 大量测试会耗尽当日挂牌配额，导致后续测试失败
 * - 此函数清理测试用户当天的挂牌记录，重置计数
 *
 * 警告：此函数会删除挂牌及相关订单，仅用于测试环境！
 *
 * @param {number} [userId] - 可选的用户ID，不传则使用测试用户
 * @param {string} [assetCode='star_stone'] - 可选的币种代码
 * @returns {Promise<{deleted_listings: number, deleted_orders: number}>}
 * 
 * @example
 * // 在测试开始前清理挂牌计数
 * beforeAll(async () => {
 *   await resetTestUserDailyListings()
 * })
 */
async function resetTestUserDailyListings(userId = null, assetCode = null) {
  const { MarketListing, TradeOrder, Op } = require('../../models')
  const BeijingTimeHelper = require('../../utils/timeHelper')
  
  // 确保测试数据已初始化
  await initRealTestData()
  
  let user_id = userId
  if (!user_id) {
    user_id = await getRealTestUserId()
  }
  
  if (!user_id) {
    throw new Error('测试用户未初始化')
  }

  // 计算北京时间今天0点的UTC时间
  const now = new Date()
  const beijingOffset = 8 * 60 // 北京时间偏移量（分钟）
  const utcOffset = now.getTimezoneOffset()
  const todayStartBeijing = new Date(now)
  todayStartBeijing.setMinutes(todayStartBeijing.getMinutes() + utcOffset + beijingOffset)
  todayStartBeijing.setHours(0, 0, 0, 0)
  const todayStart = new Date(todayStartBeijing.getTime() - (utcOffset + beijingOffset) * 60 * 1000)

  console.log(`\n🧹 [test-points-setup] 清理测试用户当日挂牌记录`)
  console.log(`   用户ID: ${user_id}`)
  console.log(`   币种: ${assetCode || '全部'}`)
  console.log(`   起始时间: ${todayStart.toISOString()}`)

  try {
    // 构建查询条件
    const listingWhere = {
      seller_user_id: user_id,
      created_at: { [Op.gte]: todayStart }
    }
    if (assetCode) {
      listingWhere.price_asset_code = assetCode
    }

    // 1. 查找当日挂牌
    const listings = await MarketListing.findAll({
      where: listingWhere,
      attributes: ['market_listing_id', 'status']
    })

    if (listings.length === 0) {
      console.log(`⚠️ [test-points-setup] 无当日挂牌记录需要清理\n`)
      return { deleted_listings: 0, deleted_orders: 0 }
    }

    const listingIds = listings.map(l => l.market_listing_id)
    console.log(`   找到 ${listingIds.length} 条当日挂牌记录`)

    // 2. 删除关联的订单
    const deletedOrders = await TradeOrder.destroy({
      where: { market_listing_id: { [Op.in]: listingIds } }
    })
    console.log(`   删除 ${deletedOrders} 条关联订单`)

    // 3. 删除挂牌记录
    const deletedListings = await MarketListing.destroy({
      where: { market_listing_id: { [Op.in]: listingIds } }
    })

    console.log(`✅ [test-points-setup] 挂牌记录清理完成`)
    console.log(`   删除挂牌: ${deletedListings} 条`)
    console.log(`   删除订单: ${deletedOrders} 条\n`)

    return {
      deleted_listings: deletedListings,
      deleted_orders: deletedOrders
    }
  } catch (error) {
    console.error(`❌ [test-points-setup] 挂牌记录清理失败: ${error.message}`)
    throw error
  }
}

/**
 * 为测试用户设置更高的每日挂牌上限
 * 
 * 通过更新 user_risk_profiles 表的等级默认配置，
 * 提高所有用户（包括测试用户）的每日挂牌上限。
 * 
 * 注意：由于数据库设计限制（uk_user_risk_profiles_level_default），
 * 无法为单个用户创建个人配置，只能修改等级默认配置。
 *
 * @param {number} dailyMaxListings - 新的每日挂牌上限（默认 1000）
 * @param {number} [userId] - 可选的用户ID（用于获取用户等级）
 * @param {string} [assetCode='star_stone'] - 币种代码
 * @returns {Promise<Object>} 配置结果
 * 
 * @example
 * // 将测试用户的挂牌上限提高到 500
 * await setTestUserListingLimit(500)
 */
async function setTestUserListingLimit(dailyMaxListings = 1000, userId = null, assetCode = 'star_stone') {
  const { UserRiskProfile, User } = require('../../models')
  
  // 确保测试数据已初始化
  await initRealTestData()
  
  let user_id = userId
  if (!user_id) {
    user_id = await getRealTestUserId()
  }
  
  if (!user_id) {
    throw new Error('测试用户未初始化')
  }

  console.log(`\n⚙️ [test-points-setup] 设置测试用户挂牌上限`)
  console.log(`   用户ID: ${user_id}`)
  console.log(`   币种: ${assetCode}`)
  console.log(`   新上限: ${dailyMaxListings}`)

  try {
    // 获取用户等级
    const user = await User.findByPk(user_id, { attributes: ['user_id', 'user_level'] })
    const userLevel = user?.user_level || 'normal'

    // 由于数据库唯一约束限制，更新等级默认配置而非创建用户配置
    const levelConfig = await UserRiskProfile.findOne({
      where: {
        user_level: userLevel,
        config_type: 'level'
      }
    })

    if (levelConfig) {
      // 更新等级配置的阈值
      const currentThresholds = levelConfig.thresholds || {}
      currentThresholds[assetCode] = {
        ...currentThresholds[assetCode],
        daily_max_listings: dailyMaxListings
      }
      
      await levelConfig.update({
        thresholds: currentThresholds,
        remarks: `测试环境配置 - 挂牌上限更新为 ${dailyMaxListings} (${new Date().toISOString()})`
      })

      console.log(`✅ [test-points-setup] 挂牌上限设置完成`)
      console.log(`   配置ID: ${levelConfig.risk_profile_id}`)
      console.log(`   用户等级: ${userLevel}`)
      console.log(`   操作: 更新等级默认配置\n`)

      return {
        user_id,
        user_level: userLevel,
        asset_code: assetCode,
        daily_max_listings: dailyMaxListings,
        config_id: levelConfig.risk_profile_id,
        updated: true
      }
    } else {
      console.log(`⚠️ [test-points-setup] 未找到等级 ${userLevel} 的配置，跳过设置\n`)
      return {
        user_id,
        user_level: userLevel,
        asset_code: assetCode,
        daily_max_listings: dailyMaxListings,
        config_id: null,
        updated: false
      }
    }
  } catch (error) {
    console.error(`❌ [test-points-setup] 挂牌上限设置失败: ${error.message}`)
    throw error
  }
}

/**
 * 准备市场测试环境（综合函数）
 * 
 * 为市场相关测试准备完整的测试环境：
 * 1. 清理当日挂牌记录（重置计数）
 * 2. 设置较高的挂牌上限
 * 3. 确保用户有足够积分
 *
 * @param {Object} options - 配置选项
 * @param {number} options.dailyMaxListings - 每日挂牌上限（默认 1000）
 * @param {number} options.requiredPoints - 需要的积分（默认 100000）
 * @param {boolean} options.clearTodayListings - 是否清理当日挂牌（默认 true）
 * @returns {Promise<Object>} 准备结果
 * 
 * @example
 * beforeAll(async () => {
 *   await prepareMarketTestEnvironment({
 *     dailyMaxListings: 500,
 *     requiredPoints: 50000
 *   })
 * })
 */
async function prepareMarketTestEnvironment(options = {}) {
  const {
    dailyMaxListings = 1000,
    requiredPoints = 100000,
    clearTodayListings = true
  } = options

  console.log(`\n🏪 [test-points-setup] 准备市场测试环境...`)

  const result = {
    listings_cleared: 0,
    orders_cleared: 0,
    listing_limit_set: false,
    points_ensured: false
  }

  try {
    // 1. 清理当日挂牌记录
    if (clearTodayListings) {
      const clearResult = await resetTestUserDailyListings()
      result.listings_cleared = clearResult.deleted_listings
      result.orders_cleared = clearResult.deleted_orders
    }

    // 2. 设置挂牌上限
    await setTestUserListingLimit(dailyMaxListings)
    result.listing_limit_set = true

    // 3. 确保积分充足
    await ensureTestUserHasPoints(requiredPoints)
    result.points_ensured = true

    console.log(`✅ [test-points-setup] 市场测试环境准备完成`)
    console.log(`   清理挂牌: ${result.listings_cleared} 条`)
    console.log(`   清理订单: ${result.orders_cleared} 条`)
    console.log(`   挂牌上限: ${dailyMaxListings}`)
    console.log(`   积分目标: ${requiredPoints}\n`)

    return result
  } catch (error) {
    console.error(`❌ [test-points-setup] 市场测试环境准备失败: ${error.message}`)
    throw error
  }
}

module.exports = {
  ensureTestUserHasPoints,
  getTestUserPointsBalance,
  calculateRequiredPoints,
  ensureTestUserHasQuota,
  resetTestUserDailyQuota,
  // 市场测试相关辅助函数
  resetTestUserDailyListings,
  setTestUserListingLimit,
  prepareMarketTestEnvironment
}
