const BeijingTimeHelper = require('../utils/timeHelper')
const { AssetCode } = require('../constants/AssetCode')
const DecimalConverter = require('../utils/formatters/DecimalConverter') // 🔧 DECIMAL字段类型转换工具
const { getImageUrl, getPlaceholderImageUrl } = require('../utils/ImageUrlHelper') // 🔧 Sealos 对象存储 URL 生成

/**
 * 🔒 全局敏感资产类型黑名单（决策1：绝对禁止暴露给前端）
 *
 * BUDGET_POINTS 为系统内部资产，任何面向微信小程序前端的 API 响应中
 * 禁止出现该资产类型的字段信息（包括 asset_code 值、余额、流水等）
 *
 * @constant {string[]}
 */
const FORBIDDEN_FRONTEND_ASSET_CODES = [AssetCode.BUDGET_POINTS]

/**
 * 统一数据脱敏服务（DataSanitizer）
 *
 * 业务场景：API响应数据安全防护 - 防止用户通过抓包分析数据库结构和商业逻辑
 *
 * 核心功能：
 * - 根据用户权限级别（dataLevel）返回不同级别的数据
 * - 管理员（dataLevel='full'）：返回完整业务数据
 * - 普通用户（dataLevel='public'）：返回脱敏后的安全数据
 * - 主键使用描述性 {entity}_id 命名（与阿里/腾讯/Stripe 行业标准对齐）
 * - 移除敏感商业信息（概率、成本、限制等）
 * - 过滤敏感字段（role、permissions、admin_flags 等）
 * - PII 脱敏（maskUserName / maskAdminName）
 *
 * 🏛️ DataSanitizer 架构原则（2026-01-13 确立）：
 *
 * 1. 禁止字段兼容逻辑（fail-fast）
 *    - 禁止使用 `xxx.id || xxx.{table}_id` 等 fallback 逻辑
 *    - 直接使用数据库真实字段名
 *    - 字段缺失时立即报错（fail-fast）
 *
 * 2. 唯一真相源原则
 *    - 数据库表结构是字段名的唯一权威定义
 *    - 不做"可能存在的字段"的防御性兼容
 *    - 字段变更必须通过数据库迁移 + 代码同步修改
 *
 * 3. 明确输入契约
 *    - 每个脱敏方法必须在注释中声明处理哪个表
 *    - 方法命名必须体现表名（如 sanitizeExchangeMarketItems 对应 exchange_items 表）
 *    - 输入数据必须符合表结构，否则报错
 *
 * 4. 快速失败原则
 *    - 访问不存在的字段时，让 JavaScript 返回 undefined
 *    - 如果业务逻辑依赖该字段，会在后续处理中报错
 *    - 不做"可能有、可能没有"的容错处理
 *
 *
 *    - 仅使用 primary_media_id 关联 media_files 表
 *    - DataSanitizer 输出 image 对象（含 url、primary_media_id）
 *
 * 🔒 安全设计说明（2026-02-21 γ 模式升级）：
 * 1. 主键使用描述性 {entity}_id（行业标准：阿里/腾讯/美团/Stripe 无一例外）
 * 2. 商业信息保护：移除概率、成本、限制等核心商业数据
 * 3. 敏感字段过滤：移除 role、permissions、admin_flags 等敏感字段
 * 4. PII 脱敏：maskUserName() / maskAdminName() 保护用户隐私
 * 5. 禁止资产过滤：BUDGET_POINTS 等内部资产绝对禁止暴露
 *
 * ⚠️ γ 模式职责边界（2026-02-21 确立）：
 * - DataSanitizer 只做减法：删除敏感字段、脱敏 PII、主键前缀统一
 * - DataSanitizer 不做加法或字段重命名（Service 层负责数据转换）
 * - Service 层是白名单构造层（直接操作 Sequelize 模型，不会产生 ghost field）
 * - DataSanitizer 是黑名单过滤层（从 Service 输出中删除敏感字段）
 */
class DataSanitizer {
  /**
   * 抽奖奖品数据脱敏 - 解决概率泄露等极高风险问题
   *
   * 业务场景：抽奖奖品列表API响应时调用，防止用户通过抓包获取中奖概率等商业机密
   *
   * 脱敏规则：
   * - 管理员（dataLevel='full'）：返回完整奖品数据
   * - 普通用户（dataLevel='public'）：移除win_probability（中奖概率）、stock_quantity（库存数量）、
   *   prize_value（奖品价值）、cost_points（成本积分）等敏感字段
   * - 保持数据库原始字段名，仅过滤敏感字段（win_probability、stock_quantity 等）
   *
   * @param {Array<Object>} prizes - 奖品数据数组（来自 lottery_prizes 表的 Sequelize 查询结果）
   * @param {string} dataLevel - 数据级别：'full'（管理员完整数据）或'public'（普通用户脱敏数据）
   * @returns {Array<Object>} 脱敏后的奖品数组（字段名与 lottery_prizes 表一致）
   * @returns {number} return[].prize_id - 奖品ID（剥离 lottery_ 模块前缀，源自 lottery_prize_id）
   * @returns {number} return[].lottery_campaign_id - 关联活动ID
   * @returns {string} return[].prize_name - 奖品名称
   * @returns {string} return[].prize_type - 奖品类型（points/coupon/physical/virtual/service/product/special）
   * @returns {number} return[].prize_value - 展示价值（DECIMAL→number 转换）
   * @returns {string} return[].rarity_code - 稀有度代码（FK→rarity_defs）
   * @returns {number} return[].sort_order - 排序顺序（前端转盘位置索引）
   * @returns {string} return[].status - 奖品状态（active/inactive）
   *
   * @example
   * // 管理员查看完整数据
   * const adminPrizes = DataSanitizer.sanitizePrizes(prizes, 'full')
   * // 返回：包含win_probability、stock_quantity等完整字段
   *
   * // 普通用户查看脱敏数据
   * const publicPrizes = DataSanitizer.sanitizePrizes(prizes, 'public')
   * // 返回：移除敏感字段，使用rarity替代win_probability
   */
  static sanitizePrizes(prizes, dataLevel) {
    if (dataLevel === 'full') {
      /*
       * 管理员看完整数据，但需要转换DECIMAL字段为数字类型（修复前端TypeError）
       * Sequelize 模型实例需先转为普通对象，供 DecimalConverter 的 spread 操作正常工作
       */
      const plainPrizes = (Array.isArray(prizes) ? prizes : [prizes]).map(p => {
        const plain = p.toJSON ? p.toJSON() : p

        return plain
      })
      return DecimalConverter.convertPrizeData(plainPrizes)
    }

    /*
     * γ 模式：黑名单删除敏感字段，而非白名单构造新对象
     * 优势：Service 层新增字段自动透传，不会产生 ghost field
     */
    return prizes.map(prize => {
      const plain = prize.toJSON ? prize.toJSON() : prize
      const rawPrimaryMedia = prize.primary_media || plain.primary_media
      const rawMaterial = prize.materialAssetType || plain.materialAssetType
      const sanitized = { ...plain }

      // 主键统一（决策 A：剥离 lottery_ 模块前缀）
      sanitized.prize_id = sanitized.lottery_prize_id
      delete sanitized.lottery_prize_id

      // 图片处理：仅 primary_media（MediaFile）
      if (rawPrimaryMedia && typeof rawPrimaryMedia.toSafeJSON === 'function') {
        const safe = rawPrimaryMedia.toSafeJSON()
        sanitized.image = {
          primary_media_id: safe.media_id,
          url: safe.public_url,
          mime: safe.mime_type,
          thumbnail_url: safe.thumbnails?.small || safe.public_url
        }
      } else if (rawPrimaryMedia?.object_key) {
        sanitized.image = {
          primary_media_id: rawPrimaryMedia.media_id,
          url: getImageUrl(rawPrimaryMedia.object_key),
          mime: rawPrimaryMedia.mime_type,
          thumbnail_url: rawPrimaryMedia.thumbnail_keys?.small
            ? getImageUrl(rawPrimaryMedia.thumbnail_keys.small)
            : getImageUrl(rawPrimaryMedia.object_key)
        }
      } else {
        /**
         * 最终兜底：所有图片来源都不可用时，返回占位图 URL
         * 确保前端 <image> 组件始终有可渲染的图片地址
         */
        const placeholderUrl = getPlaceholderImageUrl('prize')
        sanitized.image = {
          url: placeholderUrl,
          thumbnail_url: placeholderUrl,
          source: 'placeholder'
        }
      }

      // 材料资产展示信息（前端需要材料的display_name用于展示）
      if (rawMaterial) {
        sanitized.material_display_name = rawMaterial.display_name
      }

      // 清理关联对象原始数据（防止泄露材料资产内部结构）
      delete sanitized.materialAssetType

      // DECIMAL 类型转换（Sequelize DECIMAL 返回字符串，前端需要数字）
      sanitized.prize_value = DecimalConverter.toNumber(sanitized.prize_value, 0)
      sanitized.rarity_code = sanitized.rarity_code || 'common'

      // 黑名单：删除敏感字段（商业机密 + 内部控制参数）
      delete sanitized.win_probability
      delete sanitized.stock_quantity
      delete sanitized.win_weight
      delete sanitized.cost_points
      delete sanitized.prize_value_points
      delete sanitized.max_daily_wins
      delete sanitized.daily_win_count
      delete sanitized.total_win_count
      delete sanitized.is_fallback
      delete sanitized.reward_tier
      delete sanitized.reserved_for_vip
      delete sanitized.angle
      delete sanitized.color
      delete sanitized.is_activity

      return sanitized
    })
  }

  /**
   * 库存物品数据脱敏（γ 模式：接收 BackpackService 输出，只做安全过滤）
   *
   * 🗄️ 数据库表：items（主键：item_id）
   *
   * ⚠️ D2 决策：此方法当前不被任何路由调用。
   * BackpackService 已是完整的领域转换层，背包列表和详情都直接使用 BackpackService 输出。
   * 保留此方法以供未来需要额外脱敏层时使用。
   *
   * γ 模式职责：
   * - 接收 BackpackService._getItems() 已转换的数据（从 meta JSON 提取的结构化字段）
   * - 白名单输出面向用户的字段，排除内部字段（owner_account_id、locks、item_template_id、source、meta）
   *
   * @param {Array<Object>} inventory - 库存数据数组（来自 BackpackService._getItems() 输出）
   * @param {string} dataLevel - 数据级别：'full'（管理员完整数据）或'public'（普通用户脱敏数据）
   * @returns {Array<Object>} 脱敏后的库存数组
   * @returns {number} return[].item_id - 物品ID（数据库主键原样输出）
   * @returns {string} return[].item_type - 物品类型（voucher/product/service）
   * @returns {string} return[].name - 物品名称（来自 meta JSON）
   * @returns {string} return[].description - 物品描述（来自 meta JSON）
   * @returns {string} return[].rarity - 稀有度代码（来自 meta JSON）
   * @returns {string} return[].status - 物品状态（available/used/expired/transferred）
   * @returns {boolean} return[].has_redemption_code - 是否有核销码（布尔标识，不暴露完整码）
   * @returns {string} return[].acquired_at - 获得时间（映射自 created_at）
   * @returns {string} return[].expires_at - 过期时间（来自 meta JSON）
   * @returns {Array<string>} return[].allowed_actions - 允许操作列表（来自 system_settings 缓存）
   * @returns {string} return[].status_display_name - 状态中文显示名
   * @returns {string} return[].item_type_display_name - 物品类型中文显示名
   * @returns {string} return[].rarity_display_name - 稀有度中文显示名
   * @returns {string} return[].created_at - 创建时间
   * @returns {string} return[].updated_at - 更新时间
   */
  static sanitizeInventory(inventory, dataLevel) {
    if (dataLevel === 'full') {
      return inventory
    }

    /*
     * γ 模式：接收 BackpackService._getItems() 输出，只做安全过滤
     *
     * ⚠️ 当前状态（D2 决策）：此方法未被任何路由调用。
     * 背包列表和详情都直接使用 BackpackService 输出（BackpackService 已是完整的领域转换层）。
     * 保留此方法供未来需要时使用。
     *
     * BackpackService 输出字段：item_id, item_type, name, description,
     * rarity, status, has_redemption_code, acquired_at, expires_at, allowed_actions,
     * status_display_name, item_type_display_name, rarity_display_name
     */
    /*
     * γ 模式：黑名单删除敏感字段
     */
    return inventory.map(item => {
      const sanitized = { ...(item.toJSON ? item.toJSON() : item) }

      // 黑名单：删除内部字段（隐私 + 内部状态 + 核销码明文 + 原始 JSON）
      delete sanitized.owner_account_id
      delete sanitized.locks
      delete sanitized.item_template_id
      delete sanitized.source
      delete sanitized.source_id
      delete sanitized.meta
      delete sanitized.verification_code
      delete sanitized.verification_expires_at

      return sanitized
    })
  }

  /**
   * 用户认证数据脱敏（γ 模式：只做安全过滤，不做字段重命名）
   *
   * 🗄️ 数据库表：users（主键：user_id）
   *
   * 业务场景：用户信息 API 响应时调用，移除权限、管理员标识等敏感字段
   *
   * γ 模式职责：
   * - 接收 Service 层已转换的用户数据（字段名已是 nickname、avatar_url 等真实 DB 列名）
   * - 只做减法：删除 role、permissions、admin_flags 等敏感字段
   * - 主键统一：user_id 原样输出（无需剥离前缀）
   * - 不做字段重命名（不把 nickname 改成 display_name）
   *
   * @param {Object} user - 用户数据对象（来自 Service 层或 Sequelize 查询）
   * @param {string} dataLevel - 数据级别：'full'（管理员完整数据）或 'public'（普通用户脱敏数据）
   * @returns {Object} 脱敏后的用户对象
   * @returns {number} return.user_id - 用户ID（数据库主键原样输出）
   * @returns {string} return.nickname - 昵称（DB 实际列名）
   * @returns {string|null} return.avatar_url - 头像 URL（DB 实际列名）
   * @returns {boolean} return.can_lottery - 是否可以抽奖
   * @returns {boolean} return.can_exchange - 是否可以兑换
   * @returns {Object} return.points_account - 积分账户信息
   * @returns {string|null} return.member_since - 注册日期（YYYY-MM-DD 格式）
   */
  static sanitizeUser(user, dataLevel) {
    if (dataLevel === 'full') {
      return user
    }

    /*
     * γ 模式：黑名单删除敏感字段
     */
    const sanitized = { ...(user.toJSON ? user.toJSON() : user) }

    // 补充派生字段
    sanitized.avatar_url = sanitized.avatar_url || null
    sanitized.can_lottery = sanitized.can_lottery !== false
    sanitized.can_exchange = sanitized.can_exchange !== false

    const pa = sanitized.points_account || {
      available_points: 0,
      frozen_points: 0,
      total_points: 0
    }
    sanitized.points_account = {
      available_points: pa.available_points || 0,
      frozen_points: pa.frozen_points || 0,
      total_points: pa.total_points || (pa.available_points || 0) + (pa.frozen_points || 0)
    }

    sanitized.member_since = sanitized.created_at
      ? typeof sanitized.created_at === 'string'
        ? sanitized.created_at.split('T')[0]
        : null
      : null

    // 黑名单：删除敏感字段（PII + 内部状态 + 权限信息）
    delete sanitized.mobile
    delete sanitized.consecutive_fail_count
    delete sanitized.history_total_points
    delete sanitized.login_count
    delete sanitized.max_active_listings
    delete sanitized.role
    delete sanitized.permissions
    delete sanitized.admin_flags
    delete sanitized.user_uuid
    delete sanitized.password_hash

    return sanitized
  }

  /**
   * 积分系统数据脱敏 - 解决经济模型泄露
   *
   * 业务场景：积分查询API响应时调用，防止用户通过抓包分析积分获取规则、收益率等经济模型信息
   *
   * 脱敏规则：
   * - 管理员（dataLevel='full'）：返回完整积分数据
   * - 普通用户（dataLevel='public'）：移除earning_rules（获取规则详情）、discount_rate（折扣率）、
   *   等敏感字段
   * - 只返回业务必需的基础信息：余额、今日获得、是否可以抽奖、可抽奖次数
   *
   * @param {Object} pointsData - 积分数据对象，包含balance、today_earned、earning_rules、discount_rate等字段
   * @param {string} dataLevel - 数据级别：'full'（管理员完整数据）或'public'（普通用户脱敏数据）
   * @returns {Object} 脱敏后的积分对象
   * @returns {number} return.balance - 积分余额
   * @returns {number} return.today_earned - 今日获得积分
   * @returns {boolean} return.can_draw - 是否可以抽奖（余额>=抽奖成本，默认100积分）
   * @returns {number} return.draw_available - 可抽奖次数（余额/抽奖成本，向下取整）
   *
   * @example
   * // 管理员查看完整数据
   * const adminPoints = DataSanitizer.sanitizePoints(pointsData, 'full')
   * // 返回：包含earning_rules、discount_rate等完整字段
   *
   * // 普通用户查看脱敏数据
   * const publicPoints = DataSanitizer.sanitizePoints(pointsData, 'public')
   * // 返回：移除敏感字段，只返回基础积分信息
   */
  static sanitizePoints(pointsData, dataLevel) {
    if (dataLevel === 'full') {
      return pointsData
    }

    return {
      balance: pointsData.balance,
      today_earned: pointsData.today_earned,
      can_draw: pointsData.balance >= (pointsData.draw_cost || 100),
      draw_available: Math.floor(pointsData.balance / (pointsData.draw_cost || 100))
      // ❌ 移除敏感字段：earning_rules, discount_rate 详情
    }
  }

  /**
   * 管理员统计数据脱敏 - 解决运营数据泄露
   *
   * 业务场景：管理员统计API响应时调用，防止普通用户通过抓包获取运营数据、收益信息等商业机密
   *
   * 脱敏规则：
   * - 管理员（dataLevel='full'）：返回完整统计数据
   * - 普通用户（dataLevel='public'）：返回模糊化的基础统计，移除revenue（收入）、profit_margin（利润率）、
   *   user_behavior_analytics（用户行为分析）等敏感字段
   * - 使用模糊化显示（如'1000+'）替代具体数字
   *
   * @param {Object} stats - 统计数据对象，包含total_users、revenue、profit_margin等字段
   * @param {string} dataLevel - 数据级别：'full'（管理员完整数据）或'public'（普通用户脱敏数据）
   * @returns {Object} 脱敏后的统计对象
   * @returns {string} return.total_users - 用户总数（模糊化显示，如'1000+'）
   * @returns {string} return.lottery_draws_today - 今日抽奖次数（模糊化显示，如'50+'）
   * @returns {string} return.system_health - 系统健康状态（healthy/warning/error）
   *
   * @example
   * // 管理员查看完整数据
   * const adminStats = DataSanitizer.sanitizeAdminStats(stats, 'full')
   * // 返回：包含revenue、profit_margin、user_behavior_analytics等完整字段
   *
   * // 普通用户查看脱敏数据
   * const publicStats = DataSanitizer.sanitizeAdminStats(stats, 'public')
   * // 返回：模糊化的基础统计，移除敏感运营数据
   */
  static sanitizeAdminStats(stats, dataLevel) {
    if (dataLevel === 'full') {
      return stats // 只有管理员能看到完整统计
    }

    // 普通用户只能看到基础统计
    return {
      total_users: '1000+', // 模糊化用户数量
      lottery_draws_today: '50+',
      system_health: 'healthy'
      // ❌ 移除敏感字段：revenue, profit_margin, user_behavior_analytics
    }
  }

  /**
   * 图片上传响应脱敏 - 解决存储架构泄露
   *
   * 业务场景：图片上传API响应时调用，防止用户通过抓包获取存储架构、内部路径、存储提供商等基础设施信息
   *
   * 脱敏规则：
   * - 管理员（dataLevel='full'）：返回完整上传数据
   * - 普通用户（dataLevel='public'）：移除storage_bucket（存储桶）、storage_region（存储区域）、
   *   internal_path（内部路径）、cost_analysis（成本分析）、storage_provider（存储提供商）、
   *   backup_info（备份信息）等敏感字段
   * - 只返回业务必需的上传信息：上传ID、状态、文件名、大小显示、成功标识
   *
   * @param {Object} uploadData - 上传数据对象，包含upload_id、storage_bucket、storage_region等字段
   * @param {string} dataLevel - 数据级别：'full'（管理员完整数据）或'public'（普通用户脱敏数据）
   * @returns {Object} 脱敏后的上传对象
   * @returns {string} return.upload_id - 上传ID
   * @returns {string} return.status - 上传状态
   * @returns {string} return.filename - 文件名（public_filename）
   * @returns {string} return.size_display - 大小显示（友好格式）
   * @returns {boolean} return.success - 是否成功
   *
   * @example
   * // 管理员查看完整数据
   * const adminUpload = DataSanitizer.sanitizeUpload(uploadData, 'full')
   * // 返回：包含storage_bucket、storage_region、internal_path等完整字段
   *
   * // 普通用户查看脱敏数据
   * const publicUpload = DataSanitizer.sanitizeUpload(uploadData, 'public')
   * // 返回：移除敏感字段，只返回基础上传信息
   */
  static sanitizeUpload(uploadData, dataLevel) {
    if (dataLevel === 'full') {
      return uploadData
    }

    return {
      upload_id: uploadData.upload_id,
      status: uploadData.status,
      filename: uploadData.public_filename,
      size_display: uploadData.size_display,
      success: uploadData.success
      /*
       * ❌ 移除敏感字段：storage_bucket, storage_region, internal_path,
       * cost_analysis, storage_provider, backup_info
       */
    }
  }

  /**
   * 聊天会话数据脱敏 - 解决用户隐私泄露
   *
   * 业务场景：聊天会话列表API响应时调用，防止用户通过抓包获取其他用户的内部备注、升级原因等隐私信息
   *
   * 脱敏规则：
   * - 管理员（dataLevel='full'）：返回完整会话数据
   * - 普通用户（dataLevel='public'）：移除internal_notes（内部备注）、escalation_reasons（升级原因）、
   *   admin_notes（管理员备注）等敏感字段
   * - 只返回业务必需的会话信息：会话ID、类型、状态、最后消息、未读数量、创建时间
   *
   * @param {Array<Object>} sessions - 会话数据数组，包含customer_service_session_id、internal_notes等字段
   * @param {string} dataLevel - 数据级别：'full'（管理员完整数据）或'public'（普通用户脱敏数据）
   * @returns {Array<Object>} 脱敏后的会话数组
   * @returns {number} return[].session_id - 会话ID（剥离 customer_service_ 模块前缀）
   * @returns {string} return[].type - 会话类型
   * @returns {string} return[].status - 会话状态
   * @returns {Object|null} return[].last_message - 最后消息对象（包含content、sender_type、created_at）
   * @returns {number} return[].unread_count - 未读消息数量
   * @returns {string} return[].created_at - 创建时间
   *
   * @example
   * // 管理员查看完整数据
   * const adminSessions = DataSanitizer.sanitizeChatSessions(sessions, 'full')
   * // 返回：包含internal_notes、escalation_reasons、admin_notes等完整字段
   *
   * // 普通用户查看脱敏数据
   * const publicSessions = DataSanitizer.sanitizeChatSessions(sessions, 'public')
   * // 返回：移除敏感字段，只返回基础会话信息
   */
  /**
   * 聊天会话数据脱敏
   *
   * 业务场景：聊天会话列表API响应时调用，防止用户通过抓包获取敏感信息
   *
   * 脱敏规则：
   * - 管理员（dataLevel='full'）：返回完整会话数据（包含internal_notes、escalation_reasons等）
   * - 普通用户（dataLevel='public'）：仅返回基础字段（id、status、messages、created_at）
   *
   * 数据安全：
   * - 移除敏感字段：internal_notes（内部备注）、escalation_reasons（升级原因）、admin_notes（客服备注）
   * - 保留业务字段：id（脱敏会话ID）、status、messages（消息关联数据）、created_at
   *
   * @param {Array} sessions - 会话列表数组（Sequelize查询结果）
   * @param {string} dataLevel - 数据级别（'full'管理员完整数据 / 'public'普通用户脱敏数据）
   * @returns {Array} 脱敏后的会话列表数组
   *
   * @example
   * // 管理员查看完整数据
   * const adminSessions = DataSanitizer.sanitizeChatSessions(sessions, 'full')
   *
   * @example
   * // 普通用户查看脱敏数据
   * const publicSessions = DataSanitizer.sanitizeChatSessions(sessions, 'public')
   */
  static sanitizeChatSessions(sessions, dataLevel) {
    // 管理员权限：返回完整数据（不脱敏）
    if (dataLevel === 'full') {
      return sessions
    }

    /*
     * γ 模式：黑名单删除敏感字段
     */
    return sessions.map(session => {
      const sanitized = { ...(session.toJSON ? session.toJSON() : session) }

      // 主键统一（剥离 customer_service_ 模块前缀）
      sanitized.session_id = sanitized.customer_service_session_id
      delete sanitized.customer_service_session_id

      // 黑名单：删除内部管理字段
      delete sanitized.admin_id
      delete sanitized.closed_by
      delete sanitized.close_reason
      delete sanitized.satisfaction_score
      delete sanitized.first_response_at
      delete sanitized.internal_notes
      delete sanitized.escalation_reasons
      delete sanitized.admin_notes
      delete sanitized.toJSON

      return sanitized
    })
  }

  /**
   * 积分记录数据脱敏（γ 模式：基于 V4 asset_transactions 表结构）
   *
   * 🗄️ 数据库表：asset_transactions（主键：asset_transaction_id）
   *
   * 委托 _sanitizeAssetTransactions() 实现（子决策 3：两个方法名保留，内部共享实现）
   *
   * @param {Array<Object>} records - 资产流水数组（来自 asset_transactions 查询）
   * @param {string} dataLevel - 数据级别
   * @returns {Array<Object>} 脱敏后的流水数组
   */
  static sanitizePointsRecords(records, dataLevel) {
    return this._sanitizeAssetTransactions(records, dataLevel)
  }

  /**
   * 交易市场挂单数据脱敏（γ 模式：接收 MarketListingQueryService 输出，只做安全过滤）
   *
   * 🗄️ 数据库表：market_listings（主键：market_listing_id，V4 报价-出价架构）
   *
   * 业务场景：交易市场商品列表 API 响应时调用，脱敏卖家信息和内部字段
   *
   * γ 模式职责：
   * - 接收 MarketListingQueryService 已转换的 V4 格式数据
   * - 主键统一：market_listing_id → listing_id（剥离 market_ 模块前缀）
   * - PII 脱敏：seller_nickname 经 maskUserName() 处理
   * - 删除内部字段：locked_by_order_id、seller_contact 等
   *
   * @param {Array<Object>} listings - 挂单数据数组（来自 MarketListingQueryService）
   * @param {string} dataLevel - 数据级别：'full'（管理员）或 'public'（普通用户）
   * @returns {Array<Object>} 脱敏后的挂单数组
   * @returns {number} return[].listing_id - 挂单ID（剥离 market_ 前缀）
   * @returns {string} return[].listing_kind - 挂单类型（item/fungible_asset）
   * @returns {number} return[].seller_user_id - 卖家用户ID
   * @returns {string} return[].seller_nickname - 卖家昵称（经 maskUserName 脱敏）
   * @returns {number} return[].price_amount - 价格
   * @returns {string} return[].price_asset_code - 价格资产代码
   * @returns {string} return[].status - 挂单状态
   */
  static sanitizeMarketProducts(listings, dataLevel) {
    if (dataLevel === 'full') {
      return listings
    }

    /*
     * γ 模式：黑名单删除敏感字段
     */
    return listings.map(listing => {
      const sanitized = { ...(listing.toJSON ? listing.toJSON() : listing) }

      // 主键统一（剥离 market_ 模块前缀）
      sanitized.listing_id = sanitized.market_listing_id
      delete sanitized.market_listing_id

      // PII 脱敏：卖家昵称（保留首尾字符，中间用 * 替代）
      sanitized.seller_nickname = this.maskUserName(
        sanitized.seller_nickname || sanitized.seller?.nickname
      )
      sanitized.seller_avatar_url =
        sanitized.seller_avatar_url || sanitized.seller?.avatar_url || null
      delete sanitized.seller

      // 黑名单：删除内部字段
      delete sanitized.idempotency_key
      delete sanitized.seller_offer_frozen
      delete sanitized.locked_by_order_id
      delete sanitized.locked_at
      delete sanitized.seller_contact
      delete sanitized.transaction_fees
      delete sanitized.profit_analysis
      delete sanitized.internal_remark
      // Sequelize include 关联对象（含 owner_account_id、locks、meta 等敏感信息）
      delete sanitized.offerItem
      delete sanitized.offerItemTemplate

      return sanitized
    })
  }

  /**
   * 用户统计数据脱敏 - 新增前端需求
   *
   * 业务场景：用户统计API响应时调用，防止用户通过抓包获取消费模式、预测模型、风险评分等敏感分析数据
   *
   * 脱敏规则：
   * - 管理员（dataLevel='full'）：返回完整统计数据
   * - 普通用户（dataLevel='public'）：移除spending_pattern（消费模式）、prediction_model（预测模型）、
   *   risk_score（风险评分）等敏感字段
   * - 只返回业务必需的基础统计信息：抽奖次数、兑换次数、消费记录统计、积分统计等
   *
   * @param {Object} statistics - 统计数据对象，包含user_id、lottery_count、spending_pattern等字段
   * @param {string} dataLevel - 数据级别：'full'（管理员完整数据）或'public'（普通用户脱敏数据）
   * @returns {Object} 脱敏后的统计对象
   * @returns {number} return.user_id - 用户ID
   * @returns {number} return.lottery_count - 抽奖次数
   * @returns {number} return.exchange_count - 兑换次数
   * @returns {number} return.consumption_count - 消费记录数量
   * @returns {number} return.consumption_amount - 消费总金额
   * @returns {number} return.consumption_points - 消费获得积分
   * @returns {Object} return.points_account - 积分账户信息（V4.6统一：采用points_account结构）
   * @returns {number} return.points_account.available_points - 可用积分
   * @returns {number} return.points_account.frozen_points - 冻结积分
   * @returns {number} return.points_account.total_points - 总积分
   * @returns {number} return.total_points_earned - 总获得积分
   * @returns {string} return.account_created - 账户创建时间
   * @returns {string} return.last_activity - 最后活动时间
   * @returns {Array<Object>} return.achievements - 成就列表（仅已解锁的成就）
   *
   * @example
   * const adminStats = DataSanitizer.sanitizeUserStatistics(statistics, 'full')
   * const publicStats = DataSanitizer.sanitizeUserStatistics(statistics, 'public')
   */
  static sanitizeUserStatistics(statistics, dataLevel) {
    if (dataLevel === 'full') {
      return statistics // 管理员看完整数据
    }

    // 用户查看自己的统计数据时，应该包含基本的积分、抽奖、库存等信息
    return {
      user_id: statistics.user_id,
      account_created: statistics.account_created,
      last_activity: statistics.last_activity,

      // 抽奖统计（用户应该看到自己的抽奖记录）- V4.0语义更新
      lottery_count: statistics.lottery_count,
      lottery_high_tier_wins: statistics.lottery_high_tier_wins, // V4.0：高档奖励次数
      lottery_high_tier_rate: statistics.lottery_high_tier_rate, // V4.0：高档奖励率

      // 库存统计（用户应该看到自己的库存）
      inventory_total: statistics.inventory_total, // 🔥 方案A修复：添加库存总数
      inventory_available: statistics.inventory_available, // 🔥 方案A修复：添加可用库存

      /*
       * 积分统计（用户应该看到自己的积分余额和交易记录）
       * V4.6决策A2：统一使用 points_account 结构
       */
      points_account: statistics.points_account || {
        available_points: 0,
        frozen_points: 0,
        total_points: 0
      },
      total_points_earned: statistics.total_points_earned,
      total_points_consumed: statistics.total_points_consumed, // 🔥 方案A修复：添加消耗积分
      transaction_count: statistics.transaction_count, // 🔥 方案A修复：添加交易次数

      // 兑换统计
      exchange_count: statistics.exchange_count,
      exchange_points_spent: statistics.exchange_points_spent, // 🔥 方案A修复：添加兑换花费积分

      // 商家扫码录入消费记录统计
      consumption_count: statistics.consumption_count,
      consumption_amount: statistics.consumption_amount,
      consumption_points: statistics.consumption_points,

      // 活跃度评分
      activity_score: statistics.activity_score, // 🔥 方案A修复：添加活跃度评分

      // 成就徽章
      achievements: statistics.achievements?.filter(a => a.unlocked) || []

      // ❌ 移除敏感字段：spending_pattern, prediction_model, risk_score（仅管理员可见）
    }
  }

  /**
   * 反馈系统数据脱敏 - 新增前端需求
   *
   * 业务场景：反馈列表API响应时调用，防止用户通过抓包获取用户IP、设备信息、管理员ID、内部备注等敏感信息
   *
   * 脱敏规则：
   * - 管理员（dataLevel='full'）：返回完整反馈数据（包含所有字段）
   * - 普通用户（dataLevel='public'）：移除user_ip（用户IP）、device_info（设备信息）、
   *   admin_id（管理员ID）、internal_notes（内部备注）等敏感字段
   * - 使用maskAdminName()对管理员名称进行脱敏处理（如"张**"）
   *
   * ✅ P0修复：
   * - 修复字段映射：id → feedback_id（使用正确的主键字段）
   * - 添加缺失字段：priority、estimated_response_time、attachments
   * - 完善回复信息：支持reply_content字段和admin关联对象
   *
   * @param {Array<Object>} feedbacks - 反馈数据数组，包含feedback_id、category、user_ip、admin_id等字段
   * @param {string} dataLevel - 数据级别：'full'（管理员完整数据）或'public'（普通用户脱敏数据）
   * @returns {Array<Object>} 脱敏后的反馈数组
   * @returns {number} return[].feedback_id - 反馈ID（数据库主键原样输出）
   * @returns {string} return[].category - 反馈分类（technical/feature/bug/complaint/suggestion/other）
   * @returns {string} return[].content - 反馈内容（TEXT，1-5000字符）
   * @returns {string} return[].status - 反馈状态（pending/processing/replied/closed）
   * @returns {string} return[].priority - 优先级（high/medium/low）✅ 新增字段
   * @returns {string} return[].created_at - 创建时间（北京时间）
   * @returns {string} return[].estimated_response_time - 预计响应时间（如"4小时内"）✅ 新增字段
   * @returns {Array} return[].attachments - 附件URLs（JSON数组）✅ 新增字段
   * @returns {Object|null} return[].reply - 回复对象（包含content、replied_at、admin_name（脱敏））
   *
   * @example
   * const adminFeedbacks = DataSanitizer.sanitizeFeedbacks(feedbacks, 'full')
   * const publicFeedbacks = DataSanitizer.sanitizeFeedbacks(feedbacks, 'public')
   */
  static sanitizeFeedbacks(feedbacks, dataLevel) {
    if (dataLevel === 'full') {
      return feedbacks // 管理员看完整数据（包含所有字段）
    }

    /*
     * γ 模式：黑名单删除敏感字段
     */
    return feedbacks.map(feedback => {
      const sanitized = { ...(feedback.toJSON ? feedback.toJSON() : feedback) }

      /*
       * 派生字段：Unix 时间戳
       * 模型 getter 将 created_at 格式化为中文字符串（如"2026年2月21日星期六 20:08:35"），
       * 无法被 new Date() 解析。优先从 Sequelize 别名 createdAt（保留原始格式）
       * 或模型实例的 getDataValue 取得可解析的日期值。
       */
      const parseableDate = feedback.getDataValue
        ? feedback.getDataValue('created_at')
        : sanitized.createdAt || sanitized.created_at
      const parsedTime = parseableDate ? new Date(parseableDate).getTime() : NaN
      sanitized.created_at_timestamp = Number.isFinite(parsedTime) ? parsedTime : null

      // 构建回复对象（PII 脱敏：管理员昵称）
      sanitized.reply = sanitized.reply_content
        ? {
            content: sanitized.reply_content,
            replied_at: sanitized.replied_at,
            admin_name: this.maskAdminName(sanitized.admin?.nickname || '系统管理员')
          }
        : null

      // 黑名单：删除敏感字段（PII + 内部管理信息）
      delete sanitized.user_ip
      delete sanitized.device_info
      delete sanitized.internal_notes
      delete sanitized.admin_id
      delete sanitized.reply_content
      delete sanitized.replied_at
      delete sanitized.admin

      return sanitized
    })
  }

  /**
   * 交易记录数据脱敏（γ 模式：基于 V4 asset_transactions 表结构）
   *
   * 🗄️ 数据库表：asset_transactions（主键：asset_transaction_id）
   *
   * 委托 _sanitizeAssetTransactions() 实现（子决策 3：两个方法名保留，内部共享实现）
   *
   * @param {Array<Object>} records - 资产流水数组（来自 asset_transactions 查询）
   * @param {string} dataLevel - 数据级别
   * @returns {Array<Object>} 脱敏后的流水数组
   */
  static sanitizeTransactionRecords(records, dataLevel) {
    return this._sanitizeAssetTransactions(records, dataLevel)
  }

  /**
   * 资产流水脱敏共享实现（子决策 3：sanitizePointsRecords 和 sanitizeTransactionRecords 共享）
   *
   * 🗄️ 数据库表：asset_transactions（主键：asset_transaction_id）
   *
   * γ 模式职责：
   * - 主键统一：asset_transaction_id → transaction_id（剥离 asset_ 模块前缀）
   * - 添加 business_type_display 中文映射（子决策 2：机器码 + 中文并存）
   * - 过滤 BUDGET_POINTS 等禁止暴露的资产记录
   * - 删除内部字段：account_id、idempotency_key、frozen_amount_change、lottery_session_id
   * - **保留 `transaction_no`（TX 流水号）**：面向用户/客服的可读编号，非敏感，不得加入删除黑名单（编码统一 2026-03）
   *
   * @param {Array<Object>} records - 资产流水数组
   * @param {string} dataLevel - 数据级别
   * @returns {Array<Object>} 脱敏后的流水数组
   * @private
   */
  static _sanitizeAssetTransactions(records, dataLevel) {
    if (dataLevel === 'full') {
      return records
    }

    /*
     * γ 模式：先过滤禁止资产，再黑名单删除敏感字段
     */
    const filtered = this.filterForbiddenAssets(records)

    return filtered.map(record => {
      const sanitized = { ...(record.toJSON ? record.toJSON() : record) }

      // 主键统一（剥离 asset_ 模块前缀）
      sanitized.transaction_id = sanitized.asset_transaction_id
      delete sanitized.asset_transaction_id

      // 补充派生字段（在删除 meta 前提取）
      sanitized.business_type_display = this.getPublicSource(sanitized.business_type)
      sanitized.description = sanitized.meta?.description || sanitized.meta?.title || null
      sanitized.title = sanitized.meta?.title || null

      // BIGINT → Number 转换（避免 bigNumberStrings 返回字符串）
      if (sanitized.transaction_id !== undefined) {
        sanitized.transaction_id = Number(sanitized.transaction_id)
      }
      if (sanitized.delta_amount !== undefined) {
        sanitized.delta_amount = Number(sanitized.delta_amount)
      }
      if (sanitized.balance_before !== undefined) {
        sanitized.balance_before = Number(sanitized.balance_before)
      }
      if (sanitized.balance_after !== undefined) {
        sanitized.balance_after = Number(sanitized.balance_after)
      }

      // 黑名单：删除内部字段
      delete sanitized.account_id
      delete sanitized.idempotency_key
      delete sanitized.frozen_amount_change
      delete sanitized.lottery_session_id
      delete sanitized.meta

      return sanitized
    })
  }

  /**
   * 系统概览数据脱敏 - 新增管理员需求
   *
   * 业务场景：系统概览API响应时调用，确保只有管理员可以查看系统概览数据
   *
   * 脱敏规则：
   * - 管理员（dataLevel='full'）：返回完整系统概览数据
   * - 普通用户（dataLevel!='full'）：返回权限不足错误
   *
   * @param {Object} overview - 系统概览数据对象
   * @param {string} dataLevel - 数据级别：'full'（管理员完整数据）或其他（普通用户无权查看）
   * @returns {Object} 系统概览数据对象（管理员）或错误对象（普通用户）
   * @returns {Object} return - 当dataLevel='full'时，返回完整系统概览数据
   * @returns {Object} return.error - 当dataLevel!='full'时，返回'Access denied'
   * @returns {string} return.message - 当dataLevel!='full'时，返回'权限不足，无法查看系统概览'
   *
   * @example
   * const adminOverview = DataSanitizer.sanitizeSystemOverview(overview, 'full')
   * const publicOverview = DataSanitizer.sanitizeSystemOverview(overview, 'public')
   * // 返回：{ error: 'Access denied', message: '权限不足，无法查看系统概览' }
   */
  static sanitizeSystemOverview(overview, dataLevel) {
    if (dataLevel !== 'full') {
      // 普通用户无权查看系统概览
      return {
        error: 'Access denied',
        message: '权限不足，无法查看系统概览'
      }
    }

    return overview // 管理员看完整数据
  }

  /**
   * 管理员今日统计数据脱敏 - 新增管理员需求
   *
   * 业务场景：管理员今日统计API响应时调用，确保只有管理员可以查看今日统计数据，并标记敏感字段
   *
   * 脱敏规则：
   * - 管理员（dataLevel='full'）：返回完整统计数据，但标记敏感字段
   * - 普通用户（dataLevel!='full'）：返回权限不足错误
   * - 敏感字段标记：在返回数据中添加_sensitive_fields数组，列出敏感字段路径
   *
   * @param {Object} stats - 今日统计数据对象
   * @param {string} dataLevel - 数据级别：'full'（管理员完整数据）或其他（普通用户无权查看）
   * @returns {Object} 统计数据对象（管理员）或错误对象（普通用户）
   * @returns {Object} return - 当dataLevel='full'时，返回完整统计数据并添加标记字段
   * @returns {string} return._data_level - 数据级别标识（'admin_full'）
   * @returns {boolean} return._sanitized - 是否已脱敏标识（true）
   * @returns {Array<string>} return._sensitive_fields - 敏感字段路径数组
   * @returns {Object} return.error - 当dataLevel!='full'时，返回'Access denied'
   * @returns {string} return.message - 当dataLevel!='full'时，返回'权限不足，无法查看今日统计数据'
   *
   * @example
   * const adminStats = DataSanitizer.sanitizeAdminTodayStats(stats, 'full')
   * // 返回：{ ...stats, _data_level: 'admin_full', _sanitized: true, _sensitive_fields: [...] }
   * const publicStats = DataSanitizer.sanitizeAdminTodayStats(stats, 'public')
   * // 返回：{ error: 'Access denied', message: '权限不足，无法查看今日统计数据' }
   */
  static sanitizeAdminTodayStats(stats, dataLevel) {
    if (dataLevel !== 'full') {
      // 非管理员无权查看今日统计
      return {
        error: 'Access denied',
        message: '权限不足，无法查看今日统计数据'
      }
    }

    // 管理员看完整数据，但敏感信息需要标记
    return {
      ...stats,
      _data_level: 'admin_full',
      _sanitized: true,
      _sensitive_fields: [
        'user_stats.new_users_today',
        'points_stats.net_points_change',
        'system_health.response_time'
      ]
    }
  }

  /**
   * WebSocket消息脱敏 - 解决实时数据泄露
   *
   * 业务场景：WebSocket实时消息推送时调用，防止用户通过抓包获取管理员专用的实时统计数据、系统指标等敏感信息
   *
   * 脱敏规则：
   * - 管理员（dataLevel='full'）：返回完整WebSocket消息
   * - 普通用户（dataLevel='public'）：移除real_time_stats（实时统计）、admin_notifications（管理员通知）、
   *   probability_adjustments（概率调整）、system_metrics（系统指标）等敏感字段
   * - 只返回业务必需的消息内容
   *
   * @param {Object} message - WebSocket消息对象，包含real_time_stats、admin_notifications等字段
   * @param {string} dataLevel - 数据级别：'full'（管理员完整数据）或'public'（普通用户脱敏数据）
   * @returns {Object} 脱敏后的WebSocket消息对象
   *
   * @example
   * // 管理员查看完整消息
   * const adminMessage = DataSanitizer.sanitizeWebSocketMessage(message, 'full')
   * // 返回：包含real_time_stats、admin_notifications等完整字段
   *
   * // 普通用户查看脱敏消息
   * const publicMessage = DataSanitizer.sanitizeWebSocketMessage(message, 'public')
   * // 返回：移除敏感字段，只返回基础消息内容
   */
  static sanitizeWebSocketMessage(message, dataLevel) {
    if (dataLevel === 'full') {
      return message
    }

    const sanitized = { ...message }
    // 移除管理员专用的实时数据
    delete sanitized.real_time_stats
    delete sanitized.admin_notifications
    delete sanitized.probability_adjustments
    delete sanitized.system_metrics

    return sanitized
  }

  /**
   * 日志数据脱敏 - 防止日志泄露敏感信息
   *
   * 业务场景：日志记录时调用，防止日志文件中泄露中奖概率、预设类型、成本积分等敏感商业信息
   *
   * 脱敏规则：
   * - 使用正则表达式替换敏感字段值
   * - 替换win_probability（中奖概率）为[HIDDEN]
   * - 替换preset_type（预设类型）为[HIDDEN]
   * - 替换cost_points（成本积分）为[HIDDEN]
   * - 替换market_value（市场价值）为[HIDDEN]
   * - 替换acquisition_cost（获取成本）为[HIDDEN]
   *
   * @param {string|Object} logData - 日志数据（字符串或对象，对象会自动转换为JSON字符串）
   * @returns {string} 脱敏后的日志字符串
   *
   * @example
   * // 字符串日志脱敏
   * const sanitized = DataSanitizer.sanitizeLogs('win_probability: 0.05, cost_points: 100')
   * // 返回：'win_probability: [HIDDEN], cost_points: [HIDDEN]'
   *
   * // 对象日志脱敏
   * const sanitized = DataSanitizer.sanitizeLogs({ win_probability: 0.05, cost_points: 100 })
   * // 返回：脱敏后的JSON字符串
   */
  static sanitizeLogs(logData) {
    if (typeof logData !== 'string') {
      logData = JSON.stringify(logData)
    }

    /*
     * 同时支持两种格式：
     * - 字符串日志格式：win_probability: 0.05
     * - JSON格式："win_probability":0.05
     */
    return logData
      .replace(/"?win_probability"?:\s*[\d.]+/g, 'win_probability: [HIDDEN]')
      .replace(/"?preset_type"?:\s*"?\w+"?/g, 'preset_type: [HIDDEN]')
      .replace(/"?cost_points"?:\s*\d+/g, 'cost_points: [HIDDEN]')
      .replace(/"?market_value"?:\s*[\d.]+/g, 'market_value: [HIDDEN]')
      .replace(/"?acquisition_cost"?:\s*\d+/g, 'acquisition_cost: [HIDDEN]')
      .replace(/"?is_fallback"?:\s*(true|false)/g, 'is_fallback: [HIDDEN]')
  }

  // ========== 辅助方法 ==========

  /**
   * 获取奖品图标（辅助方法）
   *
   * 业务场景：奖品脱敏时调用，根据奖品类型返回对应的emoji图标
   *
   * @param {string} prizeType - 奖品类型（points/physical/voucher/virtual/special）
   * @returns {string} 奖品图标（emoji字符）
   * @returns {string} '🪙' - points类型（积分）
   * @returns {string} '🎁' - physical类型（实物）或默认图标
   * @returns {string} '🎫' - voucher类型（券）
   * @returns {string} '💎' - virtual类型（虚拟）
   * @returns {string} '⭐' - special类型（特殊）
   *
   * @example
   * const icon = DataSanitizer.getPrizeIcon('points') // 返回：'🪙'
   * const icon = DataSanitizer.getPrizeIcon('physical') // 返回：'🎁'
   */
  static getPrizeIcon(prizeType) {
    const icons = {
      points: '🪙',
      physical: '🎁',
      voucher: '🎫',
      virtual: '💎',
      special: '⭐'
    }
    return icons[prizeType] || '🎁'
  }

  /**
   * 计算稀有度（辅助方法）
   *
   * 业务场景：奖品脱敏时调用，根据奖品类型返回对应的稀有度等级，用于替代win_probability（中奖概率）
   *
   * @param {string} prizeType - 奖品类型（points/physical/voucher/virtual/special）
   * @returns {string} 稀有度等级
   * @returns {string} 'common' - points类型（普通）
   * @returns {string} 'uncommon' - voucher类型（不普通）
   * @returns {string} 'rare' - virtual类型（稀有）
   * @returns {string} 'epic' - physical类型（史诗）
   * @returns {string} 'legendary' - special类型（传说）
   * @returns {string} 'common' - 未知类型默认值
   *
   * @example
   * const rarity = DataSanitizer.calculateRarity('points') // 返回：'common'
   * const rarity = DataSanitizer.calculateRarity('special') // 返回：'legendary'
   */
  static calculateRarity(prizeType) {
    const rarity = {
      points: 'common',
      voucher: 'uncommon',
      virtual: 'rare',
      physical: 'epic',
      special: 'legendary'
    }
    return rarity[prizeType] || 'common'
  }

  /**
   * 获取显示价值（辅助方法）
   *
   * 业务场景：奖品和库存脱敏时调用，将数值转换为友好的显示文本，用于替代具体的数值
   *
   * @param {number|string} value - 价值数值（数字或字符串）
   * @returns {string} 显示价值文本
   * @returns {string} '高价值' - 当value > 1000时
   * @returns {string} '中价值' - 当value > 100时
   * @returns {string} '基础价值' - 当value <= 100时
   * @returns {string} '未知价值' - 当value不是数字时
   *
   * @example
   * const display = DataSanitizer.getDisplayValue(1500) // 返回：'高价值'
   * const display = DataSanitizer.getDisplayValue(500) // 返回：'中价值'
   * const display = DataSanitizer.getDisplayValue(50) // 返回：'基础价值'
   */
  static getDisplayValue(value) {
    if (typeof value === 'number') {
      if (value > 1000) return '高价值'
      if (value > 100) return '中价值'
      return '基础价值'
    }
    return '未知价值'
  }

  /**
   * 获取来源显示（辅助方法）
   *
   * 业务场景：库存脱敏时调用，将获取方式（acquisition_method）转换为友好的中文显示文本
   *
   * @param {string} method - 获取方式（lottery/exchange/transfer/admin/event）
   * @returns {string} 来源显示文本
   * @returns {string} '抽奖获得' - lottery类型
   * @returns {string} '兑换获得' - exchange类型
   * @returns {string} '转让获得' - transfer类型
   * @returns {string} '系统发放' - admin类型
   * @returns {string} '活动获得' - event类型
   * @returns {string} '其他方式' - 未知类型默认值
   *
   * @example
   * const display = DataSanitizer.getSourceDisplay('lottery') // 返回：'抽奖获得'
   * const display = DataSanitizer.getSourceDisplay('exchange') // 返回：'兑换获得'
   */
  static getSourceDisplay(method) {
    const displays = {
      lottery: '抽奖获得',
      exchange: '兑换获得',
      transfer: '转让获得',
      admin: '系统发放',
      event: '活动获得'
    }
    return displays[method] || '其他方式'
  }

  /**
   * 检查是否即将过期（辅助方法）
   *
   * 业务场景：库存脱敏时调用，判断库存物品是否在7天内过期
   *
   * @param {string|Date|null} expiresAt - 过期时间（字符串、Date对象或null）
   * @returns {boolean} 是否即将过期
   * @returns {boolean} true - 过期时间在7天内且未过期
   * @returns {boolean} false - 已过期、超过7天或expiresAt为null
   *
   * @example
   * const soon = DataSanitizer.checkExpiringSoon('2025-11-05') // 如果今天是2025-10-31，返回：true
   * const soon = DataSanitizer.checkExpiringSoon(null) // 返回：false
   */
  static checkExpiringSoon(expiresAt) {
    if (!expiresAt) return false
    const now = BeijingTimeHelper.createBeijingTime()
    const expiry = new Date(expiresAt)
    const daysLeft = (expiry - now) / (1000 * 60 * 60 * 24)
    return daysLeft <= 7 && daysLeft > 0
  }

  /**
   * 获取 business_type 的中文显示文本（V4 资产账本架构）
   *
   * 业务场景：资产流水脱敏时调用，将 asset_transactions.business_type 转换为用户友好的中文
   * 覆盖实际数据库中 48+ 种 business_type（2026-02-21 基于真实数据验证）
   *
   * 设计决策（子决策 2）：同时输出 business_type（机器码）+ business_type_display（中文）
   * 行业参照：支付宝 biz_type + biz_type_desc、京东金融 bizType + bizTypeName
   *
   * @param {string} businessType - 资产流水业务类型（来自 asset_transactions.business_type）
   * @returns {string} 中文显示文本
   */
  static getPublicSource(businessType) {
    const displayMap = {
      /* 抽奖相关 */
      lottery_consume: '抽奖消耗',
      lottery_reward: '抽奖奖励',
      lottery_reward_material: '抽奖奖励',
      lottery_management: '抽奖管理',
      lottery_budget_deduct: '抽奖预算扣减',
      lottery_budget_rollback: '抽奖预算回退',
      /* 兑换相关 */
      exchange_debit: '兑换扣款',
      exchange_refund: '兑换退款',
      /* 核销相关 */
      redemption_use: '核销使用',
      admin_redemption_fulfill: '管理员核销',
      /* 市场交易相关 */
      market_listing_freeze: '市场挂单冻结',
      market_listing_withdraw_unfreeze: '挂单撤回',
      market_listing_expire_unfreeze: '挂单过期退回',
      listing_withdrawn_unfreeze: '挂单撤回退回',
      listing_settle_seller_offer_debit: '挂单成交扣减',
      listing_transfer_buyer_offer_credit: '挂单成交收入',
      market_transfer: '市场转让',
      admin_force_withdraw_unfreeze: '管理员强制撤回',
      /* 订单相关 */
      order_freeze_buyer: '订单冻结',
      order_settle_buyer_debit: '订单结算',
      order_settle_seller_credit: '卖出收入',
      order_cancel_unfreeze_buyer: '订单取消退回',
      order_unfreeze_buyer: '订单取消退回',
      order_timeout_unfreeze: '订单超时退回',
      order_settle_platform_fee_credit: '平台手续费',
      /* 竞价相关 */
      bid_freeze: '出价冻结',
      bid_unfreeze: '出价退回',
      bid_settle_winner: '竞价成交',
      bid_settle_refund: '竞价退款',
      bid_cancel_refund: '竞价取消退回',
      /* 材料兑换 */
      material_convert_credit: '材料兑换入账',
      material_convert_debit: '材料兑换扣款',
      material_convert_fee: '兑换手续费',
      /* 管理员操作 */
      admin_adjustment: '系统调整',
      admin_grant: '系统发放',
      /* 消费奖励 */
      merchant_points_reward: '消费奖励',
      consumption_reward: '消费奖励',
      consumption_budget_allocation: '消费预算分配',
      /* 广告相关 */
      ad_campaign_freeze: '广告冻结',
      ad_campaign_deduct: '广告扣费',
      ad_campaign_refund: '广告退款',
      ad_campaign_daily_deduct: '广告日扣费',
      /* 空间解锁 */
      premium_unlock: '解锁空间',
      /* 冻结清理 */
      orphan_frozen_cleanup: '冻结清理',
      buyer_orphan_frozen_cleanup: '冻结清理',
      /* 历史数据 */
      opening_balance: '历史余额补录',
      /* 通用 */
      transfer: '用户转让',
      manual: '系统奖励',
      bonus: '奖励积分'
    }

    if (!businessType) return '系统操作'

    if (displayMap[businessType]) return displayMap[businessType]

    /* test_ 前缀的业务类型统一显示为"测试操作"（不暴露内部测试分类） */
    if (businessType.startsWith('test_')) return '测试操作'

    return '系统操作'
  }

  /**
   * 脱敏用户名（辅助方法）
   *
   * 业务场景：交易市场等公开场景调用，对用户名进行脱敏处理，保护用户隐私
   *
   * 脱敏规则：
   * - 用户名长度<=2：不脱敏，直接返回
   * - 用户名长度>2：保留首尾字符，中间用*替代
   *
   * @param {string|null} user_name - 用户名（可为null）
   * @returns {string} 脱敏后的用户名
   * @returns {string} '匿名用户' - 当user_name为null或空时
   * @returns {string} 原用户名 - 当用户名长度<=2时
   * @returns {string} 脱敏用户名 - 当用户名长度>2时（如"张*三"）
   *
   * @example
   * const masked = DataSanitizer.maskUserName('张三') // 返回：'张三'
   * const masked = DataSanitizer.maskUserName('张三丰') // 返回：'张*丰'
   * const masked = DataSanitizer.maskUserName(null) // 返回：'匿名用户'
   */
  static maskUserName(user_name) {
    if (!user_name) return '匿名用户'
    if (user_name.length <= 2) return user_name
    const first = user_name.charAt(0)
    const last = user_name.charAt(user_name.length - 1)
    const middle = '*'.repeat(user_name.length - 2)
    return first + middle + last
  }

  /**
   * 脱敏管理员名称（辅助方法）
   *
   * 业务场景：反馈回复等公开场景调用，对管理员名称进行脱敏处理，保护管理员隐私
   *
   * 脱敏规则：
   * - adminName为null或空：返回'客服'
   * - adminName不为空：返回'客服' + 最后一个字符
   *
   * @param {string|null} adminName - 管理员名称（可为null）
   * @returns {string} 脱敏后的管理员名称
   * @returns {string} '客服' - 当adminName为null或空时
   * @returns {string} '客服X' - 当adminName不为空时（X为最后一个字符）
   *
   * @example
   * const masked = DataSanitizer.maskAdminName(null) // 返回：'客服'
   * const masked = DataSanitizer.maskAdminName('管理员A') // 返回：'客服A'
   */
  static maskAdminName(adminName) {
    if (!adminName) return '客服'
    return '客服' + adminName.slice(-1)
  }

  /**
   * 兑换市场商品列表数据脱敏
   *
   * 🗄️ 数据库表：exchange_items（主键：exchange_item_id）
   * 数据模型：ExchangeItem（兑换商品 SPU 表）
   *
   * 业务场景：兑换市场商品列表API响应时调用，防止泄露商业敏感信息
   *
   * 脱敏规则：
   * - 管理员（dataLevel='full'）：返回完整商品数据
   * - 普通用户（dataLevel='public'）：移除cost_price（成本价）、sold_count（销量统计）等敏感字段
   *
   * 输入契约：
   * - 输入数据必须来自 exchange_items 表的 Sequelize 查询结果
   * - 必须包含 exchange_item_id 字段（数据库主键）
   * - 🔧 2026-03-16 媒体体系：需要 include primary_media（MediaFile 关联）
   *
   * 输出字段（统一规范）：
   * - primary_media_id: 主图媒体ID（关联 media_files 表）
   * - primary_image: 图片对象 { primary_media_id, url, mime, thumbnail_url }，缺失时为 null
   *
   * @param {Array<Object>} items - 商品数据数组（来自 exchange_items 表，需 include primary_media）
   * @param {string} dataLevel - 数据级别：'full'（管理员）或'public'（普通用户）
   * @returns {Array<Object>} 脱敏后的商品数组
   */
  static sanitizeExchangeMarketItems(items, dataLevel) {
    /*
     * γ 模式：黑名单删除敏感字段
     */
    return items.map(item => {
      const plain = item.toJSON ? item.toJSON() : item
      const rawPrimaryMedia = item.primary_media || plain.primary_media
      const sanitized = { ...plain }

      // 图片处理：仅 primary_media（MediaFile）
      if (rawPrimaryMedia && typeof rawPrimaryMedia.toSafeJSON === 'function') {
        const safe = rawPrimaryMedia.toSafeJSON()
        sanitized.primary_image = {
          primary_media_id: safe.media_id,
          url: safe.public_url,
          mime: safe.mime_type,
          thumbnail_url: safe.thumbnails?.small || safe.public_url
        }
      } else if (rawPrimaryMedia?.object_key) {
        sanitized.primary_image = {
          primary_media_id: rawPrimaryMedia.media_id,
          url: getImageUrl(rawPrimaryMedia.object_key),
          mime: rawPrimaryMedia.mime_type,
          thumbnail_url: rawPrimaryMedia.thumbnail_keys?.small
            ? getImageUrl(rawPrimaryMedia.thumbnail_keys.small)
            : getImageUrl(rawPrimaryMedia.object_key)
        }
      } else {
        sanitized.primary_image = null
      }
      delete sanitized.primary_media

      // 补充派生字段（2026-03-16 媒体体系：primary_media_id）
      sanitized.primary_media_id = sanitized.primary_media_id ?? null
      sanitized.space = sanitized.space || 'lucky'
      sanitized.original_price = sanitized.original_price || null
      sanitized.tags = sanitized.tags || null
      sanitized.is_new = !!sanitized.is_new
      sanitized.is_hot = !!sanitized.is_hot
      sanitized.is_lucky = !!sanitized.is_lucky
      sanitized.is_limited = !!sanitized.is_limited
      sanitized.has_warranty = !!sanitized.has_warranty
      sanitized.free_shipping = !!sanitized.free_shipping
      sanitized.sell_point = sanitized.sell_point || null
      sanitized.usage_rules = sanitized.usage_rules || null

      // 多图数据透传（兑换详情页 B+C 混合方案）
      if (sanitized.images !== undefined) {
        sanitized.images = sanitized.images || []
      }
      if (sanitized.detail_images !== undefined) {
        sanitized.detail_images = sanitized.detail_images || []
      }
      if (sanitized.showcase_images !== undefined) {
        sanitized.showcase_images = sanitized.showcase_images || []
      }

      // 黑名单：删除敏感字段（成本价仅管理员可见）
      if (dataLevel !== 'full') {
        delete sanitized.cost_price
      }

      return sanitized
    })
  }

  /**
   * 兑换市场单个商品数据脱敏
   *
   * @param {Object} item - 商品数据
   * @param {string} dataLevel - 数据级别：'full'（管理员）或'public'（普通用户）
   * @returns {Object} 脱敏后的商品数据
   */
  static sanitizeExchangeMarketItem(item, dataLevel) {
    const items = this.sanitizeExchangeMarketItems([item], dataLevel)
    return items[0]
  }

  /**
   * 兑换市场订单列表数据脱敏
   *
   * 🗄️ 数据库表：exchange_records（主键：exchange_record_id）
   *
   * 业务场景：用户查询兑换订单列表时调用，保护订单敏感信息
   *
   * 脱敏规则：
   * - 管理员（dataLevel='full'）：返回完整订单数据
   * - 普通用户（dataLevel='public'）：移除total_cost（成本金额）等敏感字段
   * - **保留 `order_no`（EM/BD 等运营单号）**；删除 `business_id`（内部幂等/关联键，非展示字段）
   *
   * 输入契约：
   * - 输入数据必须来自 exchange_records 表的 Sequelize 查询结果
   * - 必须包含 exchange_record_id 字段（数据库主键）
   *
   * @param {Array<Object>} orders - 订单数据数组（来自 exchange_records 表）
   * @param {string} _dataLevel - 数据级别：'full'（管理员）或'public'（普通用户）（未使用，保留以保持接口一致性）
   * @returns {Array<Object>} 脱敏后的订单数组（exchange_record_id 主键原样输出）
   */
  static sanitizeExchangeMarketOrders(orders, _dataLevel) {
    /*
     * γ 模式：黑名单删除敏感字段
     */
    return orders.map(order => {
      const sanitized = { ...(order.toJSON ? order.toJSON() : order) }

      // 安全处理 item_snapshot（只保留用户可见信息）
      if (sanitized.item_snapshot) {
        sanitized.item_snapshot = {
          item_name: sanitized.item_snapshot.item_name,
          description: sanitized.item_snapshot.description,
          image_url: sanitized.item_snapshot.image_url
        }
      }

      // 黑名单：删除敏感字段（成本 + 内部标识 + 管理员备注）
      delete sanitized.actual_cost
      delete sanitized.total_cost
      delete sanitized.idempotency_key
      delete sanitized.business_id
      delete sanitized.debit_transaction_id
      delete sanitized.admin_remark

      return sanitized
    })
  }

  /**
   * 兑换市场单个订单数据脱敏
   *
   * @param {Object} order - 订单数据
   * @param {string} dataLevel - 数据级别：'full'（管理员）或'public'（普通用户）
   * @returns {Object} 脱敏后的订单数据
   */
  static sanitizeExchangeMarketOrder(order, dataLevel) {
    const orders = this.sanitizeExchangeMarketOrders([order], dataLevel)
    return orders[0]
  }

  /**
   * 🔒 全局敏感资产过滤：从数组中移除包含 BUDGET_POINTS 的记录
   *
   * 业务场景（决策1）：
   * - BUDGET_POINTS 为系统内部资产，绝对禁止暴露给微信小程序前端
   * - 用于过滤资产余额列表、资产类型列表、流水记录等任何包含 asset_code 的数组数据
   *
   * @param {Array<Object>} items - 包含 asset_code 字段的数组
   * @param {string} [assetCodeField='asset_code'] - 资产代码字段名
   * @returns {Array<Object>} 过滤后的数组（不含 BUDGET_POINTS 相关记录）
   */
  static filterForbiddenAssets(items, assetCodeField = 'asset_code') {
    if (!Array.isArray(items)) return items
    return items.filter(item => {
      const code = item[assetCodeField]
      return !FORBIDDEN_FRONTEND_ASSET_CODES.includes(code)
    })
  }

  /**
   * 🔒 检查单个资产代码是否为前端禁止暴露的敏感资产
   *
   * @param {string} assetCode - 资产代码
   * @returns {boolean} 是否为敏感资产（true = 禁止暴露给前端）
   */
  static isForbiddenAsset(assetCode) {
    return FORBIDDEN_FRONTEND_ASSET_CODES.includes(assetCode)
  }
}

module.exports = DataSanitizer
