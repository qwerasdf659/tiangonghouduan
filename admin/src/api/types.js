/**
 * 通用类型定义模块
 *
 * @module api/types
 * @description 定义 API 模块共享的类型和数据结构
 *
 * 类型分类：
 * - 基础响应类型：ApiResponse, PaginatedResponse
 * - 用户相关类型：UserInfo, UserRole, UserStatus
 * - 资产相关类型：AssetBalance, AssetTransaction
 * - 抽奖相关类型：LotteryRecord, PrizeInfo, PresetConfig
 * - 市场相关类型：ListingInfo, OrderInfo
 *
 * @version 1.0.0
 * @since 2026-01-23
 */

// ========== 基础响应类型 ==========

/**
 * API 标准响应结构
 *
 * @typedef {Object} ApiResponse
 * @property {boolean} success - 请求是否成功
 * @property {string} code - 业务状态码（如 'SUCCESS', 'NOT_FOUND', 'BAD_REQUEST'）
 * @property {string} message - 响应消息（人类可读）
 * @property {*} data - 响应数据（成功时返回具体数据，失败时可能为 null）
 * @property {string} timestamp - 响应时间戳（ISO8601格式，北京时间）
 * @property {string} [version] - API版本号
 * @property {string} [request_id] - 请求追踪ID
 *
 * @example
 * // 成功响应示例
 * {
 *   success: true,
 *   code: 'SUCCESS',
 *   message: '获取用户列表成功',
 *   data: { users: [...], total: 100 },
 *   timestamp: '2026-01-23T10:30:00.000+08:00'
 * }
 *
 * @example
 * // 失败响应示例
 * {
 *   success: false,
 *   code: 'NOT_FOUND',
 *   message: '用户不存在',
 *   data: null,
 *   timestamp: '2026-01-23T10:30:00.000+08:00'
 * }
 */

/**
 * 分页响应结构
 *
 * @typedef {Object} PaginatedResponse
 * @property {boolean} success - 请求是否成功
 * @property {string} code - 业务状态码
 * @property {string} message - 响应消息
 * @property {Object} data - 响应数据
 * @property {Array} data.list - 数据列表
 * @property {PaginationInfo} data.pagination - 分页信息
 * @property {string} timestamp - 响应时间戳
 */

/**
 * 分页信息
 *
 * @typedef {Object} PaginationInfo
 * @property {number} page - 当前页码（从1开始）
 * @property {number} page_size - 每页数量
 * @property {number} total - 总记录数
 * @property {number} total_pages - 总页数
 */

/**
 * 分页查询参数
 *
 * @typedef {Object} PaginationParams
 * @property {number} [page=1] - 页码（从1开始）
 * @property {number} [page_size=20] - 每页数量（默认20，最大100）
 */

// ========== 用户相关类型 ==========

/**
 * 用户基本信息
 *
 * @typedef {Object} UserInfo
 * @property {number} user_id - 用户ID
 * @property {string} nickname - 用户昵称
 * @property {string} mobile - 手机号（脱敏显示）
 * @property {string} avatar_url - 头像URL
 * @property {string} status - 用户状态（active/inactive/banned）
 * @property {string} created_at - 注册时间（ISO8601格式）
 */

/**
 * 用户详细信息（含统计）
 *
 * @typedef {Object} UserDetail
 * @property {number} user_id - 用户ID
 * @property {string} nickname - 用户昵称
 * @property {string} mobile - 手机号
 * @property {string} avatar_url - 头像URL
 * @property {string} status - 用户状态
 * @property {string} role - 用户角色（user/merchant/admin）
 * @property {string} created_at - 注册时间
 * @property {string} last_login_at - 最后登录时间
 * @property {Object} stats - 用户统计
 * @property {number} stats.total_points - 累计积分
 * @property {number} stats.lottery_count - 抽奖次数
 * @property {number} stats.win_count - 中奖次数
 */

/**
 * 用户角色信息
 *
 * @typedef {Object} UserRole
 * @property {string} role_name - 角色名称（user/merchant/admin/super_admin）
 * @property {number} role_level - 角色等级（0-1000）
 * @property {string} [description] - 角色描述
 */

/**
 * 用户状态
 *
 * @typedef {'active'|'inactive'|'banned'} UserStatus
 * @description
 * - active: 正常激活状态
 * - inactive: 未激活/停用状态
 * - banned: 封禁状态
 */

// ========== 资产相关类型 ==========

/**
 * 资产余额信息
 *
 * @typedef {Object} AssetBalance
 * @property {string} asset_code - 资产代码（POINTS/DIAMOND/BUDGET_POINTS/材料代码）
 * @property {string} [display_name] - 资产显示名称
 * @property {number} available_amount - 可用余额
 * @property {number} frozen_amount - 冻结余额
 * @property {number} total - 总余额（可用+冻结）
 * @property {number|null} [campaign_id] - 活动ID（仅 BUDGET_POINTS 有值）
 */

/**
 * 资产流水记录
 *
 * @typedef {Object} AssetTransaction
 * @property {number} transaction_id - 交易ID
 * @property {string} asset_code - 资产代码
 * @property {string} asset_name - 资产显示名称
 * @property {string} tx_type - 业务类型（admin_adjustment/lottery_reward/exchange 等）
 * @property {number} amount - 变动金额（正数增加，负数扣减）
 * @property {number} balance_before - 变动前余额
 * @property {number} balance_after - 变动后余额
 * @property {string} [reason] - 变动原因
 * @property {string} [operator_name] - 操作人
 * @property {string} [idempotency_key] - 幂等键
 * @property {string} created_at - 创建时间（ISO8601格式）
 */

/**
 * 资产调整参数
 *
 * @typedef {Object} AssetAdjustParams
 * @property {number} user_id - 目标用户ID
 * @property {string} asset_code - 资产代码（POINTS/DIAMOND/BUDGET_POINTS/材料代码）
 * @property {number} amount - 调整数量（正数=增加，负数=扣减）
 * @property {string} reason - 调整原因
 * @property {string} idempotency_key - 幂等键（必填，前端生成）
 * @property {number} [campaign_id] - 活动ID（BUDGET_POINTS 必填）
 */

/**
 * 资产代码枚举
 *
 * @typedef {'POINTS'|'DIAMOND'|'BUDGET_POINTS'|string} AssetCode
 * @description
 * 内置资产类型：
 * - POINTS: 积分
 * - DIAMOND: 钻石
 * - BUDGET_POINTS: 预算积分（关联活动）
 *
 * 材料资产类型（动态）：
 * - red_shard, blue_shard 等碎片
 * - red_crystal, blue_crystal 等水晶
 */

// ========== 抽奖相关类型 ==========

/**
 * 抽奖记录
 *
 * @typedef {Object} LotteryRecord
 * @property {number} record_id - 记录ID
 * @property {number} user_id - 用户ID
 * @property {string} user_nickname - 用户昵称
 * @property {number} preset_id - 预设ID
 * @property {string} preset_name - 预设名称
 * @property {number|null} prize_id - 奖品ID（未中奖时为 null）
 * @property {string|null} prize_name - 奖品名称
 * @property {boolean} is_winner - 是否中奖
 * @property {number} points_consumed - 消耗积分
 * @property {string} created_at - 抽奖时间
 */

/**
 * 奖品信息
 *
 * @typedef {Object} PrizeInfo
 * @property {number} prize_id - 奖品ID
 * @property {string} name - 奖品名称
 * @property {string} description - 奖品描述
 * @property {string} prize_type - 奖品类型（points/item/coupon/physical）
 * @property {number} value - 奖品价值
 * @property {number} probability - 中奖概率（0-1）
 * @property {number} stock - 库存数量（-1 表示无限）
 * @property {number} remaining - 剩余数量
 * @property {boolean} is_enabled - 是否启用
 * @property {string} [image_url] - 奖品图片URL
 */

/**
 * 抽奖预设配置
 *
 * @typedef {Object} PresetConfig
 * @property {number} preset_id - 预设ID
 * @property {string} name - 预设名称
 * @property {string} description - 预设描述
 * @property {number} cost_points - 单次消耗积分
 * @property {boolean} is_enabled - 是否启用
 * @property {string} start_time - 开始时间
 * @property {string} end_time - 结束时间
 * @property {number} daily_limit - 每日限制次数（0=无限制）
 * @property {Array<PrizeInfo>} [prizes] - 关联奖品列表
 */

// ========== 市场相关类型 ==========

/**
 * 市场挂牌信息
 *
 * @typedef {Object} ListingInfo
 * @property {string} listing_id - 挂牌ID（UUID格式）
 * @property {number} seller_user_id - 卖家用户ID
 * @property {string} seller_nickname - 卖家昵称
 * @property {string} item_type - 物品类型（material/coupon/product）
 * @property {string} item_code - 物品代码
 * @property {string} item_name - 物品名称
 * @property {number} quantity - 出售数量
 * @property {number} price - 单价（钻石）
 * @property {number} total_price - 总价
 * @property {string} status - 状态（active/sold/cancelled/expired）
 * @property {string} created_at - 创建时间
 * @property {string} [expires_at] - 过期时间
 */

/**
 * 市场挂牌状态
 *
 * @typedef {'active'|'sold'|'cancelled'|'expired'} ListingStatus
 * @description
 * - active: 在售中
 * - sold: 已售出
 * - cancelled: 已取消
 * - expired: 已过期
 */

/**
 * 兑换订单信息
 *
 * @typedef {Object} ExchangeOrderInfo
 * @property {string} order_id - 订单ID
 * @property {number} user_id - 用户ID
 * @property {string} user_nickname - 用户昵称
 * @property {string} item_name - 商品名称
 * @property {number} quantity - 数量
 * @property {number} points_cost - 消耗积分
 * @property {string} status - 订单状态（pending/processing/shipped/completed/cancelled）
 * @property {string} created_at - 下单时间
 * @property {Object} [shipping_info] - 收货信息
 */

/**
 * 兑换订单状态
 *
 * @typedef {'pending'|'processing'|'shipped'|'completed'|'cancelled'} ExchangeOrderStatus
 * @description
 * - pending: 待处理
 * - processing: 处理中
 * - shipped: 已发货
 * - completed: 已完成
 * - cancelled: 已取消
 */

// ========== 材料转换相关类型 ==========

/**
 * 材料转换规则
 *
 * @typedef {Object} ConversionRule
 * @property {number} rule_id - 规则ID
 * @property {string} from_asset_code - 源资产代码
 * @property {string} to_asset_code - 目标资产代码
 * @property {number} from_amount - 源资产数量
 * @property {number} to_amount - 目标资产数量
 * @property {string} effective_at - 生效时间（ISO8601格式）
 * @property {boolean} is_enabled - 是否启用
 * @property {number} [min_from_amount] - 最小转换数量
 * @property {number} [max_from_amount] - 最大转换数量
 * @property {number} [fee_rate] - 手续费费率（0-1，如 0.05 = 5%）
 * @property {string} [title] - 规则标题
 * @property {string} [description] - 规则描述
 */

/**
 * 材料资产类型
 *
 * @typedef {Object} MaterialAssetType
 * @property {string} asset_code - 资产代码（如 'red_shard'）
 * @property {string} display_name - 显示名称（如 '红色碎片'）
 * @property {string} group_code - 分组代码（如 'red', 'blue'）
 * @property {string} form - 形态（'shard' 碎片 / 'crystal' 水晶）
 * @property {number} tier - 层级
 * @property {number} sort_order - 排序权重
 * @property {boolean} is_enabled - 是否启用
 * @property {boolean} [is_tradable] - 是否可交易
 */

// ========== 系统配置相关类型 ==========

/**
 * 系统设置分类
 *
 * @typedef {'general'|'lottery'|'market'|'notification'|'security'} SettingsCategory
 * @description
 * - general: 通用设置
 * - lottery: 抽奖设置
 * - market: 市场设置
 * - notification: 通知设置
 * - security: 安全设置
 */

/**
 * 公告信息
 *
 * @typedef {Object} AnnouncementInfo
 * @property {number} announcement_id - 公告ID
 * @property {string} title - 公告标题
 * @property {string} content - 公告内容
 * @property {string} type - 公告类型（notice/maintenance/promotion）
 * @property {boolean} is_pinned - 是否置顶
 * @property {boolean} is_published - 是否发布
 * @property {string} created_at - 创建时间
 * @property {string} [publish_at] - 发布时间
 * @property {string} [expires_at] - 过期时间
 */

// ========== 认证相关类型 ==========

/**
 * 登录响应数据
 *
 * @typedef {Object} LoginResponse
 * @property {string} token - JWT 访问令牌
 * @property {string} [refresh_token] - 刷新令牌
 * @property {number} expires_in - 过期时间（秒）
 * @property {UserInfo} user - 用户信息
 */

/**
 * Token 验证响应
 *
 * @typedef {Object} TokenVerifyResponse
 * @property {boolean} valid - Token 是否有效
 * @property {UserInfo} [user] - 用户信息（有效时返回）
 * @property {string} [error] - 错误信息（无效时返回）
 */

// ========== 错误类型 ==========

/**
 * API 错误对象
 *
 * @typedef {Object} ApiError
 * @property {string} code - 错误代码
 * @property {string} message - 错误消息
 * @property {Object} [details] - 错误详情
 * @property {string} [stack] - 错误堆栈（仅开发环境）
 */

/**
 * 常见错误代码
 *
 * @typedef {'SUCCESS'|'BAD_REQUEST'|'UNAUTHORIZED'|'FORBIDDEN'|'NOT_FOUND'|'CONFLICT'|'INTERNAL_ERROR'} ErrorCode
 * @description
 * - SUCCESS: 成功
 * - BAD_REQUEST: 请求参数错误
 * - UNAUTHORIZED: 未授权（未登录或Token过期）
 * - FORBIDDEN: 禁止访问（无权限）
 * - NOT_FOUND: 资源不存在
 * - CONFLICT: 资源冲突（如重复创建）
 * - INTERNAL_ERROR: 服务器内部错误
 */

// 导出空对象以支持模块引用
export default {}


