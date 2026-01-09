/**
 * 弹窗Banner 数据库直接测试脚本
 *
 * 用途：直接测试数据库和服务层是否正常工作（跳过认证）
 * 执行：node scripts/test-popup-banners-db.js
 *
 * @date 2026-01-09
 */

require('dotenv').config()

const { PopupBanner, User, sequelize } = require('../models')
const PopupBannerService = require('../services/PopupBannerService')

async function main() {
  console.log('='.repeat(60))
  console.log('🧪 弹窗Banner 数据库直接测试')
  console.log('='.repeat(60))
  console.log('测试时间:', new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }))

  try {
    // 1. 测试数据库连接
    console.log('\n🔍 测试 1: 数据库连接...')
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 2. 检查 popup_banners 表是否存在
    console.log('\n🔍 测试 2: 检查 popup_banners 表...')
    const [results] = await sequelize.query(`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = DATABASE() AND table_name = 'popup_banners'
    `)
    if (results[0].count > 0) {
      console.log('✅ popup_banners 表存在')
    } else {
      console.log('❌ popup_banners 表不存在，请运行迁移')
      console.log('   执行: npx sequelize-cli db:migrate')
      return
    }

    // 3. 查询弹窗统计
    console.log('\n🔍 测试 3: 弹窗统计...')
    const statistics = await PopupBannerService.getStatistics()
    console.log('✅ 统计查询成功')
    console.log('   总数:', statistics.total)
    console.log('   已启用:', statistics.active)
    console.log('   已禁用:', statistics.inactive)
    console.log('   首页弹窗:', statistics.by_position?.home)
    console.log('   个人中心弹窗:', statistics.by_position?.profile)

    // 4. 查询弹窗列表
    console.log('\n🔍 测试 4: 弹窗列表...')
    const listResult = await PopupBannerService.getAdminBannerList({
      position: null,
      is_active: null,
      limit: 10,
      offset: 0
    })
    console.log('✅ 列表查询成功')
    console.log('   返回数量:', listResult.banners.length)
    console.log('   总记录:', listResult.total)

    if (listResult.banners.length > 0) {
      console.log('\n   📋 弹窗列表:')
      listResult.banners.forEach((banner, index) => {
        console.log(`   ${index + 1}. [ID:${banner.banner_id}] ${banner.title}`)
        console.log(`      位置: ${banner.position}, 状态: ${banner.is_active ? '启用' : '禁用'}`)
        console.log(`      图片: ${banner.image_url?.substring(0, 50)}...`)
      })
    } else {
      console.log('   (数据库中暂无弹窗数据)')
    }

    // 5. 如果没有数据，创建测试数据
    if (listResult.total === 0) {
      console.log('\n🔍 测试 5: 创建测试弹窗...')

      // 查找一个管理员用户
      const adminUser = await User.findOne({
        where: sequelize.literal(`EXISTS (
          SELECT 1 FROM user_roles ur 
          JOIN roles r ON ur.role_id = r.role_id 
          WHERE ur.user_id = "User"."user_id" AND r.role_level >= 100
        )`)
      })

      if (adminUser) {
        const testBanner = await PopupBannerService.createBanner(
          {
            title: '测试弹窗 - ' + new Date().toLocaleTimeString('zh-CN'),
            image_url: 'popup-banners/test-placeholder.jpg',
            link_type: 'none',
            position: 'home',
            is_active: true,
            display_order: 0
          },
          adminUser.user_id
        )

        console.log('✅ 测试弹窗创建成功')
        console.log('   ID:', testBanner.banner_id)
        console.log('   标题:', testBanner.title)
      } else {
        console.log('⚠️ 未找到管理员用户，跳过创建测试数据')
      }
    }

    // 6. 验证前端期望的 API 响应格式
    console.log('\n🔍 测试 6: 验证 API 响应格式...')
    const stats = await PopupBannerService.getStatistics()

    const expectedFields = ['total', 'active', 'inactive', 'by_position']
    const missingFields = expectedFields.filter(field => stats[field] === undefined)

    if (missingFields.length === 0) {
      console.log('✅ 统计 API 响应格式正确')
    } else {
      console.log('❌ 统计 API 缺少字段:', missingFields.join(', '))
    }

    if (stats.by_position && stats.by_position.home !== undefined) {
      console.log('✅ by_position.home 字段存在')
    } else {
      console.log('❌ by_position.home 字段缺失')
    }

    console.log('\n' + '='.repeat(60))
    console.log('🎉 所有数据库测试通过！')
    console.log('='.repeat(60))
    console.log('\n💡 下一步:')
    console.log('1. 刷新浏览器页面 /admin/popup-banners.html')
    console.log('2. 检查页面是否能正常加载数据')
    console.log('3. 如果仍有问题，检查浏览器控制台错误')
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message)
    console.error('堆栈:', error.stack)
  } finally {
    await sequelize.close()
  }
}

main()
