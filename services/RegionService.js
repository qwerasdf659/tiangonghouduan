/**
 * 行政区划服务 - 餐厅积分抽奖系统 V4.0
 *
 * @description 提供省市区街道行政区划的查询和校验功能
 *
 * 业务场景：
 * - 门店管理时的省市区街道级联选择
 * - 门店创建/编辑时的区划代码校验
 * - 区划代码到名称的自动转换
 * - 区划搜索（名称或拼音）
 *
 * 技术特性：
 * - 使用 AdministrativeRegion 模型进行数据查询
 * - 支持层级级联查询（省 → 市 → 区县 → 街道）
 * - 校验区划代码的有效性和层级关系
 * - 自动填充 _name 字段
 *
 * @since 2026-01-12
 * @see docs/省市区级联选择功能设计方案.md
 */

'use strict'

const logger = require('../utils/logger')

/**
 * 行政区划服务类
 */
class RegionService {
  /**
   * 创建 RegionService 实例
   * @param {Object} models - Sequelize 模型集合
   */
  constructor(models) {
    this.models = models
    this.AdministrativeRegion = models.AdministrativeRegion
  }

  /*
   * =================================================================
   * 查询方法
   * =================================================================
   */

  /**
   * 获取所有省级区划列表
   *
   * @returns {Promise<Array>} 省级区划列表
   *
   * @example
   * const provinces = await regionService.getProvinces()
   * // [{ region_code: '110000', region_name: '北京市', ... }, ...]
   */
  async getProvinces() {
    try {
      const provinces = await this.AdministrativeRegion.getProvinces()

      logger.debug('获取省级区划列表', {
        count: provinces.length
      })

      return provinces.map(p => ({
        region_code: p.region_code,
        region_name: p.region_name,
        short_name: p.short_name,
        pinyin: p.pinyin
      }))
    } catch (error) {
      logger.error('获取省级区划列表失败', { error: error.message })
      throw error
    }
  }

  /**
   * 根据父级代码获取子级区划列表
   *
   * @param {string} parentCode - 父级区划代码
   * @returns {Promise<Array>} 子级区划列表
   *
   * @example
   * // 获取北京市下属的区/县
   * const districts = await regionService.getChildren('110000')
   */
  async getChildren(parentCode) {
    if (!parentCode) {
      throw new Error('父级区划代码不能为空')
    }

    try {
      const children = await this.AdministrativeRegion.getChildren(parentCode)

      logger.debug('获取子级区划列表', {
        parent_code: parentCode,
        count: children.length
      })

      return children.map(c => ({
        region_code: c.region_code,
        region_name: c.region_name,
        level: c.level,
        pinyin: c.pinyin
      }))
    } catch (error) {
      logger.error('获取子级区划列表失败', {
        parent_code: parentCode,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 搜索区划（按名称或拼音）
   *
   * @param {string} keyword - 搜索关键词
   * @param {Object} options - 搜索选项
   * @param {number} [options.level] - 限制层级（1=省, 2=市, 3=区县, 4=街道）
   * @param {number} [options.limit=20] - 结果数量限制
   * @returns {Promise<Array>} 匹配的区划列表
   *
   * @example
   * // 搜索包含"海淀"的区划
   * const results = await regionService.search('海淀')
   *
   * // 搜索拼音包含"haidian"的区划
   * const results = await regionService.search('haidian', { limit: 10 })
   */
  async search(keyword, options = {}) {
    if (!keyword || keyword.trim().length < 2) {
      throw new Error('搜索关键词至少需要2个字符')
    }

    try {
      const results = await this.AdministrativeRegion.search(keyword.trim(), options)

      logger.debug('搜索区划', {
        keyword,
        options,
        count: results.length
      })

      return results.map(r => ({
        region_code: r.region_code,
        region_name: r.region_name,
        level: r.level,
        parent_code: r.parent_code,
        pinyin: r.pinyin
      }))
    } catch (error) {
      logger.error('搜索区划失败', {
        keyword,
        options,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 获取区划的完整路径
   *
   * @param {string} regionCode - 区划代码
   * @returns {Promise<string>} 完整路径字符串
   *
   * @example
   * const path = await regionService.getFullPath('110108')
   * // "北京市 > 北京市 > 海淀区"
   */
  async getFullPath(regionCode) {
    if (!regionCode) {
      throw new Error('区划代码不能为空')
    }

    try {
      return await this.AdministrativeRegion.getFullPath(regionCode)
    } catch (error) {
      logger.error('获取区划完整路径失败', {
        region_code: regionCode,
        error: error.message
      })
      throw error
    }
  }

  /*
   * =================================================================
   * 校验方法
   * =================================================================
   */

  /**
   * 校验区划代码是否有效
   *
   * @param {string} regionCode - 区划代码
   * @param {number} [expectedLevel] - 期望的层级
   * @returns {Promise<Object|null>} 区划信息或 null
   *
   * @example
   * const region = await regionService.validateCode('110108', 3)
   * if (!region) {
   *   throw new Error('无效的区县代码')
   * }
   */
  async validateCode(regionCode, expectedLevel = null) {
    if (!regionCode) {
      return null
    }

    try {
      return await this.AdministrativeRegion.validateCode(regionCode, expectedLevel)
    } catch (error) {
      logger.error('校验区划代码失败', {
        region_code: regionCode,
        expected_level: expectedLevel,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 校验门店的省市区街道代码是否有效
   *
   * @param {Object} codes - 区划代码对象
   * @param {string} codes.province_code - 省级代码
   * @param {string} codes.city_code - 市级代码
   * @param {string} codes.district_code - 区县级代码
   * @param {string} codes.street_code - 街道级代码
   * @returns {Promise<Object>} 校验结果，包含有效性和名称信息
   *
   * @example
   * const result = await regionService.validateStoreCodes({
   *   province_code: '110000',
   *   city_code: '110100',
   *   district_code: '110108',
   *   street_code: '110108001'
   * })
   *
   * if (!result.valid) {
   *   throw new Error(result.errors.join(', '))
   * }
   */
  async validateStoreCodes(codes) {
    const errors = []
    const validations = []

    // 必填字段检查
    const requiredFields = [
      { field: 'province_code', level: 1, name: '省级' },
      { field: 'city_code', level: 2, name: '市级' },
      { field: 'district_code', level: 3, name: '区县级' },
      { field: 'street_code', level: 4, name: '街道级' }
    ]

    for (const { field, level, name } of requiredFields) {
      if (!codes[field]) {
        errors.push(`${name}区划代码不能为空`)
      } else {
        validations.push({ field, code: codes[field], level, name })
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors, names: null }
    }

    // 并行校验所有代码
    try {
      const validationPromises = validations.map(async v => {
        const region = await this.validateCode(v.code, v.level)
        return { ...v, region }
      })

      const results = await Promise.all(validationPromises)

      for (const r of results) {
        if (!r.region) {
          errors.push(`无效的${r.name}区划代码: ${r.code}`)
        }
      }

      if (errors.length > 0) {
        return { valid: false, errors, names: null }
      }

      // 校验层级关系（省→市→区县→街道）
      const provinceResult = results.find(r => r.field === 'province_code')
      const cityResult = results.find(r => r.field === 'city_code')
      const districtResult = results.find(r => r.field === 'district_code')
      const streetResult = results.find(r => r.field === 'street_code')

      // 校验市级的父级是省级
      if (cityResult.region.parent_code !== provinceResult.code) {
        errors.push(
          `市级区划"${cityResult.region.region_name}"不属于省级区划"${provinceResult.region.region_name}"`
        )
      }

      // 校验区县级的父级是市级
      if (districtResult.region.parent_code !== cityResult.code) {
        errors.push(
          `区县级区划"${districtResult.region.region_name}"不属于市级区划"${cityResult.region.region_name}"`
        )
      }

      // 校验街道级的父级是区县级
      if (streetResult.region.parent_code !== districtResult.code) {
        errors.push(
          `街道级区划"${streetResult.region.region_name}"不属于区县级区划"${districtResult.region.region_name}"`
        )
      }

      if (errors.length > 0) {
        return { valid: false, errors, names: null }
      }

      // 返回有效的名称信息
      const names = {
        province_code: codes.province_code,
        province_name: provinceResult.region.region_name,
        city_code: codes.city_code,
        city_name: cityResult.region.region_name,
        district_code: codes.district_code,
        district_name: districtResult.region.region_name,
        street_code: codes.street_code,
        street_name: streetResult.region.region_name
      }

      logger.debug('门店区划代码校验通过', { codes, names })

      return { valid: true, errors: [], names }
    } catch (error) {
      logger.error('门店区划代码校验失败', {
        codes,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 根据区划代码获取完整的 code + name 信息
   * （用于门店创建/编辑时自动填充 _name 字段）
   *
   * @param {Object} codes - 区划代码对象
   * @param {string} codes.province_code - 省级代码
   * @param {string} codes.city_code - 市级代码
   * @param {string} codes.district_code - 区县级代码
   * @param {string} codes.street_code - 街道级代码
   * @returns {Promise<Object>} 包含 code 和 name 的完整信息
   *
   * @example
   * const regionInfo = await regionService.getRegionNames({
   *   province_code: '110000',
   *   city_code: '110100',
   *   district_code: '110108',
   *   street_code: '110108001'
   * })
   * // { province_code: '110000', province_name: '北京市', ... }
   */
  async getRegionNames(codes) {
    if (!codes) {
      throw new Error('区划代码不能为空')
    }

    try {
      return await this.AdministrativeRegion.getRegionNames(codes)
    } catch (error) {
      logger.error('获取区划名称失败', {
        codes,
        error: error.message
      })
      throw error
    }
  }

  /*
   * =================================================================
   * 统计方法
   * =================================================================
   */

  /**
   * 获取区划统计信息
   *
   * @returns {Promise<Object>} 统计信息
   *
   * @example
   * const stats = await regionService.getStats()
   * // { total: 45000, provinces: 31, cities: 340, districts: 3000, streets: 41629 }
   */
  async getStats() {
    try {
      // Op保留用于未来扩展复杂查询条件
      const { Op: _Op } = require('sequelize')

      const [total, provinces, cities, districts, streets] = await Promise.all([
        this.AdministrativeRegion.count({ where: { status: 'active' } }),
        this.AdministrativeRegion.count({ where: { level: 1, status: 'active' } }),
        this.AdministrativeRegion.count({ where: { level: 2, status: 'active' } }),
        this.AdministrativeRegion.count({ where: { level: 3, status: 'active' } }),
        this.AdministrativeRegion.count({ where: { level: 4, status: 'active' } })
      ])

      const stats = { total, provinces, cities, districts, streets }

      logger.debug('获取区划统计信息', stats)

      return stats
    } catch (error) {
      logger.error('获取区划统计信息失败', { error: error.message })
      throw error
    }
  }
}

module.exports = RegionService
