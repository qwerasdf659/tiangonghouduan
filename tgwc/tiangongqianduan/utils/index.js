/**
 * 🔴 Utils统一导出模块 v4.2
 * 📦 集中管理所有工具函数，防止导入混乱
 * 🎯 提供清晰的功能分类和类型定义
 * ✅ 已移除过度设计的监控系统，保持简洁高效
 * ✅ v4.2: 删除直接函数导出，统一使用分类导出
 *
 * 📋 命名规范说明
 *
 * 本项目采用混合命名策略：
 *
 * 1️⃣ 业务逻辑层（100% camelCase）
 *    - 变量名：userName, pointsBalance
 *    - 函数名：showToast, getUserInfo
 *
 * 2️⃣ API交互层（100% snake_case）
 *    - 请求参数：{ user_id, campaign_code }
 *    - 响应字段：{ user_id, created_at }
 *    - 与后端数据库字段保持一致
 *
 * 3️⃣ 工具类/类名（PascalCase）
 *    - Wechat, Utils, Validation
 *    - 符合 JavaScript 类命名约定
 *
 * 🔄 字段转换方式：
 *    const { user_id } = apiResponse       // API层：保持snake_case
 *    const userId = user_id                // 业务层：转换为camelCase
 *    或使用解构赋值：
 *    const { user_id: userId } = apiResponse
 *
 * @file 天宫餐厅积分系统 - 工具函数统一入口
 * @version 4.2.0 - 删除直接函数导出，降低维护成本
 * @author Restaurant Lottery Team
 * @since 2025-01-11
 * @updated 2025-10-19 - 添加命名规范说明，优化注释结构
 */

// ===== 🔧 工具函数模块导入 =====
const utilFunctions = require('./util')
const validateFunctions = require('./validate')
const apiFunctions = require('./api')
const wechatFunctions = require('./wechat')
// 🗑️ V4.1: 已删除loading-manager，统一使用Wechat工具
const authHelperFunctions = require('./auth-helper')
// 🗑️ V4.2: 已删除api-helper，统一为直接调用API方法
// 🔴 V4.3: 新增极简错误处理工具（方案A）
const errorFunctions = require('./simple-error')

// ===== 📋 功能模块分类导出 =====

/**
 * 🔧 基础工具函数
 * 包含日期格式化、字符串处理、防抖节流等基础功能
 */
const Utils = {
  // 日期时间处理
  formatTime: utilFunctions.formatTime,
  formatNumber: utilFunctions.formatNumber,
  // 🔴 新增：聊天消息时间格式化
  formatDateMessage: utilFunctions.formatDateMessage,

  // 字符串和编码处理
  base64Decode: utilFunctions.base64Decode,
  generateRandomString: utilFunctions.generateRandomString,
  formatFileSize: utilFunctions.formatFileSize,
  formatPoints: utilFunctions.formatPoints,
  formatPhoneNumber: utilFunctions.formatPhoneNumber,

  // JWT和Token处理
  validateJWTTokenIntegrity: utilFunctions.validateJWTTokenIntegrity,
  decodeJWTPayload: utilFunctions.decodeJWTPayload,
  isTokenExpired: utilFunctions.isTokenExpired,

  // 对象和数据处理
  deepClone: utilFunctions.deepClone,
  isEmpty: utilFunctions.isEmpty,
  safeJsonParse: utilFunctions.safeJsonParse,

  // 函数式编程工具
  debounce: utilFunctions.debounce,
  throttle: utilFunctions.throttle,

  // 🔴 V4.0新增：认证助手函数
  checkAuth: authHelperFunctions.checkAuth,
  checkAdmin: authHelperFunctions.checkAdmin,
  getAccessToken: authHelperFunctions.getAccessToken,
  getUserInfo: authHelperFunctions.getUserInfo,
  // refreshToken 已删除 - 使用 api.js 的 APIClient.handleTokenExpired() 自动刷新机制
  clearAuthData: authHelperFunctions.clearAuthData

  // 🗑️ V4.2: 已删除API调用助手函数（callApi、callPaginationApi等）
  // 统一为直接调用API方法，降低代码复杂度和维护成本
}

/**
 * 🔍 数据验证函数
 * 包含表单验证、字段检查、业务规则验证等
 */
const Validation = {
  // 基础字段验证
  validatePhoneNumber: validateFunctions.validatePhoneNumber,
  validateVerificationCode: validateFunctions.validateVerificationCode,
  validatePoints: validateFunctions.validatePoints,
  validateQuantity: validateFunctions.validateQuantity,
  validateNickname: validateFunctions.validateNickname,
  validateImageFile: validateFunctions.validateImageFile,

  // 批量验证
  validateBatch: validateFunctions.validateBatch,

  // 表单验证器和规则
  FormValidator: validateFunctions.FormValidator,
  commonRules: validateFunctions.commonRules
}

/**
 * 🌐 API接口函数 - V4.0统一引擎
 * 包含所有后端接口调用和数据处理功能
 *
 * ⚠️ 【重要】新增API方法时，必须在此处添加导出！
 *
 * 📋 导出格式：methodName: apiFunctions.methodName,
 *
 * 🔴 最容易遗漏的步骤：
 * 1. 在 utils/api.js 中定义方法 ✓
 * 2. 在 utils/api.js 的 module.exports 中导出 ✓
 * 3. 在此处的 API 对象中导出 ← 容易遗漏！
 * 4. 在页面中调用 API.methodName() ✓
 *
 * 📋 完整检查清单详见：.cursor/rules/development-automation-unified.mdc
 * 搜索关键词："API方法新增检查清单"
 *
 * 🔴 如果遗漏此步骤，页面调用时会报错：API.methodName is not a function
 */
const API = {
  // API客户端类
  APIClient: apiFunctions.APIClient,

  // ========== 认证系统 ==========
  userLogin: apiFunctions.userLogin,
  quickLogin: apiFunctions.quickLogin,
  getUserInfo: apiFunctions.getUserInfo,
  getUserIdentity: apiFunctions.getUserIdentity,
  verifyToken: apiFunctions.verifyToken,

  // ========== 消费积分二维码系统 ==========
  getUserQRCode: apiFunctions.getUserQRCode,
  getUserInfoByQRCode: apiFunctions.getUserInfoByQRCode, // ✅ 根据二维码获取用户信息（文档Line 323-423）

  // 🆕 审核记录查询（用户端）
  getMyRecentAuditsCount: apiFunctions.getMyRecentAuditsCount, // 🆕 获取用户最近审核记录数量
  getMyRecentAudits: apiFunctions.getMyRecentAudits, // 🆕 获取用户最近5笔积分审核记录

  // ========== 消费记录管理系统（管理员扫码审核功能）==========
  submitConsumption: apiFunctions.submitConsumption,
  getPendingConsumption: apiFunctions.getPendingConsumption,
  approveConsumption: apiFunctions.approveConsumption,
  rejectConsumption: apiFunctions.rejectConsumption,

  // ========== 抽奖系统 ==========
  getLotteryPrizes: apiFunctions.getLotteryPrizes,
  getLotteryConfig: apiFunctions.getLotteryConfig,
  performLottery: apiFunctions.performLottery,
  getLotteryHistory: apiFunctions.getLotteryHistory,
  getLotteryCampaigns: apiFunctions.getLotteryCampaigns,

  // ========== 积分系统 ==========
  getCurrentUserBalance: apiFunctions.getCurrentUserBalance,
  getPointsBalance: apiFunctions.getPointsBalance,
  getPointsTransactions: apiFunctions.getPointsTransactions,
  getUserStatistics: apiFunctions.getUserStatistics,
  adminAdjustPoints: apiFunctions.adminAdjustPoints,
  getAdminPointsStatistics: apiFunctions.getAdminPointsStatistics,

  // ========== 用户库存和兑换 ==========
  getUserInventory: apiFunctions.getUserInventory,
  getInventoryItem: apiFunctions.getInventoryItem,
  useInventoryItem: apiFunctions.useInventoryItem,
  getExchangeProducts: apiFunctions.getExchangeProducts,
  exchangeProduct: apiFunctions.exchangeProduct,
  getExchangeRecords: apiFunctions.getExchangeRecords,
  cancelExchange: apiFunctions.cancelExchange,
  generateVerificationCode: apiFunctions.generateVerificationCode,
  transferInventoryItem: apiFunctions.transferInventoryItem,
  getTransferHistory: apiFunctions.getTransferHistory,
  getAdminInventoryStatistics: apiFunctions.getAdminInventoryStatistics,
  getMarketProducts: apiFunctions.getMarketProducts,
  getMarketProductDetail: apiFunctions.getMarketProductDetail,
  purchaseMarketProduct: apiFunctions.purchaseMarketProduct,
  withdrawMarketProduct: apiFunctions.withdrawMarketProduct,

  // ========== 图片上传和审核 ==========
  uploadImage: apiFunctions.uploadImage,
  getMyUploads: apiFunctions.getMyUploads,
  getMyUploadStats: apiFunctions.getMyUploadStats,
  getPendingReviews: apiFunctions.getPendingReviews,
  reviewImage: apiFunctions.reviewImage,

  // ========== 系统通用 ==========
  getAnnouncements: apiFunctions.getAnnouncements,
  getHomeAnnouncements: apiFunctions.getHomeAnnouncements,
  submitFeedback: apiFunctions.submitFeedback,
  getMyFeedbacks: apiFunctions.getMyFeedbacks,
  getSystemStatus: apiFunctions.getSystemStatus,

  // ========== 客服会话 ==========
  createChatSession: apiFunctions.createChatSession,
  getChatSessions: apiFunctions.getChatSessions,
  getChatHistory: apiFunctions.getChatHistory,
  sendChatMessage: apiFunctions.sendChatMessage,

  // ========== 管理员专用 ==========
  getAdminTodayStats: apiFunctions.getAdminTodayStats,
  getAdminUsers: apiFunctions.getAdminUsers,
  getAdminChatSessions: apiFunctions.getAdminChatSessions,
  getAdminChatHistory: apiFunctions.getAdminChatHistory,

  // API版本信息
  version: apiFunctions.version,
  lastUpdated: apiFunctions.lastUpdated,
  apiCompatibility: apiFunctions.apiCompatibility,
  changelog: apiFunctions.changelog
}

/**
 * 📱 微信小程序工具函数
 * 包含微信API封装、用户交互、导航等功能
 */
const Wechat = {
  // 微信工具类
  WechatUtils: wechatFunctions.WechatUtils,

  // 环境初始化
  initializeWechatEnvironment: wechatFunctions.initializeWechatEnvironment,

  // 用户信息获取
  getUserProfile: wechatFunctions.getUserProfile,

  // 用户界面交互
  showToast: wechatFunctions.showToast,
  showLoading: wechatFunctions.showLoading,
  hideLoading: wechatFunctions.hideLoading,

  // 页面导航
  navigateTo: wechatFunctions.navigateTo,
  navigateBack: wechatFunctions.navigateBack
}

/**
 * ❌ 错误处理工具（V4.3极简方案）
 * 包含错误提示、成功提示、JWT过期处理等核心功能
 * 🎯 设计原则：简单、直接、零学习成本（50行代码）
 */
const ErrorHandler = {
  // 显示错误提示
  showError: errorFunctions.showError,
  // 显示成功提示
  showSuccess: errorFunctions.showSuccess,
  // 处理JWT过期
  handleJWTExpired: errorFunctions.handleJWTExpired,
  // 统一错误处理（推荐使用）
  handleError: errorFunctions.handleError
}

/**
 * ⏳ 加载状态管理
 * 🗑️ V4.1: 已移除Loading模块，统一使用Wechat.showLoading/hideLoading
 * 原因：降低维护成本，避免过度设计
 */
// const Loading = {} // 已删除

// ===== 🎯 统一导出接口 =====

/**
 * 🔴 项目核心常量
 * 从 config/constants.js 导入并导出
 */
const Constants = require('../config/constants')

/**
 * 默认导出：推荐的导入方式
 * @example
 * const { Utils, Validation, API, Constants } = require('../utils')
 * const { debounce, formatTime } = Utils
 * const { validatePhoneNumber } = Validation
 * const { userLogin } = API
 * const { TIME, DELAY, LOTTERY } = Constants
 */
module.exports = {
  // 按功能分类的模块
  Utils,
  Validation,
  API,
  Wechat,
  ErrorHandler,
  // 项目常量
  Constants
}

/**
 * 🔧 使用指南和最佳实践
 *
 * === 📦 标准的导入方式 ===
 *
 * 按功能模块导入（唯一标准方式）：
 * ```javascript
 * const { Utils, Validation, API, Wechat, ErrorHandler } = require('../../utils')
 * const { debounce, formatTime } = Utils
 * const { validatePhoneNumber } = Validation
 * const { userLogin, getUserInfo } = API
 * const { showToast, showLoading } = Wechat
 * const { handleError, showSuccess } = ErrorHandler
 * ```
 *
 * === 🎯 功能分类说明 ===
 *
 * - **Utils**: 基础工具函数（日期、字符串、防抖节流、认证助手、API助手等）
 * - **Validation**: 数据验证函数（表单校验、业务规则等）
 * - **API**: 后端接口调用函数（认证、抽奖、兑换等）
 * - **Wechat**: 微信小程序功能封装（用户交互、导航、加载状态等）
 * - **ErrorHandler**: 错误处理工具（错误提示、JWT过期处理、统一错误处理等）
 *
 * === ❌ 错误处理最佳实践（V4.3极简方案）===
 *
 * ```javascript
 * // 推荐用法：统一错误处理
 * try {
 *   await API.performLottery()
 *   ErrorHandler.showSuccess('抽奖成功')
 * } catch (error) {
 *   ErrorHandler.handleError(error, '抽奖')  // 自动处理JWT过期、网络错误等
 * }
 * ```
 */
