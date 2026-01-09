#!/usr/bin/env node
/**
 * 图片上传 API 闭环测试脚本
 *
 * @description
 *   测试 POST /api/v4/console/images/upload 接口
 *   验证架构决策（2026-01-08）：
 *   - image_resources 新增记录，file_path 和 thumbnail_paths 为对象 key
 *   - Sealos 上原图 + 3 档缩略图均可访问
 *
 * @usage node scripts/sealos/test-image-upload-api.js
 */

require('dotenv').config()

const axios = require('axios')
const FormData = require('form-data')
const { Readable } = require('stream')

// 服务地址
const BASE_URL = 'http://localhost:3000'

/**
 * 生成测试图片 Buffer（1x1 像素 PNG）
 */
function createTestImageBuffer() {
  // 1x1 像素红色 PNG 图片的 base64 编码
  const base64Png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='
  return Buffer.from(base64Png, 'base64')
}

/**
 * 步骤 1：登录获取管理员 token
 */
async function loginAndGetToken() {
  console.log('\n📋 步骤 1：登录获取管理员 token')
  console.log('-'.repeat(50))

  try {
    const response = await axios.post(`${BASE_URL}/api/v4/auth/login`, {
      mobile: '13612227930',
      verification_code: '123456'
    })

    if (response.data.success && response.data.data.access_token) {
      const token = response.data.data.access_token
      const user = response.data.data.user
      console.log(`✅ 登录成功`)
      console.log(`   用户 ID: ${user.user_id}`)
      console.log(`   用户名: ${user.nickname}`)
      console.log(`   是否管理员: ${user.is_admin}`)
      return token
    } else {
      throw new Error(`登录失败: ${response.data.message}`)
    }
  } catch (error) {
    console.error(`❌ 登录失败: ${error.response?.data?.message || error.message}`)
    throw error
  }
}

/**
 * 步骤 2：上传图片
 */
async function uploadImage(token) {
  console.log('\n📋 步骤 2：上传图片到 /api/v4/console/images/upload')
  console.log('-'.repeat(50))

  try {
    const imageBuffer = createTestImageBuffer()
    const form = new FormData()

    // 添加图片文件
    form.append('image', imageBuffer, {
      filename: 'test-image.png',
      contentType: 'image/png'
    })

    // 添加业务参数
    form.append('business_type', 'lottery')
    form.append('category', 'prizes')
    // business_id 不传，测试 context_id=0 的情况

    console.log(`   文件大小: ${imageBuffer.length} bytes`)
    console.log(`   业务类型: lottery`)
    console.log(`   分类: prizes`)

    const response = await axios.post(`${BASE_URL}/api/v4/console/images/upload`, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${token}`
      },
      maxContentLength: 10 * 1024 * 1024,
      maxBodyLength: 10 * 1024 * 1024
    })

    if (response.data.success) {
      const data = response.data.data
      console.log(`✅ 图片上传成功`)
      console.log(`   image_id: ${data.image_id}`)
      console.log(`   object_key: ${data.object_key}`)
      console.log(`   public_url: ${data.public_url}`)
      console.log(`   缩略图:`)
      console.log(`     small: ${data.thumbnails?.small}`)
      console.log(`     medium: ${data.thumbnails?.medium}`)
      console.log(`     large: ${data.thumbnails?.large}`)
      return data
    } else {
      throw new Error(`上传失败: ${response.data.message}`)
    }
  } catch (error) {
    console.error(`❌ 上传失败: ${error.response?.data?.message || error.message}`)
    if (error.response?.data) {
      console.error(`   响应详情:`, JSON.stringify(error.response.data, null, 2))
    }
    throw error
  }
}

/**
 * 步骤 3：验证数据库记录（使用独立连接）
 */
async function verifyDatabaseRecord(imageId) {
  console.log('\n📋 步骤 3：验证数据库记录')
  console.log('-'.repeat(50))

  // 创建独立的数据库连接（避免与主服务连接冲突）
  const { Sequelize } = require('sequelize')
  const dbConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    dialect: 'mysql',
    logging: false
  }

  const sequelize = new Sequelize(dbConfig.database, dbConfig.username, dbConfig.password, {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: dbConfig.dialect,
    logging: dbConfig.logging
  })

  try {
    await sequelize.authenticate()

    const [rows] = await sequelize.query(
      `SELECT 
        image_id, 
        file_path, 
        thumbnail_paths, 
        original_filename,
        business_type,
        category,
        context_id,
        status,
        created_at
      FROM image_resources 
      WHERE image_id = ?`,
      { replacements: [imageId] }
    )

    if (rows.length === 0) {
      throw new Error(`未找到 image_id=${imageId} 的记录`)
    }

    const record = rows[0]
    console.log(`✅ 数据库记录验证`)
    console.log(`   image_id: ${record.image_id}`)
    console.log(`   file_path: ${record.file_path}`)
    console.log(`   thumbnail_paths: ${JSON.stringify(record.thumbnail_paths)}`)
    console.log(`   business_type: ${record.business_type}`)
    console.log(`   category: ${record.category}`)
    console.log(`   context_id: ${record.context_id}`)
    console.log(`   status: ${record.status}`)

    // 验证 file_path 是对象 key 格式
    const filePath = record.file_path
    const isValidObjectKey =
      filePath &&
      !filePath.startsWith('http://') &&
      !filePath.startsWith('https://') &&
      !filePath.startsWith('/') &&
      filePath.includes('/')

    if (!isValidObjectKey) {
      throw new Error(`file_path 格式错误，应为对象 key: ${filePath}`)
    }
    console.log(`   ✅ file_path 是有效的对象 key`)

    // 验证 thumbnail_paths 是 JSON 对象 key
    const thumbnails =
      typeof record.thumbnail_paths === 'string'
        ? JSON.parse(record.thumbnail_paths)
        : record.thumbnail_paths

    if (!thumbnails || !thumbnails.small || !thumbnails.medium || !thumbnails.large) {
      throw new Error(`thumbnail_paths 缺失或不完整: ${JSON.stringify(thumbnails)}`)
    }

    const allThumbnailsValid = ['small', 'medium', 'large'].every(size => {
      const key = thumbnails[size]
      return (
        key &&
        !key.startsWith('http://') &&
        !key.startsWith('https://') &&
        !key.startsWith('/') &&
        key.includes('thumbnails/')
      )
    })

    if (!allThumbnailsValid) {
      throw new Error(`thumbnail_paths 格式错误: ${JSON.stringify(thumbnails)}`)
    }
    console.log(`   ✅ thumbnail_paths 包含有效的对象 key`)

    await sequelize.close()
    return { filePath, thumbnails }
  } catch (error) {
    console.error(`❌ 数据库验证失败: ${error.message}`)
    try {
      await sequelize.close()
    } catch {}
    throw error
  }
}

/**
 * 步骤 4：验证 Sealos 对象可访问性
 */
async function verifySealosAccess(uploadResult) {
  console.log('\n📋 步骤 4：验证 Sealos 对象可访问性')
  console.log('-'.repeat(50))

  const urlsToCheck = [
    { name: '原图', url: uploadResult.public_url },
    { name: '小缩略图', url: uploadResult.thumbnails?.small },
    { name: '中缩略图', url: uploadResult.thumbnails?.medium },
    { name: '大缩略图', url: uploadResult.thumbnails?.large }
  ]

  let allAccessible = true

  for (const item of urlsToCheck) {
    if (!item.url) {
      console.log(`   ⚠️ ${item.name}: URL 缺失`)
      allAccessible = false
      continue
    }

    try {
      const response = await axios.head(item.url, { timeout: 10000 })
      if (response.status === 200) {
        console.log(`   ✅ ${item.name}: 可访问 (200)`)
      } else {
        console.log(`   ⚠️ ${item.name}: 状态码 ${response.status}`)
        allAccessible = false
      }
    } catch (error) {
      console.log(`   ❌ ${item.name}: 访问失败 - ${error.message}`)
      allAccessible = false
    }
  }

  if (allAccessible) {
    console.log(`\n✅ Sealos 对象全部可访问`)
  } else {
    throw new Error('部分 Sealos 对象不可访问')
  }
}

/**
 * 步骤 5：获取当前 image_resources 记录数（使用独立连接）
 */
async function getImageResourcesCount() {
  const { Sequelize } = require('sequelize')
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

  try {
    await sequelize.authenticate()
    const [rows] = await sequelize.query('SELECT COUNT(*) as count FROM image_resources')
    const count = rows[0].count
    await sequelize.close()
    return count
  } catch (error) {
    try {
      await sequelize.close()
    } catch {}
    throw error
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('='.repeat(60))
  console.log('🧪 图片上传 API 闭环测试')
  console.log('   验证架构决策（2026-01-08）')
  console.log('='.repeat(60))

  try {
    // 检查环境变量
    const requiredEnvVars = [
      'SEALOS_ENDPOINT',
      'SEALOS_BUCKET',
      'SEALOS_ACCESS_KEY',
      'SEALOS_SECRET_KEY'
    ]
    const missingVars = requiredEnvVars.filter(v => !process.env[v])
    if (missingVars.length > 0) {
      throw new Error(`缺少环境变量: ${missingVars.join(', ')}`)
    }

    // 获取测试前的记录数
    const countBefore = await getImageResourcesCount()
    console.log(`\n📊 测试前 image_resources 记录数: ${countBefore}`)

    // 执行测试步骤
    const token = await loginAndGetToken()
    const uploadResult = await uploadImage(token)
    await verifyDatabaseRecord(uploadResult.image_id)
    await verifySealosAccess(uploadResult)

    // 获取测试后的记录数
    const countAfter = await getImageResourcesCount()
    console.log(`\n📊 测试后 image_resources 记录数: ${countAfter}`)
    console.log(`   新增记录数: ${countAfter - countBefore}`)

    // 测试结果汇总
    console.log('\n' + '='.repeat(60))
    console.log('🎉 测试结果：全部通过！')
    console.log('='.repeat(60))
    console.log('\n✅ 验收点确认：')
    console.log('   1. image_resources 出现新记录')
    console.log('   2. file_path 存储的是对象 key（非完整 URL）')
    console.log('   3. thumbnail_paths 存储的是对象 key（JSON 格式）')
    console.log('   4. Sealos 上原图可访问')
    console.log('   5. Sealos 上 3 档缩略图均可访问')
    console.log('\n📋 上传结果：')
    console.log(`   image_id: ${uploadResult.image_id}`)
    console.log(`   object_key: ${uploadResult.object_key}`)
  } catch (error) {
    console.log('\n' + '='.repeat(60))
    console.log('❌ 测试失败')
    console.log('='.repeat(60))
    console.error(`\n错误: ${error.message}`)
    process.exit(1)
  }
}

main()
