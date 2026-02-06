/**
 * 抽奖健康度分析 API
 * @description 获取抽奖活动健康度评分和诊断信息
 * @version 1.1.0
 * @date 2026-02-01
 * @updated 2026-02-06 - 统一使用 request() 替代原生 fetch
 */

import { API_PREFIX, request } from './base.js'

// 健康度端点（与后端 routes/v4/console/lottery-health.js 对齐）
export const LOTTERY_HEALTH_ENDPOINTS = {
  // GET /console/lottery-health/:id - 获取活动健康度报告
  CAMPAIGN: campaignId => `${API_PREFIX}/console/lottery-health/${campaignId}`,
  // GET /console/lottery-health/:id/tier-distribution - 档位分布
  TIER_DISTRIBUTION: campaignId =>
    `${API_PREFIX}/console/lottery-health/${campaignId}/tier-distribution`,
  // GET /console/lottery-health/:id/diagnose - 问题诊断
  DIAGNOSE: campaignId => `${API_PREFIX}/console/lottery-health/${campaignId}/diagnose`,
  // GET /console/lottery-health/:id/budget-rate - 预算消耗速度
  BUDGET_RATE: campaignId => `${API_PREFIX}/console/lottery-health/${campaignId}/budget-rate`
}

/**
 * 抽奖健康度 API
 * @description 与后端 routes/v4/console/lottery-health.js 对齐
 */
export const LotteryHealthAPI = {
  /**
   * 获取单个活动健康度报告
   * @param {number} campaignId - 活动ID（必需）
   * @returns {Promise<Object>} 活动健康度报告
   */
  async getCampaignHealth(campaignId) {
    if (!campaignId) {
      throw new Error('campaign_id 是必需的')
    }
    return request({ url: LOTTERY_HEALTH_ENDPOINTS.CAMPAIGN(campaignId) })
  },

  /**
   * 获取档位分布
   * @param {number} campaignId - 活动ID（必需）
   * @returns {Promise<Object>} 档位分布数据
   */
  async getTierDistribution(campaignId) {
    if (!campaignId) {
      throw new Error('campaign_id 是必需的')
    }
    return request({ url: LOTTERY_HEALTH_ENDPOINTS.TIER_DISTRIBUTION(campaignId) })
  },

  /**
   * 获取问题诊断
   * @param {number} campaignId - 活动ID（必需）
   * @returns {Promise<Array>} 问题诊断列表
   */
  async getDiagnose(campaignId) {
    if (!campaignId) {
      throw new Error('campaign_id 是必需的')
    }
    return request({ url: LOTTERY_HEALTH_ENDPOINTS.DIAGNOSE(campaignId) })
  },

  /**
   * 获取预算消耗速度
   * @param {number} campaignId - 活动ID（必需）
   * @returns {Promise<Object>} 预算消耗速度数据
   */
  async getBudgetRate(campaignId) {
    if (!campaignId) {
      throw new Error('campaign_id 是必需的')
    }
    return request({ url: LOTTERY_HEALTH_ENDPOINTS.BUDGET_RATE(campaignId) })
  }
}
