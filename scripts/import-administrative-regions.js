#!/usr/bin/env node

/**
 * 行政区划数据导入脚本 - 餐厅积分抽奖系统 V4.0
 *
 * @description 从 GitHub 项目导入标准化的省市区街道行政区划数据
 *
 * 数据来源：
 * - GitHub: modood/Administrative-divisions-of-China
 * - 标准：GB/T 2260 行政区划代码
 *
 * 支持的数据级别：
 * - 省级（level=1）：省、直辖市、自治区
 * - 市级（level=2）：地级市、直辖市辖区
 * - 区县级（level=3）：区、县、县级市
 * - 街道级（level=4）：街道、乡镇
 *
 * 使用方法：
 *   node scripts/import-administrative-regions.js
 *   node scripts/import-administrative-regions.js --levels=1,2,3  # 仅导入省市区
 *   node scripts/import-administrative-regions.js --levels=1,2,3,4  # 导入省市区街道（默认）
 *   node scripts/import-administrative-regions.js --dry-run  # 仅下载不导入
 *
 * @since 2026-01-12
 * @see docs/省市区级联选择功能设计方案.md
 */

'use strict'

require('dotenv').config()

const https = require('https')
const { sequelize } = require('../config/database')
const BeijingTimeHelper = require('../utils/timeHelper')

// GitHub 数据源配置
const GITHUB_BASE_URL =
  'https://raw.githubusercontent.com/modood/Administrative-divisions-of-China/master/dist'

// 数据文件映射
const DATA_FILES = {
  provinces: 'provinces.json', // 省级
  cities: 'cities.json', // 市级
  areas: 'areas.json', // 区县级
  streets: 'streets.json' // 街道级
}

// 拼音转换（简化版本，可使用专业库 pinyin）
const PINYIN_MAP = {
  北京: 'beijing',
  天津: 'tianjin',
  上海: 'shanghai',
  重庆: 'chongqing',
  河北: 'hebei',
  山西: 'shanxi',
  内蒙古: 'neimenggu',
  辽宁: 'liaoning',
  吉林: 'jilin',
  黑龙江: 'heilongjiang',
  江苏: 'jiangsu',
  浙江: 'zhejiang',
  安徽: 'anhui',
  福建: 'fujian',
  江西: 'jiangxi',
  山东: 'shandong',
  河南: 'henan',
  湖北: 'hubei',
  湖南: 'hunan',
  广东: 'guangdong',
  广西: 'guangxi',
  海南: 'hainan',
  四川: 'sichuan',
  贵州: 'guizhou',
  云南: 'yunnan',
  西藏: 'xizang',
  陕西: 'shaanxi',
  甘肃: 'gansu',
  青海: 'qinghai',
  宁夏: 'ningxia',
  新疆: 'xinjiang',
  香港: 'hongkong',
  澳门: 'aomen',
  台湾: 'taiwan'
}

// 省份简称映射
const SHORT_NAME_MAP = {
  北京市: '京',
  天津市: '津',
  上海市: '沪',
  重庆市: '渝',
  河北省: '冀',
  山西省: '晋',
  内蒙古自治区: '蒙',
  辽宁省: '辽',
  吉林省: '吉',
  黑龙江省: '黑',
  江苏省: '苏',
  浙江省: '浙',
  安徽省: '皖',
  福建省: '闽',
  江西省: '赣',
  山东省: '鲁',
  河南省: '豫',
  湖北省: '鄂',
  湖南省: '湘',
  广东省: '粤',
  广西壮族自治区: '桂',
  海南省: '琼',
  四川省: '川',
  贵州省: '黔',
  云南省: '滇',
  西藏自治区: '藏',
  陕西省: '陕',
  甘肃省: '甘',
  青海省: '青',
  宁夏回族自治区: '宁',
  新疆维吾尔自治区: '新',
  香港特别行政区: '港',
  澳门特别行政区: '澳',
  台湾省: '台'
}

/**
 * 从 URL 下载 JSON 数据
 * @param {string} url - 下载地址
 * @returns {Promise<Object>} JSON 数据
 */
function downloadJSON(url) {
  return new Promise((resolve, reject) => {
    console.log(`📥 下载: ${url}`)

    https
      .get(url, res => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }

        let data = ''
        res.on('data', chunk => {
          data += chunk
        })
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch (e) {
            reject(new Error(`JSON 解析失败: ${e.message}`))
          }
        })
      })
      .on('error', reject)
  })
}

/**
 * 生成拼音（简化版本）
 * @param {string} name - 区划名称
 * @returns {string} 拼音
 */
function generatePinyin(name) {
  // 尝试从映射表匹配
  for (const [key, pinyin] of Object.entries(PINYIN_MAP)) {
    if (name.includes(key)) {
      return pinyin
    }
  }
  // 默认返回空（后续可使用专业拼音库）
  return null
}

/**
 * 获取省份简称
 * @param {string} name - 省份名称
 * @returns {string|null} 简称
 */
function getShortName(name) {
  return SHORT_NAME_MAP[name] || null
}

/**
 * 批量插入数据
 * @param {Array} records - 记录数组
 * @param {number} batchSize - 批量大小
 * @returns {Promise<number>} 插入的记录数
 */
async function batchInsert(records, batchSize = 1000) {
  if (records.length === 0) return 0

  let inserted = 0
  // 生成 MySQL 兼容的时间格式 YYYY-MM-DD HH:mm:ss
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize)

    // 构建 VALUES 部分
    const values = batch
      .map(r => {
        const parentCode = r.parent_code ? `'${r.parent_code}'` : 'NULL'
        const shortName = r.short_name ? `'${r.short_name}'` : 'NULL'
        const pinyin = r.pinyin ? `'${r.pinyin}'` : 'NULL'

        return `('${r.region_code}', ${parentCode}, '${r.region_name}', ${r.level}, ${shortName}, ${pinyin}, 'active', 0, '${now}', '${now}')`
      })
      .join(',\n')

    const sql = `
      INSERT INTO administrative_regions 
        (region_code, parent_code, region_name, level, short_name, pinyin, status, sort_order, created_at, updated_at)
      VALUES ${values}
      ON DUPLICATE KEY UPDATE 
        region_name = VALUES(region_name),
        parent_code = VALUES(parent_code),
        updated_at = VALUES(updated_at)
    `

    // eslint-disable-next-line no-await-in-loop
    await sequelize.query(sql)
    inserted += batch.length

    console.log(`   ✅ 已导入 ${inserted}/${records.length} 条记录`)
  }

  return inserted
}

/**
 * 导入省级数据
 * @returns {Promise<number>} 导入的记录数
 */
async function importProvinces() {
  console.log('\n📦 导入省级数据...')

  const url = `${GITHUB_BASE_URL}/${DATA_FILES.provinces}`
  const data = await downloadJSON(url)

  const records = data.map((item, index) => ({
    region_code: item.code,
    parent_code: null,
    region_name: item.name,
    level: 1,
    short_name: getShortName(item.name),
    pinyin: generatePinyin(item.name),
    sort_order: index
  }))

  return batchInsert(records)
}

/**
 * 导入市级数据
 * @returns {Promise<number>} 导入的记录数
 */
async function importCities() {
  console.log('\n📦 导入市级数据...')

  const url = `${GITHUB_BASE_URL}/${DATA_FILES.cities}`
  const data = await downloadJSON(url)

  const records = data.map((item, index) => ({
    region_code: item.code,
    parent_code: item.provinceCode,
    region_name: item.name,
    level: 2,
    short_name: null,
    pinyin: generatePinyin(item.name),
    sort_order: index
  }))

  return batchInsert(records)
}

/**
 * 导入区县级数据
 * @returns {Promise<number>} 导入的记录数
 */
async function importAreas() {
  console.log('\n📦 导入区县级数据...')

  const url = `${GITHUB_BASE_URL}/${DATA_FILES.areas}`
  const data = await downloadJSON(url)

  const records = data.map((item, index) => ({
    region_code: item.code,
    parent_code: item.cityCode,
    region_name: item.name,
    level: 3,
    short_name: null,
    pinyin: generatePinyin(item.name),
    sort_order: index
  }))

  return batchInsert(records)
}

/**
 * 导入街道级数据
 * @returns {Promise<number>} 导入的记录数
 */
async function importStreets() {
  console.log('\n📦 导入街道级数据...')

  const url = `${GITHUB_BASE_URL}/${DATA_FILES.streets}`
  const data = await downloadJSON(url)

  const records = data.map((item, index) => ({
    region_code: item.code,
    parent_code: item.areaCode,
    region_name: item.name,
    level: 4,
    short_name: null,
    pinyin: null, // 街道数据量大，不生成拼音
    sort_order: index
  }))

  return batchInsert(records, 5000) // 街道数据量大，增加批量大小
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 行政区划数据导入脚本启动')
  console.log(`📅 时间: ${BeijingTimeHelper.apiTimestamp()}`)

  // 解析命令行参数
  const args = process.argv.slice(2)
  const levelsArg = args.find(arg => arg.startsWith('--levels='))
  const dryRun = args.includes('--dry-run')

  let levels = [1, 2, 3, 4] // 默认导入所有级别
  if (levelsArg) {
    levels = levelsArg.replace('--levels=', '').split(',').map(Number)
  }

  console.log(`📋 导入级别: ${levels.join(', ')} (1=省, 2=市, 3=区县, 4=街道)`)

  if (dryRun) {
    console.log('⚠️ 干跑模式：仅下载数据，不导入数据库')
  }

  try {
    // 测试数据库连接
    console.log('\n🔌 测试数据库连接...')
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    const stats = {
      provinces: 0,
      cities: 0,
      areas: 0,
      streets: 0,
      total: 0
    }

    // 根据级别导入数据
    if (levels.includes(1)) {
      if (dryRun) {
        const url = `${GITHUB_BASE_URL}/${DATA_FILES.provinces}`
        const data = await downloadJSON(url)
        console.log(`📊 省级数据量: ${data.length}`)
        stats.provinces = data.length
      } else {
        stats.provinces = await importProvinces()
      }
    }

    if (levels.includes(2)) {
      if (dryRun) {
        const url = `${GITHUB_BASE_URL}/${DATA_FILES.cities}`
        const data = await downloadJSON(url)
        console.log(`📊 市级数据量: ${data.length}`)
        stats.cities = data.length
      } else {
        stats.cities = await importCities()
      }
    }

    if (levels.includes(3)) {
      if (dryRun) {
        const url = `${GITHUB_BASE_URL}/${DATA_FILES.areas}`
        const data = await downloadJSON(url)
        console.log(`📊 区县级数据量: ${data.length}`)
        stats.areas = data.length
      } else {
        stats.areas = await importAreas()
      }
    }

    if (levels.includes(4)) {
      if (dryRun) {
        const url = `${GITHUB_BASE_URL}/${DATA_FILES.streets}`
        const data = await downloadJSON(url)
        console.log(`📊 街道级数据量: ${data.length}`)
        stats.streets = data.length
      } else {
        stats.streets = await importStreets()
      }
    }

    stats.total = stats.provinces + stats.cities + stats.areas + stats.streets

    // 输出统计结果
    console.log('\n📊 导入统计:')
    console.log(`   省级: ${stats.provinces} 条`)
    console.log(`   市级: ${stats.cities} 条`)
    console.log(`   区县级: ${stats.areas} 条`)
    console.log(`   街道级: ${stats.streets} 条`)
    console.log(`   ───────────────`)
    console.log(`   总计: ${stats.total} 条`)

    if (!dryRun) {
      // 验证导入结果
      console.log('\n🔍 验证导入结果...')
      const [countResult] = await sequelize.query(
        'SELECT level, COUNT(*) as count FROM administrative_regions GROUP BY level ORDER BY level'
      )

      console.log('📋 数据库中的区划统计:')
      countResult.forEach(row => {
        const levelName = { 1: '省级', 2: '市级', 3: '区县级', 4: '街道级' }[row.level] || '未知'
        console.log(`   ${levelName} (level=${row.level}): ${row.count} 条`)
      })
    }

    console.log('\n✅ 行政区划数据导入完成!')
  } catch (error) {
    console.error('\n❌ 导入失败:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

// 运行主函数
main()
