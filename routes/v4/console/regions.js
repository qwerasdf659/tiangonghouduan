/**
 * 行政区划管理路由 - 餐厅积分抽奖系统 V4.0
 *
 * @description 提供省市区街道行政区划的查询接口
 *              用于门店管理中的级联选择器
 *
 * 业务场景：
 * - 获取省级列表（级联选择器第一级）
 * - 根据父级代码获取子级列表（级联选择器联动）
 * - 区划搜索（按名称或拼音）
 * - 区划统计信息查询
 *
 * 技术特性：
 * - 仅限管理员访问（通过 requireRoleLevel(100)）
 * - 使用 RegionService 进行业务处理
 * - 统一 ApiResponse 响应格式
 *
 * @since 2026-01-12
 * @see docs/省市区级联选择功能设计方案.md
 */

'use strict'

const express = require('express')
const router = express.Router()
const ServiceManager = require('../../../services')
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const logger = require('../../../utils/logger').logger

/*
 * =================================================================
 * 中间件配置
 * =================================================================
 */

// 所有路由需要登录并具有管理员权限
router.use(authenticateToken)
router.use(requireRoleLevel(100))

/*
 * =================================================================
 * 查询接口
 * =================================================================
 */

/**
 * @api {get} /api/v4/console/regions/provinces 获取省级区划列表
 * @apiName GetProvinces
 * @apiGroup Regions
 * @apiVersion 4.0.0
 *
 * @apiDescription 获取所有省级行政区划列表（省、直辖市、自治区）
 *                 用于级联选择器的第一级选项
 *
 * @apiSuccess {boolean} success 是否成功
 * @apiSuccess {string} code 业务码
 * @apiSuccess {string} message 消息
 * @apiSuccess {Array} data 省级区划列表
 * @apiSuccess {string} data.region_code 区划代码
 * @apiSuccess {string} data.region_name 区划名称
 * @apiSuccess {string} data.short_name 简称
 * @apiSuccess {string} data.pinyin 拼音
 *
 * @apiSuccessExample {json} 成功响应:
 * {
 *   "success": true,
 *   "code": "SUCCESS",
 *   "message": "获取省级区划列表成功",
 *   "data": [
 *     { "region_code": "110000", "region_name": "北京市", "short_name": "京", "pinyin": "beijing" },
 *     { "region_code": "120000", "region_name": "天津市", "short_name": "津", "pinyin": "tianjin" }
 *   ]
 * }
 */
router.get('/provinces', async (req, res) => {
  try {
    const regionService = ServiceManager.getService('region')
    const provinces = await regionService.getProvinces()

    return res.apiSuccess(provinces, '获取省级区划列表成功')
  } catch (error) {
    logger.error('获取省级区划列表失败', {
      error: error.message,
      user_id: req.user?.user_id
    })

    return res.apiError(error.message, 'REGION_QUERY_FAILED')
  }
})

/**
 * @api {get} /api/v4/console/regions/children/:parent_code 获取子级区划列表
 * @apiName GetRegionChildren
 * @apiGroup Regions
 * @apiVersion 4.0.0
 *
 * @apiDescription 根据父级区划代码获取子级区划列表
 *                 用于级联选择器的联动加载
 *
 * @apiParam {string} parent_code 父级区划代码
 *
 * @apiSuccess {boolean} success 是否成功
 * @apiSuccess {string} code 业务码
 * @apiSuccess {string} message 消息
 * @apiSuccess {Array} data 子级区划列表
 * @apiSuccess {string} data.region_code 区划代码
 * @apiSuccess {string} data.region_name 区划名称
 * @apiSuccess {number} data.level 层级
 * @apiSuccess {string} data.pinyin 拼音
 *
 * @apiSuccessExample {json} 成功响应:
 * {
 *   "success": true,
 *   "code": "SUCCESS",
 *   "message": "获取子级区划列表成功",
 *   "data": [
 *     { "region_code": "110101", "region_name": "东城区", "level": 3, "pinyin": "dongcheng" },
 *     { "region_code": "110102", "region_name": "西城区", "level": 3, "pinyin": "xicheng" }
 *   ]
 * }
 *
 * @apiError (400) INVALID_PARAMS 缺少父级区划代码
 */
router.get('/children/:parent_code', async (req, res) => {
  try {
    const { parent_code } = req.params

    if (!parent_code) {
      return res.apiError('缺少父级区划代码', 'INVALID_PARAMS', null, 400)
    }

    const regionService = ServiceManager.getService('region')
    const children = await regionService.getChildren(parent_code)

    return res.apiSuccess(children, '获取子级区划列表成功')
  } catch (error) {
    logger.error('获取子级区划列表失败', {
      parent_code: req.params.parent_code,
      error: error.message,
      user_id: req.user?.user_id
    })

    return res.apiError(error.message, 'REGION_QUERY_FAILED')
  }
})

/**
 * @api {get} /api/v4/console/regions/search 搜索区划
 * @apiName SearchRegions
 * @apiGroup Regions
 * @apiVersion 4.0.0
 *
 * @apiDescription 按名称或拼音搜索行政区划
 *                 用于快速定位区域
 *
 * @apiQuery {string} keyword 搜索关键词（至少2个字符）
 * @apiQuery {number} [level] 限制层级（1=省, 2=市, 3=区县, 4=街道）
 * @apiQuery {number} [limit=20] 结果数量限制
 *
 * @apiSuccess {boolean} success 是否成功
 * @apiSuccess {string} code 业务码
 * @apiSuccess {string} message 消息
 * @apiSuccess {Array} data 搜索结果列表
 *
 * @apiSuccessExample {json} 成功响应:
 * {
 *   "success": true,
 *   "code": "SUCCESS",
 *   "message": "搜索区划成功",
 *   "data": [
 *     { "region_code": "110108", "region_name": "海淀区", "level": 3, "parent_code": "110100", "pinyin": "haidian" }
 *   ]
 * }
 *
 * @apiError (400) INVALID_PARAMS 搜索关键词不能为空或少于2个字符
 */
router.get('/search', async (req, res) => {
  try {
    const { keyword, level, limit } = req.query

    if (!keyword || keyword.trim().length < 2) {
      return res.apiError('搜索关键词至少需要2个字符', 'INVALID_PARAMS', null, 400)
    }

    const options = {}
    if (level) {
      options.level = parseInt(level, 10)
    }
    if (limit) {
      options.limit = parseInt(limit, 10)
    }

    const regionService = ServiceManager.getService('region')
    const results = await regionService.search(keyword.trim(), options)

    return res.apiSuccess(results, '搜索区划成功')
  } catch (error) {
    logger.error('搜索区划失败', {
      keyword: req.query.keyword,
      error: error.message,
      user_id: req.user?.user_id
    })

    return res.apiError(error.message, 'REGION_SEARCH_FAILED')
  }
})

/**
 * @api {get} /api/v4/console/regions/path/:region_code 获取区划完整路径
 * @apiName GetRegionPath
 * @apiGroup Regions
 * @apiVersion 4.0.0
 *
 * @apiDescription 获取区划的完整层级路径
 *                 如：北京市 > 北京市 > 海淀区 > 万寿路街道
 *
 * @apiParam {string} region_code 区划代码
 *
 * @apiSuccess {boolean} success 是否成功
 * @apiSuccess {string} code 业务码
 * @apiSuccess {string} message 消息
 * @apiSuccess {Object} data 路径信息
 * @apiSuccess {string} data.region_code 区划代码
 * @apiSuccess {string} data.full_path 完整路径字符串
 *
 * @apiSuccessExample {json} 成功响应:
 * {
 *   "success": true,
 *   "code": "SUCCESS",
 *   "message": "获取区划完整路径成功",
 *   "data": {
 *     "region_code": "110108001",
 *     "full_path": "北京市 > 北京市 > 海淀区 > 万寿路街道"
 *   }
 * }
 */
router.get('/path/:region_code', async (req, res) => {
  try {
    const { region_code } = req.params

    if (!region_code) {
      return res.apiError('缺少区划代码', 'INVALID_PARAMS', null, 400)
    }

    const regionService = ServiceManager.getService('region')
    const fullPath = await regionService.getFullPath(region_code)

    return res.apiSuccess(
      {
        region_code,
        full_path: fullPath
      },
      '获取区划完整路径成功'
    )
  } catch (error) {
    logger.error('获取区划完整路径失败', {
      region_code: req.params.region_code,
      error: error.message,
      user_id: req.user?.user_id
    })

    return res.apiError(error.message, 'REGION_PATH_FAILED')
  }
})

/**
 * @api {get} /api/v4/console/regions/stats 获取区划统计信息
 * @apiName GetRegionStats
 * @apiGroup Regions
 * @apiVersion 4.0.0
 *
 * @apiDescription 获取行政区划的统计信息
 *                 包括各层级的数量统计
 *
 * @apiSuccess {boolean} success 是否成功
 * @apiSuccess {string} code 业务码
 * @apiSuccess {string} message 消息
 * @apiSuccess {Object} data 统计信息
 * @apiSuccess {number} data.total 总数量
 * @apiSuccess {number} data.provinces 省级数量
 * @apiSuccess {number} data.cities 市级数量
 * @apiSuccess {number} data.districts 区县级数量
 * @apiSuccess {number} data.streets 街道级数量
 *
 * @apiSuccessExample {json} 成功响应:
 * {
 *   "success": true,
 *   "code": "SUCCESS",
 *   "message": "获取区划统计信息成功",
 *   "data": {
 *     "total": 45000,
 *     "provinces": 31,
 *     "cities": 340,
 *     "districts": 3000,
 *     "streets": 41629
 *   }
 * }
 */
router.get('/stats', async (req, res) => {
  try {
    const regionService = ServiceManager.getService('region')
    const stats = await regionService.getStats()

    return res.apiSuccess(stats, '获取区划统计信息成功')
  } catch (error) {
    logger.error('获取区划统计信息失败', {
      error: error.message,
      user_id: req.user?.user_id
    })

    return res.apiError(error.message, 'REGION_STATS_FAILED')
  }
})

/**
 * @api {post} /api/v4/console/regions/validate 校验区划代码
 * @apiName ValidateRegionCodes
 * @apiGroup Regions
 * @apiVersion 4.0.0
 *
 * @apiDescription 校验门店的省市区街道代码是否有效
 *                 用于门店创建/编辑前的预校验
 *
 * @apiBody {string} province_code 省级区划代码
 * @apiBody {string} city_code 市级区划代码
 * @apiBody {string} district_code 区县级区划代码
 * @apiBody {string} street_code 街道级区划代码
 *
 * @apiSuccess {boolean} success 是否成功
 * @apiSuccess {string} code 业务码
 * @apiSuccess {string} message 消息
 * @apiSuccess {Object} data 校验结果
 * @apiSuccess {boolean} data.valid 是否有效
 * @apiSuccess {Array} data.errors 错误信息列表（如有）
 * @apiSuccess {Object} data.names 区划名称信息（校验通过时）
 *
 * @apiSuccessExample {json} 校验通过:
 * {
 *   "success": true,
 *   "code": "SUCCESS",
 *   "message": "区划代码校验通过",
 *   "data": {
 *     "valid": true,
 *     "errors": [],
 *     "names": {
 *       "province_code": "110000",
 *       "province_name": "北京市",
 *       "city_code": "110100",
 *       "city_name": "北京市",
 *       "district_code": "110108",
 *       "district_name": "海淀区",
 *       "street_code": "110108001",
 *       "street_name": "万寿路街道"
 *     }
 *   }
 * }
 *
 * @apiSuccessExample {json} 校验失败:
 * {
 *   "success": true,
 *   "code": "SUCCESS",
 *   "message": "区划代码校验完成",
 *   "data": {
 *     "valid": false,
 *     "errors": ["无效的街道级区划代码: 999999999"],
 *     "names": null
 *   }
 * }
 */
router.post('/validate', async (req, res) => {
  try {
    const { province_code, city_code, district_code, street_code } = req.body

    const regionService = ServiceManager.getService('region')
    const result = await regionService.validateStoreCodes({
      province_code,
      city_code,
      district_code,
      street_code
    })

    const message = result.valid ? '区划代码校验通过' : '区划代码校验完成'

    return res.apiSuccess(result, message)
  } catch (error) {
    logger.error('区划代码校验失败', {
      body: req.body,
      error: error.message,
      user_id: req.user?.user_id
    })

    return res.apiError(error.message, 'REGION_VALIDATE_FAILED')
  }
})

module.exports = router
