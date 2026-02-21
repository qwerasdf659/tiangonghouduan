/**
 * 🔐 DataSanitizer 业务数据脱敏单元测试
 *
 * P0-5 任务：创建 DataSanitizer 业务脱敏测试
 *
 * 审计标准：
 * - 审计标准 B-2：奖品概率脱敏
 * - 审计标准 B-3：用户权限脱敏
 * - 审计标准 B-5：商业数据保护
 * - 《个人信息保护法》第51条
 * - 《网络安全法》第42条
 *
 * 测试范围：
 * - services/DataSanitizer.js 各脱敏方法
 * - sanitizePrizes - 奖品数据脱敏
 * - sanitizeInventory - 库存数据脱敏
 * - sanitizeUser - 用户数据脱敏
 * - sanitizePoints - 积分数据脱敏
 * - sanitizeAdminStats - 管理员统计脱敏
 * - sanitizeChatSessions - 聊天会话脱敏
 * - sanitizeAnnouncements - 公告数据脱敏
 * - sanitizeFeedbacks - 反馈数据脱敏
 * - sanitizeExchangeMarketItems - 兑换商品脱敏
 * - sanitizeLogs - 日志脱敏
 *
 * 验收标准：
 * - npm test -- tests/security/business-data-sanitizer.test.js 全部通过
 * - 公开视图中无 win_probability、stock_quantity 等敏感字段
 *
 * @module tests/security/business-data-sanitizer
 * @since 2026-01-28
 */

'use strict'

// 🔐 使用项目已有的业务脱敏服务
const DataSanitizer = require('../../services/DataSanitizer')

describe('🔐 DataSanitizer 业务数据脱敏测试（P0-5）', () => {
  /**
   * B-5-1: 奖品数据脱敏测试
   *
   * 业务场景：抽奖奖品列表返回给普通用户时，隐藏中奖概率等商业机密
   * 安全要求：win_probability、stock_quantity、cost_points 等敏感字段不对外暴露
   */
  describe('B-5-1 奖品数据脱敏（sanitizePrizes）', () => {
    const mockPrizes = [
      {
        lottery_prize_id: 1,
        prize_name: '一等奖',
        prize_type: 'physical',
        win_probability: 0.001,
        stock_quantity: 10,
        prize_value: 1000,
        cost_points: 500,
        max_daily_wins: 1,
        daily_win_count: 0,
        status: 'active',
        sort_order: 1
      },
      {
        lottery_prize_id: 2,
        prize_name: '二等奖',
        prize_type: 'voucher',
        win_probability: 0.05,
        stock_quantity: 100,
        prize_value: 200,
        cost_points: 50,
        status: 'active',
        sort_order: 2
      }
    ]

    test('B-5-1-1 普通用户（public）不可见 win_probability', () => {
      const result = DataSanitizer.sanitizePrizes(mockPrizes, 'public')

      result.forEach(prize => {
        expect(prize).not.toHaveProperty('win_probability')
      })
    })

    test('B-5-1-2 普通用户（public）不可见 stock_quantity', () => {
      const result = DataSanitizer.sanitizePrizes(mockPrizes, 'public')

      result.forEach(prize => {
        expect(prize).not.toHaveProperty('stock_quantity')
      })
    })

    test('B-5-1-3 普通用户（public）不可见 cost_points', () => {
      const result = DataSanitizer.sanitizePrizes(mockPrizes, 'public')

      result.forEach(prize => {
        expect(prize).not.toHaveProperty('cost_points')
      })
    })

    test('B-5-1-4 普通用户（public）保留 rarity_code 字段', () => {
      const result = DataSanitizer.sanitizePrizes(mockPrizes, 'public')

      result.forEach(prize => {
        expect(prize).toHaveProperty('rarity_code')
      })
    })

    test('B-5-1-5 普通用户（public）输出描述性 prize_id 字段（行业标准：{entity}_id）', () => {
      const result = DataSanitizer.sanitizePrizes(mockPrizes, 'public')

      result.forEach(prize => {
        expect(prize).toHaveProperty('prize_id')
        expect(prize).toHaveProperty('prize_name')
        expect(prize).toHaveProperty('prize_type')
        expect(prize).toHaveProperty('prize_value')
        expect(prize).not.toHaveProperty('lottery_prize_id')
      })
    })

    test('B-5-1-6 管理员（full）可见完整数据', () => {
      const result = DataSanitizer.sanitizePrizes(mockPrizes, 'full')

      // 管理员应该能看到原始数据（DECIMAL转换后的数字类型）
      expect(result).toBeInstanceOf(Array)
      expect(result.length).toBe(mockPrizes.length)
    })

    test('B-5-1-7 普通用户（public）prize_id 映射自数据库 lottery_prize_id', () => {
      const result = DataSanitizer.sanitizePrizes(mockPrizes, 'public')

      result.forEach((prize, index) => {
        expect(prize.prize_id).toBe(mockPrizes[index].lottery_prize_id)
        expect(prize.prize_name).toBe(mockPrizes[index].prize_name)
        expect(prize.prize_type).toBe(mockPrizes[index].prize_type)
      })
    })

    test('B-5-1-8 普通用户（public）image 字段为 null 当奖品无图片', () => {
      const result = DataSanitizer.sanitizePrizes(mockPrizes, 'public')

      result.forEach(prize => {
        expect(prize).toHaveProperty('image')
        expect(prize.image).toBeNull()
      })
    })
  })

  /**
   * B-5-2: 库存数据脱敏测试（γ 模式白名单）
   *
   * 业务场景：用户查看自己的库存物品时，通过白名单机制只输出安全字段
   * 安全策略（γ 模式重构后）：不再对敏感字段做脱敏，而是完全不输出
   *   - verification_code → 不输出（改用 has_redemption_code 布尔标识）
   *   - source_id / owner_user_id / item_template_id → 不输出
   */
  describe('B-5-2 库存数据脱敏（sanitizeInventory）', () => {
    const mockInventory = [
      {
        item_instance_id: 1,
        item_type: 'voucher',
        name: '测试券',
        description: '测试描述',
        rarity: 'common',
        status: 'available',
        has_redemption_code: true,
        acquired_at: '2026-01-01',
        expires_at: '2026-12-31',
        allowed_actions: ['redeem', 'sell'],
        status_display_name: '可用',
        item_type_display_name: '兑换券',
        rarity_display_name: '普通',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        owner_user_id: 31,
        item_template_id: 5,
        source: 'lottery',
        verification_code: 'A1B2C3D4',
        verification_expires_at: '2026-02-28',
        source_id: 123
      }
    ]

    test('B-5-2-1 普通用户（public）白名单排除核销码明文', () => {
      const result = DataSanitizer.sanitizeInventory(mockInventory, 'public')

      expect(result[0]).not.toHaveProperty('verification_code')
      expect(result[0].has_redemption_code).toBe(true)
    })

    test('B-5-2-2 普通用户（public）不可见 verification_expires_at', () => {
      const result = DataSanitizer.sanitizeInventory(mockInventory, 'public')

      expect(result[0]).not.toHaveProperty('verification_expires_at')
    })

    test('B-5-2-3 普通用户（public）不可见 source_id', () => {
      const result = DataSanitizer.sanitizeInventory(mockInventory, 'public')

      expect(result[0]).not.toHaveProperty('source_id')
    })

    test('B-5-2-4 管理员（full）可见完整原始数据', () => {
      const result = DataSanitizer.sanitizeInventory(mockInventory, 'full')

      expect(result[0].verification_code).toBe('A1B2C3D4')
      expect(result[0].source_id).toBe(123)
    })

    test('B-5-2-5 普通用户（public）输出描述性 item_instance_id 字段', () => {
      const result = DataSanitizer.sanitizeInventory(mockInventory, 'public')

      expect(result[0]).toHaveProperty('item_instance_id')
      expect(result[0].item_instance_id).toBe(1)
      expect(result[0]).not.toHaveProperty('id')
    })
  })

  /**
   * B-5-3: 用户数据脱敏测试
   *
   * 业务场景：用户信息返回时，隐藏角色权限等敏感信息
   * 安全要求：role、permissions、admin_flags 等字段不对外暴露
   */
  describe('B-5-3 用户数据脱敏（sanitizeUser）', () => {
    const mockUser = {
      user_id: 1,
      nickname: '测试用户',
      avatar_url: 'https://example.com/avatar.jpg',
      mobile: '13612227930',
      role: 'admin',
      permissions: ['manage_users', 'manage_prizes'],
      admin_flags: true,
      can_lottery: true,
      can_exchange: true,
      points_account: {
        available_points: 1000,
        frozen_points: 100,
        total_points: 1100
      },
      created_at: '2026-01-01T00:00:00.000Z'
    }

    test('B-5-3-1 普通用户（public）不可见 role', () => {
      const result = DataSanitizer.sanitizeUser(mockUser, 'public')

      expect(result).not.toHaveProperty('role')
    })

    test('B-5-3-2 普通用户（public）不可见 permissions', () => {
      const result = DataSanitizer.sanitizeUser(mockUser, 'public')

      expect(result).not.toHaveProperty('permissions')
    })

    test('B-5-3-3 普通用户（public）不可见 admin_flags', () => {
      const result = DataSanitizer.sanitizeUser(mockUser, 'public')

      expect(result).not.toHaveProperty('admin_flags')
    })

    test('B-5-3-4 普通用户（public）可见基础信息（γ 模式：使用 DB 真实字段名）', () => {
      const result = DataSanitizer.sanitizeUser(mockUser, 'public')

      expect(result.user_id).toBe(1)
      expect(result.nickname).toBe('测试用户')
      expect(result.avatar_url).toBe('https://example.com/avatar.jpg')
      expect(result.can_lottery).toBe(true)
      expect(result.can_exchange).toBe(true)
      expect(result.points_account).toBeDefined()
    })

    test('B-5-3-4b 普通用户（public）不可见 mobile', () => {
      const result = DataSanitizer.sanitizeUser(mockUser, 'public')

      expect(result).not.toHaveProperty('mobile')
    })

    test('B-5-3-5 管理员（full）可见完整数据', () => {
      const result = DataSanitizer.sanitizeUser(mockUser, 'full')

      expect(result).toEqual(mockUser)
    })
  })

  /**
   * B-5-4: 积分数据脱敏测试
   *
   * 业务场景：用户查询积分时，隐藏积分获取规则等经济模型信息
   * 安全要求：earning_rules、discount_rate 等字段不对外暴露
   */
  describe('B-5-4 积分数据脱敏（sanitizePoints）', () => {
    const mockPointsData = {
      balance: 5000,
      today_earned: 100,
      draw_cost: 100,
      earning_rules: { daily_login: 10, share: 50 },
      discount_rate: 0.8
    }

    test('B-5-4-1 普通用户（public）不可见 earning_rules', () => {
      const result = DataSanitizer.sanitizePoints(mockPointsData, 'public')

      expect(result).not.toHaveProperty('earning_rules')
    })

    test('B-5-4-2 普通用户（public）不可见 discount_rate', () => {
      const result = DataSanitizer.sanitizePoints(mockPointsData, 'public')

      expect(result).not.toHaveProperty('discount_rate')
    })

    test('B-5-4-3 普通用户（public）可见余额和可抽奖次数', () => {
      const result = DataSanitizer.sanitizePoints(mockPointsData, 'public')

      expect(result.balance).toBe(5000)
      expect(result.today_earned).toBe(100)
      expect(result.can_draw).toBe(true)
      expect(result.draw_available).toBe(50) // 5000 / 100 = 50
    })

    test('B-5-4-4 管理员（full）可见完整数据', () => {
      const result = DataSanitizer.sanitizePoints(mockPointsData, 'full')

      expect(result).toEqual(mockPointsData)
    })
  })

  /**
   * B-5-5: 管理员统计数据脱敏测试
   *
   * 业务场景：管理员统计数据不应对普通用户暴露
   * 安全要求：revenue、profit_margin 等运营数据只对管理员可见
   */
  describe('B-5-5 管理员统计数据脱敏（sanitizeAdminStats）', () => {
    const mockStats = {
      total_users: 10000,
      lottery_draws_today: 500,
      revenue: 50000,
      profit_margin: 0.3,
      user_behavior_analytics: { active_rate: 0.6 },
      system_health: 'healthy'
    }

    test('B-5-5-1 普通用户（public）看到模糊化统计', () => {
      const result = DataSanitizer.sanitizeAdminStats(mockStats, 'public')

      expect(result.total_users).toBe('1000+')
      expect(result.lottery_draws_today).toBe('50+')
    })

    test('B-5-5-2 普通用户（public）不可见 revenue', () => {
      const result = DataSanitizer.sanitizeAdminStats(mockStats, 'public')

      expect(result).not.toHaveProperty('revenue')
    })

    test('B-5-5-3 普通用户（public）不可见 profit_margin', () => {
      const result = DataSanitizer.sanitizeAdminStats(mockStats, 'public')

      expect(result).not.toHaveProperty('profit_margin')
    })

    test('B-5-5-4 管理员（full）可见完整数据', () => {
      const result = DataSanitizer.sanitizeAdminStats(mockStats, 'full')

      expect(result).toEqual(mockStats)
    })
  })

  /**
   * B-5-6: 聊天会话数据脱敏测试
   *
   * 业务场景：用户查看聊天会话时，隐藏内部备注等管理员信息
   * 安全要求：internal_notes、escalation_reasons 等字段不对外暴露
   */
  describe('B-5-6 聊天会话数据脱敏（sanitizeChatSessions）', () => {
    const mockSessions = [
      {
        customer_service_session_id: 'session-001',
        status: 'active',
        messages: [],
        internal_notes: '用户反馈问题严重',
        escalation_reasons: ['高优先级'],
        admin_notes: '需要跟进',
        createdAt: '2026-01-01T00:00:00.000Z',
        toJSON: function () {
          return this
        }
      }
    ]

    test('B-5-6-1 普通用户（public）不可见 internal_notes', () => {
      const result = DataSanitizer.sanitizeChatSessions(mockSessions, 'public')

      expect(result[0]).not.toHaveProperty('internal_notes')
    })

    test('B-5-6-2 普通用户（public）不可见 escalation_reasons', () => {
      const result = DataSanitizer.sanitizeChatSessions(mockSessions, 'public')

      expect(result[0]).not.toHaveProperty('escalation_reasons')
    })

    test('B-5-6-3 普通用户（public）可见基础会话信息（session_id 剥离 customer_service_ 前缀）', () => {
      const result = DataSanitizer.sanitizeChatSessions(mockSessions, 'public')

      expect(result[0].session_id).toBe('session-001')
      expect(result[0].status).toBe('active')
    })

    test('B-5-6-4 管理员（full）可见完整数据', () => {
      const result = DataSanitizer.sanitizeChatSessions(mockSessions, 'full')

      expect(result).toEqual(mockSessions)
    })
  })

  /**
   * B-5-7: 公告数据脱敏测试
   *
   * 业务场景：用户查看系统公告时，隐藏管理员ID等内部信息
   * 安全要求：admin_id、internal_notes、target_groups 不对外暴露
   */
  describe('B-5-7 公告数据脱敏（sanitizeAnnouncements）', () => {
    // Mock 数据模拟 Sequelize toJSON() 输出，主键字段名为 system_announcement_id（数据库实际列名）
    const mockAnnouncements = [
      {
        system_announcement_id: 1,
        title: '系统公告',
        content: '公告内容',
        type: 'notice',
        priority: 'high',
        created_at: '2026-01-01',
        expires_at: '2026-12-31',
        is_active: true,
        admin_id: 999,
        internal_notes: '内部备注',
        target_groups: ['vip'],
        view_count: 100,
        creator: {
          user_id: 1,
          nickname: '管理员'
        }
      }
    ]

    test('B-5-7-1 普通用户（public）不可见 admin_id', () => {
      const result = DataSanitizer.sanitizeAnnouncements(mockAnnouncements, 'public')

      expect(result[0]).not.toHaveProperty('admin_id')
    })

    test('B-5-7-2 普通用户（public）不可见 internal_notes', () => {
      const result = DataSanitizer.sanitizeAnnouncements(mockAnnouncements, 'public')

      expect(result[0]).not.toHaveProperty('internal_notes')
    })

    test('B-5-7-3 普通用户（public）不可见 target_groups', () => {
      const result = DataSanitizer.sanitizeAnnouncements(mockAnnouncements, 'public')

      expect(result[0]).not.toHaveProperty('target_groups')
    })

    test('B-5-7-4 普通用户（public）使用 announcement_id 字段（映射自 system_announcement_id）', () => {
      const result = DataSanitizer.sanitizeAnnouncements(mockAnnouncements, 'public')

      // DataSanitizer 将 system_announcement_id 映射为 announcement_id（与 popup_banner_id 命名模式一致）
      expect(result[0].announcement_id).toBe(1)
      // public 级别不暴露数据库内部主键名
      expect(result[0]).not.toHaveProperty('system_announcement_id')
    })

    test('B-5-7-5 管理员（full）可见完整数据且包含 announcement_id 映射', () => {
      const result = DataSanitizer.sanitizeAnnouncements(mockAnnouncements, 'full')

      // full 级别：展开所有原始字段 + 添加 announcement_id（映射自 system_announcement_id）
      expect(result[0].announcement_id).toBe(1)
      expect(result[0].system_announcement_id).toBe(1)
      // 管理员可见敏感字段
      expect(result[0].admin_id).toBe(999)
      expect(result[0].internal_notes).toBe('内部备注')
      expect(result[0].target_groups).toEqual(['vip'])
    })
  })

  /**
   * B-5-8: 反馈数据脱敏测试
   *
   * 业务场景：用户查看反馈时，隐藏IP、设备信息等隐私数据
   * 安全要求：user_ip、device_info、admin_id、internal_notes 不对外暴露
   */
  describe('B-5-8 反馈数据脱敏（sanitizeFeedbacks）', () => {
    const mockFeedbacks = [
      {
        feedback_id: 1,
        category: 'bug',
        content: '发现一个问题',
        status: 'replied',
        priority: 'high',
        created_at: '2026-01-01',
        createdAt: '2026-01-01T00:00:00.000Z',
        estimated_response_time: '4小时内',
        attachments: ['https://example.com/image.jpg'],
        reply_content: '已修复',
        replied_at: '2026-01-02',
        user_ip: '192.168.1.100',
        device_info: { os: 'iOS', version: '15.0' },
        admin_id: 999,
        internal_notes: '需要技术部门处理',
        admin: {
          nickname: '管理员A'
        }
      }
    ]

    test('B-5-8-1 普通用户（public）不可见 user_ip', () => {
      const result = DataSanitizer.sanitizeFeedbacks(mockFeedbacks, 'public')

      expect(result[0]).not.toHaveProperty('user_ip')
    })

    test('B-5-8-2 普通用户（public）不可见 device_info', () => {
      const result = DataSanitizer.sanitizeFeedbacks(mockFeedbacks, 'public')

      expect(result[0]).not.toHaveProperty('device_info')
    })

    test('B-5-8-3 普通用户（public）不可见 admin_id', () => {
      const result = DataSanitizer.sanitizeFeedbacks(mockFeedbacks, 'public')

      expect(result[0]).not.toHaveProperty('admin_id')
    })

    test('B-5-8-4 普通用户（public）不可见 internal_notes', () => {
      const result = DataSanitizer.sanitizeFeedbacks(mockFeedbacks, 'public')

      expect(result[0]).not.toHaveProperty('internal_notes')
    })

    test('B-5-8-5 普通用户（public）看到脱敏的管理员名称', () => {
      const result = DataSanitizer.sanitizeFeedbacks(mockFeedbacks, 'public')

      // 管理员名称脱敏为"客服X"格式
      expect(result[0].reply.admin_name).toMatch(/^客服/)
    })

    test('B-5-8-6 普通用户（public）输出描述性 feedback_id 字段', () => {
      const result = DataSanitizer.sanitizeFeedbacks(mockFeedbacks, 'public')

      expect(result[0]).toHaveProperty('feedback_id')
      expect(result[0].feedback_id).toBe(1)
    })

    test('B-5-8-7 管理员（full）可见完整数据', () => {
      const result = DataSanitizer.sanitizeFeedbacks(mockFeedbacks, 'full')

      expect(result).toEqual(mockFeedbacks)
    })
  })

  /**
   * B-5-9: 兑换商品数据脱敏测试
   *
   * 业务场景：用户查看兑换商品时，隐藏成本价等商业敏感信息
   * 安全要求：cost_price、sold_count 等字段不对外暴露
   */
  describe('B-5-9 兑换商品数据脱敏（sanitizeExchangeMarketItems）', () => {
    const mockItems = [
      {
        exchange_item_id: 1,
        name: '测试商品',
        description: '商品描述',
        cost_asset_code: 'points',
        cost_amount: 100,
        stock: 50,
        status: 'active',
        sort_order: 1,
        created_at: '2026-01-01',
        cost_price: 20,
        sold_count: 100,
        primary_image_id: null,
        primaryImage: null
      }
    ]

    test('B-5-9-1 普通用户（public）不可见 cost_price', () => {
      const result = DataSanitizer.sanitizeExchangeMarketItems(mockItems, 'public')

      expect(result[0]).not.toHaveProperty('cost_price')
    })

    test('B-5-9-2 普通用户（public）可见 sold_count（业务决策：展示"已售N件"）', () => {
      const result = DataSanitizer.sanitizeExchangeMarketItems(mockItems, 'public')

      // 产品决策：sold_count 对普通用户可见，用于前端展示"已售N件"
      expect(result[0]).toHaveProperty('sold_count')
    })

    test('B-5-9-3 普通用户（public）使用描述性 exchange_item_id 字段', () => {
      const result = DataSanitizer.sanitizeExchangeMarketItems(mockItems, 'public')

      expect(result[0].exchange_item_id).toBe(1)
    })

    test('B-5-9-4 管理员（full）可见 cost_price 和 sold_count', () => {
      const result = DataSanitizer.sanitizeExchangeMarketItems(mockItems, 'full')

      expect(result[0].cost_price).toBe(20)
      expect(result[0].sold_count).toBe(100)
    })
  })

  /**
   * B-5-10: 日志数据脱敏测试
   *
   * 业务场景：防止日志中泄露商业敏感信息
   * 安全要求：win_probability、preset_type、cost_points 等字段在日志中脱敏
   */
  describe('B-5-10 日志数据脱敏（sanitizeLogs）', () => {
    test('B-5-10-1 win_probability 在日志中脱敏', () => {
      const logData = 'prize info: win_probability: 0.05, name: test'
      const result = DataSanitizer.sanitizeLogs(logData)

      expect(result).toContain('win_probability: [HIDDEN]')
      expect(result).not.toContain('0.05')
    })

    test('B-5-10-2 preset_type 在日志中脱敏', () => {
      const logData = 'draw info: preset_type: guaranteed, lottery_draw_id: 123'
      const result = DataSanitizer.sanitizeLogs(logData)

      expect(result).toContain('preset_type: [HIDDEN]')
      expect(result).not.toContain('guaranteed')
    })

    test('B-5-10-3 cost_points 在日志中脱敏', () => {
      const logData = 'prize cost: cost_points: 500, lottery_prize_id: 1'
      const result = DataSanitizer.sanitizeLogs(logData)

      expect(result).toContain('cost_points: [HIDDEN]')
      expect(result).not.toContain('500')
    })

    test('B-5-10-4 market_value 在日志中脱敏', () => {
      const logData = 'item value: market_value: 99.99, item_id: 1'
      const result = DataSanitizer.sanitizeLogs(logData)

      expect(result).toContain('market_value: [HIDDEN]')
      expect(result).not.toContain('99.99')
    })

    test('B-5-10-5 acquisition_cost 在日志中脱敏', () => {
      const logData = 'inventory: acquisition_cost: 1000, inventory_id: 1'
      const result = DataSanitizer.sanitizeLogs(logData)

      expect(result).toContain('acquisition_cost: [HIDDEN]')
      expect(result).not.toContain('1000')
    })

    test('B-5-10-6 对象输入自动转换为JSON字符串', () => {
      const logData = {
        win_probability: 0.05,
        cost_points: 100,
        name: 'test prize'
      }
      const result = DataSanitizer.sanitizeLogs(logData)

      expect(result).toContain('win_probability: [HIDDEN]')
      expect(result).toContain('cost_points: [HIDDEN]')
      expect(result).toContain('test prize')
    })
  })

  /**
   * 辅助方法测试
   *
   * 验证 DataSanitizer 的辅助方法行为正确
   */
  describe('辅助方法测试', () => {
    test('getPrizeIcon 根据奖品类型返回正确图标', () => {
      expect(DataSanitizer.getPrizeIcon('points')).toBe('🪙')
      expect(DataSanitizer.getPrizeIcon('physical')).toBe('🎁')
      expect(DataSanitizer.getPrizeIcon('voucher')).toBe('🎫')
      expect(DataSanitizer.getPrizeIcon('virtual')).toBe('💎')
      expect(DataSanitizer.getPrizeIcon('special')).toBe('⭐')
      expect(DataSanitizer.getPrizeIcon('unknown')).toBe('🎁') // 默认值
    })

    test('calculateRarity 根据奖品类型计算稀有度', () => {
      expect(DataSanitizer.calculateRarity('points')).toBe('common')
      expect(DataSanitizer.calculateRarity('voucher')).toBe('uncommon')
      expect(DataSanitizer.calculateRarity('virtual')).toBe('rare')
      expect(DataSanitizer.calculateRarity('physical')).toBe('epic')
      expect(DataSanitizer.calculateRarity('special')).toBe('legendary')
      expect(DataSanitizer.calculateRarity('unknown')).toBe('common') // 默认值
    })

    test('getDisplayValue 根据数值返回显示价值', () => {
      expect(DataSanitizer.getDisplayValue(1500)).toBe('高价值')
      expect(DataSanitizer.getDisplayValue(500)).toBe('中价值')
      expect(DataSanitizer.getDisplayValue(50)).toBe('基础价值')
      expect(DataSanitizer.getDisplayValue('invalid')).toBe('未知价值')
    })

    test('getPublicSource 将 V4 business_type 转换为中文显示', () => {
      expect(DataSanitizer.getPublicSource('lottery_consume')).toBe('抽奖消耗')
      expect(DataSanitizer.getPublicSource('lottery_reward')).toBe('抽奖奖励')
      expect(DataSanitizer.getPublicSource('exchange_debit')).toBe('兑换扣款')
      expect(DataSanitizer.getPublicSource('market_listing_freeze')).toBe('市场挂单冻结')
      expect(DataSanitizer.getPublicSource('order_settle_seller_credit')).toBe('卖出收入')
      expect(DataSanitizer.getPublicSource('admin_adjustment')).toBe('系统调整')
      expect(DataSanitizer.getPublicSource('merchant_points_reward')).toBe('消费奖励')
      expect(DataSanitizer.getPublicSource('transfer')).toBe('用户转让')
      expect(DataSanitizer.getPublicSource('test_grant')).toBe('测试操作')
      expect(DataSanitizer.getPublicSource('unknown_type')).toBe('系统操作')
      expect(DataSanitizer.getPublicSource(null)).toBe('系统操作')
    })

    test('maskUserName 脱敏用户名', () => {
      expect(DataSanitizer.maskUserName('张三')).toBe('张三')
      expect(DataSanitizer.maskUserName('张三丰')).toBe('张*丰')
      expect(DataSanitizer.maskUserName('欧阳克')).toBe('欧*克')
      expect(DataSanitizer.maskUserName(null)).toBe('匿名用户')
      expect(DataSanitizer.maskUserName('')).toBe('匿名用户')
    })

    test('maskAdminName 脱敏管理员名称', () => {
      expect(DataSanitizer.maskAdminName('管理员A')).toBe('客服A')
      expect(DataSanitizer.maskAdminName('张三')).toBe('客服三')
      expect(DataSanitizer.maskAdminName(null)).toBe('客服')
      expect(DataSanitizer.maskAdminName('')).toBe('客服')
    })
  })

  /**
   * B-5-11: 交易市场挂单数据脱敏测试（γ 重写方法）
   *
   * 业务场景：用户浏览交易市场时，脱敏卖家信息和内部字段
   * 安全要求：locked_by_order_id、seller_contact、transaction_fees 等不对外暴露
   */
  describe('B-5-11 交易市场挂单脱敏（sanitizeMarketProducts）', () => {
    const mockListings = [
      {
        market_listing_id: 101,
        listing_kind: 'item_instance',
        seller_user_id: 31,
        seller_nickname: '张三丰',
        seller_avatar_url: 'https://example.com/avatar1.jpg',
        offer_item_display_name: '红宝石碎片',
        offer_item_category_code: 'material',
        price_amount: 500,
        price_asset_code: 'DIAMOND',
        status: 'on_sale',
        item_info: { rarity: 'rare' },
        asset_info: null,
        created_at: '2026-02-01T10:00:00.000+08:00',
        locked_by_order_id: 3200,
        seller_contact: '13612227930',
        transaction_fees: 25,
        profit_analysis: { margin: 0.3 },
        internal_remark: '测试挂单'
      },
      {
        market_listing_id: 102,
        listing_kind: 'fungible_asset',
        seller_user_id: 32,
        seller_nickname: '李四',
        seller_avatar_url: null,
        offer_item_display_name: '积分',
        offer_item_category_code: 'currency',
        price_amount: 100,
        price_asset_code: 'DIAMOND',
        status: 'on_sale',
        item_info: null,
        asset_info: { amount: 1000 },
        created_at: '2026-02-01T11:00:00.000+08:00',
        locked_by_order_id: null,
        seller_contact: '13800138000',
        transaction_fees: 5,
        internal_remark: null
      }
    ]

    test('B-5-11-1 普通用户（public）不可见 locked_by_order_id', () => {
      const result = DataSanitizer.sanitizeMarketProducts(mockListings, 'public')

      result.forEach(item => {
        expect(item).not.toHaveProperty('locked_by_order_id')
      })
    })

    test('B-5-11-2 普通用户（public）不可见 seller_contact', () => {
      const result = DataSanitizer.sanitizeMarketProducts(mockListings, 'public')

      result.forEach(item => {
        expect(item).not.toHaveProperty('seller_contact')
      })
    })

    test('B-5-11-3 普通用户（public）不可见 transaction_fees 和 profit_analysis', () => {
      const result = DataSanitizer.sanitizeMarketProducts(mockListings, 'public')

      result.forEach(item => {
        expect(item).not.toHaveProperty('transaction_fees')
        expect(item).not.toHaveProperty('profit_analysis')
        expect(item).not.toHaveProperty('internal_remark')
      })
    })

    test('B-5-11-4 普通用户（public）主键映射 market_listing_id → listing_id', () => {
      const result = DataSanitizer.sanitizeMarketProducts(mockListings, 'public')

      expect(result[0].listing_id).toBe(101)
      expect(result[1].listing_id).toBe(102)
      expect(result[0]).not.toHaveProperty('market_listing_id')
    })

    test('B-5-11-5 普通用户（public）seller_nickname 经 maskUserName 脱敏', () => {
      const result = DataSanitizer.sanitizeMarketProducts(mockListings, 'public')

      expect(result[0].seller_nickname).toBe('张*丰')
      expect(result[1].seller_nickname).toBe('李四')
    })

    test('B-5-11-6 普通用户（public）保留业务必需字段', () => {
      const result = DataSanitizer.sanitizeMarketProducts(mockListings, 'public')

      result.forEach(item => {
        expect(item).toHaveProperty('listing_id')
        expect(item).toHaveProperty('listing_kind')
        expect(item).toHaveProperty('price_amount')
        expect(item).toHaveProperty('price_asset_code')
        expect(item).toHaveProperty('status')
        expect(item).toHaveProperty('offer_item_display_name')
        expect(item).toHaveProperty('created_at')
      })
    })

    test('B-5-11-7 管理员（full）可见完整原始数据', () => {
      const result = DataSanitizer.sanitizeMarketProducts(mockListings, 'full')

      expect(result).toEqual(mockListings)
    })
  })

  /**
   * B-5-12: 积分记录脱敏测试（γ 重写方法 - 委托 _sanitizeAssetTransactions）
   *
   * 业务场景：用户查看积分流水时，脱敏内部字段
   * 安全要求：account_id、idempotency_key、frozen_amount_change、BUDGET_POINTS 记录不暴露
   */
  describe('B-5-12 积分记录脱敏（sanitizePointsRecords）', () => {
    const mockRecords = [
      {
        asset_transaction_id: 501,
        asset_code: 'POINTS',
        business_type: 'lottery_consume',
        delta_amount: -100,
        balance_before: 5000,
        balance_after: 4900,
        created_at: '2026-02-01T10:00:00.000+08:00',
        account_id: 7,
        idempotency_key: 'test_key_001',
        frozen_amount_change: 0,
        lottery_session_id: 123,
        meta: { description: '抽奖消耗100积分' }
      },
      {
        asset_transaction_id: 502,
        asset_code: 'POINTS',
        business_type: 'lottery_reward',
        delta_amount: 500,
        balance_before: 4900,
        balance_after: 5400,
        created_at: '2026-02-01T10:01:00.000+08:00',
        account_id: 7,
        idempotency_key: 'test_key_002',
        frozen_amount_change: 0,
        lottery_session_id: 123,
        meta: { description: '抽奖奖励500积分' }
      },
      {
        asset_transaction_id: 503,
        asset_code: 'BUDGET_POINTS',
        business_type: 'budget_deduction',
        delta_amount: -500,
        balance_before: 100000,
        balance_after: 99500,
        created_at: '2026-02-01T10:01:00.000+08:00',
        account_id: 1,
        idempotency_key: 'budget_key_001',
        frozen_amount_change: 0,
        lottery_session_id: null,
        meta: {}
      }
    ]

    test('B-5-12-1 普通用户（public）不可见 account_id', () => {
      const result = DataSanitizer.sanitizePointsRecords(mockRecords, 'public')

      result.forEach(record => {
        expect(record).not.toHaveProperty('account_id')
      })
    })

    test('B-5-12-2 普通用户（public）不可见 idempotency_key', () => {
      const result = DataSanitizer.sanitizePointsRecords(mockRecords, 'public')

      result.forEach(record => {
        expect(record).not.toHaveProperty('idempotency_key')
      })
    })

    test('B-5-12-3 普通用户（public）不可见 frozen_amount_change 和 lottery_session_id', () => {
      const result = DataSanitizer.sanitizePointsRecords(mockRecords, 'public')

      result.forEach(record => {
        expect(record).not.toHaveProperty('frozen_amount_change')
        expect(record).not.toHaveProperty('lottery_session_id')
      })
    })

    test('B-5-12-4 普通用户（public）过滤 BUDGET_POINTS 记录', () => {
      const result = DataSanitizer.sanitizePointsRecords(mockRecords, 'public')

      expect(result.length).toBe(2)
      result.forEach(record => {
        expect(record.asset_code).not.toBe('BUDGET_POINTS')
      })
    })

    test('B-5-12-5 普通用户（public）主键映射 asset_transaction_id → transaction_id', () => {
      const result = DataSanitizer.sanitizePointsRecords(mockRecords, 'public')

      expect(result[0].transaction_id).toBe(501)
      expect(result[0]).not.toHaveProperty('asset_transaction_id')
    })

    test('B-5-12-6 普通用户（public）business_type_display 中文映射', () => {
      const result = DataSanitizer.sanitizePointsRecords(mockRecords, 'public')

      expect(result[0].business_type_display).toBe('抽奖消耗')
      expect(result[1].business_type_display).toBe('抽奖奖励')
    })

    test('B-5-12-7 普通用户（public）meta.description 提取为顶层 description', () => {
      const result = DataSanitizer.sanitizePointsRecords(mockRecords, 'public')

      expect(result[0].description).toBe('抽奖消耗100积分')
      expect(result[0]).not.toHaveProperty('meta')
    })

    test('B-5-12-8 管理员（full）可见完整原始数据', () => {
      const result = DataSanitizer.sanitizePointsRecords(mockRecords, 'full')

      expect(result).toEqual(mockRecords)
    })
  })

  /**
   * B-5-13: 交易记录脱敏测试（γ 重写方法 - 与 sanitizePointsRecords 共享实现）
   *
   * 业务场景：用户查看资产交易流水时，脱敏内部字段
   * 安全要求：与积分记录相同的脱敏规则（共享 _sanitizeAssetTransactions 实现）
   */
  describe('B-5-13 交易记录脱敏（sanitizeTransactionRecords）', () => {
    const mockTransactions = [
      {
        asset_transaction_id: 601,
        asset_code: 'DIAMOND',
        business_type: 'market_listing_freeze',
        delta_amount: -500,
        balance_before: 10000,
        balance_after: 9500,
        created_at: '2026-02-01T12:00:00.000+08:00',
        account_id: 7,
        idempotency_key: 'market_freeze_001',
        frozen_amount_change: 500,
        lottery_session_id: null,
        meta: { title: '市场挂单冻结500钻石' }
      },
      {
        asset_transaction_id: 602,
        asset_code: 'DIAMOND',
        business_type: 'order_settle_seller_credit',
        delta_amount: 300,
        balance_before: 9500,
        balance_after: 9800,
        created_at: '2026-02-01T13:00:00.000+08:00',
        account_id: 7,
        idempotency_key: 'settle_seller_001',
        frozen_amount_change: 0,
        lottery_session_id: null,
        meta: { title: '卖出商品收入300钻石' }
      }
    ]

    test('B-5-13-1 普通用户（public）不可见内部字段', () => {
      const result = DataSanitizer.sanitizeTransactionRecords(mockTransactions, 'public')

      result.forEach(record => {
        expect(record).not.toHaveProperty('account_id')
        expect(record).not.toHaveProperty('idempotency_key')
        expect(record).not.toHaveProperty('frozen_amount_change')
        expect(record).not.toHaveProperty('lottery_session_id')
      })
    })

    test('B-5-13-2 普通用户（public）主键映射和中文映射', () => {
      const result = DataSanitizer.sanitizeTransactionRecords(mockTransactions, 'public')

      expect(result[0].transaction_id).toBe(601)
      expect(result[0].business_type_display).toBe('市场挂单冻结')
      expect(result[1].business_type_display).toBe('卖出收入')
    })

    test('B-5-13-3 普通用户（public）meta.title 提取为顶层 description', () => {
      const result = DataSanitizer.sanitizeTransactionRecords(mockTransactions, 'public')

      expect(result[0].description).toBe('市场挂单冻结500钻石')
      expect(result[1].description).toBe('卖出商品收入300钻石')
    })

    test('B-5-13-4 普通用户（public）保留业务必需字段', () => {
      const result = DataSanitizer.sanitizeTransactionRecords(mockTransactions, 'public')

      result.forEach(record => {
        expect(record).toHaveProperty('transaction_id')
        expect(record).toHaveProperty('asset_code')
        expect(record).toHaveProperty('business_type')
        expect(record).toHaveProperty('delta_amount')
        expect(record).toHaveProperty('balance_before')
        expect(record).toHaveProperty('balance_after')
        expect(record).toHaveProperty('created_at')
      })
    })

    test('B-5-13-5 管理员（full）可见完整原始数据', () => {
      const result = DataSanitizer.sanitizeTransactionRecords(mockTransactions, 'full')

      expect(result).toEqual(mockTransactions)
    })
  })
})
