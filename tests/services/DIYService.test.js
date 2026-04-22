/**
 * DIY 饰品设计引擎 — 服务层 + API 集成测试
 *
 * 测试范围：
 * - 模板 CRUD（管理端）
 * - 用户作品 CRUD + 状态流转（小程序端）
 * - 材料查询（联动 diy_materials + media_files）
 * - 支付资产查询（联动 material_asset_types + account_asset_balances）
 *
 * 使用真实数据库，不使用 mock 数据
 * 测试用户：13612227930（既是用户也是管理员）
 */

'use strict'

const request = require('supertest')
const app = require('../../app')
const _TestConfig = require('../helpers/test-setup').TestConfig

// 初始化 ServiceManager（测试环境）
const models = require('../../models')
const { initializeServices } = require('../../services')
const services = initializeServices(models)
app.locals.services = services
app.locals.models = models

let adminToken = null
let testAccountId = null
let createdTemplateId = null
let createdWorkId = null

beforeAll(async () => {
  // 使用 quick-login 获取 token
  const loginRes = await request(app)
    .post('/api/v4/auth/quick-login')
    .send({ mobile: '13612227930' })

  expect(loginRes.body.success).toBe(true)
  adminToken = loginRes.body.data.access_token

  // 获取 account_id
  const userId = loginRes.body.data.user?.user_id || loginRes.body.data.user_id
  const account = await models.Account.findOne({
    where: { user_id: userId }
  })
  testAccountId = account.account_id
})

afterAll(async () => {
  // 清理测试创建的数据
  if (createdWorkId) {
    await models.DiyWork.destroy({ where: { diy_work_id: createdWorkId } }).catch(() => {})
  }
  if (createdTemplateId) {
    await models.DiyTemplate.destroy({ where: { diy_template_id: createdTemplateId } }).catch(
      () => {}
    )
  }
})

describe('DIY 款式模板 — 管理端 API', () => {
  test('GET /api/v4/diy/templates — 获取用户端模板列表（公开接口）', async () => {
    const res = await request(app).get('/api/v4/diy/templates')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)

    // 迁移后无图模板已降级为 draft，用户端列表可能为空
    if (res.body.data.length > 0) {
      const tpl = res.body.data[0]
      expect(tpl).toHaveProperty('diy_template_id')
      expect(tpl).toHaveProperty('template_code')
      expect(tpl).toHaveProperty('display_name')
      expect(tpl).toHaveProperty('category_id')
      expect(tpl).toHaveProperty('layout')
      expect(tpl).toHaveProperty('bead_rules')
      expect(tpl).toHaveProperty('material_group_codes')
      expect(tpl).toHaveProperty('status')
      expect(tpl).toHaveProperty('is_enabled')
      expect(tpl).toHaveProperty('sort_order')

      // 用户端只返回 published + enabled 的模板
      expect(tpl.status).toBe('published')
      expect(tpl.is_enabled).toBe(true)

      // 验证关联数据
      expect(tpl).toHaveProperty('category')
      if (tpl.category) {
        expect(tpl.category).toHaveProperty('category_id')
        expect(tpl.category).toHaveProperty('category_name')
        expect(tpl.category).toHaveProperty('category_code')
      }
    }
  })

  test('GET /api/v4/diy/templates/:id — 获取模板详情', async () => {
    // 使用管理端列表获取真实 ID（不受 published 过滤影响）
    const listRes = await request(app)
      .get('/api/v4/console/diy/templates')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(listRes.body.data.rows.length).toBeGreaterThan(0)

    const templateId = listRes.body.data.rows[0].diy_template_id
    const res = await request(app).get(`/api/v4/diy/templates/${templateId}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.diy_template_id).toBe(templateId)
    expect(res.body.data).toHaveProperty('layout')
    expect(res.body.data).toHaveProperty('bead_rules')
  })

  test('GET /api/v4/console/diy/templates — 管理端模板列表（需认证）', async () => {
    const res = await request(app)
      .get('/api/v4/console/diy/templates')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('rows')
    expect(res.body.data).toHaveProperty('count')
  })

  test('POST /api/v4/console/diy/templates — 缺少底图时拒绝创建', async () => {
    const res = await request(app)
      .post('/api/v4/console/diy/templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        display_name: '测试模板_缺底图',
        category_id: 191,
        layout: { shape: 'circle', bead_count: 16, radius_x: 100, radius_y: 100 },
        preview_media_id: 1
        // 故意不传 base_image_media_id
      })

    expect(res.body.success).toBe(false)
    expect(res.body.message).toMatch(/底图/)
  })

  test('POST /api/v4/console/diy/templates — 缺少预览图时拒绝创建', async () => {
    const res = await request(app)
      .post('/api/v4/console/diy/templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        display_name: '测试模板_缺预览图',
        category_id: 191,
        layout: { shape: 'circle', bead_count: 16, radius_x: 100, radius_y: 100 },
        base_image_media_id: 1
        // 故意不传 preview_media_id
      })

    expect(res.body.success).toBe(false)
    expect(res.body.message).toMatch(/预览图/)
  })

  test('POST /api/v4/console/diy/templates — 创建模板（含底图+预览图）', async () => {
    const res = await request(app)
      .post('/api/v4/console/diy/templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        display_name: '测试模板_自动化测试',
        category_id: 191, // DIY_BRACELET
        layout: { shape: 'circle', bead_count: 16, radius_x: 100, radius_y: 100 },
        bead_rules: { margin: 8, default_diameter: 10, allowed_diameters: [8, 10, 12] },
        sizing_rules: {
          default_size: 'M',
          size_options: [
            { label: 'S', bead_count: 14 },
            { label: 'M', bead_count: 16 }
          ]
        },
        capacity_rules: { min_beads: 12, max_beads: 20 },
        material_group_codes: ['red', 'blue'],
        sort_order: 99,
        status: 'draft',
        is_enabled: false,
        base_image_media_id: 1,
        preview_media_id: 1
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('diy_template_id')
    expect(res.body.data).toHaveProperty('template_code')
    expect(res.body.data.template_code).toMatch(/^DT/)
    expect(res.body.data.display_name).toBe('测试模板_自动化测试')

    createdTemplateId = res.body.data.diy_template_id
  })

  test('PUT /api/v4/console/diy/templates/:id — 更新模板', async () => {
    expect(createdTemplateId).toBeTruthy()

    const res = await request(app)
      .put(`/api/v4/console/diy/templates/${createdTemplateId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        display_name: '测试模板_已更新',
        status: 'published',
        is_enabled: true
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.display_name).toBe('测试模板_已更新')
    expect(res.body.data.status).toBe('published')
    expect(res.body.data.is_enabled).toBe(true)
  })
})

describe('DIY 用户作品 — 小程序端 API', () => {
  test('POST /api/v4/diy/works — 创建作品草稿', async () => {
    /* 使用测试中创建的模板（含底图+预览图），空设计数据（草稿允许） */
    expect(createdTemplateId).toBeTruthy()

    const res = await request(app)
      .post('/api/v4/diy/works')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        diy_template_id: createdTemplateId,
        work_name: '自动化测试作品',
        design_data: {
          slots: []
        }
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('diy_work_id')
    expect(res.body.data).toHaveProperty('work_code')
    expect(res.body.data.work_code).toMatch(/^DW/)
    expect(res.body.data.work_name).toBe('自动化测试作品')
    expect(res.body.data.status).toBe('draft')
    expect(res.body.data.account_id).toBe(testAccountId)

    createdWorkId = res.body.data.diy_work_id
  })

  test('GET /api/v4/diy/works — 获取用户作品列表', async () => {
    const res = await request(app)
      .get('/api/v4/diy/works')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('rows')
    expect(res.body.data).toHaveProperty('count')

    if (res.body.data.rows.length > 0) {
      const work = res.body.data.rows[0]
      expect(work).toHaveProperty('diy_work_id')
      expect(work).toHaveProperty('work_code')
      expect(work).toHaveProperty('work_name')
      expect(work).toHaveProperty('design_data')
      expect(work).toHaveProperty('status')
      expect(work).toHaveProperty('template')
    }
  })

  test('GET /api/v4/diy/works/:id — 获取作品详情', async () => {
    expect(createdWorkId).toBeTruthy()

    const res = await request(app)
      .get(`/api/v4/diy/works/${createdWorkId}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Number(res.body.data.diy_work_id)).toBe(Number(createdWorkId))
    expect(res.body.data.work_name).toBe('自动化测试作品')
    expect(res.body.data).toHaveProperty('template')
    expect(res.body.data.template).toHaveProperty('diy_template_id')
  })

  test('POST /api/v4/diy/works — 更新已有作品', async () => {
    expect(createdWorkId).toBeTruthy()
    expect(createdTemplateId).toBeTruthy()

    const res = await request(app)
      .post('/api/v4/diy/works')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        diy_work_id: createdWorkId,
        diy_template_id: createdTemplateId,
        work_name: '自动化测试作品_已更新',
        design_data: {
          slots: []
        }
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.work_name).toBe('自动化测试作品_已更新')
  })

  test('DELETE /api/v4/diy/works/:id — 删除草稿作品', async () => {
    expect(createdWorkId).toBeTruthy()

    const res = await request(app)
      .delete(`/api/v4/diy/works/${createdWorkId}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    // 标记已删除，避免 afterAll 重复删除
    createdWorkId = null
  })
})

describe('DIY 整数定价校验', () => {
  test('POST /api/v4/console/diy/materials — 缺少素材图片时拒绝创建', async () => {
    const res = await request(app)
      .post('/api/v4/console/diy/materials')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        material_name: '测试缺图拒绝',
        display_name: '测试缺图拒绝',
        group_code: 'crystal',
        diameter: 8,
        price: 10,
        price_asset_code: 'star_stone'
        // 故意不传 image_media_id
      })

    expect(res.body.success).toBe(false)
    expect(res.body.message).toMatch(/素材图片/)
  })

  test('POST /api/v4/console/diy/materials — 拒绝小数价格', async () => {
    const res = await request(app)
      .post('/api/v4/console/diy/materials')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        material_code: 'test_decimal_reject',
        material_name: '测试小数拒绝',
        display_name: '测试小数拒绝',
        group_code: 'crystal',
        diameter: 8,
        price: 6.5,
        price_asset_code: 'star_stone',
        image_media_id: 1
      })

    expect(res.body.success).toBe(false)
    expect(res.body.message).toMatch(/整数/)
  })

  test('POST /api/v4/console/diy/materials — 接受整数价格（含图片）', async () => {
    const res = await request(app)
      .post('/api/v4/console/diy/materials')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        material_code: 'test_integer_accept_' + Date.now(),
        material_name: '测试整数接受',
        display_name: '测试整数接受',
        group_code: 'crystal',
        diameter: 8,
        price: 7,
        price_asset_code: 'star_stone',
        image_media_id: 1
      })

    expect(res.body.success).toBe(true)

    // 清理测试数据
    if (res.body.data?.diy_material_id) {
      await request(app)
        .delete(`/api/v4/console/diy/materials/${res.body.data.diy_material_id}`)
        .set('Authorization', `Bearer ${adminToken}`)
    }
  })
})

describe('DIY 管理端作品订单接口', () => {
  test('GET /api/v4/console/diy/works/:id/order — 获取关联订单', async () => {
    // 使用已有的 completed 作品 id=35
    const res = await request(app)
      .get('/api/v4/console/diy/works/35/order')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    if (res.body.data) {
      expect(res.body.data.source).toBe('diy')
      expect(res.body.data.order_no).toBeTruthy()
    }
  })

  test('GET /api/v4/console/diy/works/99999/order — 不存在的作品返回 null', async () => {
    const res = await request(app)
      .get('/api/v4/console/diy/works/99999/order')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toBeNull()
  })
})

describe('DIY 模板管理 — 清理', () => {
  test('DELETE /api/v4/console/diy/templates/:id — 删除测试模板', async () => {
    if (!createdTemplateId) return

    const res = await request(app)
      .delete(`/api/v4/console/diy/templates/${createdTemplateId}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    createdTemplateId = null
  })
})

describe('DIY 素材图上传 — trim_transparent 裁剪透明边距', () => {
  const sharp = require('sharp')
  let uploadedMediaId = null

  afterAll(async () => {
    // 清理测试上传的媒体文件
    if (uploadedMediaId) {
      await models.MediaFile.destroy({ where: { media_id: uploadedMediaId } }).catch(() => {})
    }
  })

  test('POST /api/v4/console/media/upload — trim_transparent=true 裁剪 PNG 透明边距', async () => {
    // 生成一张 200×200 的测试 PNG，实际内容只占中间 100×100，四周 50px 透明
    const testImage = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 100,
              height: 100,
              channels: 4,
              background: { r: 255, g: 0, b: 0, alpha: 255 }
            }
          })
            .png()
            .toBuffer(),
          left: 50,
          top: 50
        }
      ])
      .png()
      .toBuffer()

    const res = await request(app)
      .post('/api/v4/console/media/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('folder', 'diy-materials')
      .field('trim_transparent', 'true')
      .attach('image', testImage, 'test_gem_with_margin.png')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('media_id')

    uploadedMediaId = res.body.data.media_id

    // 验证裁剪后的尺寸：应该接近 100×100（trim 后去掉了四周透明区域）
    expect(res.body.data.width).toBeLessThanOrEqual(110) // 允许 trim threshold 误差
    expect(res.body.data.height).toBeLessThanOrEqual(110)
    expect(res.body.data.width).toBeGreaterThanOrEqual(90)
    expect(res.body.data.height).toBeGreaterThanOrEqual(90)
  })

  test('POST /api/v4/console/media/upload — 不传 trim_transparent 时保持原尺寸', async () => {
    // 同样的 200×200 带透明边距的图，不传 trim_transparent
    const testImage = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 100,
              height: 100,
              channels: 4,
              background: { r: 0, g: 255, b: 0, alpha: 255 }
            }
          })
            .png()
            .toBuffer(),
          left: 50,
          top: 50
        }
      ])
      .png()
      .toBuffer()

    const res = await request(app)
      .post('/api/v4/console/media/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('folder', 'diy-materials')
      .attach('image', testImage, 'test_gem_no_trim.png')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    // 不裁剪时保持原始 200×200
    expect(res.body.data.width).toBe(200)
    expect(res.body.data.height).toBe(200)

    // 清理
    if (res.body.data.media_id) {
      await models.MediaFile.destroy({ where: { media_id: res.body.data.media_id } }).catch(
        () => {}
      )
    }
  })
})
