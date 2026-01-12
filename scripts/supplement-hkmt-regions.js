#!/usr/bin/env node

/**
 * 港澳台行政区划数据补充脚本 - 餐厅积分抽奖系统 V4.0
 *
 * @description 补充 GitHub 数据源缺失的港澳台行政区划数据
 *
 * 背景说明：
 * - modood/Administrative-divisions-of-China 项目仅包含大陆31个省级行政区
 * - 根据设计文档要求，需要包含 34 个省级行政区（含港澳台）
 * - 本脚本补充香港、澳门、台湾的基础行政区划数据
 *
 * GB/T 2260 标准代码：
 * - 台湾省: 71（简码）/ 710000（完整码）
 * - 香港特别行政区: 81（简码）/ 810000（完整码）
 * - 澳门特别行政区: 82（简码）/ 820000（完整码）
 *
 * 使用方法：
 *   node scripts/supplement-hkmt-regions.js
 *   node scripts/supplement-hkmt-regions.js --check  # 仅检查，不导入
 *
 * @since 2026-01-12
 * @see docs/省市区级联选择功能设计方案.md
 */

'use strict'

require('dotenv').config()

const { sequelize } = require('../config/database')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 港澳台行政区划数据
 *
 * 数据来源：
 * - 国家统计局行政区划代码
 * - GB/T 2260-2007 中华人民共和国行政区划代码
 *
 * 注意：
 * - 港澳台数据在大陆系统中仅展示到省/特别行政区级别
 * - 如需详细的市/区/街道数据，需另行补充
 */
const HKMT_DATA = {
  // 台湾省 - 代码 71（按GB/T 2260简码标准）
  taiwan: {
    province: {
      region_code: '71',
      parent_code: null,
      region_name: '台湾省',
      level: 1,
      short_name: '台',
      pinyin: 'taiwan'
    },
    // 台湾主要城市（市级）
    cities: [
      { region_code: '7101', parent_code: '71', region_name: '台北市', level: 2, pinyin: 'taibei' },
      {
        region_code: '7102',
        parent_code: '71',
        region_name: '高雄市',
        level: 2,
        pinyin: 'gaoxiong'
      },
      {
        region_code: '7103',
        parent_code: '71',
        region_name: '台中市',
        level: 2,
        pinyin: 'taizhong'
      },
      { region_code: '7104', parent_code: '71', region_name: '台南市', level: 2, pinyin: 'tainan' },
      { region_code: '7105', parent_code: '71', region_name: '新北市', level: 2, pinyin: 'xinbei' },
      { region_code: '7106', parent_code: '71', region_name: '桃园市', level: 2, pinyin: 'taoyuan' }
    ]
  },

  // 香港特别行政区 - 代码 81
  hongkong: {
    province: {
      region_code: '81',
      parent_code: null,
      region_name: '香港特别行政区',
      level: 1,
      short_name: '港',
      pinyin: 'hongkong'
    },
    // 香港行政区划（区级）
    cities: [
      {
        region_code: '8101',
        parent_code: '81',
        region_name: '香港岛',
        level: 2,
        pinyin: 'hongkongdao'
      },
      { region_code: '8102', parent_code: '81', region_name: '九龙', level: 2, pinyin: 'jiulong' },
      { region_code: '8103', parent_code: '81', region_name: '新界', level: 2, pinyin: 'xinjie' }
    ],
    // 香港区级数据（区县级）
    districts: [
      // 香港岛
      {
        region_code: '810101',
        parent_code: '8101',
        region_name: '中西区',
        level: 3,
        pinyin: 'zhongxiqu'
      },
      {
        region_code: '810102',
        parent_code: '8101',
        region_name: '湾仔区',
        level: 3,
        pinyin: 'wanzaiqu'
      },
      {
        region_code: '810103',
        parent_code: '8101',
        region_name: '东区',
        level: 3,
        pinyin: 'dongqu'
      },
      {
        region_code: '810104',
        parent_code: '8101',
        region_name: '南区',
        level: 3,
        pinyin: 'nanqu'
      },
      // 九龙
      {
        region_code: '810201',
        parent_code: '8102',
        region_name: '油尖旺区',
        level: 3,
        pinyin: 'youjianwangqu'
      },
      {
        region_code: '810202',
        parent_code: '8102',
        region_name: '深水埗区',
        level: 3,
        pinyin: 'shenshuibuqu'
      },
      {
        region_code: '810203',
        parent_code: '8102',
        region_name: '九龙城区',
        level: 3,
        pinyin: 'jiulongchengqu'
      },
      {
        region_code: '810204',
        parent_code: '8102',
        region_name: '黄大仙区',
        level: 3,
        pinyin: 'huangdaxianqu'
      },
      {
        region_code: '810205',
        parent_code: '8102',
        region_name: '观塘区',
        level: 3,
        pinyin: 'guantangqu'
      },
      // 新界
      {
        region_code: '810301',
        parent_code: '8103',
        region_name: '葵青区',
        level: 3,
        pinyin: 'kuiqingqu'
      },
      {
        region_code: '810302',
        parent_code: '8103',
        region_name: '荃湾区',
        level: 3,
        pinyin: 'quanwanqu'
      },
      {
        region_code: '810303',
        parent_code: '8103',
        region_name: '屯门区',
        level: 3,
        pinyin: 'tunmenqu'
      },
      {
        region_code: '810304',
        parent_code: '8103',
        region_name: '元朗区',
        level: 3,
        pinyin: 'yuanlangqu'
      },
      {
        region_code: '810305',
        parent_code: '8103',
        region_name: '北区',
        level: 3,
        pinyin: 'beiqu'
      },
      {
        region_code: '810306',
        parent_code: '8103',
        region_name: '大埔区',
        level: 3,
        pinyin: 'dabuqu'
      },
      {
        region_code: '810307',
        parent_code: '8103',
        region_name: '沙田区',
        level: 3,
        pinyin: 'shatianqu'
      },
      {
        region_code: '810308',
        parent_code: '8103',
        region_name: '西贡区',
        level: 3,
        pinyin: 'xigongqu'
      },
      {
        region_code: '810309',
        parent_code: '8103',
        region_name: '离岛区',
        level: 3,
        pinyin: 'lidaoqu'
      }
    ]
  },

  // 澳门特别行政区 - 代码 82
  macau: {
    province: {
      region_code: '82',
      parent_code: null,
      region_name: '澳门特别行政区',
      level: 1,
      short_name: '澳',
      pinyin: 'aomen'
    },
    // 澳门行政区划（市级 - 堂区）
    cities: [
      {
        region_code: '8201',
        parent_code: '82',
        region_name: '澳门半岛',
        level: 2,
        pinyin: 'aomenbandao'
      },
      { region_code: '8202', parent_code: '82', region_name: '离岛', level: 2, pinyin: 'lidao' }
    ],
    // 澳门堂区（区县级）
    districts: [
      // 澳门半岛
      {
        region_code: '820101',
        parent_code: '8201',
        region_name: '花地玛堂区',
        level: 3,
        pinyin: 'huadimatangqu'
      },
      {
        region_code: '820102',
        parent_code: '8201',
        region_name: '花王堂区',
        level: 3,
        pinyin: 'huawangtangqu'
      },
      {
        region_code: '820103',
        parent_code: '8201',
        region_name: '望德堂区',
        level: 3,
        pinyin: 'wangdetangqu'
      },
      {
        region_code: '820104',
        parent_code: '8201',
        region_name: '大堂区',
        level: 3,
        pinyin: 'datangqu'
      },
      {
        region_code: '820105',
        parent_code: '8201',
        region_name: '风顺堂区',
        level: 3,
        pinyin: 'fengshuntangqu'
      },
      // 离岛
      {
        region_code: '820201',
        parent_code: '8202',
        region_name: '嘉模堂区',
        level: 3,
        pinyin: 'jiamotangqu'
      },
      {
        region_code: '820202',
        parent_code: '8202',
        region_name: '路凼填海区',
        level: 3,
        pinyin: 'ludangtianhaqu'
      },
      {
        region_code: '820203',
        parent_code: '8202',
        region_name: '圣方济各堂区',
        level: 3,
        pinyin: 'shengfangjigetnagqu'
      }
    ]
  }
}

/**
 * 检查港澳台数据是否已存在
 * @returns {Promise<Object>} 检查结果 { taiwan: boolean, hongkong: boolean, macau: boolean }
 */
async function checkExistingData() {
  const [results] = await sequelize.query(
    "SELECT region_code, region_name FROM administrative_regions WHERE region_code IN ('71', '81', '82')"
  )

  const existing = {
    taiwan: results.some(r => r.region_code === '71'),
    hongkong: results.some(r => r.region_code === '81'),
    macau: results.some(r => r.region_code === '82')
  }

  return existing
}

/**
 * 插入单条记录
 * @param {Object} record - 记录数据
 * @returns {Promise<void>}
 */
async function insertRecord(record) {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const parentCode = record.parent_code ? `'${record.parent_code}'` : 'NULL'
  const shortName = record.short_name ? `'${record.short_name}'` : 'NULL'
  const pinyin = record.pinyin ? `'${record.pinyin}'` : 'NULL'

  const sql = `
    INSERT INTO administrative_regions 
      (region_code, parent_code, region_name, level, short_name, pinyin, status, sort_order, created_at, updated_at)
    VALUES 
      ('${record.region_code}', ${parentCode}, '${record.region_name}', ${record.level}, ${shortName}, ${pinyin}, 'active', 0, '${now}', '${now}')
    ON DUPLICATE KEY UPDATE 
      region_name = VALUES(region_name),
      parent_code = VALUES(parent_code),
      short_name = VALUES(short_name),
      pinyin = VALUES(pinyin),
      updated_at = VALUES(updated_at)
  `

  await sequelize.query(sql)
}

/**
 * 导入港澳台数据
 * @returns {Promise<Object>} 导入统计
 */
async function importHKMTData() {
  const stats = {
    taiwan: { provinces: 0, cities: 0, districts: 0 },
    hongkong: { provinces: 0, cities: 0, districts: 0 },
    macau: { provinces: 0, cities: 0, districts: 0 }
  }

  // 导入台湾数据
  console.log('\n📦 导入台湾省数据...')
  await insertRecord(HKMT_DATA.taiwan.province)
  stats.taiwan.provinces = 1
  console.log(`   ✅ 省级: ${HKMT_DATA.taiwan.province.region_name}`)

  for (const city of HKMT_DATA.taiwan.cities) {
    // eslint-disable-next-line no-await-in-loop
    await insertRecord(city)
    stats.taiwan.cities++
  }
  console.log(`   ✅ 市级: ${stats.taiwan.cities} 个`)

  // 导入香港数据
  console.log('\n📦 导入香港特别行政区数据...')
  await insertRecord(HKMT_DATA.hongkong.province)
  stats.hongkong.provinces = 1
  console.log(`   ✅ 省级: ${HKMT_DATA.hongkong.province.region_name}`)

  for (const city of HKMT_DATA.hongkong.cities) {
    // eslint-disable-next-line no-await-in-loop
    await insertRecord(city)
    stats.hongkong.cities++
  }
  console.log(`   ✅ 市级: ${stats.hongkong.cities} 个`)

  for (const district of HKMT_DATA.hongkong.districts) {
    // eslint-disable-next-line no-await-in-loop
    await insertRecord(district)
    stats.hongkong.districts++
  }
  console.log(`   ✅ 区县级: ${stats.hongkong.districts} 个`)

  // 导入澳门数据
  console.log('\n📦 导入澳门特别行政区数据...')
  await insertRecord(HKMT_DATA.macau.province)
  stats.macau.provinces = 1
  console.log(`   ✅ 省级: ${HKMT_DATA.macau.province.region_name}`)

  for (const city of HKMT_DATA.macau.cities) {
    // eslint-disable-next-line no-await-in-loop
    await insertRecord(city)
    stats.macau.cities++
  }
  console.log(`   ✅ 市级: ${stats.macau.cities} 个`)

  for (const district of HKMT_DATA.macau.districts) {
    // eslint-disable-next-line no-await-in-loop
    await insertRecord(district)
    stats.macau.districts++
  }
  console.log(`   ✅ 区县级: ${stats.macau.districts} 个`)

  return stats
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 港澳台行政区划数据补充脚本启动')
  console.log(`📅 时间: ${BeijingTimeHelper.apiTimestamp()}`)

  // 解析命令行参数
  const args = process.argv.slice(2)
  const checkOnly = args.includes('--check')

  try {
    // 测试数据库连接
    console.log('\n🔌 测试数据库连接...')
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 检查现有数据
    console.log('\n🔍 检查现有港澳台数据...')
    const existing = await checkExistingData()

    console.log(`   台湾省 (71): ${existing.taiwan ? '✅ 已存在' : '❌ 缺失'}`)
    console.log(`   香港特别行政区 (81): ${existing.hongkong ? '✅ 已存在' : '❌ 缺失'}`)
    console.log(`   澳门特别行政区 (82): ${existing.macau ? '✅ 已存在' : '❌ 缺失'}`)

    if (checkOnly) {
      console.log('\n⚠️ 仅检查模式，不执行导入')

      // 显示当前省级统计
      const [countResult] = await sequelize.query(
        'SELECT COUNT(*) as count FROM administrative_regions WHERE level = 1'
      )
      console.log(`\n📊 当前省级行政区数量: ${countResult[0].count}`)

      process.exit(0)
    }

    // 执行导入
    const stats = await importHKMTData()

    // 计算总数
    const totalImported =
      stats.taiwan.provinces +
      stats.taiwan.cities +
      stats.taiwan.districts +
      stats.hongkong.provinces +
      stats.hongkong.cities +
      stats.hongkong.districts +
      stats.macau.provinces +
      stats.macau.cities +
      stats.macau.districts

    console.log('\n📊 导入统计:')
    console.log('   台湾省:')
    console.log(`     省级: ${stats.taiwan.provinces}`)
    console.log(`     市级: ${stats.taiwan.cities}`)
    console.log(`     区县级: ${stats.taiwan.districts}`)
    console.log('   香港特别行政区:')
    console.log(`     省级: ${stats.hongkong.provinces}`)
    console.log(`     市级: ${stats.hongkong.cities}`)
    console.log(`     区县级: ${stats.hongkong.districts}`)
    console.log('   澳门特别行政区:')
    console.log(`     省级: ${stats.macau.provinces}`)
    console.log(`     市级: ${stats.macau.cities}`)
    console.log(`     区县级: ${stats.macau.districts}`)
    console.log(`   ───────────────`)
    console.log(`   总计: ${totalImported} 条`)

    // 验证导入结果
    console.log('\n🔍 验证导入结果...')
    const [verifyResult] = await sequelize.query(
      'SELECT level, COUNT(*) as count FROM administrative_regions GROUP BY level ORDER BY level'
    )

    console.log('📋 数据库中的区划统计:')
    let totalCount = 0
    verifyResult.forEach(row => {
      const levelName = { 1: '省级', 2: '市级', 3: '区县级', 4: '街道级' }[row.level] || '未知'
      console.log(`   ${levelName} (level=${row.level}): ${row.count} 条`)
      totalCount += parseInt(row.count, 10)
    })
    console.log(`   ───────────────`)
    console.log(`   总计: ${totalCount} 条`)

    // 确认34个省级
    const [provinceCount] = await sequelize.query(
      'SELECT COUNT(*) as count FROM administrative_regions WHERE level = 1'
    )
    const pCount = provinceCount[0].count
    if (pCount === 34) {
      console.log(`\n✅ 省级行政区确认: ${pCount} 个 (包含港澳台)`)
    } else {
      console.log(`\n⚠️ 省级行政区数量: ${pCount} 个 (预期 34 个)`)
    }

    console.log('\n✅ 港澳台行政区划数据补充完成!')
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
