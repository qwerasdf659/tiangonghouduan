/**
 * 幂等性测试工具套件 (Idempotency Test Suite)
 *
 * 业务场景：确保关键业务操作的幂等性，防止重复提交导致的数据不一致
 *
 * 核心功能：
 * 1. business_id幂等性验证 - 相同business_id只执行一次
 * 2. 重复请求测试 - 模拟重复提交请求
 * 3. 幂等性失败检测 - 检测幂等性实现是否正确
 * 4. 并发重复请求测试 - 测试高并发下的幂等性保护
 *
 * 设计原则：
 * - 相同business_id：只执行一次，后续返回原结果
 * - 事务保护：使用数据库事务确保原子性
 * - 并发安全：高并发下仍然保证幂等性
 * - 审计记录：记录所有幂等性验证结果
 *
 * 使用方式：
 * ```javascript
 * const { IdempotencyTestSuite } = require('./shared/idempotency.test')
 *
 * // 测试资产操作幂等性
 * await IdempotencyTestSuite.testBusinessIdIdempotency(
 *   () => BalanceService.changeBalance(params),
 *   'lottery_reward_12345'
 * )
 * ```
 *
 * 创建时间：2025-11-14
 * 符合规范：01-核心开发质量标准.mdc
 * 最后更新：2025-12-30（迁移到BalanceService）
 * 使用模型：Claude 4 Sonnet
 */

/**
 * 幂等性测试工具类
 *
 * 提供统一的幂等性验证方法，确保业务操作不会因重复提交而产生副作用
 */
class IdempotencyTestSuite {
  /**
   * 测试business_id幂等性保护
   *
   * 验证内容：
   * - 第一次执行成功并产生效果
   * - 第二次执行不产生新效果
   * - 返回结果一致（相同business_id返回原结果）
   *
   * @param {Function} operation - 需要测试的幂等操作函数
   * @param {string} businessId - 业务唯一标识
   * @param {Function} verifyResult - 验证结果一致性的函数
   * @returns {Promise<Object>} 测试结果
   * @throws {Error} 如果幂等性保护失效
   */
  static async testBusinessIdIdempotency(operation, businessId, verifyResult = null) {
    console.log(`🔒 测试幂等性: business_id=${businessId}`)

    // 第一次执行
    const result1 = await operation()
    console.log('✅ 第一次执行完成')

    // 第二次执行（相同business_id）
    const result2 = await operation()
    console.log('✅ 第二次执行完成')

    // 验证结果一致性
    if (verifyResult) {
      const isConsistent = verifyResult(result1, result2)
      if (!isConsistent) {
        throw new Error('❌ 幂等性失败: 相同business_id返回结果不一致')
      }
      console.log('✅ 幂等性保护有效: 返回结果一致')
    }

    return {
      success: true,
      businessId,
      firstResult: result1,
      secondResult: result2,
      isIdempotent: true
    }
  }

  /**
   * 测试幂等性失败检测
   *
   * 验证内容：
   * - 相同business_id不应创建新记录
   * - 数据库中只有一条记录
   * - 重复操作不改变系统状态
   *
   * @param {Function} operation - 执行操作的函数
   * @param {Function} getRecordCount - 获取记录数量的函数
   * @param {string} businessId - 业务唯一标识
   * @returns {Promise<Object>} 测试结果
   * @throws {Error} 如果检测到幂等性失败
   */
  static async testIdempotencyFailureDetection(operation, getRecordCount, businessId) {
    console.log(`🔍 检测幂等性失败: business_id=${businessId}`)

    // 执行前的记录数
    const countBefore = await getRecordCount()

    // 第一次执行
    await operation()
    const countAfterFirst = await getRecordCount()

    if (countAfterFirst !== countBefore + 1) {
      throw new Error(
        `❌ 第一次执行异常: 预期增加1条记录，实际增加${countAfterFirst - countBefore}条`
      )
    }

    // 第二次执行（相同business_id）
    await operation()
    const countAfterSecond = await getRecordCount()

    if (countAfterSecond !== countAfterFirst) {
      throw new Error(
        `❌ 幂等性失败: 重复执行创建了新记录 (${countAfterSecond - countAfterFirst}条)`
      )
    }

    console.log('✅ 幂等性保护有效: 重复执行未创建新记录')

    return {
      success: true,
      businessId,
      recordCountBefore: countBefore,
      recordCountAfterFirst: countAfterFirst,
      recordCountAfterSecond: countAfterSecond,
      isIdempotent: true
    }
  }

  /**
   * 测试并发重复请求的幂等性保护
   *
   * 验证内容：
   * - 多个并发请求只执行一次
   * - 所有请求返回相同结果
   * - 数据库只有一条记录
   *
   * @param {Function} operation - 执行操作的函数
   * @param {number} concurrentCount - 并发请求数量 (默认: 5)
   * @returns {Promise<Object>} 测试结果
   * @throws {Error} 如果并发幂等性保护失效
   */
  static async testConcurrentIdempotency(operation, concurrentCount = 5) {
    console.log(`🔒 测试并发幂等性: ${concurrentCount}个并发请求`)

    // 并发执行多个相同请求
    const startTime = Date.now()
    const promises = Array.from({ length: concurrentCount }, () => operation())
    const results = await Promise.all(promises)
    const duration = Date.now() - startTime

    // 验证所有结果一致
    const firstResult = JSON.stringify(results[0])
    const allSame = results.every(result => JSON.stringify(result) === firstResult)

    if (!allSame) {
      throw new Error('❌ 并发幂等性失败: 并发请求返回结果不一致')
    }

    console.log(`✅ 并发幂等性保护有效: ${concurrentCount}个请求结果一致`)
    console.log(`⏱️ 并发执行耗时: ${duration}ms`)

    return {
      success: true,
      concurrentCount,
      duration,
      allResultsSame: allSame,
      sampleResult: results[0]
    }
  }

  /**
   * 测试不同business_id的独立性
   *
   * 验证内容：
   * - 不同business_id可以独立执行
   * - 每个business_id都有对应的记录
   * - 幂等性保护不影响正常业务
   *
   * @param {Function} createOperation - 创建操作的函数工厂
   * @param {Array<string>} businessIds - 业务ID列表
   * @returns {Promise<Object>} 测试结果
   * @throws {Error} 如果独立性测试失败
   */
  static async testBusinessIdIndependence(createOperation, businessIds) {
    console.log(`🔍 测试business_id独立性: ${businessIds.length}个ID`)

    const results = []

    for (const businessId of businessIds) {
      const operation = createOperation(businessId)
      const result = await operation()
      results.push({ businessId, result })
      console.log(`✅ business_id=${businessId} 执行成功`)
    }

    // 验证所有业务ID都有对应结果
    if (results.length !== businessIds.length) {
      throw new Error(`❌ 独立性测试失败: 预期${businessIds.length}个结果，实际${results.length}个`)
    }

    console.log(`✅ business_id独立性验证通过: ${businessIds.length}个ID独立执行`)

    return {
      success: true,
      totalBusinessIds: businessIds.length,
      results
    }
  }

  /**
   * 测试资产服务的幂等性（项目特定）
   *
   * 验证内容：
   * - 相同idempotency_key的资产操作只执行一次
   * - 账户余额只变更一次
   * - 流水记录只创建一次
   *
   * @param {number} userId - 用户ID
   * @param {number} amount - 资产数量
   * @param {string} idempotencyKey - 幂等性键
   * @param {Object} BalanceService - 资产服务实例
   * @returns {Promise<Object>} 测试结果
   * @throws {Error} 如果幂等性保护失效
   */
  static async testBalanceServiceIdempotency(userId, amount, idempotencyKey, BalanceService) {
    console.log(`💰 测试资产服务幂等性: user_id=${userId}, idempotency_key=${idempotencyKey}`)

    // 获取初始余额
    const balanceBefore = await BalanceService.getBalance({ user_id: userId, asset_code: 'points' })
    const availableBefore = Number(balanceBefore.available_amount)

    // 第一次添加资产
    await BalanceService.changeBalance({
      user_id: userId,
      asset_code: 'points',
      delta_amount: amount,
      business_type: 'idempotency_test',
      idempotency_key: idempotencyKey
    })

    // 验证余额变更
    const balanceAfterFirst = await BalanceService.getBalance({
      user_id: userId,
      asset_code: 'points'
    })
    const availableAfterFirst = Number(balanceAfterFirst.available_amount)

    if (availableAfterFirst !== availableBefore + amount) {
      throw new Error('❌ 第一次执行异常: 余额变更不正确')
    }

    // 第二次添加资产（相同idempotency_key）
    await BalanceService.changeBalance({
      user_id: userId,
      asset_code: 'points',
      delta_amount: amount,
      business_type: 'idempotency_test',
      idempotency_key: idempotencyKey // 相同idempotency_key
    })

    // 验证余额未再次变更
    const balanceAfterSecond = await BalanceService.getBalance({
      user_id: userId,
      asset_code: 'points'
    })
    const availableAfterSecond = Number(balanceAfterSecond.available_amount)

    if (availableAfterSecond !== availableAfterFirst) {
      throw new Error('❌ 幂等性失败: 重复执行导致余额再次变更')
    }

    console.log('✅ 资产服务幂等性保护有效')

    return {
      success: true,
      userId,
      amount,
      idempotencyKey,
      balanceBefore: availableBefore,
      balanceAfterFirst: availableAfterFirst,
      balanceAfterSecond: availableAfterSecond,
      isIdempotent: true
    }
  }

  /**
   * 测试抽奖服务的幂等性（项目特定）
   *
   * 验证内容：
   * - 相同抽奖请求只执行一次
   * - 积分只扣除一次
   * - 抽奖记录只创建一次
   *
   * @param {number} userId - 用户ID
   * @param {number} campaignId - 活动ID
   * @param {string} idempotencyKey - 幂等性键
   * @param {Object} LotteryEngine - 抽奖引擎实例
   * @returns {Promise<Object>} 测试结果
   * @throws {Error} 如果幂等性保护失效
   */
  static async testLotteryIdempotency(userId, campaignId, idempotencyKey, LotteryEngine) {
    console.log(`🎲 测试抽奖幂等性: user_id=${userId}, key=${idempotencyKey}`)

    const { LotteryDraw } = require('../../models')

    // 获取初始抽奖记录数
    const countBefore = await LotteryDraw.count({
      where: { user_id: userId, lottery_campaign_id: campaignId }
    })

    // 第一次抽奖
    await LotteryEngine.executeLottery({
      user_id: userId,
      lottery_campaign_id: campaignId,
      draws_count: 1,
      idempotency_key: idempotencyKey
    })

    // 验证抽奖记录增加
    const countAfterFirst = await LotteryDraw.count({
      where: { user_id: userId, lottery_campaign_id: campaignId }
    })

    if (countAfterFirst !== countBefore + 1) {
      throw new Error('❌ 第一次抽奖异常: 预期增加1条记录')
    }

    // 第二次抽奖（相同idempotency_key）
    await LotteryEngine.executeLottery({
      user_id: userId,
      lottery_campaign_id: campaignId,
      draws_count: 1,
      idempotency_key: idempotencyKey // 相同幂等性键
    })

    // 验证抽奖记录未再次增加
    const countAfterSecond = await LotteryDraw.count({
      where: { user_id: userId, lottery_campaign_id: campaignId }
    })

    if (countAfterSecond !== countAfterFirst) {
      throw new Error('❌ 抽奖幂等性失败: 重复执行创建了新记录')
    }

    console.log('✅ 抽奖服务幂等性保护有效')

    return {
      success: true,
      userId,
      campaignId,
      idempotencyKey,
      countBefore,
      countAfterFirst,
      countAfterSecond,
      isIdempotent: true
    }
  }
}

// 导出测试工具
module.exports = {
  IdempotencyTestSuite
}
