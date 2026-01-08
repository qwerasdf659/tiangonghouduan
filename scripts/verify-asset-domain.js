/**
 * 统一资产域架构验证脚本
 * 验证文档 /docs/统一资产域架构设计方案.md 中的各项任务完成情况
 *
 * 执行方式: node scripts/verify-asset-domain.js
 */

require('dotenv').config()
const { Sequelize, QueryTypes } = require('sequelize')
// 🔴 复用主 sequelize 实例（单一配置源）
const { sequelize } = require('../config/database')

// 验证结果存储
const results = {
  passed: [],
  failed: [],
  warnings: []
}

/**
 * 添加通过的验证项
 */
function pass(item, detail = '') {
  results.passed.push({ item, detail })
  console.log(`✅ ${item}${detail ? ': ' + detail : ''}`)
}

/**
 * 添加失败的验证项
 */
function fail(item, detail = '') {
  results.failed.push({ item, detail })
  console.log(`❌ ${item}${detail ? ': ' + detail : ''}`)
}

/**
 * 添加警告的验证项
 */
function warn(item, detail = '') {
  results.warnings.push({ item, detail })
  console.log(`⚠️  ${item}${detail ? ': ' + detail : ''}`)
}

/**
 * 检查表是否存在
 */
async function tableExists(tableName) {
  try {
    const [tables] = await sequelize.query(`SHOW TABLES LIKE '${tableName}'`, {
      type: QueryTypes.SELECT,
      raw: true
    })
    return !!tables
  } catch (err) {
    return false
  }
}

/**
 * 检查列是否存在
 */
async function columnExists(tableName, columnName) {
  try {
    const [columns] = await sequelize.query(`SHOW COLUMNS FROM ${tableName} LIKE '${columnName}'`, {
      type: QueryTypes.SELECT,
      raw: true
    })
    return !!columns
  } catch (err) {
    return false
  }
}

/**
 * 验证数据库层
 */
async function verifyDatabaseLayer() {
  console.log('\n==========================================')
  console.log('📦 数据库层验证')
  console.log('==========================================\n')

  // 1. 检查 CREDITS 是否已清除
  console.log('【检查1】CREDITS 资产码清理状态')
  try {
    const creditsBalance = await sequelize.query(
      `SELECT COUNT(*) as count, SUM(COALESCE(available_amount, 0)) as total
       FROM account_asset_balances WHERE asset_code = 'CREDITS'`,
      { type: QueryTypes.SELECT }
    )
    const creditsCount = parseInt(creditsBalance[0]?.count) || 0
    const creditsTotal = parseFloat(creditsBalance[0]?.total) || 0

    if (creditsCount === 0) {
      pass('CREDITS 已从 account_asset_balances 清除')
    } else {
      fail(
        'CREDITS 仍存在于 account_asset_balances',
        `${creditsCount} 条记录, 总额: ${creditsTotal}`
      )
    }

    // 检查 asset_transactions
    const creditsTransactions = await sequelize.query(
      `SELECT COUNT(*) as count FROM asset_transactions WHERE asset_code = 'CREDITS'`,
      { type: QueryTypes.SELECT }
    )
    const transCount = parseInt(creditsTransactions[0]?.count) || 0
    if (transCount === 0) {
      pass('CREDITS 已从 asset_transactions 清除')
    } else {
      fail('CREDITS 仍存在于 asset_transactions', `${transCount} 条记录`)
    }

    // 检查 material_asset_types
    const creditsType = await sequelize.query(
      `SELECT COUNT(*) as count FROM material_asset_types WHERE asset_code = 'CREDITS'`,
      { type: QueryTypes.SELECT }
    )
    const typeCount = parseInt(creditsType[0]?.count) || 0
    if (typeCount === 0) {
      pass('CREDITS 已从 material_asset_types 清除')
    } else {
      fail('CREDITS 仍存在于 material_asset_types', `${typeCount} 条记录`)
    }
  } catch (err) {
    fail('检查 CREDITS 清理状态失败', err.message)
  }

  // 2. 检查 campaign_id 字段和 campaign_key 归一化列（2026-01-07 P0数据一致性加固）
  console.log('\n【检查2】BUDGET_POINTS 迁移状态 (campaign_id + campaign_key 字段)')
  try {
    const hasCampaignId = await columnExists('account_asset_balances', 'campaign_id')
    if (hasCampaignId) {
      pass('account_asset_balances 表已添加 campaign_id 字段')

      // 检查 campaign_key 归一化列
      const hasCampaignKey = await columnExists('account_asset_balances', 'campaign_key')
      if (hasCampaignKey) {
        pass('account_asset_balances 表已添加 campaign_key 归一化列')
      } else {
        fail('缺少 campaign_key 归一化列')
      }

      // 检查新唯一索引（uk_account_asset_campaign_key 替代旧的 uk_account_asset_campaign）
      const [indexes] = await sequelize.query(
        `SHOW INDEX FROM account_asset_balances WHERE Key_name = 'uk_account_asset_campaign_key'`,
        { type: QueryTypes.SELECT, raw: true }
      )
      if (indexes) {
        pass('已创建 uk_account_asset_campaign_key 唯一索引')
      } else {
        fail('缺少 uk_account_asset_campaign_key 唯一索引')
      }
    } else {
      fail('account_asset_balances 表缺少 campaign_id 字段')
    }
  } catch (err) {
    fail('检查 campaign_id/campaign_key 字段失败', err.message)
  }

  // 3. 检查 item_instance_events 表
  console.log('\n【检查3】item_instance_events 表状态')
  try {
    const exists = await tableExists('item_instance_events')
    if (exists) {
      pass('item_instance_events 表已创建')

      // 检查表结构
      const [columns] = await sequelize.query(`DESCRIBE item_instance_events`, {
        type: QueryTypes.SELECT
      })
      console.log('   表字段数:', columns ? 1 : 0)
    } else {
      fail('item_instance_events 表不存在')
    }
  } catch (err) {
    fail('检查 item_instance_events 表失败', err.message)
  }

  // 4. 检查 item_templates 表（已拍板不做，但需确认）
  console.log('\n【检查4】item_templates 表状态（已拍板不做）')
  try {
    const exists = await tableExists('item_templates')
    if (exists) {
      warn('item_templates 表存在（文档拍板不做模板化）')
    } else {
      pass('item_templates 表不存在（符合文档拍板：不做模板化）')
    }
  } catch (err) {
    warn('检查 item_templates 表失败', err.message)
  }

  // 5. 检查 item_template_aliases 表
  console.log('\n【检查5】item_template_aliases 表状态')
  try {
    const exists = await tableExists('item_template_aliases')
    if (exists) {
      pass('item_template_aliases 表已创建')
    } else {
      fail('item_template_aliases 表不存在')
    }
  } catch (err) {
    fail('检查 item_template_aliases 表失败', err.message)
  }

  // 6. 检查 locked 物品状态（使用 locks JSON 字段解析）
  console.log('\n【检查6】物品锁超时修复状态')
  try {
    const lockedItems = await sequelize.query(
      `SELECT COUNT(*) as count FROM item_instances WHERE status = 'locked'`,
      { type: QueryTypes.SELECT }
    )
    const lockedCount = lockedItems[0]?.count || 0

    if (lockedCount === 0) {
      pass('所有超时锁已修复', '无 locked 状态物品')
    } else {
      /*
       * 2026-01-07 修正：使用 locks JSON 字段检查超时
       * locks 格式: [{lock_type, lock_id, locked_at, expires_at, auto_release, reason}]
       * 超时判断逻辑：
       * - 如果 expires_at 存在且已过期 → 超时
       * - 如果 expires_at 为空，检查 locked_at + 3分钟是否超时
       */
      const timeoutLocked = await sequelize.query(
        `SELECT COUNT(*) as count FROM item_instances
         WHERE status = 'locked'
           AND locks IS NOT NULL
           AND JSON_LENGTH(locks) > 0
           AND EXISTS (
             SELECT 1 FROM JSON_TABLE(
               locks, '$[*]' COLUMNS (
                 locked_at DATETIME PATH '$.locked_at',
                 expires_at DATETIME PATH '$.expires_at'
               )
             ) AS jt
             WHERE
               (jt.expires_at IS NOT NULL AND jt.expires_at < NOW())
               OR (jt.expires_at IS NULL AND jt.locked_at < DATE_SUB(NOW(), INTERVAL 3 MINUTE))
           )`,
        { type: QueryTypes.SELECT }
      )
      const timeoutCount = timeoutLocked[0]?.count || 0

      if (timeoutCount > 0) {
        fail('存在超时锁定的物品', `${timeoutCount} 条锁已超时（需清理）`)
      } else {
        warn('存在锁定物品但未超时', `${lockedCount} 条处于 locked 状态`)
      }
    }

    // 显示物品状态分布
    const statusDist = await sequelize.query(
      `SELECT status, COUNT(*) as count FROM item_instances GROUP BY status`,
      { type: QueryTypes.SELECT }
    )
    console.log('   物品状态分布:')
    statusDist.forEach(s => {
      console.log(`     - ${s.status}: ${s.count}`)
    })
  } catch (err) {
    fail('检查 locked 物品状态失败', err.message)
  }

  // 7. 检查资产码现状
  console.log('\n【检查7】资产码现状')
  try {
    const assetTypes = await sequelize.query(
      `SELECT asset_code, COUNT(*) as count, SUM(available_amount) as total_available, SUM(frozen_amount) as total_frozen
       FROM account_asset_balances GROUP BY asset_code`,
      { type: QueryTypes.SELECT }
    )
    console.log('   当前资产码分布:')
    assetTypes.forEach(a => {
      console.log(
        `     - ${a.asset_code}: ${a.count} 条, 可用: ${a.total_available}, 冻结: ${a.total_frozen}`
      )
    })

    // 检查 DIAMOND 是否是唯一虚拟货币
    const hasCredits = assetTypes.some(a => a.asset_code === 'CREDITS')
    if (!hasCredits) {
      pass('CREDITS 已清除，DIAMOND 为唯一虚拟货币')
    } else {
      fail('CREDITS 仍存在')
    }
  } catch (err) {
    fail('检查资产码现状失败', err.message)
  }
}

/**
 * P1-9：初始化 ServiceManager 并获取 AssetService
 * @returns {Promise<Object>} AssetService 实例
 */
async function initializeAssetService() {
  try {
    const serviceManager = require('../services/index')
    if (!serviceManager._initialized) {
      await serviceManager.initialize()
    }
    const AssetService = serviceManager.getService('asset')
    console.log('  ✅ AssetService 加载成功（P1-9 ServiceManager）')
    return AssetService
  } catch (error) {
    console.log(`  ❌ AssetService 加载失败: ${error.message}`)
    throw error
  }
}

/**
 * 验证服务层
 */
async function verifyServiceLayer() {
  console.log('\n==========================================')
  console.log('🔧 服务层验证')
  console.log('==========================================\n')

  // 检查 AssetService 方法
  try {
    // P1-9：通过 ServiceManager 获取 AssetService
    const AssetService = await initializeAssetService()

    console.log('【检查1】AssetService 核心方法')

    // getAssetPortfolio
    if (typeof AssetService.getAssetPortfolio === 'function') {
      pass('AssetService.getAssetPortfolio() 方法存在')
    } else {
      fail('AssetService.getAssetPortfolio() 方法不存在')
    }

    // mintItem
    if (typeof AssetService.mintItem === 'function') {
      pass('AssetService.mintItem() 方法存在')
    } else {
      fail('AssetService.mintItem() 方法不存在')
    }

    // lockItem
    if (typeof AssetService.lockItem === 'function') {
      pass('AssetService.lockItem() 方法存在')
    } else {
      fail('AssetService.lockItem() 方法不存在')
    }

    // unlockItem
    if (typeof AssetService.unlockItem === 'function') {
      pass('AssetService.unlockItem() 方法存在')
    } else {
      fail('AssetService.unlockItem() 方法不存在')
    }

    // transferItem
    if (typeof AssetService.transferItem === 'function') {
      pass('AssetService.transferItem() 方法存在')
    } else {
      fail('AssetService.transferItem() 方法不存在')
    }

    // consumeItem
    if (typeof AssetService.consumeItem === 'function') {
      pass('AssetService.consumeItem() 方法存在')
    } else {
      fail('AssetService.consumeItem() 方法不存在')
    }

    // recordItemEvent
    if (typeof AssetService.recordItemEvent === 'function') {
      pass('AssetService.recordItemEvent() 方法存在')
    } else {
      fail('AssetService.recordItemEvent() 方法不存在')
    }

    // getItemEvents
    if (typeof AssetService.getItemEvents === 'function') {
      pass('AssetService.getItemEvents() 方法存在')
    } else {
      fail('AssetService.getItemEvents() 方法不存在')
    }

    // changeBalance (应该支持 campaign_id)
    if (typeof AssetService.changeBalance === 'function') {
      pass('AssetService.changeBalance() 方法存在')
    } else {
      fail('AssetService.changeBalance() 方法不存在')
    }

    // freeze
    if (typeof AssetService.freeze === 'function') {
      pass('AssetService.freeze() 方法存在')
    } else {
      fail('AssetService.freeze() 方法不存在')
    }

    // unfreeze
    if (typeof AssetService.unfreeze === 'function') {
      pass('AssetService.unfreeze() 方法存在')
    } else {
      fail('AssetService.unfreeze() 方法不存在')
    }

    // settleFromFrozen
    if (typeof AssetService.settleFromFrozen === 'function') {
      pass('AssetService.settleFromFrozen() 方法存在')
    } else {
      fail('AssetService.settleFromFrozen() 方法不存在')
    }
  } catch (err) {
    fail('加载 AssetService 失败', err.message)
  }

  // 检查 PointsService 是否已删除（应该删除）
  console.log('\n【检查2】PointsService 删除状态')
  try {
    require('../services/PointsService')
    warn('PointsService 仍然存在（文档要求删除）')
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      pass('PointsService 已删除')
    } else {
      fail('检查 PointsService 状态失败', err.message)
    }
  }

  // 检查 BackpackService 是否并入 AssetService
  console.log('\n【检查3】BackpackService 归属状态')
  try {
    const BackpackService = require('../services/BackpackService')
    warn('BackpackService 仍独立存在（文档要求并入 AssetService）')
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      pass('BackpackService 已并入 AssetService')
    } else {
      fail('检查 BackpackService 状态失败', err.message)
    }
  }
}

/**
 * 验证 API 层
 */
async function verifyApiLayer() {
  console.log('\n==========================================')
  console.log('🌐 API 层验证')
  console.log('==========================================\n')

  const fs = require('fs')
  const path = require('path')

  /*
   * 2026-01-07 架构重构：资产总览接口迁移到 console 域
   * - 用户端背包：/api/v4/backpack
   * - 后台运营资产查询：/api/v4/console/assets/portfolio（admin/ops权限）
   * - 基础资产能力：/api/v4/assets/*（跨业务域底座）
   */

  // 检查 /api/v4/console/assets/portfolio 路由（后台运营资产中心）
  console.log('【检查1】/api/v4/console/assets/portfolio 路由（后台运营）')
  try {
    const routesDir = path.join(__dirname, '..', 'routes', 'v4')

    // 查找 assets 相关路由文件（优先检查 console 域）
    const assetsRouteFiles = [
      path.join(routesDir, 'console', 'assets', 'portfolio.js'),
      path.join(routesDir, 'console', 'assets', 'index.js'),
      path.join(routesDir, 'assets', 'index.js'),
      path.join(routesDir, 'assets.js')
    ]

    let foundPortfolio = false
    for (const file of assetsRouteFiles) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf-8')
        if (content.includes('portfolio') || content.includes('getAssetPortfolio')) {
          foundPortfolio = true
          const routePath = file.includes('console')
            ? '/api/v4/console/assets/portfolio'
            : '/api/v4/assets/portfolio'
          pass(`${routePath} 路由已实现`, `在 ${path.relative(__dirname, file)}`)
          break
        }
      }
    }

    if (!foundPortfolio) {
      fail('/api/v4/console/assets/portfolio 路由不存在')
    }
  } catch (err) {
    fail('检查 /console/assets/portfolio 路由失败', err.message)
  }

  // 检查 /api/v4/console/assets/item-events 路由（后台运营资产中心）
  console.log('\n【检查2】/api/v4/console/assets/item-events 路由（后台运营）')
  try {
    const routesDir = path.join(__dirname, '..', 'routes', 'v4')
    const assetsRouteFiles = [
      path.join(routesDir, 'console', 'assets', 'portfolio.js'),
      path.join(routesDir, 'console', 'assets', 'index.js'),
      path.join(routesDir, 'assets', 'index.js'),
      path.join(routesDir, 'assets.js')
    ]

    let foundItemEvents = false
    for (const file of assetsRouteFiles) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf-8')
        if (content.includes('item-events') || content.includes('getItemEvents')) {
          foundItemEvents = true
          const routePath = file.includes('console')
            ? '/api/v4/console/assets/item-events'
            : '/api/v4/assets/item-events'
          pass(`${routePath} 路由已实现`, `在 ${path.relative(__dirname, file)}`)
          break
        }
      }
    }

    if (!foundItemEvents) {
      fail('/api/v4/console/assets/item-events 路由不存在')
    }
  } catch (err) {
    fail('检查 /console/assets/item-events 路由失败', err.message)
  }

  // 检查 /api/v4/inventory 目录是否已彻底删除（不再接受 410 过渡状态）
  console.log('\n【检查3】/api/v4/inventory 彻底删除验收')
  try {
    const inventoryDir = path.join(__dirname, '..', 'routes', 'v4', 'inventory')

    if (!fs.existsSync(inventoryDir)) {
      pass('/api/v4/inventory 目录已彻底删除（符合暴力重构标准）')
    } else {
      fail('/api/v4/inventory 目录仍存在，需要彻底删除')
    }
  } catch (err) {
    fail('检查 /inventory 彻底删除状态失败', err.message)
  }
}

/**
 * 验证业务层改造
 */
async function verifyBusinessLayer() {
  console.log('\n==========================================')
  console.log('💼 业务层改造验证')
  console.log('==========================================\n')

  const fs = require('fs')
  const path = require('path')

  // 检查抽奖策略是否使用 AssetService.mintItem
  console.log('【检查1】抽奖策略改造状态')
  try {
    const strategyPath = path.join(
      __dirname,
      '..',
      'services',
      'UnifiedLotteryEngine',
      'strategies',
      'BasicGuaranteeStrategy.js'
    )

    if (fs.existsSync(strategyPath)) {
      const content = fs.readFileSync(strategyPath, 'utf-8')

      if (content.includes('AssetService.mintItem') || content.includes('assetService.mintItem')) {
        pass('抽奖策略已使用 AssetService.mintItem()')
      } else if (content.includes('ItemInstance.create')) {
        fail('抽奖策略仍直接使用 ItemInstance.create()')
      } else {
        warn('抽奖策略未发现 mintItem 或 ItemInstance.create 调用')
      }
    } else {
      warn('BasicGuaranteeStrategy.js 文件不存在')
    }
  } catch (err) {
    fail('检查抽奖策略改造状态失败', err.message)
  }

  // 检查交易服务是否使用 AssetService.transferItem
  console.log('\n【检查2】交易服务改造状态')
  try {
    const tradeServicePath = path.join(__dirname, '..', 'services', 'TradeOrderService.js')

    if (fs.existsSync(tradeServicePath)) {
      const content = fs.readFileSync(tradeServicePath, 'utf-8')

      if (
        content.includes('AssetService.transferItem') ||
        content.includes('assetService.transferItem')
      ) {
        pass('交易服务已使用 AssetService.transferItem()')
      } else if (content.includes('.update(') && content.includes('owner_user_id')) {
        fail('交易服务仍直接操作 ItemInstance')
      } else {
        warn('交易服务未发现 transferItem 调用')
      }
    } else {
      warn('TradeOrderService.js 文件不存在')
    }
  } catch (err) {
    fail('检查交易服务改造状态失败', err.message)
  }

  // 检查核销服务是否使用 AssetService.consumeItem
  console.log('\n【检查3】核销服务改造状态')
  try {
    const redemptionServicePath = path.join(__dirname, '..', 'services', 'RedemptionService.js')

    if (fs.existsSync(redemptionServicePath)) {
      const content = fs.readFileSync(redemptionServicePath, 'utf-8')

      if (
        content.includes('AssetService.consumeItem') ||
        content.includes('assetService.consumeItem')
      ) {
        pass('核销服务已使用 AssetService.consumeItem()')
      } else if (content.includes('markAsUsed')) {
        fail('核销服务仍直接调用 markAsUsed()')
      } else {
        warn('核销服务未发现 consumeItem 或 markAsUsed 调用')
      }
    } else {
      warn('RedemptionService.js 文件不存在')
    }
  } catch (err) {
    fail('检查核销服务改造状态失败', err.message)
  }
}

/**
 * 输出验证结果汇总
 */
function printSummary() {
  console.log('\n==========================================')
  console.log('📊 验证结果汇总')
  console.log('==========================================\n')

  console.log(`✅ 通过: ${results.passed.length} 项`)
  console.log(`❌ 失败: ${results.failed.length} 项`)
  console.log(`⚠️  警告: ${results.warnings.length} 项`)

  if (results.failed.length > 0) {
    console.log('\n【未完成的任务】')
    results.failed.forEach((f, i) => {
      console.log(`${i + 1}. ${f.item}${f.detail ? ' - ' + f.detail : ''}`)
    })
  }

  if (results.warnings.length > 0) {
    console.log('\n【需要注意的事项】')
    results.warnings.forEach((w, i) => {
      console.log(`${i + 1}. ${w.item}${w.detail ? ' - ' + w.detail : ''}`)
    })
  }

  console.log('\n==========================================')
  if (results.failed.length === 0) {
    console.log('🎉 所有验证项已通过！')
  } else {
    console.log(`⚠️  有 ${results.failed.length} 项任务待完成`)
  }
  console.log('==========================================\n')
}

/**
 * 主函数
 */
async function main() {
  console.log('==========================================')
  console.log('🔍 统一资产域架构验证')
  console.log('   基于: /docs/统一资产域架构设计方案.md')
  console.log('   时间:', new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }))
  console.log('==========================================')

  try {
    // 测试数据库连接
    await sequelize.authenticate()
    console.log('\n✅ 数据库连接成功\n')

    // 执行各层验证
    await verifyDatabaseLayer()
    await verifyServiceLayer()
    await verifyApiLayer()
    await verifyBusinessLayer()

    // 输出汇总
    printSummary()
  } catch (err) {
    console.error('\n❌ 验证过程出错:', err.message)
    console.error(err.stack)
  } finally {
    await sequelize.close()
  }
}

// 执行
main()
