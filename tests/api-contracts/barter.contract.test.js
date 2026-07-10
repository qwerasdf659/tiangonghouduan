/**
 * API契约测试 - 以物易物模块（Barter / B2C 官方合成）
 *
 * 覆盖范围（合规整改 §10.15 阶段六 Step 18 + 工程加固 §9-7 成功路径兜底，2026-07-10）：
 * - GET  /api/v4/exchange/barter/recipes  - 配方列表（登录可见）
 * - POST /api/v4/exchange/barter          - 执行以物易物
 *
 * 用例分组：
 * 1. 拒绝路径（鉴权/幂等键/参数/配方不存在）——路由层契约
 * 2. 成功路径（券产出即时 completed + mint 进背包）——业务闭环
 * 3. 幂等重放（同 Idempotency-Key 重放返回同结果）
 * 4. 限量拦截（per_user_limit 超限拒绝，拍板⑬-(c)）
 * 5. 方向守卫（产出价值高于投入拒绝，BARTER_DIRECTION_UPWARD_FORBIDDEN）
 * 6. 实物履约分流（拍板⑩：实物产出无地址拒绝 / 带地址走 pending 发货链且不 mint 背包）
 *
 * 测试原则：
 * - 不依赖 mock 数据：夹具经真实业务链创建（配方走 BarterService.saveRecipes、
 *   旧物走 ItemService.mintItem、地址走 UserAddress 模型），afterAll 恢复/清理；
 * - 不硬编码业务数据：模板取自真实库（按 template_code 查询），配方码带时间戳隔离；
 * - 使用 snake_case 命名规范。
 *
 * 创建时间：2026-06-05；成功路径补齐：2026-07-10（换物快递改造 §1.4 前置兜底）
 * @module tests/api-contracts/barter.contract.test
 */

'use strict'

const request = require('supertest')
const models = require('../../models')
const { sequelize } = models
const TransactionManager = require('../../utils/TransactionManager')
const ItemService = require('../../services/asset/ItemService')
const ProductCodeGenerator = require('../../utils/ProductCodeGenerator')

/** Express应用实例 */
let app
/** 用户认证令牌 */
let access_token
/** 测试用户ID（13612227910 登录后取真实值） */
let test_user_id

/** 夹具唯一标识（时间戳隔离，避免并行/重复运行冲突） */
const FIXTURE_TS = Date.now()
/** 券产出配方码（成功路径 + 幂等重放 + 限量拦截共用，per_user_limit=2） */
const RECIPE_VOUCHER = `test_barter_voucher_${FIXTURE_TS}`
/** 方向守卫配方码（产出价值高于投入，应拒绝） */
const RECIPE_UPWARD = `test_barter_upward_${FIXTURE_TS}`
/** 实物产出配方码（拍板⑩快递履约分流） */
const RECIPE_PHYSICAL = `test_barter_physical_${FIXTURE_TS}`

/** 夹具引用（afterAll 清理用） */
const fixtures = {
  original_recipes_row: null, // 原 barter_recipes 配置（null=原本不存在）
  voucher_output_item_id: null, // 券路径用产出商品（挂真实券模板）
  high_price_template_id: null, // 方向守卫用高价测试模板
  upward_exchange_item_id: null, // 方向守卫用产出商品
  physical_exchange_item_id: null, // 实物履约用产出商品
  no_template_output_item_id: null, // 产出模板守卫用无模板商品（应被拒绝）
  address_id: null, // 测试收货地址
  minted_item_ids: [] // 为用户铸造的旧物（投入换物）
}

/** 旧物模板：真实库任一启用券模板（投入与产出同模板 → 价值恒等，方向恒合法） */
let voucher_template
/** 实物模板：home_towel_set（毛巾礼盒 product，reference_price_points=100） */
let towel_template
/** 券产出标的：挂券模板的测试商品（产出必须挂模板——BARTER_OUTPUT_TEMPLATE_MISSING 守卫） */
let voucher_output_item

jest.setTimeout(60000)

describe('API契约测试 - 以物易物 (/api/v4/exchange/barter)', () => {
  beforeAll(async () => {
    app = require('../../app')
    await sequelize.authenticate()

    const { initializeTestServiceManager } = require('../helpers/UnifiedTestManager')
    const sm = await initializeTestServiceManager()
    app.locals.services = app.locals.services || {
      getService: key => sm.getService(key),
      getAllServices: () => sm._services,
      models
    }

    const login_response = await request(app).post('/api/v4/auth/login').send({
      mobile: '13612227910',
      verification_code: '123456'
    })
    if (login_response.body.success) {
      access_token = login_response.body.data.access_token
      test_user_id = login_response.body.data.user?.user_id || null
    } else {
      console.warn('⚠️ [Barter Test] 登录失败:', login_response.body.code)
    }

    /*
     * ===== 夹具准备（真实业务链创建，snake_case） =====
     * 1. 模板：动态取真实库已启用券模板（投入与产出用同一模板 → 价值恒相等，方向恒合法，
     *    不依赖模板具体定价）；毛巾礼盒取真实库模板（product，实物履约路径用）
     */
    voucher_template = await models.ItemTemplate.findOne({
      where: { item_type: 'voucher', is_enabled: 1 }
    })
    towel_template = await models.ItemTemplate.findOne({
      where: { template_code: 'home_towel_set' }
    })

    /*
     * 2. 券产出标的：挂券模板的测试商品。
     * 产出商品必须关联模板（2026-07-11 BARTER_OUTPUT_TEMPLATE_MISSING 守卫）——
     * 模板是方向守卫价值锚与履约分流依据，无模板产出已被业务规则禁止。
     */
    voucher_output_item = await models.ExchangeItem.create({
      item_code: ProductCodeGenerator.generate('SP'),
      item_name: '契约测试-券产出商品',
      description: '换物契约测试夹具（afterAll 清理）',
      item_template_id: voucher_template.item_template_id,
      status: 'active'
    })
    fixtures.voucher_output_item_id = voucher_output_item.exchange_item_id

    // 3. 方向守卫夹具：高价测试模板 + 挂该模板的产出商品（产出价值 999999 > 投入 0 → 应拒绝）
    const high_price_template = await models.ItemTemplate.create({
      template_code: `test_tpl_high_${FIXTURE_TS}`,
      item_type: 'product',
      rarity_code: 'common',
      display_name: '契约测试-高价模板',
      description: '方向守卫测试夹具（afterAll 清理）',
      reference_price_points: 999999,
      is_tradable: 0,
      is_enabled: 1
    })
    fixtures.high_price_template_id = high_price_template.item_template_id

    const upward_item = await models.ExchangeItem.create({
      item_code: ProductCodeGenerator.generate('SP'),
      item_name: '契约测试-高价产出商品',
      description: '方向守卫测试夹具（afterAll 清理）',
      item_template_id: high_price_template.item_template_id,
      status: 'active'
    })
    fixtures.upward_exchange_item_id = upward_item.exchange_item_id

    // 4. 实物履约夹具：挂毛巾礼盒模板（product，价 100）的产出商品
    const physical_item = await models.ExchangeItem.create({
      item_code: ProductCodeGenerator.generate('SP'),
      item_name: '契约测试-实物产出商品',
      description: '快递履约分流测试夹具（afterAll 清理）',
      item_template_id: towel_template.item_template_id,
      status: 'active'
    })
    fixtures.physical_exchange_item_id = physical_item.exchange_item_id

    /*
     * 4.5 产出模板守卫夹具：无模板商品（模型层直建绕过服务校验，
     * 专用于验证 saveRecipes 写入口的 BARTER_OUTPUT_TEMPLATE_MISSING 拒绝）
     */
    const no_template_item = await models.ExchangeItem.create({
      item_code: ProductCodeGenerator.generate('SP'),
      item_name: '契约测试-无模板产出商品',
      description: '产出模板守卫测试夹具（afterAll 清理）',
      item_template_id: null,
      mint_instance: false,
      status: 'active'
    })
    fixtures.no_template_output_item_id = no_template_item.exchange_item_id

    // 5. 测试收货地址（实物产出必填 address_id，校验归属本人）
    const address = await models.UserAddress.create({
      user_id: test_user_id,
      receiver_name: '契约测试收件人',
      receiver_phone: '13612227910',
      province: '广东省',
      city: '深圳市',
      district: '南山区',
      detail_address: '契约测试地址（afterAll 清理）',
      is_default: false
    })
    fixtures.address_id = address.address_id

    // 6. 保存原 barter_recipes 配置并写入测试配方（走真实 saveRecipes 业务链）
    fixtures.original_recipes_row = await models.SystemSettings.findOne({
      where: { category: 'exchange', setting_key: 'barter_recipes' }
    })
    const barter_service = app.locals.services.getService('exchange_barter')
    await TransactionManager.execute(async transaction => {
      return barter_service.saveRecipes(
        [
          {
            recipe_code: RECIPE_VOUCHER,
            name: '契约测试-旧券换新券',
            required_item_template_id: voucher_template.item_template_id,
            required_quantity: 1,
            output_exchange_item_id: voucher_output_item.exchange_item_id,
            is_enabled: true,
            per_user_limit: 2,
            total_limit: 0
          },
          {
            recipe_code: RECIPE_UPWARD,
            name: '契约测试-低价换高价（应被方向守卫拒绝）',
            required_item_template_id: voucher_template.item_template_id,
            required_quantity: 1,
            output_exchange_item_id: upward_item.exchange_item_id,
            is_enabled: true
          },
          {
            recipe_code: RECIPE_PHYSICAL,
            name: '契约测试-毛巾礼盒换新（实物快递履约）',
            required_item_template_id: towel_template.item_template_id,
            required_quantity: 1,
            output_exchange_item_id: physical_item.exchange_item_id,
            is_enabled: true
          }
        ],
        test_user_id,
        { transaction }
      )
    })

    // 7. 为用户铸造投入旧物（真实 ItemService.mintItem，source='test'）
    await TransactionManager.execute(async transaction => {
      // 券模板旧物 ×3（成功 1 + 限量第 2 次成功 1 + 第 3 次超限用 1 + 方向守卫用复用超限那件之前的）
      for (let i = 0; i < 4; i++) {
        // eslint-disable-next-line no-await-in-loop
        const mint_result = await ItemService.mintItem(
          {
            user_id: test_user_id,
            item_type: 'voucher',
            source: 'test',
            source_ref_id: 'barter_contract_test',
            item_name: '契约测试旧券',
            item_description: '换物契约测试旧物',
            item_value: 0,
            item_template_id: voucher_template.item_template_id,
            business_type: 'test_mint',
            idempotency_key: `barter_test_mint_${FIXTURE_TS}_v${i}`
          },
          { transaction }
        )
        fixtures.minted_item_ids.push(mint_result.item.item_id)
      }
      // 实物模板旧物 ×2（无地址拒绝 1 次 + 带地址成功 1 次，拒绝不消耗可复用，备 1 冗余）
      for (let i = 0; i < 2; i++) {
        // eslint-disable-next-line no-await-in-loop
        const mint_result = await ItemService.mintItem(
          {
            user_id: test_user_id,
            item_type: 'product',
            source: 'test',
            source_ref_id: 'barter_contract_test',
            item_name: '毛巾礼盒',
            item_description: '换物契约测试旧物（实物）',
            item_value: 100,
            item_template_id: towel_template.item_template_id,
            business_type: 'test_mint',
            idempotency_key: `barter_test_mint_${FIXTURE_TS}_p${i}`
          },
          { transaction }
        )
        fixtures.minted_item_ids.push(mint_result.item.item_id)
      }
    })
  })

  afterAll(async () => {
    try {
      // 恢复 barter_recipes 原配置（原不存在则删除测试写入的行）
      const current_row = await models.SystemSettings.findOne({
        where: { category: 'exchange', setting_key: 'barter_recipes' }
      })
      if (current_row) {
        if (fixtures.original_recipes_row) {
          await current_row.update({
            setting_value: fixtures.original_recipes_row.setting_value
          })
        } else {
          await current_row.destroy()
        }
      }
      // 清理测试商品/模板/地址（配置类夹具，硬删除）
      if (fixtures.upward_exchange_item_id) {
        await models.ExchangeItem.destroy({
          where: { exchange_item_id: fixtures.upward_exchange_item_id }
        })
      }
      if (fixtures.physical_exchange_item_id) {
        await models.ExchangeItem.destroy({
          where: { exchange_item_id: fixtures.physical_exchange_item_id }
        })
      }
      if (fixtures.no_template_output_item_id) {
        await models.ExchangeItem.destroy({
          where: { exchange_item_id: fixtures.no_template_output_item_id }
        })
      }
      if (fixtures.voucher_output_item_id) {
        await models.ExchangeItem.destroy({
          where: { exchange_item_id: fixtures.voucher_output_item_id }
        })
      }
      if (fixtures.high_price_template_id) {
        await models.ItemTemplate.destroy({
          where: { item_template_id: fixtures.high_price_template_id }
        })
      }
      if (fixtures.address_id) {
        await models.UserAddress.destroy({ where: { address_id: fixtures.address_id } })
      }
      /*
       * 说明：测试产生的 exchange_records（barter 订单）、items 状态流转（used/available）
       * 与 item_ledger 账本是"物品三表互锁"的真实业务结果，保持一致最终态、不做局部删除
       * （删账本会破坏"持有者=账本推导"互锁）。
       */
    } catch (cleanup_error) {
      console.warn('⚠️ [Barter Test] 夹具清理异常:', cleanup_error.message)
    }
    await sequelize.close()
  })

  /**
   * 验证统一响应契约格式
   * @param {Object} body - 响应体
   */
  function validateApiContract(body) {
    expect(body).toHaveProperty('success')
    expect(body).toHaveProperty('code')
    expect(body).toHaveProperty('message')
    expect(body).toHaveProperty('data')
    expect(body).toHaveProperty('timestamp')
    expect(body).toHaveProperty('version')
    expect(body).toHaveProperty('request_id')
    expect(typeof body.success).toBe('boolean')
    expect(typeof body.code).toBe('string')
  }

  /**
   * 执行换物请求（统一封装：Bearer + Idempotency-Key）
   * @param {Object} body - 请求体 { recipe_code, old_item_ids, address_id? }
   * @param {string} idempotency_key - 幂等键
   * @returns {Promise<Object>} supertest 响应
   */
  function postBarter(body, idempotency_key) {
    return request(app)
      .post('/api/v4/exchange/barter')
      .set('Authorization', `Bearer ${access_token}`)
      .set('Idempotency-Key', idempotency_key)
      .send(body)
  }

  /**
   * 取用户当前可投入的旧物实例（按模板，状态 available，排除已用）
   * @param {number} item_template_id - 旧物模板ID
   * @param {Array<number>} exclude_ids - 需排除的实例ID
   * @returns {Promise<number>} 可用旧物 item_id
   */
  async function pickAvailableItem(item_template_id, exclude_ids = []) {
    const account = await models.Account.findOne({
      where: { user_id: test_user_id, account_type: 'user' }
    })
    const item = await models.Item.findOne({
      where: {
        owner_account_id: account.account_id,
        item_template_id,
        status: 'available',
        item_id: fixtures.minted_item_ids.filter(id => !exclude_ids.includes(id))
      }
    })
    return item ? item.item_id : null
  }

  // ==================== GET /barter/recipes ====================

  describe('GET /barter/recipes - 配方列表', () => {
    test('已认证用户应返回配方列表（含测试配方，字段完整）', async () => {
      const response = await request(app)
        .get('/api/v4/exchange/barter/recipes')
        .set('Authorization', `Bearer ${access_token}`)

      expect(response.status).toBe(200)
      validateApiContract(response.body)
      expect(response.body.success).toBe(true)
      expect(Array.isArray(response.body.data.recipes)).toBe(true)

      const voucher_recipe = response.body.data.recipes.find(r => r.recipe_code === RECIPE_VOUCHER)
      expect(voucher_recipe).toBeDefined()
      expect(voucher_recipe.required_item_template_id).toBe(voucher_template.item_template_id)
      expect(voucher_recipe.per_user_limit).toBe(2)
    })

    test('未认证用户应返回 401', async () => {
      const response = await request(app).get('/api/v4/exchange/barter/recipes')
      expect(response.status).toBe(401)
      validateApiContract(response.body)
    })
  })

  // ==================== POST /barter 拒绝路径 ====================

  describe('POST /barter - 拒绝路径（路由契约）', () => {
    test('缺少 Idempotency-Key 应返回 400', async () => {
      const response = await request(app)
        .post('/api/v4/exchange/barter')
        .set('Authorization', `Bearer ${access_token}`)
        .send({ recipe_code: 'whatever', old_item_ids: [1] })

      expect(response.status).toBe(400)
      validateApiContract(response.body)
      expect(response.body.code).toMatch(/IDEMPOTENCY/i)
    })

    test('未认证用户应返回 401', async () => {
      const response = await request(app)
        .post('/api/v4/exchange/barter')
        .set('Idempotency-Key', `barter_test_${FIXTURE_TS}_auth`)
        .send({ recipe_code: 'whatever', old_item_ids: [1] })

      expect(response.status).toBe(401)
      validateApiContract(response.body)
    })

    test('缺少 recipe_code 应返回 400', async () => {
      const response = await postBarter({ old_item_ids: [1] }, `barter_test_${FIXTURE_TS}_norc`)
      expect(response.status).toBe(400)
      validateApiContract(response.body)
    })

    test('old_item_ids 非数组应返回 400', async () => {
      const response = await postBarter(
        { recipe_code: 'whatever', old_item_ids: 'not_array' },
        `barter_test_${FIXTURE_TS}_noarr`
      )
      expect(response.status).toBe(400)
      validateApiContract(response.body)
    })

    test('不存在的配方应返回 BARTER_RECIPE_NOT_FOUND', async () => {
      const response = await postBarter(
        { recipe_code: 'non_existent_recipe_xyz', old_item_ids: [999999999] },
        `barter_test_${FIXTURE_TS}_norecipe`
      )
      validateApiContract(response.body)
      expect(response.body.success).toBe(false)
      expect(response.body.code).toBe('BARTER_RECIPE_NOT_FOUND')
    })
  })

  // ==================== POST /barter 成功路径 + 幂等重放 + 限量 ====================

  describe('POST /barter - 成功路径（券产出即时到账）/ 幂等重放 / 限量拦截', () => {
    /** 首次成功换物的响应（幂等重放对照） */
    let first_success_body
    /** 首次成功使用的幂等键与旧物 */
    const first_idempotency_key = `barter_test_${FIXTURE_TS}_success`
    let first_old_item_id

    test('成功换物：旧物销毁 + 产出券 mint 进背包 + 订单 completed（order_no 前缀 BT）', async () => {
      first_old_item_id = await pickAvailableItem(voucher_template.item_template_id)
      expect(first_old_item_id).not.toBeNull()

      const response = await postBarter(
        { recipe_code: RECIPE_VOUCHER, old_item_ids: [first_old_item_id] },
        first_idempotency_key
      )

      expect(response.status).toBe(200)
      validateApiContract(response.body)
      expect(response.body.success).toBe(true)
      first_success_body = response.body

      const data = response.body.data
      expect(data.order_no).toMatch(/^BT/)
      // 券/道具产出：即时完成 + mint 进背包
      expect(data.order_status).toBe('completed')
      expect(data.consumed_item_ids).toEqual([first_old_item_id])
      expect(data.minted_item).not.toBeNull()
      expect(data.minted_item.item_id).toBeDefined()

      // 数据核对：旧物真销毁（status='used'）
      const consumed_item = await models.Item.findByPk(first_old_item_id)
      expect(consumed_item.status).toBe('used')

      // 数据核对：订单 source='barter'、快照含配方码
      const record = await models.ExchangeRecord.findOne({
        where: { order_no: data.order_no }
      })
      expect(record.source).toBe('barter')
      expect(record.status).toBe('completed')
      expect(record.item_snapshot.recipe_code).toBe(RECIPE_VOUCHER)
    })

    test('幂等重放：同 Idempotency-Key 重放返回同 order_no 且不重复消耗', async () => {
      const replay_response = await postBarter(
        { recipe_code: RECIPE_VOUCHER, old_item_ids: [first_old_item_id] },
        first_idempotency_key
      )

      expect(replay_response.status).toBe(200)
      validateApiContract(replay_response.body)
      expect(replay_response.body.success).toBe(true)
      expect(replay_response.body.data.is_duplicate).toBe(true)
      expect(replay_response.body.data.order_no).toBe(first_success_body.data.order_no)

      // 不产生第二笔 barter 订单（同配方计数仍为 1）
      const record_count = await models.ExchangeRecord.count({
        where: { source: 'barter', idempotency_key: first_idempotency_key }
      })
      expect(record_count).toBe(1)
    })

    test('限量拦截：per_user_limit=2 时第 2 次成功、第 3 次返回 BARTER_PER_USER_LIMIT_EXCEEDED', async () => {
      // 第 2 次（新幂等键 + 新旧物）应成功
      const second_item_id = await pickAvailableItem(voucher_template.item_template_id)
      expect(second_item_id).not.toBeNull()
      const second_response = await postBarter(
        { recipe_code: RECIPE_VOUCHER, old_item_ids: [second_item_id] },
        `barter_test_${FIXTURE_TS}_limit2`
      )
      expect(second_response.body.success).toBe(true)

      // 第 3 次应被每人限换拦截
      const third_item_id = await pickAvailableItem(voucher_template.item_template_id)
      expect(third_item_id).not.toBeNull()
      const third_response = await postBarter(
        { recipe_code: RECIPE_VOUCHER, old_item_ids: [third_item_id] },
        `barter_test_${FIXTURE_TS}_limit3`
      )
      validateApiContract(third_response.body)
      expect(third_response.body.success).toBe(false)
      expect(third_response.body.code).toBe('BARTER_PER_USER_LIMIT_EXCEEDED')

      // 被拦截的旧物不消耗（仍 available）
      const untouched_item = await models.Item.findByPk(third_item_id)
      expect(untouched_item.status).toBe('available')
    })
  })

  // ==================== POST /barter 方向守卫 ====================

  describe('POST /barter - 方向守卫（等价或向下）', () => {
    test('产出价值高于投入应返回 BARTER_DIRECTION_UPWARD_FORBIDDEN 且旧物不消耗', async () => {
      const old_item_id = await pickAvailableItem(voucher_template.item_template_id)
      expect(old_item_id).not.toBeNull()

      const response = await postBarter(
        { recipe_code: RECIPE_UPWARD, old_item_ids: [old_item_id] },
        `barter_test_${FIXTURE_TS}_upward`
      )

      validateApiContract(response.body)
      expect(response.body.success).toBe(false)
      expect(response.body.code).toBe('BARTER_DIRECTION_UPWARD_FORBIDDEN')

      // 事务回滚：旧物保持 available
      const item = await models.Item.findByPk(old_item_id)
      expect(item.status).toBe('available')
    })
  })

  // ==================== POST /barter 实物履约分流（拍板⑩） ====================

  describe('POST /barter - 实物产出快递履约分流（拍板⑩）', () => {
    test('实物产出未携带 address_id 应返回 BARTER_ADDRESS_REQUIRED', async () => {
      const old_item_id = await pickAvailableItem(towel_template.item_template_id)
      expect(old_item_id).not.toBeNull()

      const response = await postBarter(
        { recipe_code: RECIPE_PHYSICAL, old_item_ids: [old_item_id] },
        `barter_test_${FIXTURE_TS}_noaddr`
      )

      validateApiContract(response.body)
      expect(response.body.success).toBe(false)
      expect(response.body.code).toBe('BARTER_ADDRESS_REQUIRED')

      // 拒绝不消耗旧物
      const item = await models.Item.findByPk(old_item_id)
      expect(item.status).toBe('available')
    })

    test('实物产出带 address_id：订单 pending 走发货链、不 mint 进背包、写入地址快照', async () => {
      const old_item_id = await pickAvailableItem(towel_template.item_template_id)
      expect(old_item_id).not.toBeNull()

      const response = await postBarter(
        {
          recipe_code: RECIPE_PHYSICAL,
          old_item_ids: [old_item_id],
          address_id: fixtures.address_id
        },
        `barter_test_${FIXTURE_TS}_physical`
      )

      expect(response.status).toBe(200)
      validateApiContract(response.body)
      expect(response.body.success).toBe(true)

      const data = response.body.data
      expect(data.order_no).toMatch(/^BT/)
      // 实物产出：走 pending→approved→shipped→received 发货链
      expect(data.order_status).toBe('pending')
      // 不 mint 进背包（防"背包能核销 + 快递又寄一件"双重履约）
      expect(data.minted_item).toBeNull()

      // 数据核对：订单 pending + 地址快照已写入 + 无背包物品关联
      const record = await models.ExchangeRecord.findOne({
        where: { order_no: data.order_no }
      })
      expect(record.status).toBe('pending')
      expect(record.source).toBe('barter')
      expect(record.item_id).toBeNull()
      expect(record.address_snapshot).not.toBeNull()
      expect(record.address_snapshot.receiver_name).toBe('契约测试收件人')

      // 旧物已销毁
      const consumed_item = await models.Item.findByPk(old_item_id)
      expect(consumed_item.status).toBe('used')
    })
  })

  // ==================== 产出模板守卫（2026-07-11 根因修复） ====================

  describe('saveRecipes - 产出模板守卫（BARTER_OUTPUT_TEMPLATE_MISSING）', () => {
    test('配方产出商品未挂模板应在保存写入口被拒绝', async () => {
      const barter_service = app.locals.services.getService('exchange_barter')

      await expect(
        TransactionManager.execute(async transaction => {
          return barter_service.saveRecipes(
            [
              {
                recipe_code: `test_barter_notpl_${FIXTURE_TS}`,
                name: '契约测试-产出无模板（应被拒绝）',
                required_item_template_id: towel_template.item_template_id,
                required_quantity: 1,
                output_exchange_item_id: fixtures.no_template_output_item_id,
                is_enabled: true
              }
            ],
            test_user_id,
            { transaction }
          )
        })
      ).rejects.toMatchObject({ code: 'BARTER_OUTPUT_TEMPLATE_MISSING' })
    })

    test('配方产出商品不存在应在保存写入口被拒绝', async () => {
      const barter_service = app.locals.services.getService('exchange_barter')

      await expect(
        TransactionManager.execute(async transaction => {
          return barter_service.saveRecipes(
            [
              {
                recipe_code: `test_barter_ghost_${FIXTURE_TS}`,
                name: '契约测试-产出不存在（应被拒绝）',
                required_item_template_id: towel_template.item_template_id,
                required_quantity: 1,
                output_exchange_item_id: 999999999,
                is_enabled: true
              }
            ],
            test_user_id,
            { transaction }
          )
        })
      ).rejects.toMatchObject({ code: 'BARTER_OUTPUT_NOT_FOUND' })
    })
  })
})
