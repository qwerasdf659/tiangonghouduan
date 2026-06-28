'use strict'

/**
 * 消费「我的提交」多视角解析引擎单元测试（viewResolver）
 *
 * 业务背景：
 * - 「我的提交」页支持 self/store/staff/all 四视角，视角准入由角色等级（role_level）裁决。
 * - 本测试直接验证纯函数引擎 resolveView 的「缺省视角 + 准入裁决」，覆盖真实库 roles 表全部角色档位
 *   （店员20 / 店长40 / 区域80 / 管理员100+），不依赖登录账号，确保角色逻辑完整可验。
 *
 * 真实角色档位（restaurant_points_dev roles 表，2026-06-28 连库核对）：
 *   merchant_staff=20、merchant_manager/sales_staff=40、business_manager=60、
 *   regional_manager=80、admin=100、super_admin=110
 *
 * 测试模型：Claude Opus 4.8
 * 创建时间：2026-06-28 北京时间
 */

const {
  resolveView,
  getAllowedViews,
  getDefaultView
} = require('../../../services/consumption/viewResolver')

describe('消费多视角解析引擎 viewResolver', () => {
  describe('getDefaultView - 缺省视角按角色', () => {
    test('店员级（<40）缺省 self', () => {
      expect(getDefaultView(0)).toBe('self')
      expect(getDefaultView(20)).toBe('self')
      expect(getDefaultView(30)).toBe('self')
    })

    test('店长/经理/区域级（40~99）缺省 store', () => {
      expect(getDefaultView(40)).toBe('store')
      expect(getDefaultView(60)).toBe('store')
      expect(getDefaultView(80)).toBe('store')
    })

    test('管理员级（>=100）缺省 all', () => {
      expect(getDefaultView(100)).toBe('all')
      expect(getDefaultView(110)).toBe('all')
    })
  })

  describe('getAllowedViews - 角色可用视角集合', () => {
    test('店员仅 self', () => {
      expect(getAllowedViews(20)).toEqual(['self'])
    })

    test('店长/区域可用 self/store/staff（不含 all）', () => {
      expect(getAllowedViews(40)).toEqual(['self', 'store', 'staff'])
      expect(getAllowedViews(80)).toEqual(['self', 'store', 'staff'])
    })

    test('管理员可用全部四视角', () => {
      expect(getAllowedViews(100)).toEqual(['self', 'store', 'staff', 'all'])
    })
  })

  describe('resolveView - 缺省解析', () => {
    test('不传 view 时按角色取缺省（店员self/店长store/管理员all）', () => {
      expect(resolveView(undefined, 20)).toMatchObject({ view: 'self', allowed: true })
      expect(resolveView('', 40)).toMatchObject({ view: 'store', allowed: true })
      expect(resolveView(null, 110)).toMatchObject({ view: 'all', allowed: true })
    })
  })

  describe('resolveView - 准入裁决', () => {
    test('店员请求 store/staff/all 一律不允许（allowed=false，回落 self）', () => {
      expect(resolveView('store', 20)).toMatchObject({ view: 'self', allowed: false })
      expect(resolveView('staff', 20)).toMatchObject({ view: 'self', allowed: false })
      expect(resolveView('all', 20)).toMatchObject({ view: 'self', allowed: false })
    })

    test('店员请求 self 允许', () => {
      expect(resolveView('self', 20)).toMatchObject({ view: 'self', allowed: true })
    })

    test('店长可用 self/store/staff，但 all 不允许（回落 store）', () => {
      expect(resolveView('self', 40)).toMatchObject({ view: 'self', allowed: true })
      expect(resolveView('store', 40)).toMatchObject({ view: 'store', allowed: true })
      expect(resolveView('staff', 40)).toMatchObject({ view: 'staff', allowed: true })
      expect(resolveView('all', 40)).toMatchObject({ view: 'store', allowed: false })
    })

    test('管理员四视角全部允许', () => {
      expect(resolveView('self', 100)).toMatchObject({ view: 'self', allowed: true })
      expect(resolveView('store', 100)).toMatchObject({ view: 'store', allowed: true })
      expect(resolveView('staff', 100)).toMatchObject({ view: 'staff', allowed: true })
      expect(resolveView('all', 100)).toMatchObject({ view: 'all', allowed: true })
    })

    test('非法枚举值 allowed=false 并回落角色缺省', () => {
      expect(resolveView('whatever', 100)).toMatchObject({ view: 'all', allowed: false })
      expect(resolveView('SELF', 100)).toMatchObject({ view: 'self', allowed: true }) // 大小写归一
    })
  })
})
