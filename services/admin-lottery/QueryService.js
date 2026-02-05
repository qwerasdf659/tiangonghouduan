/**
 * V4.7.0 管理后台抽奖干预规则查询服务（QueryService）
 *
 * 业务场景：管理员查询干预规则列表和详情
 *
 * 核心功能：
 * 1. getInterventionList - 获取干预规则列表
 * 2. getInterventionById - 获取单个干预规则详情
 * 3. _formatInterventionItem - 格式化干预规则列表项（私有）
 * 4. _formatInterventionDetail - 格式化干预规则详情（私有）
 *
 * 拆分日期：2026-01-31
 * 原文件：services/AdminLotteryService.js (1781行)
 */

const models = require('../../models')
const { attachDisplayNames, DICT_TYPES } = require('../../utils/displayNameHelper')
const _logger = require('../../utils/logger').logger

/**
 * 管理后台抽奖干预规则查询服务类
 *
 * @class AdminLotteryQueryService
 */
class AdminLotteryQueryService {
  /**
   * 获取干预规则列表
   *
   * @description 分页查询lottery_management_settings表
   * @param {Object} query - 查询条件
   * @param {number} query.page - 页码，默认1
   * @param {number} query.page_size - 每页数量，默认20
   * @param {string} query.status - 状态筛选：active/used/expired/cancelled
   * @param {string} query.user_search - 用户搜索（用户ID或手机号）
   * @param {string} query.setting_type - 设置类型筛选
   * @returns {Promise<Object>} 干预规则列表和分页信息
   */
  static async getInterventionList(query = {}) {
    const { Op } = require('sequelize')
    const { page = 1, page_size = 20, status, user_search, setting_type } = query

    const where = {}

    // 状态筛选
    if (status) {
      const now = new Date()
      switch (status) {
        case 'active':
          where.status = 'active'
          where[Op.or] = [{ expires_at: null }, { expires_at: { [Op.gt]: now } }]
          break
        case 'used':
          where.status = 'used'
          break
        case 'expired':
          where.status = 'active'
          where.expires_at = { [Op.lte]: now, [Op.ne]: null }
          break
        case 'cancelled':
          where.status = 'cancelled'
          break
        default:
          if (['active', 'used', 'expired', 'cancelled'].includes(status)) {
            where.status = status
          }
      }
    }

    // 设置类型筛选
    if (setting_type) {
      where.setting_type = setting_type
    }

    // 用户搜索
    let userWhere
    if (user_search) {
      if (/^\d+$/.test(user_search)) {
        userWhere = {
          [Op.or]: [
            { user_id: parseInt(user_search) },
            { mobile: { [Op.like]: `%${user_search}%` } }
          ]
        }
      } else {
        userWhere = { mobile: { [Op.like]: `%${user_search}%` } }
      }
    }

    const offset = (parseInt(page) - 1) * parseInt(page_size)
    const limit = parseInt(page_size)

    const { count, rows } = await models.LotteryManagementSetting.findAndCountAll({
      where,
      include: [
        {
          model: models.User,
          as: 'target_user',
          attributes: ['user_id', 'nickname', 'mobile'],
          where: userWhere,
          required: !!userWhere
        },
        {
          model: models.User,
          as: 'admin',
          attributes: ['user_id', 'nickname'],
          required: false
        }
      ],
      order: [['created_at', 'DESC']],
      offset,
      limit
    })

    // 批量查询奖品信息（避免N+1查询）
    const prizeIds = new Set()
    rows.forEach(item => {
      const settingData =
        typeof item.setting_data === 'string'
          ? JSON.parse(item.setting_data)
          : item.setting_data || {}
      if (settingData.lottery_prize_id) {
        prizeIds.add(settingData.lottery_prize_id)
      }
    })

    const prizeMap = new Map()
    if (prizeIds.size > 0) {
      const prizes = await models.LotteryPrize.findAll({
        where: { lottery_prize_id: { [Op.in]: Array.from(prizeIds) } },
        attributes: ['lottery_prize_id', 'prize_name', 'prize_value']
      })
      prizes.forEach(prize => {
        prizeMap.set(prize.lottery_prize_id, {
          lottery_prize_id: prize.lottery_prize_id,
          prize_name: prize.prize_name,
          prize_value: prize.prize_value
        })
      })
    }

    // 格式化干预规则列表项
    const formattedItems = rows.map(item =>
      AdminLotteryQueryService._formatInterventionItem(item, prizeMap)
    )

    // 添加中文显示名称
    await attachDisplayNames(formattedItems, [
      { field: 'status', dictType: DICT_TYPES.MANAGEMENT_SETTING_STATUS },
      { field: 'setting_type', dictType: DICT_TYPES.MANAGEMENT_SETTING_TYPE }
    ])

    return {
      items: formattedItems,
      pagination: {
        page: parseInt(page),
        page_size: parseInt(page_size),
        total: count,
        total_pages: Math.ceil(count / parseInt(page_size))
      }
    }
  }

  /**
   * 获取单个干预规则详情
   *
   * @param {string} settingId - 设置ID
   * @returns {Promise<Object>} 干预规则详情
   * @throws {Error} 规则不存在
   */
  static async getInterventionById(settingId) {
    const setting = await models.LotteryManagementSetting.findByPk(settingId, {
      include: [
        {
          model: models.User,
          as: 'target_user',
          attributes: ['user_id', 'nickname', 'mobile', 'status']
        },
        {
          model: models.User,
          as: 'admin',
          attributes: ['user_id', 'nickname']
        }
      ]
    })

    if (!setting) {
      const error = new Error('干预规则不存在')
      error.code = 'INTERVENTION_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    // 格式化并添加中文显示名称
    const formattedSetting = AdminLotteryQueryService._formatInterventionDetail(setting)
    await attachDisplayNames(formattedSetting, [
      { field: 'status', dictType: DICT_TYPES.MANAGEMENT_SETTING_STATUS },
      { field: 'setting_type', dictType: DICT_TYPES.MANAGEMENT_SETTING_TYPE }
    ])

    return formattedSetting
  }

  /**
   * 格式化干预规则列表项
   *
   * @private
   * @param {Object} item - 数据库记录
   * @param {Map} prizeMap - 奖品ID到奖品信息的映射
   * @returns {Object} 格式化后的项
   */
  static _formatInterventionItem(item, prizeMap = new Map()) {
    const now = new Date()
    const settingData = item.setting_data || {}

    // 计算实际状态
    let displayStatus = item.status
    if (item.status === 'active' && item.expires_at && new Date(item.expires_at) <= now) {
      displayStatus = 'expired'
    }

    // 获取奖品信息
    let prizeInfo = null
    if (settingData.lottery_prize_id) {
      const dbPrize = prizeMap.get(settingData.lottery_prize_id)
      if (dbPrize) {
        prizeInfo = {
          lottery_prize_id: settingData.lottery_prize_id,
          prize_name: dbPrize.prize_name || settingData.prize_name,
          prize_value: dbPrize.prize_value ?? null
        }
      } else if (settingData.prize_name) {
        prizeInfo = {
          lottery_prize_id: settingData.lottery_prize_id,
          prize_name: settingData.prize_name,
          prize_value: settingData.prize_value ?? null
        }
      } else {
        prizeInfo = {
          lottery_prize_id: settingData.lottery_prize_id,
          prize_name: null,
          prize_value: null
        }
      }
    }

    return {
      setting_id: item.lottery_management_setting_id,
      user_id: item.user_id,
      user_info: item.target_user
        ? {
            nickname: item.target_user.nickname,
            mobile: item.target_user.mobile
          }
        : null,
      setting_type: item.setting_type,
      lottery_prize_id: settingData.lottery_prize_id || null,
      prize_info: prizeInfo,
      reason: settingData.reason || null,
      status: displayStatus,
      expires_at: item.expires_at,
      created_at: item.created_at,
      operator: item.admin
        ? {
            user_id: item.admin.user_id,
            nickname: item.admin.nickname
          }
        : null
    }
  }

  /**
   * 格式化干预规则详情
   *
   * @private
   * @param {Object} setting - 数据库记录
   * @returns {Object} 格式化后的详情
   */
  static _formatInterventionDetail(setting) {
    const now = new Date()
    const settingData = setting.setting_data || {}

    // 计算实际状态
    let displayStatus = setting.status
    if (setting.status === 'active' && setting.expires_at && new Date(setting.expires_at) <= now) {
      displayStatus = 'expired'
    }

    return {
      setting_id: setting.lottery_management_setting_id,
      user: setting.target_user
        ? {
            user_id: setting.target_user.user_id,
            nickname: setting.target_user.nickname,
            mobile: setting.target_user.mobile,
            status: setting.target_user.status
          }
        : null,
      setting_type: setting.setting_type,
      setting_data: settingData,
      lottery_prize_id: settingData.lottery_prize_id || null,
      prize_name: settingData.prize_name || null,
      reason: settingData.reason || null,
      status: displayStatus,
      expires_at: setting.expires_at,
      operator: setting.admin
        ? {
            user_id: setting.admin.user_id,
            nickname: setting.admin.nickname
          }
        : null,
      created_at: setting.created_at,
      updated_at: setting.updated_at
    }
  }
}

module.exports = AdminLotteryQueryService
