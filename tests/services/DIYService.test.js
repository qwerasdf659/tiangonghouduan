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
 * 测试用户：13612227910（既是用户也是管理员）
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
let realMediaId = null // 库中真实存在的媒体ID（media_id=1 不一定存在，测试用真实值避免外键失败）

beforeAll(async () => {
  // 使用 quick-login 获取 token
  const loginRes = await request(app)
    .post('/api/v4/auth/quick-login')
    .send({ mobile: '13612227910' })

  expect(loginRes.body.success).toBe(true)
  adminToken = loginRes.body.data.access_token

  // 获取 account_id
  const userId = loginRes.body.data.user?.user_id || loginRes.body.data.user_id
  const account = await models.Account.findOne({
    where: { user_id: userId }
  })
  testAccountId = account.account_id

  // 取库中真实存在的媒体ID（供模板底图/预览图外键使用）
  const media = await models.MediaFile.findOne({ order: [['media_id', 'ASC']] })
  realMediaId = media ? media.media_id : null
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
        /* 手围驱动方案权威 Schema（§11.1）：发布护栏要求每档含毫米数据 */
        sizing_rules: {
          default_size: 'M',
          elastic_margin_mm: 15,
          size_options: [
            { label: 'S', bead_count: 14, wrist_size_mm: 140, target_length_mm: 155 },
            { label: 'M', bead_count: 16, wrist_size_mm: 155, target_length_mm: 170 }
          ]
        },
        capacity_rules: { min_beads: 12, max_beads: 20 },
        material_group_codes: ['red', 'blue'],
        sort_order: 99,
        status: 'draft',
        is_enabled: false,
        base_image_media_id: realMediaId,
        preview_media_id: realMediaId
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
        image_media_id: realMediaId
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

describe('DIY 素材展示字段与护栏（拍板决议 11.5-A/B）', () => {
  let createdMaterialId = null

  afterAll(async () => {
    if (createdMaterialId) {
      await models.DiyMaterial.destroy({ where: { diy_material_id: createdMaterialId } }).catch(
        () => {}
      )
    }
  })

  test('POST /api/v4/console/diy/materials — 创建时接受展示/几何新字段并落库', async () => {
    // 取一张真实存在的媒体图（media_id=1 不存在，用库中首个）
    const media = await models.MediaFile.findOne({ order: [['media_id', 'ASC']] })
    expect(media).toBeTruthy()

    const res = await request(app)
      .post('/api/v4/console/diy/materials')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        material_name: '测试管珠',
        display_name: '测试管珠_新字段',
        group_code: 'green',
        diameter: 8,
        shape: 'ellipse',
        item_type: 'accessories',
        material_type: 'metal',
        five_elements: 'wood,water',
        weight: 1.2,
        meaning: '寓意测试文案',
        energy: '活力·测试',
        pairing: '搭配白水晶',
        size_length_mm: 14.5,
        size_width_mm: 4.5,
        bore_orientation: 'along_length',
        price: 12,
        price_asset_code: 'star_stone',
        image_media_id: media.media_id
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    createdMaterialId = res.body.data.diy_material_id

    // 回读数据库确认新字段真实落库（不信任响应，直连模型核对）
    const saved = await models.DiyMaterial.findByPk(createdMaterialId)
    expect(saved.item_type).toBe('accessories')
    expect(saved.material_type).toBe('metal')
    expect(saved.five_elements).toBe('wood,water')
    expect(Number(saved.weight)).toBe(1.2)
    expect(saved.meaning).toBe('寓意测试文案')
    expect(saved.bore_orientation).toBe('along_length')
  })

  test('POST /api/v4/console/diy/materials — 不传 shape 时默认 circle（历史 round bug 已修）', async () => {
    const media = await models.MediaFile.findOne({ order: [['media_id', 'ASC']] })
    const res = await request(app)
      .post('/api/v4/console/diy/materials')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        material_name: '测试默认形状',
        display_name: '测试默认形状_' + Date.now(),
        group_code: 'blue',
        diameter: 10,
        price: 8,
        price_asset_code: 'star_stone',
        image_media_id: media.media_id
        // 故意不传 shape
      })

    expect(res.body.success).toBe(true)
    const saved = await models.DiyMaterial.findByPk(res.body.data.diy_material_id)
    expect(saved.shape).toBe('circle')

    // 清理
    await models.DiyMaterial.destroy({ where: { diy_material_id: res.body.data.diy_material_id } })
  })

  test('POST /api/v4/console/diy/materials — 0 价且启用被价格护栏拒绝（拍板 ⑥）', async () => {
    const media = await models.MediaFile.findOne({ order: [['media_id', 'ASC']] })
    const res = await request(app)
      .post('/api/v4/console/diy/materials')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        material_name: '测试0价启用',
        display_name: '测试0价启用_' + Date.now(),
        group_code: 'green',
        diameter: 8,
        price: 0,
        is_enabled: true,
        price_asset_code: 'star_stone',
        image_media_id: media.media_id
      })

    expect(res.body.success).toBe(false)
    expect(res.body.message).toMatch(/0 价素材禁止启用/)
  })

  test('GET /api/v4/diy/templates/:id/beads — 用户端库存掩码（正数压成1）+ 隐藏对象存储字段', async () => {
    // 用真实 published 模板 #65
    const res = await request(app).get('/api/v4/diy/templates/65/beads')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)

    for (const bead of res.body.data) {
      // 库存掩码：只允许 -1 / 0 / 1 三值
      expect([-1, 0, 1]).toContain(bead.stock)
      // 展示字段存在
      expect(bead).toHaveProperty('item_type')
      expect(bead).toHaveProperty('material_type')
      // 媒体字段脱敏：不下发 object_key / uploaded_by
      if (bead.image_media) {
        expect(bead.image_media).not.toHaveProperty('object_key')
        expect(bead.image_media).not.toHaveProperty('uploaded_by')
        expect(bead.image_media).toHaveProperty('public_url')
      }
    }
  })
})

describe('DIY 素材价格护栏 — 更新路径（拍板决议 11.8-⑥，11.9 复核要求的 update 用例）', () => {
  let guardMaterialId = null

  afterAll(async () => {
    if (guardMaterialId) {
      await models.DiyMaterial.destroy({ where: { diy_material_id: guardMaterialId } }).catch(
        () => {}
      )
    }
  })

  test('PUT /api/v4/console/diy/materials/:id — 已启用素材改成 0 价被拒（按更新后最终状态校验）', async () => {
    const media = await models.MediaFile.findOne({ order: [['media_id', 'ASC']] })
    expect(media).toBeTruthy()

    // 先建一个正常素材（价 15 且启用），作为更新护栏的被测对象
    const createRes = await request(app)
      .post('/api/v4/console/diy/materials')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        material_name: '测试更新护栏',
        display_name: '测试更新护栏_' + Date.now(),
        group_code: 'green',
        diameter: 8,
        price: 15,
        is_enabled: true,
        price_asset_code: 'star_stone',
        image_media_id: media.media_id
      })
    expect(createRes.body.success).toBe(true)
    guardMaterialId = createRes.body.data.diy_material_id

    // 只改价格为 0（不动 is_enabled）→ 最终状态 = 0 价 + 启用 → 护栏拒绝
    const updRes = await request(app)
      .put(`/api/v4/console/diy/materials/${guardMaterialId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ price: 0 })

    expect(updRes.body.success).toBe(false)
    expect(updRes.body.message).toMatch(/0 价素材禁止启用/)

    // 回读数据库确认价格未被改动（护栏在写库前拦截）
    const saved = await models.DiyMaterial.findByPk(guardMaterialId)
    expect(Number(saved.price)).toBe(15)
    expect(Boolean(saved.is_enabled)).toBe(true)
  })

  test('PUT /api/v4/console/diy/materials/:id — 0 价 + 同时停用可通过；再单独启用被拒', async () => {
    expect(guardMaterialId).toBeTruthy()

    // 0 价 + 停用是合法组合（未上架的待定价素材）
    const disableRes = await request(app)
      .put(`/api/v4/console/diy/materials/${guardMaterialId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ price: 0, is_enabled: false })
    expect(disableRes.body.success).toBe(true)

    const saved = await models.DiyMaterial.findByPk(guardMaterialId)
    expect(Number(saved.price)).toBe(0)
    expect(Boolean(saved.is_enabled)).toBe(false)

    // 0 价素材单独启用（不改价）→ 最终状态 = 0 价 + 启用 → 护栏拒绝（#27 绿宝石01 同型事故防复发）
    const enableRes = await request(app)
      .put(`/api/v4/console/diy/materials/${guardMaterialId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_enabled: true })
    expect(enableRes.body.success).toBe(false)
    expect(enableRes.body.message).toMatch(/0 价素材禁止启用/)
  })
})

describe('DIY 作品分享还原 — 非作者只读权限与脱敏（拍板决议 11.8-② / 11.5-E，11.9 复核要求的权限用例）', () => {
  let otherToken = null
  let shareTemplateId = null
  let shareWorkId = null

  beforeAll(async () => {
    // 第二个真实测试账号 13612227930（ID 31），作为「非作者」访问方
    const loginRes = await request(app)
      .post('/api/v4/auth/quick-login')
      .send({ mobile: '13612227930' })
    expect(loginRes.body.success).toBe(true)
    otherToken = loginRes.body.data.access_token

    // 作者（13612227910）建测试模板 + 草稿作品
    const tplRes = await request(app)
      .post('/api/v4/console/diy/templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        display_name: '测试模板_分享还原权限',
        category_id: 191,
        layout: { shape: 'circle', bead_count: 16, radius_x: 100, radius_y: 100 },
        bead_rules: { margin: 8, default_diameter: 10, allowed_diameters: [8, 10] },
        capacity_rules: { min_beads: 12, max_beads: 20 },
        status: 'draft',
        is_enabled: false,
        base_image_media_id: realMediaId,
        preview_media_id: realMediaId
      })
    expect(tplRes.body.success).toBe(true)
    shareTemplateId = tplRes.body.data.diy_template_id

    const workRes = await request(app)
      .post('/api/v4/diy/works')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        diy_template_id: shareTemplateId,
        work_name: '分享还原权限测试作品',
        // 空珠位草稿（材料校验允许空设计保存；本组用例只验证读权限与脱敏，不做计价链路）
        design_data: { mode: 'beading', beads: [] }
      })
    expect(workRes.body.success).toBe(true)
    shareWorkId = workRes.body.data.diy_work_id
  })

  afterAll(async () => {
    if (shareWorkId) {
      await models.DiyWork.destroy({ where: { diy_work_id: shareWorkId } }).catch(() => {})
    }
    if (shareTemplateId) {
      await models.DiyTemplate.destroy({ where: { diy_template_id: shareTemplateId } }).catch(
        () => {}
      )
    }
  })

  test('GET /api/v4/diy/works/:id — 非作者读草稿返回 403（草稿不可被分享还原）', async () => {
    expect(shareWorkId).toBeTruthy()

    const res = await request(app)
      .get(`/api/v4/diy/works/${shareWorkId}`)
      .set('Authorization', `Bearer ${otherToken}`)

    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
  })

  test('GET /api/v4/diy/works/:id — 非作者读 frozen 作品返回脱敏只读版', async () => {
    expect(shareWorkId).toBeTruthy()

    /*
     * 权限口径测试夹具：直接把作品置为 frozen 并写入含 price_snapshot 的冻结快照。
     * diy_works 不在余额/物品互锁表内（此处不触碰 account_asset_balances / item_ledger），
     * confirm 全链路计价冻结另有业务覆盖，本用例只验证读权限与脱敏口径。
     */
    await models.DiyWork.update(
      {
        status: 'frozen',
        frozen_at: new Date(),
        total_cost: {
          payments: [{ asset_code: 'star_stone', amount: 30 }],
          price_snapshot: [{ material_code: 'DM_TEST', price: 30 }]
        }
      },
      { where: { diy_work_id: shareWorkId } }
    )

    const res = await request(app)
      .get(`/api/v4/diy/works/${shareWorkId}`)
      .set('Authorization', `Bearer ${otherToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    // 脱敏：去 account_id / idempotency_key / total_cost.price_snapshot
    expect(res.body.data).not.toHaveProperty('account_id')
    expect(res.body.data).not.toHaveProperty('idempotency_key')
    expect(res.body.data.total_cost).toHaveProperty('payments')
    expect(res.body.data.total_cost).not.toHaveProperty('price_snapshot')

    // 保留分享还原所需字段：design_data / work_name / template
    expect(res.body.data.work_name).toBe('分享还原权限测试作品')
    expect(res.body.data.design_data).toHaveProperty('mode', 'beading')
    expect(res.body.data).toHaveProperty('template')
  })

  test('GET /api/v4/diy/works/:id — 作者本人读 frozen 作品返回完整数据（含 account_id）', async () => {
    expect(shareWorkId).toBeTruthy()

    const res = await request(app)
      .get(`/api/v4/diy/works/${shareWorkId}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data.account_id).toBe(testAccountId)
    // 作者可见完整冻结快照（price_snapshot 不脱敏）
    expect(res.body.data.total_cost).toHaveProperty('price_snapshot')
  })

  test('GET /api/v4/diy/templates/:id/beads — image_media 输出为 11.5-D 最小字段集', async () => {
    // 复核 MediaFile.toSafeJSON 收敛：仅 { media_id, width, height, public_url, thumbnails }
    const res = await request(app).get('/api/v4/diy/templates/65/beads')

    expect(res.status).toBe(200)
    for (const bead of res.body.data) {
      if (bead.image_media) {
        expect(Object.keys(bead.image_media).sort()).toEqual([
          'height',
          'media_id',
          'public_url',
          'thumbnails',
          'width'
        ])
      }
    }
  })
})

describe('DIY 手围驱动定制 — estimate 换算 / 发布护栏 / confirm 硬校验（手围驱动方案 §11）', () => {
  let wristTemplateId = null
  let enabledMaterial = null
  const createdWorkIds = []

  /**
   * 创建一个带手围设计数据的草稿作品（真实 API 链路，非直插库）
   * @param {number} beadCount - 珠子颗数
   * @param {Object|null} size - 手围档位 { label, wrist_size_mm }，null 表示不选手围
   * @returns {Promise<number>} diy_work_id
   */
  async function createWristWork(beadCount, size) {
    const beads = Array.from({ length: beadCount }, (_, i) => ({
      material_code: enabledMaterial.material_code,
      position: i
    }))
    const res = await request(app)
      .post('/api/v4/diy/works')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        diy_template_id: wristTemplateId,
        work_name: `手围校验测试_${beadCount}颗`,
        design_data: { mode: 'beading', ...(size ? { size } : {}), beads }
      })
    expect(res.body.success).toBe(true)
    createdWorkIds.push(res.body.data.diy_work_id)
    return res.body.data.diy_work_id
  }

  beforeAll(async () => {
    /* 用库中真实启用的圆珠素材（沿绳占用 = diameter），不硬编码素材数据 */
    enabledMaterial = await models.DiyMaterial.findOne({
      where: { is_enabled: true, bore_orientation: 'none' }
    })
    expect(enabledMaterial).toBeTruthy()
    expect(Number(enabledMaterial.diameter)).toBeGreaterThan(0)

    /* 串珠测试模板：全分组可用 + 手围档位齐全（capacity 放宽以便构造超长/过短用例） */
    const res = await request(app)
      .post('/api/v4/console/diy/templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        display_name: '测试模板_手围驱动',
        category_id: 191, // DIY_BRACELET
        layout: { shape: 'circle', bead_count: 18, radius_x: 100, radius_y: 100 },
        bead_rules: { margin: 8, default_diameter: 8, allowed_diameters: [6, 8, 10, 12] },
        sizing_rules: {
          default_size: 'S',
          elastic_margin_mm: 15,
          size_options: [
            { label: 'S', bead_count: 18, wrist_size_mm: 140, target_length_mm: 155 },
            { label: 'L', bead_count: 24, wrist_size_mm: 175, target_length_mm: 190 }
          ]
        },
        capacity_rules: { min_beads: 5, max_beads: 60 },
        material_group_codes: [],
        status: 'draft',
        is_enabled: false,
        base_image_media_id: realMediaId,
        preview_media_id: realMediaId
      })
    expect(res.body.success).toBe(true)
    wristTemplateId = res.body.data.diy_template_id
  })

  afterAll(async () => {
    for (const workId of createdWorkIds) {
      // eslint-disable-next-line no-await-in-loop -- 测试清理，顺序删除
      await models.DiyWork.destroy({ where: { diy_work_id: workId } }).catch(() => {})
    }
    if (wristTemplateId) {
      await models.DiyTemplate.destroy({ where: { diy_template_id: wristTemplateId } }).catch(
        () => {}
      )
    }
  })

  test('GET /api/v4/diy/templates/:id/estimate — 匹配档位时用配置的目标周长', async () => {
    const res = await request(app).get(
      `/api/v4/diy/templates/${wristTemplateId}/estimate?wrist_size_mm=140&diameter=8`
    )

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.wrist_size_mm).toBe(140)
    expect(res.body.data.target_length_mm).toBe(155) // 取 S 档配置值，非公式推导
    expect(res.body.data.matched_size_label).toBe('S')
    expect(res.body.data.elastic_margin_mm).toBe(15)
    expect(res.body.data.min_length_mm).toBe(140) // 可戴下限 = 手围
    expect(res.body.data.max_length_mm).toBe(170) // 上限 = 目标 + 余量
    expect(res.body.data.recommend_bead_count).toBe(Math.round(155 / 8)) // 19 颗
  })

  test('GET /api/v4/diy/templates/:id/estimate — 未匹配档位走"手围+余量"公式', async () => {
    const res = await request(app).get(
      `/api/v4/diy/templates/${wristTemplateId}/estimate?wrist_size_mm=150&diameter=8`
    )

    expect(res.body.success).toBe(true)
    expect(res.body.data.target_length_mm).toBe(165) // 150 + 15
    expect(res.body.data.matched_size_label).toBeNull()
    expect(res.body.data.recommend_bead_count).toBe(Math.round(165 / 8)) // 21 颗
  })

  test('GET /api/v4/diy/templates/:id/estimate — 缺参数返回 400', async () => {
    const res = await request(app).get(
      `/api/v4/diy/templates/${wristTemplateId}/estimate?diameter=8`
    )
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toMatch(/wrist_size_mm/)
  })

  test('GET /api/v4/diy/templates/65/estimate — 镶嵌模板拒绝估算（DIY_TEMPLATE_NOT_BEADING）', async () => {
    const res = await request(app).get(
      '/api/v4/diy/templates/65/estimate?wrist_size_mm=150&diameter=8'
    )
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.code).toBe('DIY_TEMPLATE_NOT_BEADING')
  })

  test('GET /api/v4/diy/templates/:id/beads — 下发 cord_occupy_mm 派生字段（圆珠 = diameter）', async () => {
    const res = await request(app).get(`/api/v4/diy/templates/${wristTemplateId}/beads`)

    expect(res.body.success).toBe(true)
    expect(res.body.data.length).toBeGreaterThan(0)
    for (const bead of res.body.data) {
      expect(bead).toHaveProperty('cord_occupy_mm')
      if (bead.bore_orientation === 'none') {
        expect(bead.cord_occupy_mm).toBe(bead.diameter)
      } else if (bead.bore_orientation === 'along_length') {
        expect(bead.cord_occupy_mm).toBe(bead.size_length_mm)
      } else if (bead.bore_orientation === 'along_width') {
        expect(bead.cord_occupy_mm).toBe(bead.size_width_mm)
      }
    }
  })

  test('PUT /api/v4/console/diy/templates/:id/status — 档位缺毫米数据的串珠模板拒绝发布', async () => {
    /* 建一个档位没有任何毫米字段的串珠模板（旧格式），发布应被护栏拦截 */
    const createRes = await request(app)
      .post('/api/v4/console/diy/templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        display_name: '测试模板_缺档位毫米数据',
        category_id: 191,
        layout: { shape: 'circle', bead_count: 16, radius_x: 100, radius_y: 100 },
        sizing_rules: {
          default_size: 'M',
          size_options: [{ label: 'M', bead_count: 16 }] // 故意缺 wrist_size_mm/target_length_mm
        },
        status: 'draft',
        is_enabled: false,
        base_image_media_id: realMediaId,
        preview_media_id: realMediaId
      })
    expect(createRes.body.success).toBe(true)
    const templateId = createRes.body.data.diy_template_id

    const publishRes = await request(app)
      .put(`/api/v4/console/diy/templates/${templateId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' })

    expect(publishRes.body.success).toBe(false)
    expect(publishRes.body.code).toBe('DIY_SIZING_RULES_INCOMPLETE')
    expect(publishRes.body.message).toMatch(/毫米数据/)

    // 清理
    await models.DiyTemplate.destroy({ where: { diy_template_id: templateId } })
  })

  test('POST /works/:id/confirm — 颗数低于容量下限拦截（DIY_BEAD_COUNT_OUT_OF_RANGE）', async () => {
    const workId = await createWristWork(2, null) // 2 颗 < min_beads 5

    const res = await request(app)
      .post(`/api/v4/diy/works/${workId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('DIY_BEAD_COUNT_OUT_OF_RANGE')
    expect(res.body.data.bead_count).toBe(2)
    expect(res.body.data.min_beads).toBe(5)
  })

  test('POST /works/:id/confirm — 成品长度低于可戴下限拦截（DIY_LENGTH_BELOW_MIN）', async () => {
    /* 6 颗珠远短于 L 档手围 175mm（最大珠径 12mm × 6 = 72mm） */
    const workId = await createWristWork(6, { label: 'L', wrist_size_mm: 175 })

    const res = await request(app)
      .post(`/api/v4/diy/works/${workId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('DIY_LENGTH_BELOW_MIN')
    expect(res.body.data.min_length_mm).toBe(175)
    expect(res.body.data.current_length_mm).toBeCloseTo(6 * Number(enabledMaterial.diameter), 1)
  })

  test('POST /works/:id/confirm — 成品长度超可制作上限拦截（DIY_LENGTH_EXCEED_LIMIT）', async () => {
    /* S 档上限 170mm：颗数按真实珠径动态计算到刚好超限（不硬编码颗数） */
    const diameter = Number(enabledMaterial.diameter)
    const overCount = Math.ceil(171 / diameter)
    const workId = await createWristWork(overCount, { label: 'S', wrist_size_mm: 140 })

    const res = await request(app)
      .post(`/api/v4/diy/works/${workId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('DIY_LENGTH_EXCEED_LIMIT')
    expect(res.body.data.max_length_mm).toBe(170)
    expect(res.body.data.current_length_mm).toBeCloseTo(overCount * diameter, 1)
  })

  test('POST /works/:id/confirm — 长度合规时放行进入支付校验（证明校验不误伤）', async () => {
    /* 颗数按真实珠径算到落在 S 档可戴区间 [140, 170] 内 */
    const diameter = Number(enabledMaterial.diameter)
    const okCount = Math.round(155 / diameter)
    const workId = await createWristWork(okCount, { label: 'S', wrist_size_mm: 140 })

    const res = await request(app)
      .post(`/api/v4/diy/works/${workId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({}) // 故意不传 payments

    /* 长度校验通过后才会走到支付校验 → 报"缺少支付方式"而非长度错误码 */
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/支付方式/)
  })

  test('GET /api/v4/console/diy/works/:id — 管理端作品详情返回 computed_length_mm', async () => {
    const diameter = Number(enabledMaterial.diameter)
    const workId = await createWristWork(8, { label: 'S', wrist_size_mm: 140 })

    const res = await request(app)
      .get(`/api/v4/console/diy/works/${workId}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.body.success).toBe(true)
    expect(res.body.data.computed_length_mm).toBeCloseTo(8 * diameter, 1)
    expect(res.body.data.design_data.size.wrist_size_mm).toBe(140)
  })

  test('GET /api/v4/console/diy/stats — 返回手围看板扩展字段（真实聚合非预设值）', async () => {
    const res = await request(app)
      .get('/api/v4/console/diy/stats')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.body.success).toBe(true)
    // 完备度新增计数
    expect(typeof res.body.data.completeness.materials.missing_physical_count).toBe('number')
    expect(typeof res.body.data.completeness.templates.published_missing_sizing_count).toBe(
      'number'
    )
    // 手围档位分布 + 长度偏差分布结构
    expect(res.body.data.size_distribution).toHaveProperty('options')
    expect(res.body.data.size_distribution).toHaveProperty('unset_count')
    expect(Array.isArray(res.body.data.size_distribution.options)).toBe(true)
    expect(res.body.data.length_deviation).toMatchObject({
      within_5mm: expect.any(Number),
      within_10mm: expect.any(Number),
      over_10mm: expect.any(Number),
      unmeasurable: expect.any(Number)
    })
  })

  test('GET /api/v4/diy/templates/1 — 存量手链模板已回填手围毫米字段（迁移验证）', async () => {
    const res = await request(app).get('/api/v4/diy/templates/1')

    expect(res.body.success).toBe(true)
    const sizing = res.body.data.sizing_rules
    expect(sizing.elastic_margin_mm).toBe(15)
    const optionS = sizing.size_options.find(opt => opt.label === 'S')
    expect(optionS.wrist_size_mm).toBe(140)
    expect(optionS.target_length_mm).toBe(155)
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
