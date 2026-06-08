#!/usr/bin/env node
/**
 * 合规红线月度自查脚本（C2C 下线后 B2C 单向道具商城合规体系）
 * 天工商户营销平台 V4.0
 * 创建时间：2026年06月05日 北京时间（合规整改执行清单 §7.3）
 *
 * 功能说明（连 .env 真实库 restaurant_points_dev，逐条断言合规红线）：
 * - 红线1：所有材料资产 is_tradable=0（星石+碎片+源晶不可用户间流通）
 * - 红线2：无 from_asset_code='star_stone' 的反向转换规则（严禁 星石→碎片/源晶）
 * - 红线3：竞价币白名单 is_biddable=1 仅 star_stone
 * - 红线4：C2C 总开关 c2c_marketplace_enabled 关闭
 * - 红线5：C2C 表已删除（market_listings/trade_orders/auction_listings/auction_bids/market_price_snapshots）
 * - 红线6：储值礼品卡 12/13/14 已下线（is_enabled=0）
 * - 红线7：零法币 —— exchange/广告计费列无人民币/CNY 字段（人民币↔星石零兑换）
 * - 红线8：抽奖奖池无实物（lottery_campaign_prizes 仅 material/points）
 *
 * 使用方式：
 * - 本地执行：node scripts/validation/check_compliance_redlines.js
 * - npm 脚本：npm run check:compliance
 * - 建议固化为每月定时自查（cron / PM2 定时任务）
 *
 * 退出码：全部通过 0；任一红线失守 1（便于 CI/定时任务告警）
 */

'use strict'

require('dotenv').config()
const { Sequelize } = require('sequelize')

/** 北京时间格式化 */
function beijingNow() {
  return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
}

/**
 * 执行合规红线自查
 * @returns {Promise<number>} 退出码（0=全部通过，1=有红线失守）
 */
async function run() {
  const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      dialect: 'mysql',
      logging: false
    }
  )

  const results = []
  /**
   * 记录一条断言结果
   * @param {string} name - 红线名称
   * @param {boolean} pass - 是否通过
   * @param {string} detail - 实测明细
   */
  const assert = (name, pass, detail) => results.push({ name, pass, detail })

  try {
    await sequelize.authenticate()
    const dbName = process.env.DB_NAME

    // 红线1：材料资产全部不可交易
    const [tradable] = await sequelize.query(
      "SELECT asset_code FROM material_asset_types WHERE is_tradable = 1"
    )
    assert(
      '红线1 资产去交易化（is_tradable=0）',
      tradable.length === 0,
      tradable.length === 0 ? '全部材料资产 is_tradable=0' : `仍可交易: ${tradable.map(r => r.asset_code).join(',')}`
    )

    // 红线2：无 star_stone 反向转换规则
    const [reverse] = await sequelize.query(
      "SELECT COUNT(*) c FROM asset_conversion_rules WHERE from_asset_code = 'star_stone'"
    )
    assert(
      '红线2 无星石反向转换规则',
      reverse[0].c === 0,
      `from_asset_code='star_stone' 规则数 = ${reverse[0].c}`
    )

    // 红线3：竞价币仅 star_stone
    const [biddable] = await sequelize.query(
      "SELECT asset_code FROM material_asset_types WHERE is_biddable = 1"
    )
    const biddableOk = biddable.length === 1 && biddable[0].asset_code === 'star_stone'
    assert(
      '红线3 竞价币白名单仅 star_stone',
      biddableOk,
      `is_biddable=1: ${biddable.map(r => r.asset_code).join(',') || '(空)'}`
    )

    // 红线4：C2C 总开关关闭
    const [flag] = await sequelize.query(
      "SELECT is_enabled FROM feature_flags WHERE flag_key = 'c2c_marketplace_enabled'"
    )
    const flagOff = flag.length > 0 && flag[0].is_enabled === 0
    assert(
      '红线4 C2C 总开关关闭',
      flagOff,
      flag.length === 0 ? 'flag 不存在' : `c2c_marketplace_enabled = ${flag[0].is_enabled}`
    )

    // 红线5：C2C 表已删除
    const c2cTables = [
      'market_listings',
      'trade_orders',
      'auction_listings',
      'auction_bids',
      'market_price_snapshots'
    ]
    const [existing] = await sequelize.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = '${dbName}' AND table_name IN (${c2cTables.map(t => `'${t}'`).join(',')})`
    )
    assert(
      '红线5 C2C 表已删除',
      existing.length === 0,
      existing.length === 0 ? '5 张 C2C 表均已删除' : `仍存在: ${existing.map(r => r.TABLE_NAME || r.table_name).join(',')}`
    )

    // 红线6：储值礼品卡 12/13/14 已下线
    const [cards] = await sequelize.query(
      "SELECT item_template_id FROM item_templates WHERE item_template_id IN (12,13,14) AND is_enabled = 1"
    )
    assert(
      '红线6 储值礼品卡 12/13/14 已下线',
      cards.length === 0,
      cards.length === 0 ? '三张礼品卡 is_enabled=0' : `仍启用: ${cards.map(r => r.item_template_id).join(',')}`
    )

    // 红线7：零法币（exchange_channel_prices 无人民币计价；ad 计费列无 cny/rmb）
    const [fiatChannel] = await sequelize.query(
      "SELECT COUNT(*) c FROM exchange_channel_prices WHERE LOWER(cost_asset_code) IN ('cny','rmb','money')"
    )
    const [fiatCols] = await sequelize.query(
      `SELECT COLUMN_NAME FROM information_schema.columns
       WHERE table_schema = '${dbName}'
         AND table_name IN ('ad_slots','ad_campaigns','ad_billing_records')
         AND (LOWER(COLUMN_NAME) LIKE '%cny%' OR LOWER(COLUMN_NAME) LIKE '%rmb%' OR LOWER(COLUMN_NAME) LIKE '%_fen%')`
    )
    const fiatOk = fiatChannel[0].c === 0 && fiatCols.length === 0
    assert(
      '红线7 零法币（人民币↔星石零兑换）',
      fiatOk,
      `exchange 人民币计价 ${fiatChannel[0].c} 条；广告人民币列 ${fiatCols.length} 个`
    )

    // 红线8：抽奖奖池无实物
    const [physicalPrize] = await sequelize.query(
      `SELECT COUNT(*) c FROM lottery_campaign_prizes lcp
       JOIN prize_definitions pd ON lcp.prize_definition_id = pd.prize_definition_id
       WHERE pd.prize_type NOT IN ('material','points')`
    )
    assert(
      '红线8 抽奖奖池无实物',
      physicalPrize[0].c === 0,
      `非 material/points 奖品数 = ${physicalPrize[0].c}`
    )

    await sequelize.close()
  } catch (error) {
    console.error(`\n❌ 自查执行异常: ${error.message}`)
    try {
      await sequelize.close()
    } catch {
      /* ignore close error */
    }
    return 1
  }

  // 输出报告（纯文本，便于定时任务日志）
  console.log('='.repeat(64))
  console.log(`  合规红线月度自查报告  ${beijingNow()}`)
  console.log(`  真实库: ${process.env.DB_NAME} @ ${process.env.DB_HOST}:${process.env.DB_PORT}`)
  console.log('='.repeat(64))
  let failCount = 0
  for (const r of results) {
    const mark = r.pass ? '✅ 通过' : '❌ 失守'
    if (!r.pass) failCount++
    console.log(`${mark}  ${r.name}`)
    console.log(`        └─ ${r.detail}`)
  }
  console.log('-'.repeat(64))
  if (failCount === 0) {
    console.log(`✅ 全部 ${results.length} 条合规红线通过`)
    return 0
  }
  console.log(`❌ ${failCount}/${results.length} 条合规红线失守，请立即排查`)
  return 1
}

run().then(code => process.exit(code))
