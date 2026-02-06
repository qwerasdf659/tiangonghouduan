// pages/lottery/lottery-config.js - 抽奖技术配置管理
// 🔴 严禁硬编码业务数据 - 仅提供技术渲染配置

/**
 * 抽奖转盘技术配置（仅用于Canvas绘制）
 * 🚨 所有业务数据必须从后端API获取
 */
const LOTTERY_TECHNICAL_CONFIG = {
  // 转盘分割数量（技术参数）
  wheelSize: 8,
  // 每个扇形角度 (360/8)（技术参数）
  anglePerSlice: 45,
  // Canvas画布尺寸（技术参数）
  canvasSize: 600,
  // 中心圆半径（技术参数）
  centerSize: 100,
  // 🔴 以下颜色仅用于Canvas绘制，不含业务含义
  fallbackColors: [
    '#FF6B35',
    '#4ECDC4',
    '#FFD93D',
    '#6BCF7F',
    '#FF6B6B',
    '#4DABF7',
    '#9775FA',
    '#FFB84D'
  ]
}

/**
 * 🚨 严禁使用的数据示例（已删除）
 * ❌ const STANDARD_PRIZES = [...] // 违规：硬编码奖品数据
 * ❌ const LOTTERY_CONFIG = { costPoints: 100 } // 违规：硬编码业务配置
 * ❌ const FALLBACK_PRIZES = [...] // 违规：硬编码后备数据
 */

/**
 * 获取技术渲染配置（仅用于Canvas绘制）
 * @returns {Object} 技术配置对象
 */
function getTechnicalConfig() {
  return { ...LOTTERY_TECHNICAL_CONFIG }
}

/**
 * 🔴 必须从后端获取的数据类型说明：
 * - 奖品列表：prizes[]
 * - 抽奖消耗积分：cost_points
 * - 中奖概率：probability
 * - 每日限制：daily_limit
 * - 奖品类型：type, value
 *
 * 正确获取方式：
 * lotteryAPI.getConfig().then(result => {
 *   const { prizes, cost_points, daily_limit } = result.data
 *   // 使用后端数据
 * }).catch(error => {
 *   wx.showModal({
 *     title: '⚠️ 后端服务异常',
 *     content: '无法获取抽奖配置！请检查后端API服务。'
 *   })
 * })
 */

module.exports = {
  getTechnicalConfig,
  LOTTERY_TECHNICAL_CONFIG
}
