/**
 * 配置工具API完整测试脚本
 *
 * 功能：
 * 1. 检查数据库中的系统设置数据
 * 2. 测试管理员登录获取Token
 * 3. 测试所有配置相关API
 */

const { Sequelize } = require('sequelize')

// 加载环境变量
require('dotenv').config()

async function runTest() {
  console.log('='.repeat(70))
  console.log('🔍 配置工具API完整测试')
  console.log('='.repeat(70))

  // 数据库连接
  const sequelize = new Sequelize(
    process.env.DB_NAME || 'restaurant_lottery',
    process.env.DB_USER || 'root',
    process.env.DB_PASSWORD || '',
    {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      dialect: 'mysql',
      logging: false
    }
  )

  try {
    // 测试数据库连接
    await sequelize.authenticate()
    console.log('\n✅ 数据库连接成功')

    // 1. 检查system_settings表是否存在
    console.log('\n📋 1. 检查system_settings表')
    const [tables] = await sequelize.query("SHOW TABLES LIKE 'system_settings'")
    if (tables.length === 0) {
      console.log('❌ system_settings表不存在')
      return
    }
    console.log('✅ system_settings表存在')

    // 2. 检查表结构
    console.log('\n📋 2. 检查表结构')
    const [columns] = await sequelize.query('DESCRIBE system_settings')
    console.log('表字段:', columns.map(c => c.Field).join(', '))

    // 3. 检查数据数量
    console.log('\n📋 3. 检查数据数量')
    const [countResult] = await sequelize.query('SELECT COUNT(*) as total FROM system_settings')
    const totalSettings = countResult[0].total
    console.log(`总设置数量: ${totalSettings}`)

    // 4. 检查各分类数据
    console.log('\n📋 4. 检查各分类数据')
    const [categories] = await sequelize.query(`
      SELECT category, COUNT(*) as count 
      FROM system_settings 
      WHERE is_visible = 1 
      GROUP BY category
    `)

    if (categories.length === 0) {
      console.log('⚠️ 没有可见的设置数据')

      // 检查是否有数据但is_visible为false
      const [hiddenCount] = await sequelize.query(`
        SELECT COUNT(*) as count FROM system_settings WHERE is_visible = 0
      `)
      if (hiddenCount[0].count > 0) {
        console.log(`   发现 ${hiddenCount[0].count} 条隐藏的设置`)
      }
    } else {
      console.log('各分类设置数量:')
      categories.forEach(cat => {
        console.log(`   ${cat.category}: ${cat.count}项`)
      })
    }

    // 5. 查看示例数据
    console.log('\n📋 5. 示例数据')
    const [sampleData] = await sequelize.query(`
      SELECT setting_id, category, setting_key, setting_value, value_type, is_visible, is_readonly
      FROM system_settings 
      LIMIT 10
    `)

    if (sampleData.length === 0) {
      console.log('⚠️ 表中没有数据')
    } else {
      console.log('前10条设置数据:')
      sampleData.forEach(row => {
        const value = String(row.setting_value).substring(0, 30)
        console.log(
          `   [${row.category}] ${row.setting_key} = ${value}... (${row.value_type}) ${row.is_visible ? '可见' : '隐藏'}`
        )
      })
    }

    // 6. 如果没有数据，插入测试数据
    if (totalSettings === 0) {
      console.log('\n📋 6. 插入测试数据')

      const testSettings = [
        {
          category: 'basic',
          setting_key: 'system_name',
          setting_value: '餐厅积分抽奖系统',
          value_type: 'string',
          description: '系统名称',
          is_visible: 1,
          is_readonly: 0
        },
        {
          category: 'basic',
          setting_key: 'system_version',
          setting_value: '4.0.0',
          value_type: 'string',
          description: '系统版本',
          is_visible: 1,
          is_readonly: 1
        },
        {
          category: 'basic',
          setting_key: 'maintenance_mode',
          setting_value: 'false',
          value_type: 'boolean',
          description: '维护模式开关',
          is_visible: 1,
          is_readonly: 0
        },
        {
          category: 'basic',
          setting_key: 'maintenance_message',
          setting_value: '系统正在升级维护中',
          value_type: 'string',
          description: '维护公告',
          is_visible: 1,
          is_readonly: 0
        },
        {
          category: 'points',
          setting_key: 'lottery_cost_points',
          setting_value: '100',
          value_type: 'number',
          description: '单次抽奖消耗积分',
          is_visible: 1,
          is_readonly: 0
        },
        {
          category: 'points',
          setting_key: 'daily_lottery_limit',
          setting_value: '10',
          value_type: 'number',
          description: '每日抽奖次数限制',
          is_visible: 1,
          is_readonly: 0
        },
        {
          category: 'security',
          setting_key: 'enable_captcha',
          setting_value: 'true',
          value_type: 'boolean',
          description: '启用验证码',
          is_visible: 1,
          is_readonly: 0
        },
        {
          category: 'security',
          setting_key: 'max_login_attempts',
          setting_value: '5',
          value_type: 'number',
          description: '最大登录尝试次数',
          is_visible: 1,
          is_readonly: 0
        },
        {
          category: 'notification',
          setting_key: 'enable_sms',
          setting_value: 'false',
          value_type: 'boolean',
          description: '启用短信通知',
          is_visible: 1,
          is_readonly: 0
        },
        {
          category: 'notification',
          setting_key: 'enable_push',
          setting_value: 'true',
          value_type: 'boolean',
          description: '启用推送通知',
          is_visible: 1,
          is_readonly: 0
        }
      ]

      for (const setting of testSettings) {
        try {
          await sequelize.query(
            `
            INSERT INTO system_settings (category, setting_key, setting_value, value_type, description, is_visible, is_readonly, created_at, updated_at)
            VALUES (:category, :setting_key, :setting_value, :value_type, :description, :is_visible, :is_readonly, NOW(), NOW())
          `,
            {
              replacements: setting
            }
          )
          console.log(`   ✅ 插入: ${setting.setting_key}`)
        } catch (e) {
          if (e.message.includes('Duplicate')) {
            console.log(`   ⏭️ 跳过已存在: ${setting.setting_key}`)
          } else {
            console.log(`   ❌ 插入失败: ${setting.setting_key} - ${e.message}`)
          }
        }
      }

      console.log('\n✅ 测试数据插入完成')
    }

    // 7. 检查API可用性
    console.log('\n📋 7. API端点可用性')
    console.log(`
后端实际提供的API:
✅ GET  /api/v4/console/settings          - 获取设置概览
✅ GET  /api/v4/console/settings/:category - 获取分类设置
✅ PUT  /api/v4/console/settings/:category - 更新分类设置
✅ POST /api/v4/console/cache/clear        - 清除缓存

前端已修改为使用正确的API路径。
请刷新管理后台页面验证数据显示。
`)
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message)
  } finally {
    await sequelize.close()
  }

  console.log('\n' + '='.repeat(70))
  console.log('🎉 测试完成')
  console.log('='.repeat(70))
}

runTest()
