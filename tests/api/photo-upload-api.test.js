/**
 * 图片上传API测试套件
 * 测试用户上传记录和统计功能
 * 创建时间：2025年01月21日 北京时间
 * 使用模型：Claude Sonnet 4.5
 *
 * 测试覆盖：
 * 1. 获取用户上传记录列表 GET /api/v4/photo/my-uploads
 * 2. 获取用户上传统计信息 GET /api/v4/photo/my-stats
 *
 * 测试账号：13612227930 (user_id: 31)
 * 数据库：restaurant_points_dev
 */

const UnifiedAPITestManager = require('./UnifiedAPITestManager')
const moment = require('moment-timezone')

describe('图片上传API测试套件', () => {
  let tester
  const test_account = {
    phone: '13612227930',
    user_id: 31
  }

  beforeAll(async () => {
    console.log('🚀 图片上传API测试套件启动')
    console.log('='.repeat(70))
    console.log(
      `📅 测试时间: ${moment().tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss')} (北京时间)`
    )
    console.log(`📱 测试账号: ${test_account.phone}`)
    console.log(`🆔 用户ID: ${test_account.user_id}`)
    console.log('='.repeat(70))

    tester = new UnifiedAPITestManager()

    // 等待V4引擎启动
    try {
      await tester.waitForV4Engine(30000)
      console.log('✅ V4引擎启动检查通过')
    } catch (error) {
      console.warn('⚠️ V4引擎可能未启动，继续测试:', error.message)
    }

    // 登录获取token
    try {
      await tester.authenticateV4User('regular')
      console.log('✅ 测试账号登录成功')
    } catch (error) {
      console.error('❌ 登录失败:', error.message)
      throw error
    }
  }, 30000)

  afterAll(async () => {
    if (tester) {
      await tester.cleanup()
    }
    console.log('🔚 图片上传API测试套件完成')
  })

  describe('用户上传记录查询', () => {
    test('GET /api/v4/photo/my-uploads - 获取用户上传记录列表（默认分页）', async () => {
      console.log('\n📋 测试：获取用户上传记录列表（默认分页）')

      const response = await tester.request
        .get('/api/v4/photo/my-uploads')
        .query({ user_id: test_account.user_id })
        .set('Authorization', `Bearer ${tester.access_token}`)

      console.log('响应状态:', response.status)
      console.log('响应数据:', JSON.stringify(response.body, null, 2))

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data).toHaveProperty('uploads')
      expect(response.body.data).toHaveProperty('pagination')

      // 验证分页信息
      const { pagination } = response.body.data
      expect(pagination).toHaveProperty('page')
      expect(pagination).toHaveProperty('limit')
      expect(pagination).toHaveProperty('total')
      expect(pagination).toHaveProperty('total_pages')
      expect(pagination).toHaveProperty('has_next')
      expect(pagination).toHaveProperty('has_prev')

      console.log(`✅ 返回${response.body.data.uploads.length}条上传记录`)
      console.log(`📊 总记录数: ${pagination.total}`)
    })

    test('GET /api/v4/photo/my-uploads - 自定义分页参数', async () => {
      console.log('\n📋 测试：自定义分页参数（page=1, limit=5）')

      const response = await tester.request
        .get('/api/v4/photo/my-uploads')
        .query({
          user_id: test_account.user_id,
          page: 1,
          limit: 5
        })
        .set('Authorization', `Bearer ${tester.access_token}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)

      const { pagination } = response.body.data
      expect(pagination.page).toBe(1)
      expect(pagination.limit).toBe(5)
      expect(response.body.data.uploads.length).toBeLessThanOrEqual(5)

      console.log(`✅ 返回${response.body.data.uploads.length}条记录（限制5条）`)
    })

    test('GET /api/v4/photo/my-uploads - 按审核状态筛选（pending）', async () => {
      console.log('\n📋 测试：按审核状态筛选（pending）')

      const response = await tester.request
        .get('/api/v4/photo/my-uploads')
        .query({
          user_id: test_account.user_id,
          review_status: 'pending',
          limit: 10
        })
        .set('Authorization', `Bearer ${tester.access_token}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)

      // 验证所有返回的记录都是pending状态
      const uploads = response.body.data.uploads
      uploads.forEach(upload => {
        expect(upload.review_status).toBe('pending')
      })

      console.log(`✅ 返回${uploads.length}条待审核记录`)
    })

    test('GET /api/v4/photo/my-uploads - 按审核状态筛选（approved）', async () => {
      console.log('\n📋 测试：按审核状态筛选（approved）')

      const response = await tester.request
        .get('/api/v4/photo/my-uploads')
        .query({
          user_id: test_account.user_id,
          review_status: 'approved',
          limit: 10
        })
        .set('Authorization', `Bearer ${tester.access_token}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)

      // 验证所有返回的记录都是approved状态
      const uploads = response.body.data.uploads
      uploads.forEach(upload => {
        expect(upload.review_status).toBe('approved')
      })

      console.log(`✅ 返回${uploads.length}条已通过记录`)
    })

    test('GET /api/v4/photo/my-uploads - 排序测试（按创建时间倒序）', async () => {
      console.log('\n📋 测试：排序（按创建时间倒序）')

      const response = await tester.request
        .get('/api/v4/photo/my-uploads')
        .query({
          user_id: test_account.user_id,
          sort_by: 'created_at',
          order: 'DESC',
          limit: 5
        })
        .set('Authorization', `Bearer ${tester.access_token}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)

      const uploads = response.body.data.uploads
      if (uploads.length > 1) {
        // 验证时间顺序
        for (let i = 0; i < uploads.length - 1; i++) {
          const current = new Date(uploads[i].created_at)
          const next = new Date(uploads[i + 1].created_at)
          expect(current >= next).toBe(true)
        }
        console.log('✅ 时间排序正确（倒序）')
      }
    })

    test('GET /api/v4/photo/my-uploads - 缺少user_id参数（应返回400错误）', async () => {
      console.log('\n❌ 测试：缺少user_id参数（应返回400错误）')

      const response = await tester.request
        .get('/api/v4/photo/my-uploads')
        .set('Authorization', `Bearer ${tester.access_token}`)

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.code).toBe('MISSING_USER_ID')

      console.log('✅ 正确返回400错误')
    })

    test('GET /api/v4/photo/my-uploads - 用户不存在（应返回404错误）', async () => {
      console.log('\n❌ 测试：用户不存在（应返回404错误）')

      const response = await tester.request
        .get('/api/v4/photo/my-uploads')
        .query({ user_id: 999999 }) // 不存在的用户ID
        .set('Authorization', `Bearer ${tester.access_token}`)

      expect(response.status).toBe(404)
      expect(response.body.success).toBe(false)
      expect(response.body.code).toBe('USER_NOT_FOUND')

      console.log('✅ 正确返回404错误')
    })

    test('GET /api/v4/photo/my-uploads - 验证返回数据结构完整性', async () => {
      console.log('\n📋 测试：验证返回数据结构完整性')

      const response = await tester.request
        .get('/api/v4/photo/my-uploads')
        .query({
          user_id: test_account.user_id,
          limit: 1
        })
        .set('Authorization', `Bearer ${tester.access_token}`)

      expect(response.status).toBe(200)

      if (response.body.data.uploads.length > 0) {
        const upload = response.body.data.uploads[0]

        // 验证必要字段
        expect(upload).toHaveProperty('image_id')
        expect(upload).toHaveProperty('business_type')
        expect(upload).toHaveProperty('review_status')
        expect(upload).toHaveProperty('status_text')
        expect(upload).toHaveProperty('has_thumbnails')
        expect(upload).toHaveProperty('can_reupload')
        expect(upload).toHaveProperty('created_at')

        console.log('✅ 数据结构完整')
        console.log('示例记录:', JSON.stringify(upload, null, 2))
      } else {
        console.log('ℹ️ 用户暂无上传记录')
      }
    })
  })

  describe('用户上传统计查询', () => {
    test('GET /api/v4/photo/my-stats - 获取用户上传统计信息', async () => {
      console.log('\n📊 测试：获取用户上传统计信息')

      const response = await tester.request
        .get('/api/v4/photo/my-stats')
        .query({ user_id: test_account.user_id })
        .set('Authorization', `Bearer ${tester.access_token}`)

      console.log('响应状态:', response.status)
      console.log('响应数据:', JSON.stringify(response.body, null, 2))

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data).toHaveProperty('total_uploads')
      expect(response.body.data).toHaveProperty('pending_count')
      expect(response.body.data).toHaveProperty('approved_count')
      expect(response.body.data).toHaveProperty('rejected_count')
      expect(response.body.data).toHaveProperty('reviewing_count')

      console.log(`✅ 总上传数: ${response.body.data.total_uploads}`)
      console.log(`📋 待审核: ${response.body.data.pending_count}`)
      console.log(`✅ 已通过: ${response.body.data.approved_count}`)
      console.log(`❌ 已拒绝: ${response.body.data.rejected_count}`)
    })

    test('GET /api/v4/photo/my-stats - 验证审核率计算', async () => {
      console.log('\n📊 测试：验证审核率计算')

      const response = await tester.request
        .get('/api/v4/photo/my-stats')
        .query({ user_id: test_account.user_id })
        .set('Authorization', `Bearer ${tester.access_token}`)

      expect(response.status).toBe(200)

      const data = response.body.data
      expect(data).toHaveProperty('approval_rate')
      expect(data).toHaveProperty('rejection_rate')

      // 验证审核率是数字
      expect(typeof data.approval_rate).toBe('number')
      expect(typeof data.rejection_rate).toBe('number')

      // 验证审核率范围
      expect(data.approval_rate).toBeGreaterThanOrEqual(0)
      expect(data.approval_rate).toBeLessThanOrEqual(100)

      console.log(`✅ 审核通过率: ${data.approval_rate}%`)
      console.log(`❌ 审核拒绝率: ${data.rejection_rate}%`)
    })

    test('GET /api/v4/photo/my-stats - 验证时间维度统计', async () => {
      console.log('\n📊 测试：验证时间维度统计')

      const response = await tester.request
        .get('/api/v4/photo/my-stats')
        .query({ user_id: test_account.user_id })
        .set('Authorization', `Bearer ${tester.access_token}`)

      expect(response.status).toBe(200)

      const data = response.body.data
      expect(data).toHaveProperty('this_month_count')
      expect(data).toHaveProperty('this_week_count')
      expect(data).toHaveProperty('today_count')

      console.log(`📅 本月上传: ${data.this_month_count}`)
      console.log(`📅 本周上传: ${data.this_week_count}`)
      console.log(`📅 今日上传: ${data.today_count}`)

      // 验证时间统计的逻辑关系
      expect(data.this_month_count).toBeGreaterThanOrEqual(data.this_week_count)
      expect(data.this_week_count).toBeGreaterThanOrEqual(data.today_count)

      console.log('✅ 时间统计关系正确')
    })

    test('GET /api/v4/photo/my-stats - 验证积分统计', async () => {
      console.log('\n📊 测试：验证积分统计')

      const response = await tester.request
        .get('/api/v4/photo/my-stats')
        .query({ user_id: test_account.user_id })
        .set('Authorization', `Bearer ${tester.access_token}`)

      expect(response.status).toBe(200)

      const data = response.body.data
      expect(data).toHaveProperty('total_points_awarded')
      expect(data).toHaveProperty('avg_points_per_upload')

      console.log(`💰 总获得积分: ${data.total_points_awarded}`)
      console.log(`💰 平均每张积分: ${data.avg_points_per_upload}`)

      // 验证积分为非负数
      expect(data.total_points_awarded).toBeGreaterThanOrEqual(0)
      expect(data.avg_points_per_upload).toBeGreaterThanOrEqual(0)

      console.log('✅ 积分统计正确')
    })

    test('GET /api/v4/photo/my-stats - 验证用户等级评估', async () => {
      console.log('\n📊 测试：验证用户等级评估')

      const response = await tester.request
        .get('/api/v4/photo/my-stats')
        .query({ user_id: test_account.user_id })
        .set('Authorization', `Bearer ${tester.access_token}`)

      expect(response.status).toBe(200)

      const data = response.body.data
      expect(data).toHaveProperty('user_level')
      expect(data.user_level).toHaveProperty('level')
      expect(data.user_level).toHaveProperty('text')
      expect(data.user_level).toHaveProperty('description')

      console.log(`🏆 用户等级: ${data.user_level.text}`)
      console.log(`📝 等级描述: ${data.user_level.description}`)

      // 验证等级值
      const validLevels = ['beginner', 'bronze', 'silver', 'gold', 'platinum']
      expect(validLevels).toContain(data.user_level.level)

      console.log('✅ 等级评估正确')
    })

    test('GET /api/v4/photo/my-stats - 验证提示信息', async () => {
      console.log('\n📊 测试：验证提示信息')

      const response = await tester.request
        .get('/api/v4/photo/my-stats')
        .query({ user_id: test_account.user_id })
        .set('Authorization', `Bearer ${tester.access_token}`)

      expect(response.status).toBe(200)

      const data = response.body.data
      expect(data).toHaveProperty('tips')
      expect(Array.isArray(data.tips)).toBe(true)
      expect(data.tips.length).toBeGreaterThan(0)

      console.log('💡 提示信息:')
      data.tips.forEach((tip, index) => {
        console.log(`   ${index + 1}. ${tip}`)
      })

      console.log('✅ 提示信息生成正确')
    })

    test('GET /api/v4/photo/my-stats - 验证最近上传信息', async () => {
      console.log('\n📊 测试：验证最近上传信息')

      const response = await tester.request
        .get('/api/v4/photo/my-stats')
        .query({ user_id: test_account.user_id })
        .set('Authorization', `Bearer ${tester.access_token}`)

      expect(response.status).toBe(200)

      const data = response.body.data
      expect(data).toHaveProperty('latest_upload')

      if (data.latest_upload) {
        expect(data.latest_upload).toHaveProperty('image_id')
        expect(data.latest_upload).toHaveProperty('review_status')
        expect(data.latest_upload).toHaveProperty('status_text')
        expect(data.latest_upload).toHaveProperty('uploaded_at')

        console.log('最近上传信息:', JSON.stringify(data.latest_upload, null, 2))
      } else {
        console.log('ℹ️ 用户暂无上传记录')
      }

      console.log('✅ 最近上传信息正确')
    })

    test('GET /api/v4/photo/my-stats - 缺少user_id参数（应返回400错误）', async () => {
      console.log('\n❌ 测试：缺少user_id参数（应返回400错误）')

      const response = await tester.request
        .get('/api/v4/photo/my-stats')
        .set('Authorization', `Bearer ${tester.access_token}`)

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.code).toBe('MISSING_USER_ID')

      console.log('✅ 正确返回400错误')
    })

    test('GET /api/v4/photo/my-stats - 用户不存在（应返回404错误）', async () => {
      console.log('\n❌ 测试：用户不存在（应返回404错误）')

      const response = await tester.request
        .get('/api/v4/photo/my-stats')
        .query({ user_id: 999999 }) // 不存在的用户ID
        .set('Authorization', `Bearer ${tester.access_token}`)

      expect(response.status).toBe(404)
      expect(response.body.success).toBe(false)
      expect(response.body.code).toBe('USER_NOT_FOUND')

      console.log('✅ 正确返回404错误')
    })
  })

  describe('数据一致性验证', () => {
    test('验证上传记录数与统计数据一致', async () => {
      console.log('\n🔍 测试：验证上传记录数与统计数据一致')

      // 获取统计数据
      const statsResponse = await tester.request
        .get('/api/v4/photo/my-stats')
        .query({ user_id: test_account.user_id })
        .set('Authorization', `Bearer ${tester.access_token}`)

      expect(statsResponse.status).toBe(200)
      const stats = statsResponse.body.data

      // 获取所有上传记录（不分页）
      const uploadsResponse = await tester.request
        .get('/api/v4/photo/my-uploads')
        .query({
          user_id: test_account.user_id,
          limit: 100
        })
        .set('Authorization', `Bearer ${tester.access_token}`)

      expect(uploadsResponse.status).toBe(200)
      const { pagination } = uploadsResponse.body.data

      // 验证总数一致
      expect(stats.total_uploads).toBe(pagination.total)

      console.log(`✅ 统计总数: ${stats.total_uploads}`)
      console.log(`✅ 记录总数: ${pagination.total}`)
      console.log('✅ 数据一致性验证通过')
    })

    test('验证各状态数量与实际记录一致', async () => {
      console.log('\n🔍 测试：验证各状态数量与实际记录一致')

      // 获取统计数据
      const statsResponse = await tester.request
        .get('/api/v4/photo/my-stats')
        .query({ user_id: test_account.user_id })
        .set('Authorization', `Bearer ${tester.access_token}`)

      const stats = statsResponse.body.data

      // 获取各状态的记录数
      const statuses = ['pending', 'approved', 'rejected', 'reviewing']
      const statusCounts = {}

      for (const status of statuses) {
        const response = await tester.request
          .get('/api/v4/photo/my-uploads')
          .query({
            user_id: test_account.user_id,
            review_status: status,
            limit: 100
          })
          .set('Authorization', `Bearer ${tester.access_token}`)

        statusCounts[status] = response.body.data.pagination.total
      }

      // 验证数量一致
      expect(stats.pending_count).toBe(statusCounts.pending)
      expect(stats.approved_count).toBe(statusCounts.approved)
      expect(stats.rejected_count).toBe(statusCounts.rejected)
      expect(stats.reviewing_count).toBe(statusCounts.reviewing)

      console.log('✅ 各状态数量验证通过:')
      console.log(`   待审核: ${stats.pending_count} = ${statusCounts.pending}`)
      console.log(`   已通过: ${stats.approved_count} = ${statusCounts.approved}`)
      console.log(`   已拒绝: ${stats.rejected_count} = ${statusCounts.rejected}`)
      console.log(`   审核中: ${stats.reviewing_count} = ${statusCounts.reviewing}`)
    })
  })
})
