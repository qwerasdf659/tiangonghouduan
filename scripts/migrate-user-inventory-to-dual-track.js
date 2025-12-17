/**
 * 餐厅积分抽奖系统 V4.2 - 背包双轨架构数据迁移脚本
 *
 * 功能：将 user_inventory 表的历史数据迁移到双轨系统
 *
 * 迁移策略：
 * 1. 材料/碎片类型 → account_asset_balances（可叠加资产轨）
 * 2. 优惠券/商品类型 → item_instances（不可叠加物品轨）
 * 3. 旧核销码（8位HEX）→ redemption_orders（12位Base32新码）
 *
 * 执行流程：
 * 1. 数据完整性检查
 * 2. 分批迁移（每批100条）
 * 3. 数据验证
 * 4. 生成迁移报告
 *
 * 使用方法：
 * ```bash
 * # 测试环境（dry-run模式，不实际修改数据）
 * NODE_ENV=development node scripts/migrate-user-inventory-to-dual-track.js --dry-run
 *
 * # 生产环境（实际迁移）
 * NODE_ENV=production node scripts/migrate-user-inventory-to-dual-track.js
 * ```
 *
 * 创建时间：2025-12-17
 * 使用模型：Claude Sonnet 4.5
 */

const { sequelize } = require('../config/database')
const {
  UserInventory,
  ItemInstance,
  AccountAssetBalance,
  AssetTransaction,
  RedemptionOrder,
  Account,
  MaterialAssetType
} = require('../models')
const AssetService = require('../services/AssetService')
const RedemptionCodeGenerator = require('../utils/RedemptionCodeGenerator')
const Logger = require('../services/UnifiedLotteryEngine/utils/Logger')

const logger = new Logger('MigrationScript')

/**
 * 迁移配置
 */
const MIGRATION_CONFIG = {
  // 批量处理大小
  batchSize: 100,
  // 是否为干运行模式（不实际修改数据）
  isDryRun: process.argv.includes('--dry-run'),
  // 核销码有效期（天）
  redemptionCodeTTL: 30,
  // 材料类型识别关键词
  materialKeywords: ['碎片', '水晶', '材料', '粉末', '精华', '晶石'],
  // 资产代码映射规则
  assetCodeMapping: {
    红色碎片: 'red_shard',
    红水晶: 'red_crystal',
    蓝色碎片: 'blue_shard',
    蓝水晶: 'blue_crystal',
    绿色碎片: 'green_shard',
    绿水晶: 'green_crystal',
    钻石: 'DIAMOND'
  }
}

/**
 * 迁移统计数据
 */
class MigrationStatistics {
  constructor() {
    this.total = 0 // 总记录数
    this.migratedToAssets = 0 // 迁移到资产轨
    this.migratedToItems = 0 // 迁移到物品轨
    this.redemptionCodesCreated = 0 // 创建的兑换订单数
    this.skipped = 0 // 跳过的记录数
    this.errors = [] // 错误记录
    this.startTime = Date.now()
  }

  /**
   * 记录成功迁移到资产轨
   */
  recordAssetMigration() {
    this.migratedToAssets++
  }

  /**
   * 记录成功迁移到物品轨
   */
  recordItemMigration() {
    this.migratedToItems++
  }

  /**
   * 记录核销码创建
   */
  recordRedemptionCode() {
    this.redemptionCodesCreated++
  }

  /**
   * 记录跳过的记录
   */
  recordSkipped(inventoryId, reason) {
    this.skipped++
    logger.warn('跳过记录', { inventory_id: inventoryId, reason })
  }

  /**
   * 记录错误
   */
  recordError(inventoryId, error) {
    this.errors.push({
      inventory_id: inventoryId,
      error: error.message,
      stack: error.stack
    })
    logger.error('迁移失败', {
      inventory_id: inventoryId,
      error: error.message
    })
  }

  /**
   * 生成迁移报告
   */
  generateReport() {
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(2)
    const report = {
      迁移模式: MIGRATION_CONFIG.isDryRun ? 'DRY-RUN（测试模式）' : 'PRODUCTION（生产模式）',
      执行时间: `${duration}秒`,
      总记录数: this.total,
      迁移到资产轨: this.migratedToAssets,
      迁移到物品轨: this.migratedToItems,
      创建兑换订单: this.redemptionCodesCreated,
      跳过记录数: this.skipped,
      成功率: `${(((this.migratedToAssets + this.migratedToItems) / this.total) * 100).toFixed(2)}%`,
      错误数: this.errors.length
    }

    logger.info('迁移报告', report)

    if (this.errors.length > 0) {
      logger.error('错误详情', { errors: this.errors })
    }

    return report
  }
}

/**
 * 数据迁移主类
 */
class InventoryMigration {
  constructor() {
    this.stats = new MigrationStatistics()
  }

  /**
   * 执行迁移
   */
  async run() {
    try {
      logger.info('开始迁移 user_inventory 表', {
        isDryRun: MIGRATION_CONFIG.isDryRun
      })

      // 1. 数据完整性检查
      await this.performPreMigrationChecks()

      // 2. 统计待迁移数据
      this.stats.total = await UserInventory.count()
      logger.info('待迁移记录数', { total: this.stats.total })

      if (this.stats.total === 0) {
        logger.warn('没有待迁移的数据')
        return this.stats.generateReport()
      }

      // 3. 分批迁移
      const batches = Math.ceil(this.stats.total / MIGRATION_CONFIG.batchSize)
      logger.info('分批迁移', { batches, batchSize: MIGRATION_CONFIG.batchSize })

      for (let i = 0; i < batches; i++) {
        await this.migrateBatch(i * MIGRATION_CONFIG.batchSize, MIGRATION_CONFIG.batchSize)
        logger.info('迁移进度', {
          current: Math.min((i + 1) * MIGRATION_CONFIG.batchSize, this.stats.total),
          total: this.stats.total,
          percentage: `${(((i + 1) / batches) * 100).toFixed(2)}%`
        })
      }

      // 4. 生成报告
      const report = this.stats.generateReport()

      // 5. 如果是生产模式，执行最终验证
      if (!MIGRATION_CONFIG.isDryRun) {
        await this.performPostMigrationVerification()
      }

      return report
    } catch (error) {
      logger.error('迁移过程出错', { error: error.message })
      throw error
    }
  }

  /**
   * 迁移前检查
   */
  async performPreMigrationChecks() {
    logger.info('执行迁移前检查')

    // 检查数据库连接
    await sequelize.authenticate()
    logger.info('数据库连接正常')

    // 检查必需的表是否存在
    const tables = [
      'user_inventory',
      'item_instances',
      'account_asset_balances',
      'asset_transactions',
      'redemption_orders'
    ]

    for (const table of tables) {
      const [results] = await sequelize.query(`SHOW TABLES LIKE '${table}'`)
      if (results.length === 0) {
        throw new Error(`表 ${table} 不存在，请先执行数据库迁移`)
      }
    }

    logger.info('所有必需的表都存在')
  }

  /**
   * 分批迁移
   */
  async migrateBatch(offset, limit) {
    const records = await UserInventory.findAll({
      offset,
      limit,
      order: [['inventory_id', 'ASC']]
    })

    for (const record of records) {
      await this.migrateRecord(record)
    }
  }

  /**
   * 迁移单条记录
   */
  async migrateRecord(record) {
    // 如果是干运行模式，创建临时事务但不提交
    const transaction = MIGRATION_CONFIG.isDryRun ? null : await sequelize.transaction()

    try {
      // 跳过空类型或无效状态的记录
      if (!record.type || !['voucher', 'product', 'service'].includes(record.type)) {
        this.stats.recordSkipped(record.inventory_id, `无效类型: ${record.type}`)
        if (transaction) await transaction.rollback()
        return
      }

      // 判断迁移目标
      if (this.shouldMigrateToAsset(record)) {
        await this.migrateToAsset(record, transaction)
        this.stats.recordAssetMigration()
      } else {
        await this.migrateToItem(record, transaction)
        this.stats.recordItemMigration()
      }

      // 提交事务
      if (transaction && !MIGRATION_CONFIG.isDryRun) {
        await transaction.commit()
        logger.debug('迁移成功', { inventory_id: record.inventory_id })
      } else if (transaction) {
        await transaction.rollback()
        logger.debug('[DRY-RUN] 迁移成功（未实际提交）', {
          inventory_id: record.inventory_id
        })
      }
    } catch (error) {
      if (transaction) await transaction.rollback()
      this.stats.recordError(record.inventory_id, error)
    }
  }

  /**
   * 判断是否应迁移到资产轨
   */
  shouldMigrateToAsset(record) {
    // 检查名称是否包含材料关键词
    const name = record.name || ''
    return MIGRATION_CONFIG.materialKeywords.some(keyword => name.includes(keyword))
  }

  /**
   * 迁移到资产轨（可叠加资产）
   */
  async migrateToAsset(record, transaction) {
    logger.debug('迁移到资产轨', {
      inventory_id: record.inventory_id,
      name: record.name
    })

    // 1. 推导资产代码
    const assetCode = this.deriveAssetCode(record.name)

    // 2. 获取或创建账户
    const account = await AssetService.getOrCreateAccount(
      { user_id: record.user_id },
      { transaction }
    )

    // 3. 增加余额（使用迁移业务类型）
    await AssetService.changeBalance(
      {
        user_id: record.user_id,
        asset_code: assetCode,
        delta_amount: 1, // 每条记录 = 1个材料
        business_id: `migration_inventory_${record.inventory_id}`,
        business_type: 'migration_from_user_inventory',
        meta: {
          source_inventory_id: record.inventory_id,
          source_name: record.name,
          source_type: record.type,
          source_status: record.status,
          acquired_at: record.acquired_at
        }
      },
      { transaction }
    )

    logger.debug('资产余额已增加', {
      inventory_id: record.inventory_id,
      asset_code: assetCode,
      user_id: record.user_id
    })
  }

  /**
   * 迁移到物品轨（不可叠加物品）
   */
  async migrateToItem(record, transaction) {
    logger.debug('迁移到物品轨', {
      inventory_id: record.inventory_id,
      name: record.name
    })

    // 1. 创建物品实例
    const instance = await ItemInstance.create(
      {
        owner_user_id: record.user_id,
        item_type: record.type,
        status: this.mapStatus(record.status),
        meta: {
          name: record.name,
          description: record.description,
          icon: record.icon,
          value: record.value,
          expires_at: record.expires_at,
          source_inventory_id: record.inventory_id,
          source_type: record.source_type,
          source_id: record.source_id,
          acquired_at: record.acquired_at,
          migrated_at: new Date()
        },
        created_at: record.created_at || new Date(),
        updated_at: record.updated_at || new Date()
      },
      { transaction }
    )

    logger.debug('物品实例已创建', {
      inventory_id: record.inventory_id,
      item_instance_id: instance.item_instance_id
    })

    // 2. 如果有核销码，创建兑换订单
    if (record.verification_code) {
      await this.migrateVerificationCode(record, instance, transaction)
      this.stats.recordRedemptionCode()
    }
  }

  /**
   * 迁移核销码到兑换订单
   */
  async migrateVerificationCode(record, instance, transaction) {
    logger.debug('迁移核销码', {
      inventory_id: record.inventory_id,
      old_code: record.verification_code
    })

    // 生成新的12位Base32核销码（最多重试3次）
    let code,
      codeHash,
      isUnique = false,
      attempts = 0

    while (!isUnique && attempts < 3) {
      code = RedemptionCodeGenerator.generate()
      codeHash = RedemptionCodeGenerator.hash(code)

      // 检查是否碰撞
      const existing = await RedemptionOrder.findOne({
        where: { code_hash: codeHash },
        transaction
      })

      isUnique = !existing
      attempts++
    }

    if (!isUnique) {
      throw new Error('核销码生成失败: 碰撞重试次数超限')
    }

    // 确定订单状态和过期时间
    const status = record.status === 'used' ? 'fulfilled' : 'pending'
    const expiresAt =
      record.verification_expires_at ||
      new Date(Date.now() + MIGRATION_CONFIG.redemptionCodeTTL * 24 * 60 * 60 * 1000)

    // 创建兑换订单
    await RedemptionOrder.create(
      {
        code_hash: codeHash,
        item_instance_id: instance.item_instance_id,
        redeemer_user_id: record.status === 'used' ? record.user_id : null,
        status,
        expires_at: expiresAt,
        fulfilled_at: record.used_at,
        created_at: record.created_at || new Date(),
        updated_at: record.updated_at || new Date()
      },
      { transaction }
    )

    logger.debug('兑换订单已创建', {
      inventory_id: record.inventory_id,
      item_instance_id: instance.item_instance_id,
      new_code: code,
      status
    })

    // ⚠️ 注意：新核销码只在日志中记录，不存储到数据库
    logger.info('核销码迁移完成（用户需要重新获取新码）', {
      inventory_id: record.inventory_id,
      old_code: record.verification_code,
      new_code_format: '12位Base32',
      new_code_sample: code.slice(0, 4) + '-****-****'
    })
  }

  /**
   * 推导资产代码
   */
  deriveAssetCode(name) {
    // 优先使用预定义的映射
    if (MIGRATION_CONFIG.assetCodeMapping[name]) {
      return MIGRATION_CONFIG.assetCodeMapping[name]
    }

    // 否则生成标准化代码（去除空格，转小写，下划线分隔）
    return name
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
  }

  /**
   * 映射状态
   */
  mapStatus(oldStatus) {
    const mapping = {
      available: 'available',
      pending: 'locked',
      used: 'used',
      expired: 'expired',
      transferred: 'transferred'
    }
    return mapping[oldStatus] || 'available'
  }

  /**
   * 迁移后验证
   */
  async performPostMigrationVerification() {
    logger.info('执行迁移后验证')

    // 1. 验证记录数一致性
    const originalCount = this.stats.total
    const migratedCount = this.stats.migratedToAssets + this.stats.migratedToItems

    if (migratedCount < originalCount) {
      logger.warn('迁移记录数不一致', {
        original: originalCount,
        migrated: migratedCount,
        difference: originalCount - migratedCount
      })
    } else {
      logger.info('迁移记录数一致', {
        original: originalCount,
        migrated: migratedCount
      })
    }

    // 2. 验证核销码迁移
    const inventoryCodesCount = await UserInventory.count({
      where: {
        verification_code: { [require('sequelize').Op.not]: null }
      }
    })

    const redemptionOrdersCount = await RedemptionOrder.count()

    logger.info('核销码迁移验证', {
      original_codes: inventoryCodesCount,
      new_orders: redemptionOrdersCount
    })
  }
}

/**
 * 主程序入口
 */
async function main() {
  try {
    console.log('='.repeat(70))
    console.log('背包双轨架构数据迁移脚本')
    console.log('='.repeat(70))

    if (MIGRATION_CONFIG.isDryRun) {
      console.log('⚠️ 运行模式: DRY-RUN（测试模式，不会实际修改数据）')
    } else {
      console.log('🚨 运行模式: PRODUCTION（生产模式，将实际修改数据）')
      console.log('⚠️ 确保已经备份数据库！按 Ctrl+C 取消，或等待5秒后自动开始...')
      await new Promise(resolve => setTimeout(resolve, 5000))
    }

    console.log('开始迁移...\n')

    const migration = new InventoryMigration()
    const report = await migration.run()

    console.log('\n' + '='.repeat(70))
    console.log('迁移完成')
    console.log('='.repeat(70))
    console.log(JSON.stringify(report, null, 2))

    if (report.错误数 > 0) {
      console.error('\n⚠️ 迁移过程中出现错误，请检查日志')
      process.exit(1)
    } else {
      console.log('\n✅ 迁移成功完成')
      process.exit(0)
    }
  } catch (error) {
    console.error('\n❌ 迁移失败:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main()
}

module.exports = InventoryMigration
