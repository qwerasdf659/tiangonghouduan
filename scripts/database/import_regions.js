#!/usr/bin/env node
/**
 * 行政区划数据导入脚本（GB/T 2260 六位标准）
 *
 * @description 从开源数据集导入省市区街道四级行政区划数据
 *              转换为 GB/T 2260 六位标准：省=6位、市=6位、区=6位、街道=9位
 *
 * 数据来源：
 * - GitHub: https://github.com/modood/Administrative-divisions-of-China
 * - 文件：pcas-code.json（省市区街道四级数据）
 *
 * Code 转换规则：
 * - 省级：2位 → 6位（补充 0000，如 11 → 110000）
 * - 市级：4位 → 6位（补充 00，如 1101 → 110100）
 * - 区县级：6位 → 6位（不变，如 110108）
 * - 街道级：9位 → 9位（不变，如 110108001）
 *
 * 执行方式：
 *   node scripts/database/import_regions.js
 *
 * @since 2026-01-12
 * @see docs/省市区级联选择功能设计方案.md
 */

'use strict'

require('dotenv').config()

const fs = require('fs')
const path = require('path')
const { sequelize, AdministrativeRegion } = require('../../models')

/**
 * 省级简称映射表（用于 short_name 字段）
 */
const PROVINCE_SHORT_NAMES = {
  北京市: '京',
  天津市: '津',
  河北省: '冀',
  山西省: '晋',
  内蒙古自治区: '蒙',
  辽宁省: '辽',
  吉林省: '吉',
  黑龙江省: '黑',
  上海市: '沪',
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
  重庆市: '渝',
  四川省: '川',
  贵州省: '黔',
  云南省: '滇',
  西藏自治区: '藏',
  陕西省: '陕',
  甘肃省: '甘',
  青海省: '青',
  宁夏回族自治区: '宁',
  新疆维吾尔自治区: '新',
  台湾省: '台',
  香港特别行政区: '港',
  澳门特别行政区: '澳'
}

/**
 * 将原始 code 转换为 GB/T 2260 六位标准
 *
 * @param {string} originalCode - 原始代码（2/4/6/9位）
 * @param {number} level - 层级（1=省, 2=市, 3=区县, 4=街道）
 * @returns {string} 转换后的代码（6/6/6/9位）
 */
function convertToGBCode(originalCode, level) {
  switch (level) {
    case 1:
      // 省级：2位 → 6位（补充 0000）
      return originalCode.padEnd(6, '0')
    case 2:
      // 市级：4位 → 6位（补充 00）
      return originalCode.padEnd(6, '0')
    case 3:
      // 区县级：6位 → 6位（不变）
      return originalCode
    case 4:
      // 街道级：9位 → 9位（不变）
      return originalCode
    default:
      return originalCode
  }
}

/**
 * 递归解析层级数据
 *
 * @param {Array} data - 层级数据数组
 * @param {number} level - 当前层级
 * @param {string|null} parentCode - 父级代码（已转换为 GB 标准）
 * @param {number} sortOrderBase - 排序基数
 * @returns {Array} 扁平化的区划数据数组
 */
function parseHierarchy(data, level, parentCode, sortOrderBase = 0) {
  const regions = []

  data.forEach((item, index) => {
    const originalCode = item.code
    const gbCode = convertToGBCode(originalCode, level)
    const sortOrder = sortOrderBase + index + 1

    // 创建当前区划记录
    const region = {
      region_code: gbCode,
      parent_code: parentCode,
      region_name: item.name,
      level,
      short_name: level === 1 ? PROVINCE_SHORT_NAMES[item.name] || null : null,
      pinyin: null, // 拼音字段暂不填充，后续可补齐
      longitude: null,
      latitude: null,
      status: 'active',
      sort_order: sortOrder
    }

    regions.push(region)

    // 递归处理子级
    if (item.children && item.children.length > 0) {
      const childRegions = parseHierarchy(item.children, level + 1, gbCode, 0)
      regions.push(...childRegions)
    }
  })

  return regions
}

/**
 * 执行数据导入
 */
async function importRegions() {
  console.log('🚀 开始导入行政区划数据（GB/T 2260 六位标准）...')
  console.log('━'.repeat(60))

  try {
    // 1. 读取数据文件
    const dataPath = path.join(__dirname, '../../data/pcas-code.json')

    if (!fs.existsSync(dataPath)) {
      console.log('⚠️ 数据文件不存在，正在下载...')
      const { execSync } = require('child_process')
      execSync(
        `mkdir -p "${path.dirname(dataPath)}" && curl -L -o "${dataPath}" "https://raw.githubusercontent.com/modood/Administrative-divisions-of-China/master/dist/pcas-code.json"`,
        { stdio: 'inherit' }
      )
    }

    console.log('📂 读取数据文件:', dataPath)
    const rawData = fs.readFileSync(dataPath, 'utf8')
    const sourceData = JSON.parse(rawData)

    console.log(`📊 原始数据省级数量: ${sourceData.length}`)

    // 2. 解析并转换数据
    console.log('🔄 转换为 GB/T 2260 六位标准...')
    const regions = parseHierarchy(sourceData, 1, null, 0)

    // 统计各层级数量
    const levelStats = {
      1: regions.filter(r => r.level === 1).length,
      2: regions.filter(r => r.level === 2).length,
      3: regions.filter(r => r.level === 3).length,
      4: regions.filter(r => r.level === 4).length
    }

    console.log('📊 转换后数据统计:')
    console.log(`   - 省级 (level=1): ${levelStats[1]} 条`)
    console.log(`   - 市级 (level=2): ${levelStats[2]} 条`)
    console.log(`   - 区县级 (level=3): ${levelStats[3]} 条`)
    console.log(`   - 街道级 (level=4): ${levelStats[4]} 条`)
    console.log(`   - 总计: ${regions.length} 条`)

    // 3. 验证转换结果（抽样检查）
    console.log('━'.repeat(60))
    console.log('🔍 抽样检查转换结果:')

    // 找北京市的数据
    const beijing = regions.find(r => r.region_name === '北京市' && r.level === 1)
    const beijingCity = regions.find(r => r.parent_code === beijing?.region_code && r.level === 2)
    const haidian = regions.find(r => r.region_name === '海淀区' && r.level === 3)
    const wanshoulu = regions.find(r => r.region_name === '万寿路街道' && r.level === 4)

    console.log('   北京市(省级):', beijing?.region_code, '| parent:', beijing?.parent_code)
    console.log('   市辖区(市级):', beijingCity?.region_code, '| parent:', beijingCity?.parent_code)
    console.log('   海淀区(区县):', haidian?.region_code, '| parent:', haidian?.parent_code)
    console.log('   万寿路街道:', wanshoulu?.region_code, '| parent:', wanshoulu?.parent_code)

    // 4. 连接数据库
    console.log('━'.repeat(60))
    console.log('🔌 连接数据库...')
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 5. 清空旧数据并导入
    console.log('🗑️ 清空旧数据...')
    await AdministrativeRegion.destroy({ where: {}, truncate: true })
    console.log('✅ 旧数据已清空')

    // 6. 批量插入（分批处理，避免内存溢出）
    console.log('📥 开始批量插入...')
    const batchSize = 1000
    let insertedCount = 0

    for (let i = 0; i < regions.length; i += batchSize) {
      const batch = regions.slice(i, i + batchSize)
      // eslint-disable-next-line no-await-in-loop
      await AdministrativeRegion.bulkCreate(batch, {
        ignoreDuplicates: true
      })
      insertedCount += batch.length
      process.stdout.write(`\r   已插入: ${insertedCount}/${regions.length} 条`)
    }

    console.log('\n✅ 数据导入完成')

    // 7. 验证导入结果
    console.log('━'.repeat(60))
    console.log('🔍 验证导入结果:')

    const finalStats = await AdministrativeRegion.findAll({
      attributes: ['level', [sequelize.fn('COUNT', sequelize.col('region_code')), 'count']],
      group: ['level'],
      raw: true
    })

    console.log('   数据库中各层级数量:')
    finalStats.forEach(stat => {
      const levelName = { 1: '省级', 2: '市级', 3: '区县级', 4: '街道级' }[stat.level]
      console.log(`   - ${levelName} (level=${stat.level}): ${stat.count} 条`)
    })

    // 验证北京数据
    const verifyBeijing = await AdministrativeRegion.findOne({
      where: { region_name: '北京市', level: 1 },
      raw: true
    })

    const verifyHaidian = await AdministrativeRegion.findOne({
      where: { region_name: '海淀区', level: 3 },
      raw: true
    })

    console.log('━'.repeat(60))
    console.log('✅ 验证样本:')
    console.log('   北京市:', verifyBeijing?.region_code, '(期望 110000)')
    console.log('   海淀区:', verifyHaidian?.region_code, '(期望 110108)')
    console.log('   海淀区父级:', verifyHaidian?.parent_code, '(期望 110100)')

    console.log('━'.repeat(60))
    console.log('🎉 行政区划数据导入成功！')
    console.log(`   共导入 ${insertedCount} 条记录`)
    console.log('   数据标准: GB/T 2260 六位标准 (6/6/6/9)')
  } catch (error) {
    console.error('❌ 导入失败:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

// 执行导入
if (require.main === module) {
  importRegions()
}

module.exports = { importRegions, convertToGBCode, parseHierarchy }
