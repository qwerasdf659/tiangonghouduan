/**
 * C2C 材料交易功能集成测试
 *
 * 测试场景：
 * - 可叠加资产挂牌创建（createFungibleAssetListing）
 * - 可叠加资产挂牌撤回（withdrawFungibleAssetListing）
 * - 幂等性保证
 * - 挂牌数量限制
 * - 余额冻结/解冻
 *
 * 创建时间：2026-01-08
 *
 * P1-9 J2-RepoWide 改造：
 * - 通过 ServiceManager 统一获取服务
 * - 服务 key 使用 snake_case（E2-Strict）
 */

const { sequelize, MarketListing, User, MaterialAssetType } = require('../../models')
const TransactionManager = require('../../utils/TransactionManager')

// 🔴 P1-9 J2-RepoWide：通过 global.getTestService 获取服务（snake_case key）
let MarketListingService
let AssetService

// 测试数据库配置
jest.setTimeout(30000)

describe('C2C 材料交易功能集成测试', () => {
  let testUser
  const testAssetCode = 'red_shard' // 测试资产代码
  let skipTests = false
  let createdListingIds = [] // 用于清理的挂牌ID列表

  // 测试前准备
  beforeAll(async () => {
    try {
      // 🔴 P1-9：通过 ServiceManager 获取服务实例
      MarketListingService = global.getTestService('market_listing')
      AssetService = global.getTestService('asset')

      // 连接测试数据库（由全局 jest.setup.js 处理，此处仅验证）
      await sequelize.authenticate()
      console.log('✅ 数据库连接成功')

      // 获取测试用户
      testUser = await User.findOne({
        where: { mobile: '13612227930' }
      })

      if (!testUser) {
        console.warn('⚠️ 测试用户不存在，跳过测试')
        skipTests = true
        return
      }

      console.log(`✅ 测试用户: user_id=${testUser.user_id}`)

      // 检查测试资产类型是否存在
      const assetType = await MaterialAssetType.findOne({
        where: { asset_code: testAssetCode, is_enabled: true }
      })

      if (!assetType) {
        console.warn(`⚠️ 测试资产类型 ${testAssetCode} 不存在或未启用，跳过测试`)
        skipTests = true
        return
      }

      console.log(`✅ 测试资产类型: ${testAssetCode}`)

      const { Op } = require('sequelize')

      /*
       * 🔴 P0-2 修复：清理之前测试运行留下的 on_sale 挂牌（避免孤儿冻结）
       * 这些挂牌可能是之前测试运行异常中断导致的，资产处于冻结状态
       * 必须通过正确的撤回方法来解冻资产
       */
      const orphanListings = await MarketListing.findAll({
        where: {
          seller_user_id: testUser.user_id,
          status: 'on_sale',
          offer_asset_code: testAssetCode,
          listing_kind: 'fungible_asset'
        }
      })

      if (orphanListings.length > 0) {
        console.log(`🧹 发现 ${orphanListings.length} 条之前测试遗留的 on_sale 挂牌，开始清理...`)
        for (const listing of orphanListings) {
          try {
            await TransactionManager.execute(
              async transaction => {
                await MarketListingService.withdrawFungibleAssetListing(
                  {
                    listing_id: listing.listing_id,
                    seller_user_id: listing.seller_user_id,
                    withdraw_reason: 'beforeAll cleanup'
                  },
                  { transaction }
                )
              },
              { description: `cleanup_orphan_${listing.listing_id}` }
            )
            console.log(`  ✅ 撤回挂牌: ${listing.listing_id}`)
          } catch (error) {
            console.warn(`  ⚠️ 撤回失败: ${listing.listing_id} (${error.message})`)
          }
        }
      }

      /*
       * 🔴 重置每日挂牌计数器（测试环境专用）
       * 每日挂牌次数通过统计 market_listings 表中今天创建的记录计算
       * 测试环境需要重置计数器，避免因达到日限而导致测试失败
       *
       * 重置策略：
       * 1. 删除该测试用户今天创建的、已完成业务流程的挂牌记录
       *    - withdrawn（已撤回）：资产已解冻，可安全删除
       *    - sold（已售出）：资产已转移，可安全删除
       *    - admin_withdrawn（管理员撤回）：资产已解冻，可安全删除
       * 2. on_sale 状态的挂牌不删除（需要通过正常业务流程撤回）
       *
       * 北京时间今天 00:00:00 = UTC 昨天 16:00:00
       */
      const now = new Date()
      const beijingOffset = 8 * 60 // 北京时间偏移量（分钟）
      const utcOffset = now.getTimezoneOffset() // 当前时区偏移量（分钟）
      const todayStartBeijing = new Date(now)
      // 先转换为北京时间，设置为0点，再转回 UTC
      todayStartBeijing.setMinutes(todayStartBeijing.getMinutes() + utcOffset + beijingOffset)
      todayStartBeijing.setHours(0, 0, 0, 0)
      // 转回 UTC 进行数据库查询
      const todayStart = new Date(
        todayStartBeijing.getTime() - (utcOffset + beijingOffset) * 60 * 1000
      )

      // 删除已完成业务流程的挂牌记录（不影响资产余额）
      const deletedCount = await MarketListing.destroy({
        where: {
          seller_user_id: testUser.user_id,
          status: {
            [Op.in]: ['withdrawn', 'sold', 'admin_withdrawn']
          },
          created_at: {
            [Op.gte]: todayStart
          }
        }
      })

      if (deletedCount > 0) {
        console.log(`🔄 已重置每日挂牌计数器：删除 ${deletedCount} 条已完成的挂牌记录`)
      }

      // 统计当前今日挂牌次数
      const currentTodayCount = await MarketListing.count({
        where: {
          seller_user_id: testUser.user_id,
          created_at: {
            [Op.gte]: todayStart
          }
        }
      })
      console.log(`📊 当前今日挂牌次数: ${currentTodayCount}/20`)
    } catch (error) {
      console.warn('⚠️ 数据库连接失败，跳过测试:', error.message)
      skipTests = true
    }
  })

  /**
   * 每个测试后清理数据
   *
   * 🔴 P0-2 修复：禁止使用 MarketListing.destroy() 直接删除
   * 所有挂牌清理必须通过正确的业务流程（撤回方法），确保资产解冻
   *
   * 清理策略：
   * 1. on_sale + fungible_asset：使用 withdrawFungibleAssetListing 撤回并解冻
   * 2. on_sale + item_instance：使用 withdrawItemInstanceListing 撤回
   * 3. 其他状态（sold/withdrawn/locked）：已完成的业务流程，无需清理
   * 4. 撤回失败：记录警告日志，交由每日孤儿冻结检测任务处理
   */
  afterEach(async () => {
    if (skipTests) return

    // 清理创建的挂牌记录（通过撤回方法解冻资产）
    for (const listingId of createdListingIds) {
      try {
        // 检查挂牌是否仍为 on_sale 状态
        const listing = await MarketListing.findByPk(listingId)
        if (!listing) {
          console.log(`⏭️ 挂牌已删除: ${listingId}`)
          continue
        }

        /*
         * 🔴 P0-2：只有 on_sale 状态的挂牌才需要撤回
         * 其他状态（sold/withdrawn/admin_withdrawn/locked）说明业务已完成，无需清理
         */
        if (listing.status !== 'on_sale') {
          console.log(`⏭️ 挂牌状态已变更，无需清理: ${listingId} (status=${listing.status})`)
          continue
        }

        if (listing.listing_kind === 'fungible_asset') {
          // 使用正确的撤回方法解冻资产
          await TransactionManager.execute(
            async transaction => {
              await MarketListingService.withdrawFungibleAssetListing(
                {
                  listing_id: listingId,
                  seller_user_id: listing.seller_user_id,
                  withdraw_reason: '测试清理'
                },
                { transaction }
              )
            },
            { description: `test_cleanup_${listingId}` }
          )
          console.log(`✅ 撤回挂牌并解冻: ${listingId}`)
        } else if (listing.listing_kind === 'item_instance') {
          // item_instance 类型的撤回
          await TransactionManager.execute(
            async transaction => {
              await MarketListingService.withdrawItemInstanceListing(
                {
                  listing_id: listingId,
                  seller_user_id: listing.seller_user_id,
                  withdraw_reason: '测试清理'
                },
                { transaction }
              )
            },
            { description: `test_cleanup_${listingId}` }
          )
          console.log(`✅ 撤回物品实例挂牌: ${listingId}`)
        }
      } catch (error) {
        /*
         * 🔴 P0-2 修复：撤回失败时不再直接删除，而是记录警告
         * 孤儿冻结将由每日定时任务（DailyOrphanFrozenCheck）自动检测和清理
         */
        console.warn(
          `⚠️ 测试清理撤回失败: ${listingId} (${error.message})，` + '将由孤儿冻结检测任务处理'
        )
      }
    }
    createdListingIds = []
  })

  // 测试后关闭连接
  afterAll(async () => {
    await sequelize.close()
  })

  // ==================== 创建挂牌测试 ====================

  describe('createFungibleAssetListing - 创建可叠加资产挂牌', () => {
    test('成功创建挂牌并冻结资产', async () => {
      if (skipTests) {
        console.log('⏭️ 跳过测试')
        return
      }

      // 1. 确保用户有足够的资产余额
      const initialBalance = await AssetService.getBalance({
        user_id: testUser.user_id,
        asset_code: testAssetCode
      })

      if (initialBalance.available_amount < 10) {
        console.warn(`⚠️ 用户 ${testAssetCode} 余额不足，跳过测试`)
        return
      }

      // 2. 创建挂牌
      const idempotencyKey = `test_listing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const offerAmount = 5
      const priceAmount = 100

      const result = await TransactionManager.execute(
        async transaction => {
          return await MarketListingService.createFungibleAssetListing(
            {
              idempotency_key: idempotencyKey,
              seller_user_id: testUser.user_id,
              offer_asset_code: testAssetCode,
              offer_amount: offerAmount,
              price_amount: priceAmount
            },
            { transaction }
          )
        },
        { description: 'test_create_fungible_listing' }
      )

      // 记录用于清理
      createdListingIds.push(result.listing.listing_id)

      // 3. 验证结果
      expect(result.is_duplicate).toBe(false)
      expect(result.listing).toBeDefined()
      expect(result.listing.listing_kind).toBe('fungible_asset')
      expect(result.listing.seller_user_id).toBe(testUser.user_id)
      expect(result.listing.offer_asset_code).toBe(testAssetCode)
      expect(Number(result.listing.offer_amount)).toBe(offerAmount)
      expect(Number(result.listing.price_amount)).toBe(priceAmount)
      expect(result.listing.status).toBe('on_sale')
      expect(result.listing.seller_offer_frozen).toBe(true)

      // 4. 验证冻结结果
      expect(result.freeze_result).toBeDefined()

      // 5. 验证余额变化
      const afterBalance = await AssetService.getBalance({
        user_id: testUser.user_id,
        asset_code: testAssetCode
      })

      expect(afterBalance.frozen_amount).toBe(initialBalance.frozen_amount + offerAmount)
      expect(afterBalance.available_amount).toBe(initialBalance.available_amount - offerAmount)

      console.log('✅ 创建挂牌成功:', {
        listing_id: result.listing.listing_id,
        offer_amount: offerAmount,
        price_amount: priceAmount,
        frozen_amount: afterBalance.frozen_amount
      })
    })

    test('幂等性：重复请求返回相同结果', async () => {
      if (skipTests) {
        console.log('⏭️ 跳过测试')
        return
      }

      // 1. 确保用户有足够的资产余额
      const initialBalance = await AssetService.getBalance({
        user_id: testUser.user_id,
        asset_code: testAssetCode
      })

      if (initialBalance.available_amount < 5) {
        console.warn(`⚠️ 用户 ${testAssetCode} 余额不足，跳过测试`)
        return
      }

      // 2. 第一次创建挂牌
      const idempotencyKey = `test_idempotency_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      const firstResult = await TransactionManager.execute(
        async transaction => {
          return await MarketListingService.createFungibleAssetListing(
            {
              idempotency_key: idempotencyKey,
              seller_user_id: testUser.user_id,
              offer_asset_code: testAssetCode,
              offer_amount: 3,
              price_amount: 50
            },
            { transaction }
          )
        },
        { description: 'test_idempotency_first' }
      )

      createdListingIds.push(firstResult.listing.listing_id)

      // 3. 第二次使用相同幂等键创建
      const secondResult = await TransactionManager.execute(
        async transaction => {
          return await MarketListingService.createFungibleAssetListing(
            {
              idempotency_key: idempotencyKey,
              seller_user_id: testUser.user_id,
              offer_asset_code: testAssetCode,
              offer_amount: 3,
              price_amount: 50
            },
            { transaction }
          )
        },
        { description: 'test_idempotency_second' }
      )

      // 4. 验证幂等性
      expect(firstResult.is_duplicate).toBe(false)
      expect(secondResult.is_duplicate).toBe(true)
      // 注意：listing_id 可能是字符串或数字，使用 Number() 转换比较
      expect(Number(secondResult.listing.listing_id)).toBe(Number(firstResult.listing.listing_id))

      console.log('✅ 幂等性测试通过:', {
        first_is_duplicate: firstResult.is_duplicate,
        second_is_duplicate: secondResult.is_duplicate,
        same_listing_id: secondResult.listing.listing_id === firstResult.listing.listing_id
      })
    })

    test('余额不足时抛出错误', async () => {
      if (skipTests) {
        console.log('⏭️ 跳过测试')
        return
      }

      // 🔴 修复：先查询实际余额，使用比实际余额更大的数量来触发错误
      const currentBalance = await AssetService.getBalance({
        user_id: testUser.user_id,
        asset_code: testAssetCode
      })

      // 使用比当前可用余额更大的数量（确保触发余额不足错误）
      const insufficientAmount = BigInt(currentBalance.available_amount || 0) + BigInt(1000000)

      const idempotencyKey = `test_insufficient_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      console.log(
        `🔍 测试余额不足场景: 当前余额=${currentBalance.available_amount}, 请求数量=${insufficientAmount.toString()}`
      )

      await expect(
        TransactionManager.execute(
          async transaction => {
            return await MarketListingService.createFungibleAssetListing(
              {
                idempotency_key: idempotencyKey,
                seller_user_id: testUser.user_id,
                offer_asset_code: testAssetCode,
                offer_amount: Number(insufficientAmount), // 比实际余额多100万
                price_amount: 100
              },
              { transaction }
            )
          },
          { description: 'test_insufficient_balance' }
        )
      ).rejects.toThrow('可用余额不足')

      console.log('✅ 余额不足错误测试通过')
    })
  })

  // ==================== 撤回挂牌测试 ====================

  describe('withdrawFungibleAssetListing - 撤回可叠加资产挂牌', () => {
    test('成功撤回挂牌并解冻资产', async () => {
      if (skipTests) {
        console.log('⏭️ 跳过测试')
        return
      }

      // 1. 确保用户有足够的资产余额
      const initialBalance = await AssetService.getBalance({
        user_id: testUser.user_id,
        asset_code: testAssetCode
      })

      if (initialBalance.available_amount < 5) {
        console.warn(`⚠️ 用户 ${testAssetCode} 余额不足，跳过测试`)
        return
      }

      // 2. 先创建一个挂牌
      const idempotencyKey = `test_withdraw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const offerAmount = 3

      const createResult = await TransactionManager.execute(
        async transaction => {
          return await MarketListingService.createFungibleAssetListing(
            {
              idempotency_key: idempotencyKey,
              seller_user_id: testUser.user_id,
              offer_asset_code: testAssetCode,
              offer_amount: offerAmount,
              price_amount: 60
            },
            { transaction }
          )
        },
        { description: 'test_withdraw_create' }
      )

      const listingId = createResult.listing.listing_id
      createdListingIds.push(listingId)

      // 3. 记录创建后的余额
      const balanceAfterCreate = await AssetService.getBalance({
        user_id: testUser.user_id,
        asset_code: testAssetCode
      })

      // 4. 撤回挂牌
      const withdrawResult = await TransactionManager.execute(
        async transaction => {
          return await MarketListingService.withdrawFungibleAssetListing(
            {
              listing_id: listingId,
              seller_user_id: testUser.user_id
            },
            { transaction }
          )
        },
        { description: 'test_withdraw' }
      )

      // 5. 验证撤回结果
      expect(withdrawResult.listing).toBeDefined()
      expect(withdrawResult.listing.status).toBe('withdrawn')
      expect(withdrawResult.listing.seller_offer_frozen).toBe(false)

      // 6. 验证解冻结果
      expect(withdrawResult.unfreeze_result).toBeDefined()

      // 7. 验证余额恢复
      const balanceAfterWithdraw = await AssetService.getBalance({
        user_id: testUser.user_id,
        asset_code: testAssetCode
      })

      // 🔴 修复：显式转换为数值类型（Decimal/String → Number），避免字符串拼接
      expect(Number(balanceAfterWithdraw.available_amount)).toBe(
        Number(balanceAfterCreate.available_amount) + offerAmount
      )
      expect(Number(balanceAfterWithdraw.frozen_amount)).toBe(
        Number(balanceAfterCreate.frozen_amount) - offerAmount
      )

      console.log('✅ 撤回挂牌成功:', {
        listing_id: listingId,
        unfrozen_amount: offerAmount,
        available_after: balanceAfterWithdraw.available_amount
      })
    })

    test('非所有者撤回时抛出错误', async () => {
      if (skipTests) {
        console.log('⏭️ 跳过测试')
        return
      }

      // 1. 确保用户有足够的资产余额
      const initialBalance = await AssetService.getBalance({
        user_id: testUser.user_id,
        asset_code: testAssetCode
      })

      if (initialBalance.available_amount < 3) {
        console.warn(`⚠️ 用户 ${testAssetCode} 余额不足，跳过测试`)
        return
      }

      // 2. 先创建一个挂牌
      const idempotencyKey = `test_not_owner_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      const createResult = await TransactionManager.execute(
        async transaction => {
          return await MarketListingService.createFungibleAssetListing(
            {
              idempotency_key: idempotencyKey,
              seller_user_id: testUser.user_id,
              offer_asset_code: testAssetCode,
              offer_amount: 2,
              price_amount: 30
            },
            { transaction }
          )
        },
        { description: 'test_not_owner_create' }
      )

      const listingId = createResult.listing.listing_id
      createdListingIds.push(listingId)

      // 3. 使用不同的用户ID尝试撤回
      const fakeUserId = 99999 // 不存在的用户ID

      await expect(
        TransactionManager.execute(
          async transaction => {
            return await MarketListingService.withdrawFungibleAssetListing(
              {
                listing_id: listingId,
                seller_user_id: fakeUserId
              },
              { transaction }
            )
          },
          { description: 'test_not_owner_withdraw' }
        )
      ).rejects.toThrow('无权操作')

      console.log('✅ 非所有者撤回错误测试通过')
    })

    test('挂牌不存在时抛出错误', async () => {
      if (skipTests) {
        console.log('⏭️ 跳过测试')
        return
      }

      const fakeListingId = 99999999 // 不存在的挂牌ID

      await expect(
        TransactionManager.execute(
          async transaction => {
            return await MarketListingService.withdrawFungibleAssetListing(
              {
                listing_id: fakeListingId,
                seller_user_id: testUser.user_id
              },
              { transaction }
            )
          },
          { description: 'test_not_found_withdraw' }
        )
      ).rejects.toThrow('挂牌不存在')

      console.log('✅ 挂牌不存在错误测试通过')
    })
  })

  // ==================== 挂牌数量限制测试 ====================

  describe('挂牌数量限制', () => {
    test('getUserActiveListingCount 返回正确的挂牌数量', async () => {
      if (skipTests) {
        console.log('⏭️ 跳过测试')
        return
      }

      // 获取用户当前活跃挂牌数量
      const listingCount = await MarketListingService.getUserActiveListingCount(testUser.user_id)

      expect(listingCount).toBeDefined()
      expect(typeof listingCount.active_count).toBe('number')
      expect(typeof listingCount.max_count).toBe('number')
      expect(typeof listingCount.remaining_count).toBe('number')
      expect(listingCount.max_count).toBe(10) // 限制为10个
      expect(listingCount.remaining_count).toBe(listingCount.max_count - listingCount.active_count)

      console.log('✅ 挂牌数量查询测试通过:', listingCount)
    })
  })

  // ==================== 多币种扩展测试（2026-01-14 新增） ====================

  describe('多币种扩展功能测试', () => {
    /**
     * 测试场景：使用 red_shard 定价创建挂牌
     *
     * 业务决策（2026-01-14）：
     * - 支持 red_shard 作为定价结算币种
     * - 白名单校验：price_asset_code 必须在 allowed_listing_assets 中
     */
    test('支持 red_shard 定价创建挂牌', async () => {
      if (skipTests) {
        console.log('⏭️ 跳过测试')
        return
      }

      // 1. 确保用户有足够的 red_shard 余额
      const initialBalance = await AssetService.getBalance({
        user_id: testUser.user_id,
        asset_code: testAssetCode
      })

      if (initialBalance.available_amount < 5) {
        console.warn(`⚠️ 用户 ${testAssetCode} 余额不足，跳过测试`)
        return
      }

      // 2. 创建使用 red_shard 定价的挂牌
      const idempotencyKey = `test_multi_currency_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const offerAmount = 3
      const priceAmount = 50
      const priceAssetCode = 'red_shard' // 使用 red_shard 定价

      const result = await TransactionManager.execute(
        async transaction => {
          return await MarketListingService.createFungibleAssetListing(
            {
              idempotency_key: idempotencyKey,
              seller_user_id: testUser.user_id,
              offer_asset_code: testAssetCode,
              offer_amount: offerAmount,
              price_amount: priceAmount,
              price_asset_code: priceAssetCode
            },
            { transaction }
          )
        },
        { description: 'test_multi_currency_listing' }
      )

      createdListingIds.push(result.listing.listing_id)

      // 3. 验证结果
      expect(result.is_duplicate).toBe(false)
      expect(result.listing).toBeDefined()
      expect(result.listing.price_asset_code).toBe(priceAssetCode)
      expect(Number(result.listing.price_amount)).toBe(priceAmount)
      expect(result.listing.status).toBe('on_sale')

      console.log('✅ red_shard 定价挂牌创建成功:', {
        listing_id: result.listing.listing_id,
        price_asset_code: result.listing.price_asset_code,
        price_amount: result.listing.price_amount
      })
    })

    /**
     * 测试场景：定价币种白名单校验
     *
     * 业务决策（2026-01-14）：
     * - 不在白名单中的币种应该被拒绝
     */
    test('拒绝非白名单定价币种', async () => {
      if (skipTests) {
        console.log('⏭️ 跳过测试')
        return
      }

      // 1. 确保用户有足够的余额
      const initialBalance = await AssetService.getBalance({
        user_id: testUser.user_id,
        asset_code: testAssetCode
      })

      if (initialBalance.available_amount < 5) {
        console.warn(`⚠️ 用户 ${testAssetCode} 余额不足，跳过测试`)
        return
      }

      // 2. 尝试使用非白名单币种创建挂牌
      const idempotencyKey = `test_invalid_currency_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      await expect(
        TransactionManager.execute(
          async transaction => {
            return await MarketListingService.createFungibleAssetListing(
              {
                idempotency_key: idempotencyKey,
                seller_user_id: testUser.user_id,
                offer_asset_code: testAssetCode,
                offer_amount: 3,
                price_amount: 50,
                price_asset_code: 'INVALID_CURRENCY' // 非白名单币种
              },
              { transaction }
            )
          },
          { description: 'test_invalid_currency_listing' }
        )
      ).rejects.toThrow('不在允许的挂牌币种白名单中')

      console.log('✅ 非白名单定价币种拒绝测试通过')
    })

    /**
     * 测试场景：价格区间校验
     *
     * 业务决策（2026-01-14）：
     * - red_shard 价格区间 [1, 1000000]
     * - 超出范围应该被拒绝
     */
    test('价格区间校验 - 超出最大值被拒绝', async () => {
      if (skipTests) {
        console.log('⏭️ 跳过测试')
        return
      }

      // 1. 确保用户有足够的余额
      const initialBalance = await AssetService.getBalance({
        user_id: testUser.user_id,
        asset_code: testAssetCode
      })

      if (initialBalance.available_amount < 5) {
        console.warn(`⚠️ 用户 ${testAssetCode} 余额不足，跳过测试`)
        return
      }

      // 2. 尝试使用超过最大价格的金额
      const idempotencyKey = `test_price_range_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      await expect(
        TransactionManager.execute(
          async transaction => {
            return await MarketListingService.createFungibleAssetListing(
              {
                idempotency_key: idempotencyKey,
                seller_user_id: testUser.user_id,
                offer_asset_code: testAssetCode,
                offer_amount: 3,
                price_amount: 2000000, // 超过 red_shard 最大价格 1000000
                price_asset_code: 'red_shard'
              },
              { transaction }
            )
          },
          { description: 'test_price_out_of_range' }
        )
      ).rejects.toThrow('超过最大价格')

      console.log('✅ 价格区间校验（超出最大值）测试通过')
    })

    /**
     * 测试场景：价格区间校验
     *
     * 业务决策（2026-01-14）：
     * - 最小价格为 1
     * - 低于最小价格应该被拒绝
     */
    test('价格区间校验 - 低于最小值被拒绝', async () => {
      if (skipTests) {
        console.log('⏭️ 跳过测试')
        return
      }

      // 1. 确保用户有足够的余额
      const initialBalance = await AssetService.getBalance({
        user_id: testUser.user_id,
        asset_code: testAssetCode
      })

      if (initialBalance.available_amount < 5) {
        console.warn(`⚠️ 用户 ${testAssetCode} 余额不足，跳过测试`)
        return
      }

      /*
       * 2. 尝试使用低于最小价格的金额
       * 🔴 注意：price_amount: 0 会被参数校验（>0）拦截，使用 0.5 测试价格区间校验
       */
      const idempotencyKey = `test_price_min_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      await expect(
        TransactionManager.execute(
          async transaction => {
            return await MarketListingService.createFungibleAssetListing(
              {
                idempotency_key: idempotencyKey,
                seller_user_id: testUser.user_id,
                offer_asset_code: testAssetCode,
                offer_amount: 3,
                price_amount: 0.5, // 低于最小价格 1（但大于 0 以通过参数校验）
                price_asset_code: 'red_shard'
              },
              { transaction }
            )
          },
          { description: 'test_price_below_min' }
        )
      ).rejects.toThrow('低于最小价格')

      console.log('✅ 价格区间校验（低于最小值）测试通过')
    })

    /**
     * 测试场景：多币种校验方法独立验证
     *
     * 业务决策（2026-01-14）：
     * - validateListingAssetWhitelist：白名单校验
     * - validatePriceRange：价格区间校验
     */
    test('多币种校验方法 - validateListingAssetWhitelist', async () => {
      if (skipTests) {
        console.log('⏭️ 跳过测试')
        return
      }

      // 测试有效币种
      const validResult = await MarketListingService.validateListingAssetWhitelist('DIAMOND')
      expect(validResult.valid).toBe(true)
      expect(validResult.whitelist).toContain('DIAMOND')

      // 测试有效币种（red_shard）
      const redShardResult = await MarketListingService.validateListingAssetWhitelist('red_shard')
      expect(redShardResult.valid).toBe(true)
      expect(redShardResult.whitelist).toContain('red_shard')

      // 测试无效币种
      const invalidResult = await MarketListingService.validateListingAssetWhitelist('INVALID')
      expect(invalidResult.valid).toBe(false)
      expect(invalidResult.message).toContain('不在允许的挂牌币种白名单中')

      console.log('✅ validateListingAssetWhitelist 方法测试通过')
    })

    test('多币种校验方法 - validatePriceRange', async () => {
      if (skipTests) {
        console.log('⏭️ 跳过测试')
        return
      }

      // 测试 DIAMOND 有效价格（无上限）
      const diamondValidResult = await MarketListingService.validatePriceRange('DIAMOND', 1000000)
      expect(diamondValidResult.valid).toBe(true)

      // 测试 red_shard 有效价格
      const redShardValidResult = await MarketListingService.validatePriceRange('red_shard', 500)
      expect(redShardValidResult.valid).toBe(true)

      // 测试 red_shard 超出最大价格
      const redShardOverResult = await MarketListingService.validatePriceRange('red_shard', 2000000)
      expect(redShardOverResult.valid).toBe(false)
      expect(redShardOverResult.message).toContain('超过最大价格')

      // 测试低于最小价格
      const underMinResult = await MarketListingService.validatePriceRange('red_shard', 0)
      expect(underMinResult.valid).toBe(false)
      expect(underMinResult.message).toContain('低于最小价格')

      console.log('✅ validatePriceRange 方法测试通过')
    })
  })
})
