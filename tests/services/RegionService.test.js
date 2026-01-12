/**
 * 餐厅积分抽奖系统 V4.2 - RegionService 单元测试
 *
 * 测试范围：
 * - 省市区街道级联查询
 * - 行政区划代码校验
 * - 区划路径查询
 * - 搜索功能
 *
 * 业务场景：
 * - 门店创建时的省市区街道选择
 * - 区域数据标准化和校验
 *
 * @since 2026-01-12
 * @see docs/省市区级联选择功能设计方案.md
 */

'use strict'

const { sequelize } = require('../../models')

/**
 * 通过 ServiceManager 获取服务实例
 * 注意：在 beforeAll 中获取，确保 ServiceManager 已初始化
 */
let RegionService

// 测试超时设置
jest.setTimeout(30000)

describe('RegionService - 行政区划服务', () => {
  // 测试前准备
  beforeAll(async () => {
    // 连接数据库
    await sequelize.authenticate()

    // 通过 ServiceManager 获取服务实例（snake_case key）
    RegionService = global.getTestService('region')

    // 验证服务获取成功
    if (!RegionService) {
      throw new Error('RegionService 未注册到 ServiceManager')
    }
  })

  // 测试后关闭连接
  afterAll(async () => {
    await sequelize.close()
  })

  // ==================== 省级列表查询测试 ====================

  describe('getProvinces - 获取省级列表', () => {
    it('应该返回所有省级行政区（34个，含港澳台）', async () => {
      // 执行查询
      const provinces = await RegionService.getProvinces()

      // 验证返回类型
      expect(Array.isArray(provinces)).toBe(true)

      // 验证数量（31大陆 + 港澳台 = 34）
      expect(provinces.length).toBe(34)

      // 验证数据结构（服务只返回 region_code, region_name, short_name, pinyin）
      if (provinces.length > 0) {
        const province = provinces[0]
        expect(province).toHaveProperty('region_code')
        expect(province).toHaveProperty('region_name')
        // 注：服务层不返回 level 字段（减少数据量，省级固定为 level=1）
      }
    })

    it('省级数据应该包含简称和拼音', async () => {
      // 执行查询
      const provinces = await RegionService.getProvinces()

      // 验证北京市（11）
      const beijing = provinces.find(p => p.region_code === '11')
      expect(beijing).toBeDefined()
      expect(beijing.region_name).toBe('北京市')
      expect(beijing.short_name).toBe('京')
      expect(beijing.pinyin).toBe('beijing')
    })

    it('应该包含港澳台地区', async () => {
      // 执行查询
      const provinces = await RegionService.getProvinces()

      // 验证台湾（71）
      const taiwan = provinces.find(p => p.region_code === '71')
      expect(taiwan).toBeDefined()
      expect(taiwan.region_name).toBe('台湾省')

      // 验证香港（81）
      const hongkong = provinces.find(p => p.region_code === '81')
      expect(hongkong).toBeDefined()
      expect(hongkong.region_name).toBe('香港特别行政区')

      // 验证澳门（82）
      const macau = provinces.find(p => p.region_code === '82')
      expect(macau).toBeDefined()
      expect(macau.region_name).toBe('澳门特别行政区')
    })
  })

  // ==================== 子级区划查询测试 ====================

  describe('getChildren - 获取子级区划', () => {
    it('应该返回北京市的市辖区列表', async () => {
      // 查询北京市（11）的子级
      const children = await RegionService.getChildren('11')

      // 验证返回类型
      expect(Array.isArray(children)).toBe(true)

      // 北京应该有市辖区（如 1101 市辖区）
      expect(children.length).toBeGreaterThan(0)

      // 验证数据结构（服务返回 region_code, region_name, level, pinyin）
      children.forEach(child => {
        expect(child).toHaveProperty('region_code')
        expect(child).toHaveProperty('region_name')
        expect(child.level).toBe(2)
      })
    })

    it('应该返回广东省的地级市列表', async () => {
      // 查询广东省（44）的子级
      const children = await RegionService.getChildren('44')

      // 验证返回类型
      expect(Array.isArray(children)).toBe(true)

      // 广东省应该有多个地级市
      expect(children.length).toBeGreaterThan(10) // 广东有21个地级市

      // 验证包含广州市（4401）
      const guangzhou = children.find(c => c.region_code === '4401')
      expect(guangzhou).toBeDefined()
      expect(guangzhou.region_name).toBe('广州市')
    })

    it('应该返回区县级的街道列表', async () => {
      // 查询东城区（110101）的街道
      const streets = await RegionService.getChildren('110101')

      // 验证返回类型
      expect(Array.isArray(streets)).toBe(true)

      // 东城区应该有多个街道
      expect(streets.length).toBeGreaterThan(0)

      // 验证数据结构和级别（服务返回 region_code, region_name, level, pinyin）
      if (streets.length > 0) {
        const street = streets[0]
        expect(street).toHaveProperty('region_code')
        expect(street).toHaveProperty('region_name')
        expect(street.level).toBe(4)
        expect(street.region_code.length).toBe(9) // 街道代码9位
      }
    })

    it('查询不存在的区划代码应该返回空数组', async () => {
      // 查询不存在的区划代码
      const children = await RegionService.getChildren('999999')

      // 应该返回空数组
      expect(Array.isArray(children)).toBe(true)
      expect(children.length).toBe(0)
    })
  })

  // ==================== 区划代码校验测试 ====================

  describe('validateCode - 校验区划代码', () => {
    it('应该验证有效的省级代码', async () => {
      // 验证北京市代码
      const result = await RegionService.validateCode('11')

      // 验证结果（返回 region 对象或 null）
      expect(result).not.toBeNull()
      expect(result.region_name).toBe('北京市')
      expect(result.level).toBe(1)
    })

    it('应该验证有效的市级代码', async () => {
      // 验证广州市代码
      const result = await RegionService.validateCode('4401')

      // 验证结果
      expect(result).not.toBeNull()
      expect(result.region_name).toBe('广州市')
      expect(result.level).toBe(2)
    })

    it('应该验证有效的区县级代码', async () => {
      // 验证天河区代码
      const result = await RegionService.validateCode('440106')

      // 验证结果
      expect(result).not.toBeNull()
      expect(result.region_name).toBe('天河区')
      expect(result.level).toBe(3)
    })

    it('应该验证有效的街道级代码', async () => {
      // 验证东华门街道代码（北京东城区）
      const result = await RegionService.validateCode('110101001')

      // 验证结果
      expect(result).not.toBeNull()
      expect(result.region_name).toBe('东华门街道')
      expect(result.level).toBe(4)
    })

    it('应该返回 null 表示无效的区划代码', async () => {
      // 验证不存在的代码
      const result = await RegionService.validateCode('999999')

      // 验证结果（无效代码返回 null）
      expect(result).toBeNull()
    })
  })

  // ==================== 门店区划代码校验测试 ====================

  describe('validateStoreCodes - 门店区划代码校验', () => {
    it('应该验证完整的省市区街道代码组合', async () => {
      // 北京市 > 市辖区 > 东城区 > 东华门街道
      const codes = {
        province_code: '11',
        city_code: '1101',
        district_code: '110101',
        street_code: '110101001'
      }

      const result = await RegionService.validateStoreCodes(codes)

      // 验证结果
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.names).toHaveProperty('province_name', '北京市')
      expect(result.names).toHaveProperty('city_name', '市辖区')
      expect(result.names).toHaveProperty('district_name', '东城区')
      expect(result.names).toHaveProperty('street_name', '东华门街道')
    })

    it('应该拒绝缺少必填字段的代码组合', async () => {
      // 缺少街道代码
      const codes = {
        province_code: '11',
        city_code: '1101',
        district_code: '110101'
        // street_code: 缺失
      }

      const result = await RegionService.validateStoreCodes(codes)

      // 验证结果
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('应该拒绝无效的区划代码', async () => {
      // 使用不存在的代码
      const codes = {
        province_code: '99', // 不存在的省
        city_code: '9901',
        district_code: '990101',
        street_code: '990101001'
      }

      const result = await RegionService.validateStoreCodes(codes)

      // 验证结果
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('应该拒绝层级关系不正确的代码组合', async () => {
      // 市级不属于该省
      const codes = {
        province_code: '11', // 北京
        city_code: '4401', // 广州市（属于广东，不属于北京）
        district_code: '440106', // 天河区
        street_code: '440106001' // 天河区的街道
      }

      const result = await RegionService.validateStoreCodes(codes)

      // 验证结果
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('应该正确校验港澳台地区的代码', async () => {
      // 香港特别行政区 > 香港岛 > 中西区
      const codes = {
        province_code: '81',
        city_code: '8101',
        district_code: '810101',
        street_code: '810101' // 香港没有街道级，使用区县级作为最细粒度
      }

      const result = await RegionService.validateStoreCodes(codes)

      /*
       * 香港的层级关系与大陆不同，校验逻辑需要处理
       * 这个测试主要验证不会抛出异常
       */
      expect(result).toHaveProperty('valid')
    })
  })

  // ==================== 搜索功能测试 ====================

  describe('search - 搜索行政区划', () => {
    it('应该能搜索到"北京"', async () => {
      // 搜索北京
      const results = await RegionService.search('北京')

      // 验证结果
      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBeGreaterThan(0)

      // 应该包含北京市
      const beijing = results.find(r => r.region_name === '北京市' && r.level === 1)
      expect(beijing).toBeDefined()
    })

    it('应该能搜索到"天河"', async () => {
      // 搜索天河
      const results = await RegionService.search('天河')

      // 验证结果
      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBeGreaterThan(0)

      // 应该包含天河区
      const tianhe = results.find(r => r.region_name.includes('天河'))
      expect(tianhe).toBeDefined()
    })

    it('搜索空字符串应该抛出错误', async () => {
      // 搜索空字符串应该抛出错误（关键词至少需要2个字符）
      await expect(RegionService.search('')).rejects.toThrow('搜索关键词至少需要2个字符')
    })

    it('搜索单个字符应该抛出错误', async () => {
      // 搜索单个字符应该抛出错误
      await expect(RegionService.search('北')).rejects.toThrow('搜索关键词至少需要2个字符')
    })

    it('搜索不存在的区划应该返回空数组', async () => {
      // 搜索不存在的区划名
      const results = await RegionService.search('不存在的区划名称xyz')

      // 验证结果
      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBe(0)
    })
  })

  // ==================== 完整路径查询测试 ====================

  describe('getFullPath - 获取完整路径', () => {
    it('应该返回街道的完整路径字符串', async () => {
      // 查询东华门街道的完整路径
      const path = await RegionService.getFullPath('110101001')

      // 验证路径结构（返回字符串，格式：省 > 市 > 区 > 街道）
      expect(typeof path).toBe('string')
      expect(path).toContain('北京市')
      expect(path).toContain('东城区')
      expect(path).toContain('东华门街道')
      expect(path.split(' > ').length).toBe(4) // 省-市-区-街道
    })

    it('应该返回省级的完整路径（只有省名）', async () => {
      // 查询北京市的完整路径
      const path = await RegionService.getFullPath('11')

      // 验证路径结构
      expect(typeof path).toBe('string')
      expect(path).toBe('北京市')
    })

    it('查询不存在的区划代码应该返回空字符串', async () => {
      // 查询不存在的代码
      const path = await RegionService.getFullPath('999999999')

      // 验证结果（不存在的代码返回空字符串）
      expect(typeof path).toBe('string')
      expect(path).toBe('')
    })
  })

  // ==================== 统计信息测试 ====================

  describe('getStats - 获取统计信息', () => {
    it('应该返回各级别的数据统计', async () => {
      // 获取统计信息
      const stats = await RegionService.getStats()

      // 验证返回结构
      expect(stats).toHaveProperty('total')
      expect(stats).toHaveProperty('provinces')
      expect(stats).toHaveProperty('cities')
      expect(stats).toHaveProperty('districts')
      expect(stats).toHaveProperty('streets')

      // 验证数据
      expect(stats.provinces).toBe(34) // 31省 + 港澳台
      expect(stats.cities).toBeGreaterThan(300) // 300+市级
      expect(stats.districts).toBeGreaterThan(2900) // 2900+区县
      expect(stats.streets).toBeGreaterThan(40000) // 40000+街道
      expect(stats.total).toBe(stats.provinces + stats.cities + stats.districts + stats.streets)
    })
  })

  // ==================== 性能测试 ====================

  describe('性能测试', () => {
    it('省级列表查询应该在500ms内完成', async () => {
      const start = Date.now()
      await RegionService.getProvinces()
      const duration = Date.now() - start

      expect(duration).toBeLessThan(500)
    })

    it('子级查询应该在500ms内完成', async () => {
      const start = Date.now()
      await RegionService.getChildren('44') // 广东省的市级列表
      const duration = Date.now() - start

      expect(duration).toBeLessThan(500)
    })

    it('搜索功能应该在1秒内完成', async () => {
      const start = Date.now()
      await RegionService.search('北京')
      const duration = Date.now() - start

      expect(duration).toBeLessThan(1000)
    })
  })
})
