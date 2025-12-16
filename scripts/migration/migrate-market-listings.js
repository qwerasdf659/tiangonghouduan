/**
 * 数据迁移脚本：将 UserInventory 表中的市场数据迁移到 MarketListing 表
 *
 * 业务场景：
 * - Phase 2 架构升级：将挂牌真相从 UserInventory.market_status 迁移到独立的 market_listings 表
 * - 迁移 market_status=on_sale 的记录到 market_listings 表
 * - 保持 UserInventory 的原有字段不变（用于回滚观测）
 *
 * 执行方式：
 * node scripts/migration/migrate-market-listings.js
 *
 * 创建时间：2025-12-15
 */

const { sequelize, UserInventory, MarketListing } = require('../../models')
const logger = require('../../utils/logger')

/**
 * 迁移市场挂牌数据
 *
 * 业务逻辑：
 * 1. 查询所有 market_status=on_sale 的记录
 * 2. 迁移到 market_listings 表
 * 3. 保持 UserInventory 的原有字段不变（用于回滚观测）
 *
 * @returns {Promise<Object>} 迁移结果 {success, migrated_count, skipped_count, total_count, errors}
 */
async function migrateMarketListings() {
  const transaction = await sequelize.transaction()

  try {
    logger.info('开始迁移市场挂牌数据...')

    // 1. 查询所有在售的商品
    const onSaleItems = await UserInventory.findAll({
      where: {
        market_status: 'on_sale'
      },
      transaction
    })

    logger.info(`发现 ${onSaleItems.length} 个在售商品需要迁移`)

    if (onSaleItems.length === 0) {
      logger.info('没有需要迁移的数据')
      await transaction.commit()
      return {
        success: true,
        migrated_count: 0,
        message: '没有需要迁移的数据'
      }
    }

    // 2. 迁移数据到 market_listings 表
    let migrated_count = 0
    let skipped_count = 0
    const errors = []

    for (const item of onSaleItems) {
      try {
        // 检查是否已经迁移过
        const existingListing = await MarketListing.findOne({
          where: {
            offer_item_instance_id: item.inventory_id
          },
          transaction
        })

        if (existingListing) {
          logger.warn(`商品 ${item.inventory_id} 已经存在于 market_listings 表，跳过`)
          skipped_count++
          continue
        }

        // 验证必需字段
        if (!item.selling_asset_code || !item.selling_amount) {
          logger.warn(`商品 ${item.inventory_id} 缺少定价信息，跳过迁移`)
          errors.push({
            inventory_id: item.inventory_id,
            error: '缺少定价信息（selling_asset_code 或 selling_amount）'
          })
          skipped_count++
          continue
        }

        // 创建 MarketListing 记录
        await MarketListing.create(
          {
            listing_kind: 'item_instance',
            seller_user_id: item.user_id,
            offer_item_instance_id: item.inventory_id,
            offer_asset_code: null,
            offer_amount: null,
            price_asset_code: item.selling_asset_code,
            price_amount: item.selling_amount,
            seller_offer_frozen: false,
            locked_by_order_id: null,
            locked_at: null,
            status: 'on_sale'
          },
          { transaction }
        )

        migrated_count++
        logger.info(`✅ 成功迁移商品 ${item.inventory_id}`)
      } catch (error) {
        logger.error(`迁移商品 ${item.inventory_id} 失败:`, error.message)
        errors.push({
          inventory_id: item.inventory_id,
          error: error.message
        })
      }
    }

    // 提交事务
    await transaction.commit()

    logger.info('数据迁移完成', {
      total: onSaleItems.length,
      migrated: migrated_count,
      skipped: skipped_count,
      errors: errors.length
    })

    return {
      success: true,
      migrated_count,
      skipped_count,
      total_count: onSaleItems.length,
      errors
    }
  } catch (error) {
    await transaction.rollback()
    logger.error('数据迁移失败:', error.message)
    throw error
  }
}

// 执行迁移
if (require.main === module) {
  migrateMarketListings()
    .then(result => {
      console.log('\n📊 迁移结果:')
      console.log(`总数: ${result.total_count || 0}`)
      console.log(`成功: ${result.migrated_count}`)
      console.log(`跳过: ${result.skipped_count || 0}`)
      console.log(`错误: ${result.errors?.length || 0}`)

      if (result.errors && result.errors.length > 0) {
        console.log('\n❌ 错误列表:')
        result.errors.forEach(err => {
          console.log(`  - inventory_id: ${err.inventory_id}, error: ${err.error}`)
        })
      }

      process.exit(0)
    })
    .catch(error => {
      console.error('\n❌ 迁移失败:', error.message)
      process.exit(1)
    })
}

module.exports = { migrateMarketListings }
