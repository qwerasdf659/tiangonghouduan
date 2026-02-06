/**
 * 🔴 项目核心常量配置 - V4.0
 * 📊 基于"魔术数字优化方案分析文档"方案一：渐进式优化
 * ✅ 只提取真正需要复用和语义不明确的常量
 *
 * @fileoverview 天宫小程序核心常量定义
 * @version 1.0.0
 * @author Restaurant Lottery Team
 * @since 2025-10-20
 */

/**
 * ⏱️ 时间相关常量（毫秒）
 * 用于时间计算和延迟操作
 */
const TIME = {
  SECOND: 1000, // 1秒 = 1000毫秒
  MINUTE: 60 * 1000, // 1分钟 = 60秒
  HOUR: 60 * 60 * 1000, // 1小时 = 3600秒
  DAY: 24 * 60 * 60 * 1000 // 1天 = 86400秒
}

/**
 * ⏳ 延迟时间常量（毫秒）
 * 用于UI交互和用户体验优化
 */
const DELAY = {
  TOAST_SHORT: 1500, // 短提示显示时间
  TOAST_LONG: 2000, // 长提示显示时间
  LOADING: 2000, // 加载提示延迟
  DEBOUNCE: 500, // 防抖延迟（搜索、输入）
  THROTTLE: 300, // 节流延迟（滚动、点击）
  RETRY: 3000, // 重试延迟
  ANIMATION: 800 // 动画持续时间
}

/**
 * 🌐 API请求相关常量
 * 用于网络请求配置和超时设置
 */
const API_CONFIG = {
  TIMEOUT: 30000, // API请求超时时间（30秒）
  RETRY_TIMES: 3, // 最大重试次数
  RETRY_DELAY: 2000, // 重试间隔
  HEALTH_CHECK_TIMEOUT: 8000 // 健康检查超时
}

/**
 * 📄 分页相关常量
 * 用于列表数据分页显示
 */
const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20, // 默认每页显示数量
  WATERFALL_SIZE: 20, // 瀑布流每页数量
  GRID_SIZE: 4, // 网格布局每页数量（2×2）
  MAX_PAGE_SIZE: 50 // 最大每页数量
}

/**
 * 🎰 抽奖系统UI常量
 * ⚠️ 只包含UI相关常量，业务数据必须从后端API获取
 *
 * ❌ 已移除的业务数据（必须从后端获取）:
 *    - DEFAULT_COST（单次抽奖消耗）→ 从 API getLotteryConfig 的 draw_cost 获取
 *    - FREE_COUNT（每日免费次数）→ 从 API getLotteryConfig 的 daily_free_count 获取
 *    - MAX_MULTI_DRAW（最大连抽次数）→ 从 API getLotteryConfig 的 max_multi_draw 获取
 */
const LOTTERY = {
  // ✅ UI布局常量
  GRID_SIZE: 9, // 3×3网格布局总数

  // ✅ UI动画常量
  ANIMATION_DURATION: 3000, // 抽奖动画持续时间（毫秒）
  HIGHLIGHT_INTERVAL: 100 // 高亮切换间隔（毫秒）
}

/**
 * 📏 UI尺寸常量（rpx单位）
 * 用于微信小程序界面布局
 */
const UI_SIZE = {
  ICON_SMALL: 40, // 小图标尺寸
  ICON_MEDIUM: 48, // 中等图标尺寸
  ICON_LARGE: 70, // 大图标尺寸
  AVATAR_SIZE: 120, // 头像尺寸
  SPACING_SMALL: 8, // 小间距
  SPACING_MEDIUM: 12, // 中等间距
  SPACING_LARGE: 15, // 大间距
  SPACING_XLARGE: 20, // 超大间距
  BORDER_RADIUS: 8 // 标准圆角
}

/**
 * 📝 表单验证常量
 * ⚠️ 只包含技术标准，业务规则必须从后端API获取
 *
 * ❌ 已移除的业务规则（必须从后端获取）:
 *    - VERIFICATION_CODE_LENGTH → 从 API getSystemConfig 的 verification_code.length 获取
 *    - MIN_NICKNAME_LENGTH → 从 API getSystemConfig 的 validation_rules.nickname.min_length 获取
 *    - MAX_NICKNAME_LENGTH → 从 API getSystemConfig 的 validation_rules.nickname.max_length 获取
 *    - MAX_FEEDBACK_LENGTH → 从 API getFeedbackConfig 的 max_content_length 获取
 *    - MAX_FILE_SIZE → 从 API getSystemConfig 的 upload.max_file_size 获取
 */
const VALIDATION = {
  PHONE_LENGTH: 11 // ✅ 中国手机号固定11位（国家标准，GB/T 15120-1994）
}

/**
 * 🎨 UI状态常量
 * 用于界面状态切换
 */
const UI_STATE = {
  LOADING: 'loading', // 加载中
  SUCCESS: 'success', // 成功
  ERROR: 'error', // 错误
  EMPTY: 'empty' // 空状态
}

/**
 * 🔢 UI显示范围常量
 * ⚠️ 只包含UI显示规则，业务限制必须从后端API获取
 *
 * ❌ 已移除的业务限制（必须从后端获取）:
 *    - MIN_POINTS / MAX_POINTS → 从 API getSystemConfig 的 points_system 获取
 *    - MIN_EXCHANGE_QUANTITY / MAX_EXCHANGE_QUANTITY → 从商品详情 API 的 exchange_config 获取
 */
const RANGE = {
  MIN_UNREAD_COUNT: 0, // ✅ UI显示：最小未读数
  MAX_UNREAD_COUNT: 99 // ✅ UI显示：超过99显示"99+"（类似微信）
}

/**
 * 🎯 导出所有常量
 * 使用方式：
 * const { TIME, DELAY, LOTTERY } = require('../../config/constants')
 */
module.exports = {
  TIME,
  DELAY,
  API_CONFIG,
  PAGINATION,
  LOTTERY,
  UI_SIZE,
  VALIDATION,
  UI_STATE,
  RANGE
}
