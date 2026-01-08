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
 */

const { sequelize, MarketListing, User, MaterialAssetType } = require('../../models')
const MarketListingService = require('../../services/MarketListingService')
const AssetService = require('../../services/AssetService')
const TransactionManager = require('../../utils/TransactionManager')

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
      // 连接测试数据库
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
    } catch (error) {
      console.warn('⚠️ 数据库连接失败，跳过测试:', error.message)
      skipTests = true
    }
  })

  // 每个测试后清理数据（使用正确的撤回方法解冻资产，避免孤儿冻结）
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

        if (listing.status === 'on_sale' && listing.listing_kind === 'fungible_asset') {
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
        } else {
          // 非 on_sale 或非 fungible_asset，直接删除
          await MarketListing.destroy({ where: { listing_id: listingId } })
          console.log(`✅ 清理挂牌记录: ${listingId} (status=${listing.status})`)
        }
      } catch (error) {
        // 撤回失败时尝试直接删除（避免测试阻塞）
        try {
          await MarketListing.destroy({ where: { listing_id: listingId } })
          console.warn(`⚠️ 撤回失败，强制删除: ${listingId} (${error.message})`)
        } catch (deleteError) {
          console.warn(`⚠️ 清理挂牌记录失败 ${listingId}:`, deleteError.message)
        }
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

      // 使用一个非常大的数量
      const idempotencyKey = `test_insufficient_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      await expect(
        TransactionManager.execute(
          async transaction => {
            return await MarketListingService.createFungibleAssetListing(
              {
                idempotency_key: idempotencyKey,
                seller_user_id: testUser.user_id,
                offer_asset_code: testAssetCode,
                offer_amount: 999999999, // 非常大的数量
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

      expect(balanceAfterWithdraw.available_amount).toBe(
        balanceAfterCreate.available_amount + offerAmount
      )
      expect(balanceAfterWithdraw.frozen_amount).toBe(
        balanceAfterCreate.frozen_amount - offerAmount
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
})
