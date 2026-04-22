/**
 * 通用类型定义模块
 *
 * @module api/types
 * @description 定义 API 模块共享的类型和数据结构（基于数据库真实表结构）
 *
 * 类型分类：
 * - 基础响应类型：ApiResponse, PaginatedResponse, PaginationInfo
 * - 用户相关类型：UserInfo, UserDetail, UserRole, UserStatus
 * - 资产相关类型：AssetBalance, AssetTransaction, AssetAdjustParams, AssetCode
 * - 账户相关类型：Account, AccountAssetBalance
 * - 抽奖相关类型：LotteryDrawRecord, LotteryPrizeInfo, PresetConfig
 * - 市场相关类型：MarketListingInfo, TradeOrder
 * - 拍卖相关类型：AuctionListing, BidProduct
 * - 兑换相关类型：RedemptionOrderInfo
 * - 物品相关类型：Item, ItemTemplate, ItemLedger, ItemHold
 * - DIY 相关类型：DIYTemplate, DiyWork, DiyMaterial
 * - 消费相关类型：ConsumptionRecord
 * - 认证相关类型：AuthenticationSession, LoginResponse, TokenVerifyResponse
 * - 客服相关类型：CustomerServiceSession
 * - 系统配置类型：SettingsCategory, SystemNotificationInfo
 * - 材料转换类型：ConversionRule, MaterialAssetType
 * - 错误类型：ApiError, ErrorCode
 *
 * @version 2.0.0
 * @since 2026-01-23
 * @updated 2026-04-23 基于数据库真实表结构全面修正
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

// ========== 用户相关类型（users 表） ==========

/**
 * 用户基本信息
 * 对应 users 表，包含用户核心字段
 *
 * @typedef {Object} UserInfo
 * @property {number} user_id - 用户ID（自增主键）
 * @property {string} user_uuid - 用户UUID（CHAR(36)，全局唯一标识）
 * @property {string} nickname - 用户昵称
 * @property {string} mobile - 手机号（脱敏显示）
 * @property {string|null} avatar_url - 头像URL
 * @property {'active'|'inactive'|'banned'} status - 用户状态
 * @property {'normal'|'vip'|'merchant'} user_level - 用户等级
 * @property {string} created_at - 注册时间（ISO8601格式）
 * @property {string|null} last_active_at - 最后活跃时间
 */

/**
 * 用户详细信息（含统计与扩展字段）
 * 对应 users 表全字段 + 业务统计
 *
 * @typedef {Object} UserDetail
 * @property {number} user_id - 用户ID
 * @property {string} user_uuid - 用户UUID
 * @property {string} nickname - 用户昵称
 * @property {string} mobile - 手机号
 * @property {string|null} avatar_url - 头像URL
 * @property {'active'|'inactive'|'banned'} status - 用户状态
 * @property {'normal'|'vip'|'merchant'} user_level - 用户等级
 * @property {string|null} wx_openid - 微信小程序 OpenID
 * @property {number} login_count - 登录次数
 * @property {number} consecutive_fail_count - 连续登录失败次数
 * @property {number} history_total_points - 历史累计积分
 * @property {number|null} max_active_listings - 最大在售挂单数
 * @property {string|null} last_login - 最后登录时间
 * @property {string|null} last_active_at - 最后活跃时间
 * @property {string} created_at - 注册时间
 * @property {string} updated_at - 更新时间
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
 * 用户状态枚举
 *
 * @typedef {'active'|'inactive'|'banned'} UserStatus
 * @description
 * - active: 正常激活状态
 * - inactive: 未激活/停用状态
 * - banned: 封禁状态
 */

// ========== 账户相关类型（accounts / account_asset_balances 表） ==========

/**
 * 账户信息
 * 对应 accounts 表，用户/系统账户的统一抽象
 *
 * @typedef {Object} Account
 * @property {number} account_id - 账户ID（BIGINT 自增主键）
 * @property {'user'|'system'} account_type - 账户类型
 * @property {number|null} user_id - 关联用户ID（user 类型时有值）
 * @property {string|null} system_code - 系统账户代码（system 类型时有值，如 'platform_fee'）
 * @property {'active'|'disabled'} status - 账户状态
 * @property {string} created_at - 创建时间
 * @property {string} updated_at - 更新时间
 */

/**
 * 账户资产余额
 * 对应 account_asset_balances 表，记录每个账户下各资产的余额
 *
 * @typedef {Object} AccountAssetBalance
 * @property {number} account_asset_balance_id - 余额记录ID（BIGINT 自增主键）
 * @property {number} account_id - 所属账户ID
 * @property {string} asset_code - 资产代码（如 points/DIAMOND/材料代码）
 * @property {number} available_amount - 可用余额（BIGINT）
 * @property {number} frozen_amount - 冻结余额（BIGINT）
 * @property {string|null} lottery_campaign_id - 关联抽奖活动ID
 * @property {string} lottery_campaign_key - 活动维度唯一键（STORED GENERATED）
 * @property {string} created_at - 创建时间
 * @property {string} updated_at - 更新时间
 */

// ========== 资产相关类型 ==========

/**
 * 资产余额信息（前端展示用，由 AccountAssetBalance 聚合而来）
 *
 * @typedef {Object} AssetBalance
 * @property {string} asset_code - 资产代码（points/DIAMOND/budget_points/材料代码）
 * @property {string} [display_name] - 资产显示名称
 * @property {number} available_amount - 可用余额
 * @property {number} frozen_amount - 冻结余额
 * @property {number} total - 总余额（可用+冻结）
 * @property {number|null} [campaign_id] - 活动ID（仅 budget_points 有值）
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
 * @property {string} asset_code - 资产代码（points/DIAMOND/budget_points/材料代码）
 * @property {number} amount - 调整数量（正数=增加，负数=扣减）
 * @property {string} reason - 调整原因
 * @property {string} idempotency_key - 幂等键（必填，前端生成）
 * @property {number} [campaign_id] - 活动ID（budget_points 必填）
 */

/**
 * 资产代码枚举
 *
 * @typedef {'points'|'DIAMOND'|'budget_points'|string} AssetCode
 * @description
 * 内置资产类型：
 * - points: 积分
 * - DIAMOND: 钻石（原 star_stone）
 * - budget_points: 预算积分（关联活动）
 * 材料资产类型（动态）：
 * - red_core_shard, blue_shard 等碎片
 * - red_core_gem, blue_crystal 等水晶
 */

// ========== 抽奖相关类型（lottery_draws / lottery_prizes 表） ==========

/**
 * 抽奖记录（修正：原 LotteryRecord）
 * 对应 lottery_draws 表，记录每次抽奖的完整信息
 *
 * @typedef {Object} LotteryDrawRecord
 * @property {string} lottery_draw_id - 抽奖记录ID（VARCHAR(50)，非自增数字）
 * @property {string} idempotency_key - 幂等键
 * @property {string} business_id - 业务唯一ID
 * @property {string} lottery_session_id - 抽奖会话ID
 * @property {number} asset_transaction_id - 关联资产流水ID
 * @property {string|null} lottery_batch_draw_id - 批量抽奖ID
 * @property {number} user_id - 用户ID
 * @property {number} lottery_campaign_id - 抽奖活动ID
 * @property {number} lottery_preset_id - 预设ID
 * @property {number|null} lottery_prize_id - 奖品ID（未中奖时为 null）
 * @property {string|null} prize_name - 奖品名称
 * @property {'points'|'coupon'|'physical'|'virtual'|'service'|'product'|'special'|null} prize_type - 奖品类型
 * @property {number|null} prize_value - 奖品价值
 * @property {'high'|'mid'|'low'|'fallback'|'unknown'} reward_tier - 奖励档位
 * @property {'high'|'mid'|'low'|'fallback'|null} final_tier - 最终档位（经策略调整后）
 * @property {'normal'|'preset'|'override'} pipeline_type - 策略管线类型
 * @property {boolean} has_debt - 是否产生运气债务
 * @property {'single'|'triple'|'five'|'ten'|'multi'|null} draw_type - 抽奖类型
 * @property {number} draw_seq - 抽奖序号（全局自增，唯一）
 * @property {string} order_no - 订单号（唯一）
 * @property {number} points_deducted - 实际扣除积分
 * @property {number|null} cost_points - 消耗积分（单次）
 * @property {string} created_at - 抽奖时间
 * @property {string} updated_at - 更新时间
 */

/**
 * 奖品信息（修正：原 PrizeInfo）
 * 对应 lottery_prizes 表，定义抽奖奖品的完整属性
 *
 * @typedef {Object} LotteryPrizeInfo
 * @property {number} lottery_prize_id - 奖品ID（INT 自增主键）
 * @property {string} prize_name - 奖品名称
 * @property {'points'|'coupon'|'physical'|'virtual'|'service'|'product'|'special'} prize_type - 奖品类型
 * @property {number} prize_value - 奖品价值（DECIMAL(10,2)）
 * @property {number} win_probability - 中奖概率（DECIMAL(8,6)，如 0.100000）
 * @property {number} stock_quantity - 库存数量（0 表示售罄，-1 无限制由业务层处理）
 * @property {number} total_win_count - 累计中奖次数
 * @property {'active'|'inactive'} status - 奖品状态
 * @property {'high'|'mid'|'low'} reward_tier - 奖励档位
 * @property {number} sort_order - 排序权重
 * @property {number} angle - 转盘角度
 * @property {string} color - 转盘颜色（如 '#FF6B6B'）
 * @property {number} cost_points - 单次消耗积分
 * @property {number|null} max_daily_wins - 每日最大中奖数
 * @property {number|null} max_user_wins - 每用户最大中奖数
 * @property {number} daily_win_count - 当日中奖次数
 * @property {number|null} lottery_campaign_id - 关联活动ID
 * @property {string|null} prize_description - 奖品描述
 * @property {number} prize_value_points - 奖品积分价值
 * @property {number} budget_cost - 预算成本
 * @property {number} win_weight - 中奖权重（无符号整数）
 * @property {boolean} is_fallback - 是否为保底奖品
 * @property {boolean} is_activity - 是否为活动奖品
 * @property {string|null} material_asset_code - 材料资产代码
 * @property {number|null} material_amount - 材料数量
 * @property {boolean} reserved_for_vip - 是否VIP专属
 * @property {string} rarity_code - 稀有度代码（默认 'common'）
 * @property {string|null} deleted_at - 软删除时间
 * @property {number|null} merchant_id - 商户ID
 * @property {number|null} primary_media_id - 主图媒体ID
 * @property {string} created_at - 创建时间
 * @property {string} updated_at - 更新时间
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
 * @property {Array<LotteryPrizeInfo>} [prizes] - 关联奖品列表
 */

// ========== 市场相关类型（market_listings / trade_orders 表） ==========

/**
 * 市场挂牌信息（修正：原 ListingInfo）
 * 对应 market_listings 表，支持物品和同质化资产两种挂牌类型
 *
 * @typedef {Object} MarketListingInfo
 * @property {number} market_listing_id - 挂单ID（BIGINT 自增主键，非 UUID）
 * @property {'item'|'fungible_asset'} listing_kind - 挂牌类型（物品/同质化资产）
 * @property {number} seller_user_id - 卖家用户ID
 * @property {number|null} offer_item_id - 挂售物品ID（listing_kind='item' 时有值）
 * @property {number|null} offer_item_template_id - 物品模板ID
 * @property {string|null} offer_item_rarity - 物品稀有度
 * @property {string|null} offer_item_display_name - 物品展示名称
 * @property {string|null} offer_asset_group_code - 资产分组代码
 * @property {string|null} offer_asset_display_name - 资产展示名称
 * @property {string|null} offer_asset_code - 挂售资产代码（listing_kind='fungible_asset' 时有值）
 * @property {number|null} offer_amount - 挂售数量（BIGINT）
 * @property {string} price_asset_code - 定价资产代码（默认 'DIAMOND'）
 * @property {number} price_amount - 定价金额（BIGINT）
 * @property {boolean} seller_offer_frozen - 卖家挂售资产是否已冻结
 * @property {number|null} locked_by_order_id - 锁定该挂单的订单ID
 * @property {string|null} locked_at - 锁定时间
 * @property {'on_sale'|'locked'|'sold'|'withdrawn'|'admin_withdrawn'} status - 挂单状态
 * @property {number} sort_order - 排序权重
 * @property {boolean} is_pinned - 是否置顶
 * @property {string|null} pinned_at - 置顶时间
 * @property {boolean} is_recommended - 是否推荐
 * @property {string} idempotency_key - 幂等键
 * @property {number|null} offer_category_id - 挂售分类ID
 * @property {string} created_at - 创建时间
 * @property {string} updated_at - 更新时间
 */

/**
 * 市场挂牌状态枚举
 *
 * @typedef {'on_sale'|'locked'|'sold'|'withdrawn'|'admin_withdrawn'} MarketListingStatus
 * @description
 * - on_sale: 在售中
 * - locked: 已锁定（买家下单中）
 * - sold: 已售出
 * - withdrawn: 卖家主动撤回
 * - admin_withdrawn: 管理员强制下架
 */

/**
 * 交易订单
 * 对应 trade_orders 表，记录市场交易的完整订单信息
 *
 * @typedef {Object} TradeOrder
 * @property {number} trade_order_id - 交易订单ID（BIGINT 自增主键）
 * @property {string} idempotency_key - 幂等键
 * @property {string} business_id - 业务唯一ID
 * @property {number} market_listing_id - 关联挂单ID
 * @property {number} buyer_user_id - 买家用户ID
 * @property {number} seller_user_id - 卖家用户ID
 * @property {string} asset_code - 结算资产代码（默认 'DIAMOND'）
 * @property {number} gross_amount - 总金额（BIGINT）
 * @property {number} fee_amount - 手续费（BIGINT）
 * @property {number} net_amount - 净金额（BIGINT，卖家实收）
 * @property {'created'|'frozen'|'completed'|'cancelled'|'failed'|'disputed'} status - 订单状态
 * @property {Object|null} meta - 扩展元数据（JSON）
 * @property {string} order_no - 订单号（唯一）
 * @property {string} created_at - 创建时间
 * @property {string} updated_at - 更新时间
 * @property {string|null} completed_at - 完成时间
 * @property {string|null} cancelled_at - 取消时间
 */

// ========== 兑换相关类型（redemption_orders 表） ==========

/**
 * 兑换订单信息（修正：原 ExchangeOrderInfo）
 * 对应 redemption_orders 表，物品核销/兑换的订单记录
 *
 * @typedef {Object} RedemptionOrderInfo
 * @property {string} redemption_order_id - 兑换订单ID（CHAR(36) UUID）
 * @property {string} code_hash - 兑换码哈希（唯一）
 * @property {number} item_id - 关联物品ID
 * @property {number|null} redeemer_user_id - 兑换人用户ID
 * @property {'pending'|'fulfilled'|'cancelled'|'expired'} status - 订单状态
 * @property {string} expires_at - 过期时间
 * @property {string|null} fulfilled_at - 核销完成时间
 * @property {number|null} fulfilled_store_id - 核销门店ID
 * @property {number|null} fulfilled_by_staff_id - 核销员工ID
 * @property {number} redemption_seq - 兑换序号（自增唯一）
 * @property {string} order_no - 订单号（唯一）
 * @property {string} created_at - 创建时间
 * @property {string} updated_at - 更新时间
 */

/**
 * 兑换订单状态枚举
 *
 * @typedef {'pending'|'fulfilled'|'cancelled'|'expired'} RedemptionOrderStatus
 * @description
 * - pending: 待核销
 * - fulfilled: 已核销
 * - cancelled: 已取消
 * - expired: 已过期
 */

// ========== 拍卖相关类型（auction_listings / bid_products 表） ==========

/**
 * 拍卖挂牌
 * 对应 auction_listings 表，用户发起的物品拍卖
 *
 * @typedef {Object} AuctionListing
 * @property {number} auction_listing_id - 拍卖ID（BIGINT 自增主键）
 * @property {number} seller_user_id - 卖家用户ID
 * @property {number} item_id - 拍卖物品ID
 * @property {string} price_asset_code - 定价资产代码（默认 'DIAMOND'）
 * @property {number} start_price - 起拍价（BIGINT）
 * @property {number} current_price - 当前最高出价（BIGINT）
 * @property {number} min_bid_increment - 最小加价幅度（BIGINT）
 * @property {number|null} buyout_price - 一口价（BIGINT，null 表示不支持）
 * @property {string} start_time - 拍卖开始时间
 * @property {string} end_time - 拍卖结束时间
 * @property {number|null} winner_user_id - 中标用户ID
 * @property {number|null} winner_bid_id - 中标出价ID
 * @property {'pending'|'active'|'ended'|'cancelled'|'settled'|'settlement_failed'|'no_bid'} status - 拍卖状态
 * @property {number} fee_rate - 手续费率（DECIMAL(5,4)，如 0.0500 = 5%）
 * @property {number|null} gross_amount - 成交总额
 * @property {number|null} fee_amount - 手续费
 * @property {number|null} net_amount - 卖家净收
 * @property {number} bid_count - 出价次数
 * @property {number} unique_bidders - 独立出价人数
 * @property {Object|null} item_snapshot - 物品快照（JSON）
 * @property {number} retry_count - 结算重试次数
 * @property {string} created_at - 创建时间
 * @property {string} updated_at - 更新时间
 */

/**
 * 竞拍商品（管理员发起的竞拍）
 * 对应 bid_products 表，由管理员创建的竞拍商品
 *
 * @typedef {Object} BidProduct
 * @property {number} bid_product_id - 竞拍商品ID（BIGINT 自增主键）
 * @property {number} exchange_item_id - 关联兑换商品ID
 * @property {number} start_price - 起拍价（BIGINT）
 * @property {string} price_asset_code - 定价资产代码（默认 'DIAMOND'）
 * @property {number} current_price - 当前最高出价（BIGINT）
 * @property {number} min_bid_increment - 最小加价幅度（BIGINT）
 * @property {string} start_time - 竞拍开始时间
 * @property {string} end_time - 竞拍结束时间
 * @property {number|null} winner_user_id - 中标用户ID
 * @property {number|null} winner_bid_id - 中标出价ID
 * @property {'pending'|'active'|'ended'|'cancelled'|'settled'|'settlement_failed'|'no_bid'} status - 竞拍状态
 * @property {number} bid_count - 出价次数
 * @property {string|null} batch_no - 批次号
 * @property {number} created_by - 创建人（管理员ID）
 * @property {string} created_at - 创建时间
 * @property {string} updated_at - 更新时间
 */

// ========== 消费相关类型（consumption_records 表） ==========

/**
 * 消费记录
 * 对应 consumption_records 表，用户上传消费凭证后的审核记录
 *
 * @typedef {Object} ConsumptionRecord
 * @property {number} consumption_record_id - 消费记录ID（BIGINT 自增主键）
 * @property {number} user_id - 用户ID
 * @property {number|null} merchant_id - 商户ID
 * @property {number} store_id - 门店ID
 * @property {number} consumption_amount - 消费金额（DECIMAL(10,2)）
 * @property {number} points_to_award - 待发放积分
 * @property {'pending'|'approved'|'rejected'|'expired'} status - 审核状态
 * @property {'pending_review'|'approved'|'rejected'} final_status - 最终状态
 * @property {string} qr_code - 消费二维码
 * @property {string} idempotency_key - 幂等键
 * @property {string} business_id - 业务唯一ID
 * @property {number|null} reward_transaction_id - 奖励流水ID
 * @property {string|null} merchant_notes - 商户备注
 * @property {string|null} admin_notes - 管理员备注
 * @property {number|null} reviewed_by - 审核人ID
 * @property {string|null} reviewed_at - 审核时间
 * @property {boolean} is_deleted - 是否软删除
 * @property {string|null} deleted_at - 删除时间
 * @property {string|null} settled_at - 结算时间
 * @property {Object|null} anomaly_flags - 异常标记（JSON）
 * @property {number} anomaly_score - 异常评分（0-255）
 * @property {string} order_no - 订单号（唯一）
 * @property {string} created_at - 创建时间
 * @property {string} updated_at - 更新时间
 */

// ========== 物品相关类型（items / item_templates / item_ledger / item_holds 表） ==========

/**
 * 物品实例
 * 对应 items 表，每个物品的唯一实例记录
 *
 * @typedef {Object} Item
 * @property {number} item_id - 物品ID（BIGINT 自增主键）
 * @property {string} tracking_code - 追踪码（唯一，如 'ITM-XXXXXX'）
 * @property {number} owner_account_id - 所有者账户ID
 * @property {'available'|'held'|'used'|'expired'|'destroyed'} status - 物品状态
 * @property {string} item_type - 物品类型（如 'coupon', 'product', 'virtual'）
 * @property {string} item_name - 物品名称
 * @property {string|null} item_description - 物品描述
 * @property {number} item_value - 物品价值（积分计）
 * @property {number|null} prize_definition_id - 关联奖品定义ID
 * @property {string} rarity_code - 稀有度代码（默认 'common'）
 * @property {string} source - 来源（如 'lottery', 'exchange', 'admin'）
 * @property {string|null} source_ref_id - 来源引用ID
 * @property {number|null} merchant_id - 商户ID
 * @property {number|null} item_template_id - 物品模板ID
 * @property {Object|null} instance_attributes - 实例属性（JSON）
 * @property {number|null} serial_number - 序列号
 * @property {number|null} edition_total - 版本总数
 * @property {string} created_at - 创建时间
 * @property {string} updated_at - 更新时间
 */

/**
 * 物品模板
 * 对应 item_templates 表，定义物品的通用属性模板
 *
 * @typedef {Object} ItemTemplate
 * @property {number} item_template_id - 模板ID（BIGINT 自增主键）
 * @property {string} template_code - 模板代码（唯一）
 * @property {string} item_type - 物品类型
 * @property {string|null} rarity_code - 稀有度代码
 * @property {string} display_name - 展示名称
 * @property {string|null} description - 描述
 * @property {number} reference_price_points - 参考价格（积分，DECIMAL(10,2)）
 * @property {boolean} is_tradable - 是否可交易
 * @property {boolean} is_enabled - 是否启用
 * @property {Object|null} meta - 扩展元数据（JSON）
 * @property {number|null} primary_media_id - 主图媒体ID
 * @property {number|null} max_edition - 最大版本数
 * @property {number|null} category_id - 分类ID
 * @property {string} created_at - 创建时间
 * @property {string} updated_at - 更新时间
 */

/**
 * 物品流水账本
 * 对应 item_ledger 表，记录物品所有权变更的不可变日志
 *
 * @typedef {Object} ItemLedger
 * @property {number} ledger_entry_id - 账本条目ID（BIGINT 自增主键）
 * @property {number} item_id - 物品ID
 * @property {number} account_id - 账户ID
 * @property {number} delta - 变动方向（+1 入账 / -1 出账）
 * @property {number} counterpart_id - 对手方账户ID
 * @property {string} event_type - 事件类型（如 'trade_buy', 'trade_sell', 'lottery_win'）
 * @property {number|null} operator_id - 操作人ID
 * @property {'user'|'admin'|'system'} operator_type - 操作人类型
 * @property {string} business_type - 业务类型（如 'trade', 'redemption', 'lottery'）
 * @property {string} idempotency_key - 幂等键
 * @property {Object|null} meta - 扩展元数据（JSON）
 * @property {string} created_at - 创建时间
 */

/**
 * 物品冻结/持有记录
 * 对应 item_holds 表，记录物品被锁定的原因和状态
 *
 * @typedef {Object} ItemHold
 * @property {number} hold_id - 持有记录ID（BIGINT 自增主键）
 * @property {number} item_id - 物品ID
 * @property {'trade'|'redemption'|'security'|'trade_cooldown'} hold_type - 持有类型
 * @property {string} holder_ref - 持有者引用（如订单ID）
 * @property {number} priority - 优先级（TINYINT）
 * @property {'active'|'released'|'expired'|'overridden'} status - 持有状态
 * @property {string|null} reason - 持有原因
 * @property {string|null} expires_at - 过期时间
 * @property {string} created_at - 创建时间
 * @property {string|null} released_at - 释放时间
 */

// ========== DIY 相关类型（diy_templates / diy_works / diy_materials 表） ==========

/**
 * DIY 模板
 * 对应 diy_templates 表，定义 DIY 创作的模板配置
 *
 * @typedef {Object} DIYTemplate
 * @property {number} diy_template_id - 模板ID（BIGINT 自增主键）
 * @property {string} template_code - 模板代码（唯一）
 * @property {string} display_name - 展示名称
 * @property {number} category_id - 分类ID
 * @property {'draft'|'published'|'archived'} status - 模板状态
 * @property {boolean} is_enabled - 是否启用
 * @property {Object} layout - 布局配置（JSON）
 * @property {Object|null} bead_rules - 珠子规则（JSON）
 * @property {Object|null} sizing_rules - 尺寸规则（JSON）
 * @property {Object|null} capacity_rules - 容量规则（JSON）
 * @property {Object|null} material_group_codes - 材料分组代码（JSON）
 * @property {number|null} preview_media_id - 预览图媒体ID
 * @property {number|null} base_image_media_id - 底图媒体ID
 * @property {Object|null} meta - 扩展元数据（JSON）
 * @property {number} sort_order - 排序权重
 * @property {string} created_at - 创建时间
 * @property {string} updated_at - 更新时间
 */

/**
 * DIY 作品
 * 对应 diy_works 表，用户基于模板创建的 DIY 作品
 *
 * @typedef {Object} DiyWork
 * @property {number} diy_work_id - 作品ID（BIGINT 自增主键）
 * @property {string} work_code - 作品代码（唯一）
 * @property {string} work_name - 作品名称（默认 '我的设计'）
 * @property {number} diy_template_id - 关联模板ID
 * @property {number|null} account_id - 创作者账户ID
 * @property {'draft'|'frozen'|'completed'|'cancelled'} status - 作品状态
 * @property {Object} design_data - 设计数据（JSON，包含珠子排列等）
 * @property {Object|null} total_cost - 总成本（JSON，各材料消耗明细）
 * @property {number|null} preview_media_id - 预览图媒体ID
 * @property {number|null} item_id - 生成的物品ID（completed 时有值）
 * @property {string|null} idempotency_key - 幂等键
 * @property {string|null} frozen_at - 冻结时间
 * @property {string|null} completed_at - 完成时间
 * @property {string} created_at - 创建时间
 * @property {string} updated_at - 更新时间
 */

/**
 * DIY 材料
 * 对应 diy_materials 表，DIY 系统中可用的珠子/材料定义
 *
 * @typedef {Object} DiyMaterial
 * @property {number} diy_material_id - 材料ID（BIGINT UNSIGNED 自增主键）
 * @property {string} material_code - 材料代码（唯一）
 * @property {string} material_name - 材料名称
 * @property {string} display_name - 展示名称
 * @property {string} group_code - 分组代码（如 'red', 'blue'）
 * @property {number} diameter - 直径（DECIMAL(5,1)，单位 mm）
 * @property {'circle'|'ellipse'|'oval'|'square'|'heart'|'teardrop'} shape - 形状
 * @property {number} price - 单价（DECIMAL(10,2)）
 * @property {string} price_asset_code - 定价资产代码
 * @property {number} stock - 库存（-1 表示无限）
 * @property {boolean} is_stackable - 是否可堆叠
 * @property {number|null} image_media_id - 图片媒体ID
 * @property {number|null} category_id - 分类ID
 * @property {number} sort_order - 排序权重
 * @property {boolean} is_enabled - 是否启用
 * @property {Object|null} meta - 扩展元数据（JSON）
 * @property {string} created_at - 创建时间
 * @property {string} updated_at - 更新时间
 */

// ========== 认证相关类型（authentication_sessions 表） ==========

/**
 * 认证会话
 * 对应 authentication_sessions 表，记录用户/管理员的登录会话
 *
 * @typedef {Object} AuthenticationSession
 * @property {number} authentication_session_id - 会话ID（BIGINT 自增主键）
 * @property {string} session_token - 会话令牌（唯一）
 * @property {'user'|'admin'} user_type - 用户类型
 * @property {number} user_id - 用户ID
 * @property {string|null} login_ip - 登录IP
 * @property {'web'|'wechat_mp'|'douyin_mp'|'alipay_mp'|'app'|'unknown'} login_platform - 登录平台
 * @property {boolean} is_active - 是否活跃
 * @property {string} last_activity - 最后活动时间
 * @property {string} expires_at - 过期时间
 * @property {string} created_at - 创建时间
 * @property {string} updated_at - 更新时间
 */

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

// ========== 客服相关类型（customer_service_sessions 表） ==========

/**
 * 客服会话
 * 对应 customer_service_sessions 表，用户与客服的对话会话
 *
 * @typedef {Object} CustomerServiceSession
 * @property {number} customer_service_session_id - 会话ID（BIGINT 自增主键）
 * @property {number|null} user_id - 用户ID
 * @property {number|null} admin_id - 客服管理员ID
 * @property {'waiting'|'assigned'|'active'|'closed'} status - 会话状态
 * @property {string} source - 来源渠道（默认 'mobile'）
 * @property {number} priority - 优先级（默认 1）
 * @property {string|null} last_message_at - 最后消息时间
 * @property {string|null} first_response_at - 首次响应时间
 * @property {string|null} closed_at - 关闭时间
 * @property {string|null} close_reason - 关闭原因
 * @property {number|null} closed_by - 关闭操作人ID
 * @property {number|null} satisfaction_score - 满意度评分
 * @property {boolean|null} is_active_session - 是否活跃会话（VIRTUAL GENERATED）
 * @property {number|null} issue_id - 关联工单ID
 * @property {Object|null} tags - 标签（JSON）
 * @property {string|null} resolution_summary - 解决方案摘要
 * @property {string} created_at - 创建时间
 * @property {string} updated_at - 更新时间
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
 * @property {string} asset_code - 资产代码（如 'red_core_shard'）
 * @property {string} display_name - 显示名称（如 '红源晶碎片'）
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
 * @typedef {'ad_pricing'|'ad_system'|'auction'|'backpack'|'basic'|'batch_operation'|'customer_service'|'exchange'|'feature'|'general'|'marketplace'|'notification'|'points'|'redemption'|'security'} SettingsCategory
 * @description
 * - ad_pricing: 广告定价设置
 * - ad_system: 广告系统设置
 * - auction: 拍卖设置
 * - backpack: 背包设置
 * - basic: 基础设置
 * - batch_operation: 批量操作设置
 * - customer_service: 客服设置
 * - exchange: 兑换设置
 * - feature: 功能开关
 * - general: 通用设置
 * - marketplace: 市场设置
 * - notification: 通知设置
 * - points: 积分设置
 * - redemption: 核销设置
 * - security: 安全设置
 */

/**
 * 系统通知信息（通过 AdCampaign(system) 统一管理）
 *
 * @typedef {Object} SystemNotificationInfo
 * @property {number} notification_id - 通知ID（即 ad_campaign_id）
 * @property {string} title - 通知标题
 * @property {string} content - 通知内容
 * @property {string} type - 类型（固定为 'system'）
 * @property {number} priority - 优先级（900-999）
 * @property {boolean} is_active - 是否生效
 * @property {string} created_at - 创建时间
 * @property {string} [end_date] - 过期日期
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
