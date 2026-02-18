/**
 * 用户数据查询 API
 *
 * @description 管理后台 - 用户全维度数据检索
 * @version 1.0.0
 * @date 2026-02-18
 */

import { API_PREFIX, request, buildURL } from './base.js'

/** 用户数据查询端点（以后端实际路由为准） */
export const USER_DATA_QUERY_ENDPOINTS = {
  /** 搜索用户 */
  SEARCH: `${API_PREFIX}/console/user-data-query/search`,
  /** 用户概览（基本信息 + 资产余额） */
  OVERVIEW: `${API_PREFIX}/console/user-data-query/:user_id/overview`,
  /** 资产流水（积分来源 / 消耗 / 收入支出） */
  ASSET_TRANSACTIONS: `${API_PREFIX}/console/user-data-query/:user_id/asset-transactions`,
  /** 抽奖记录 */
  LOTTERY_DRAWS: `${API_PREFIX}/console/user-data-query/:user_id/lottery-draws`,
  /** 兑换记录（含核销状态） */
  EXCHANGE_RECORDS: `${API_PREFIX}/console/user-data-query/:user_id/exchange-records`,
  /** 兑换订单审核（管理员审核操作：完成 / 发货 / 取消） */
  EXCHANGE_RECORD_REVIEW: `${API_PREFIX}/console/user-data-query/:user_id/exchange-records/:order_no/review`,
  /** 交易记录（C2C 市场买卖） */
  TRADE_RECORDS: `${API_PREFIX}/console/user-data-query/:user_id/trade-records`,
  /** 市场挂牌（上架/下架） */
  MARKET_LISTINGS: `${API_PREFIX}/console/user-data-query/:user_id/market-listings`,
  /** 材料转换（分解/合成） */
  CONVERSIONS: `${API_PREFIX}/console/user-data-query/:user_id/conversions`
}

/**
 * 用户数据查询 API
 */
export const UserDataQueryAPI = {
  /**
   * 搜索用户（手机号 / user_id / 昵称）
   * @param {string} keyword - 搜索关键词
   * @returns {Promise<Object>} 匹配用户列表
   */
  async searchUser(keyword) {
    return request({
      url: USER_DATA_QUERY_ENDPOINTS.SEARCH,
      params: { keyword }
    })
  },

  /**
   * 获取用户概览
   * @param {number} user_id - 用户 ID
   * @returns {Promise<Object>} 用户基本信息 + 资产余额
   */
  async getOverview(user_id) {
    return request({
      url: buildURL(USER_DATA_QUERY_ENDPOINTS.OVERVIEW, { user_id })
    })
  },

  /**
   * 获取用户资产流水
   * @param {number} user_id - 用户 ID
   * @param {Object} params - 查询参数
   * @param {string} [params.asset_code] - 资产代码筛选
   * @param {string} [params.business_type] - 业务类型筛选
   * @param {string} [params.direction] - 方向：income / expense
   * @param {string} [params.start_date] - 开始日期
   * @param {string} [params.end_date] - 结束日期
   * @param {number} [params.page] - 页码
   * @param {number} [params.page_size] - 每页条数
   * @returns {Promise<Object>} 分页流水列表 + 汇总统计
   */
  async getAssetTransactions(user_id, params = {}) {
    return request({
      url: buildURL(USER_DATA_QUERY_ENDPOINTS.ASSET_TRANSACTIONS, { user_id }),
      params
    })
  },

  /**
   * 获取用户抽奖记录
   * @param {number} user_id - 用户 ID
   * @param {Object} params - 查询参数
   * @returns {Promise<Object>} 分页抽奖记录 + 汇总
   */
  async getLotteryDraws(user_id, params = {}) {
    return request({
      url: buildURL(USER_DATA_QUERY_ENDPOINTS.LOTTERY_DRAWS, { user_id }),
      params
    })
  },

  /**
   * 获取用户兑换记录
   * @param {number} user_id - 用户 ID
   * @param {Object} params - 查询参数
   * @returns {Promise<Object>} 分页兑换记录 + 汇总
   */
  async getExchangeRecords(user_id, params = {}) {
    return request({
      url: buildURL(USER_DATA_QUERY_ENDPOINTS.EXCHANGE_RECORDS, { user_id }),
      params
    })
  },

  /**
   * 审核兑换订单（管理员操作：完成 / 发货 / 取消）
   * @param {number} user_id - 用户 ID
   * @param {string} order_no - 订单号
   * @param {Object} data - 审核数据
   * @param {string} data.status - 目标状态（completed / shipped / cancelled）
   * @param {string} [data.admin_remark] - 审核备注
   * @returns {Promise<Object>} 审核结果
   */
  async reviewExchangeRecord(user_id, order_no, data) {
    return request({
      url: buildURL(USER_DATA_QUERY_ENDPOINTS.EXCHANGE_RECORD_REVIEW, { user_id, order_no }),
      method: 'PATCH',
      data
    })
  },

  /**
   * 获取用户交易记录
   * @param {number} user_id - 用户 ID
   * @param {Object} params - 查询参数
   * @returns {Promise<Object>} 分页交易记录 + 汇总
   */
  async getTradeRecords(user_id, params = {}) {
    return request({
      url: buildURL(USER_DATA_QUERY_ENDPOINTS.TRADE_RECORDS, { user_id }),
      params
    })
  },

  /**
   * 获取用户市场挂牌
   * @param {number} user_id - 用户 ID
   * @param {Object} params - 查询参数
   * @returns {Promise<Object>} 分页挂牌列表 + 汇总
   */
  async getMarketListings(user_id, params = {}) {
    return request({
      url: buildURL(USER_DATA_QUERY_ENDPOINTS.MARKET_LISTINGS, { user_id }),
      params
    })
  },

  /**
   * 获取用户材料转换记录
   * @param {number} user_id - 用户 ID
   * @param {Object} params - 查询参数
   * @returns {Promise<Object>} 分页转换记录 + 汇总
   */
  async getConversions(user_id, params = {}) {
    return request({
      url: buildURL(USER_DATA_QUERY_ENDPOINTS.CONVERSIONS, { user_id }),
      params
    })
  }
}

export default UserDataQueryAPI
