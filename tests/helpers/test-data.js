/**
 * 🎯 统一测试数据管理中心
 *
 * 创建时间: 2025年11月12日
 * 版本: V4.1
 *
 * 业务背景：
 * - 项目使用真实MySQL数据库进行测试(restaurant_points_dev)
 * - 所有测试共用一个测试用户(mobile: 13612227930)
 * - 需要避免测试数据冲突和不一致
 *
 * 设计原则：
 * - 单一数据源：所有测试数据从这里获取
 * - 业务语义明确：每个测试数据都有清晰的业务含义
 * - 易于维护：修改测试数据只需要改这一个文件
 * - 真实数据：不使用Mock数据,使用真实数据库数据
 * - 北京时间标准：所有时间数据使用BeijingTimeHelper生成，确保时区一致性
 *
 * 🔴 P0-1修复（2026-01-08）：
 * - 移除硬编码的 user_id=31、lottery_campaign_id=2
 * - 通过 getTestUserId()、getTestCampaignId() 从 global.testData 动态获取
 * - 测试数据由 jest.setup.js 在测试启动时从数据库加载
 */

// 引入北京时间辅助工具
const BeijingTimeHelper = require('../../utils/timeHelper')

/**
 * 🔴 P0-1修复：获取动态测试用户ID
 *
 * @description 从 global.testData 获取测试用户ID，如果未初始化则返回 null
 * @returns {number|null} 用户ID
 */
function getTestUserId() {
  if (global.testData && global.testData.testUser && global.testData.testUser.user_id) {
    return global.testData.testUser.user_id
  }
  console.warn('⚠️ [test-data] global.testData.testUser.user_id 未初始化')
  return null
}

/**
 * 获取动态管理员用户ID（超级管理员 13612227910，role_level>=100）
 *
 * @description 从 global.testData.adminUser 获取管理员用户ID，未初始化则返回 null
 * @returns {number|null} 管理员用户ID
 */
function getAdminUserId() {
  if (global.testData && global.testData.adminUser && global.testData.adminUser.user_id) {
    return global.testData.adminUser.user_id
  }
  console.warn('⚠️ [test-data] global.testData.adminUser.user_id 未初始化')
  return null
}

/**
 * 🔴 P0-1修复：获取动态测试活动ID
 *
 * @description 从 global.testData 获取测试活动ID，如果未初始化则返回 null
 * @returns {number|null} 活动ID
 */
function getTestCampaignId() {
  if (global.testData && global.testData.testCampaign && global.testData.testCampaign.lottery_campaign_id) {
    return global.testData.testCampaign.lottery_campaign_id
  }
  console.warn('⚠️ [test-data] global.testData.testCampaign.lottery_campaign_id 未初始化')
  return null
}

const TEST_DATA = {
  /*
   * ==========================================
   * 📱 测试用户数据（基于项目实际使用）
   * 🔴 P0-1修复：user_id 通过 getter 动态获取，不再硬编码
   * ==========================================
   */
  users: {
    // 默认测试用户（基于 tests/helpers/test-setup.js）
    // 🔴 P0-1修复：user_id 使用 getter 动态获取
    get testUser() {
      return {
        user_id: getTestUserId(), // 🔴 P0-1修复：动态获取，不再硬编码
        mobile: '13612227930', // 测试手机号
        nickname: '测试用户' // 用户昵称
        /*
         * 业务含义：默认测试用户，用于所有需要用户身份的测试场景
         * 使用场景：积分测试、抽奖测试、订单测试等
         */
      }
    },

    // 管理员测试用户（超级管理员 13612227910，role_level>=100，用于后台管理接口测试）
    get adminUser() {
      return {
        user_id: getAdminUserId(), // 动态获取超管 user_id（区别于普通测试用户）
        mobile: '13612227910', // 超级管理员手机号（.env SUPER_ADMIN_MOBILE）
        role: 'admin' // 角色：管理员
        /*
         * 业务含义：超级管理员用户（role_level>=100），用于测试后台管理功能
         * 使用场景：商家审核、订单管理、竞价管理、数据统计等需要管理员权限的接口
         * 注意：与普通测试用户 13612227930（regional_manager:80）是不同账号，权限不同
         */
      }
    }
  },

  /*
   * ==========================================
   * 🎁 测试奖品数据
   * ==========================================
   */
  prizes: {
    // 积分奖品（最常见）
    pointsPrize: {
      lottery_campaign_prize_id: 1, // 奖品ID（假设值,需要从数据库确认）
      name: '100积分',
      type: 'points',
      value: 100,
      probability: 0.5 // 50%概率
      /*
       * 业务含义：基础积分奖品，用于测试积分获取流程
       * 使用场景：抽奖测试、积分测试
       */
    },

    // 实物奖品
    physicalPrize: {
      lottery_campaign_prize_id: 2, // 奖品ID（假设值,需要从数据库确认）
      name: '测试商品',
      type: 'physical',
      value: 50, // 50元
      stock: 100
      /*
       * 业务含义：实物奖品，用于测试兑换和发货流程
       * 使用场景：兑换测试、物流测试
       */
    },

    // 谢谢参与（保底奖品）
    thanksPrize: {
      lottery_campaign_prize_id: 3, // 奖品ID（假设值,需要从数据库确认）
      name: '谢谢参与',
      type: 'thanks',
      value: 0,
      probability: 0.3 // 30%概率
      /*
       * 业务含义：保底奖品，确保100%中奖机制
       * 使用场景：抽奖测试、概率测试
       */
    }
  },

  /*
   * ==========================================
   * 💰 测试积分数据
   * ==========================================
   */
  points: {
    // 标准积分量
    standard: {
      lottery: 100, // 抽奖获得的标准积分
      consumption_reward: 50, // 消费审核奖励积分
      share: 5, // 分享奖励积分
      purchase: 50 // 购买奖励积分
      /*
       * 业务含义：标准业务场景的积分数量
       * 使用场景：积分测试、业务流程测试
       */
    },

    // 边界值积分
    boundary: {
      min: 1, // 最小积分
      max: 10000, // 最大单次积分
      zero: 0, // 零积分（边界测试）
      negative: -1 // 负数（异常测试）
      /*
       * 业务含义：边界条件测试数据
       * 使用场景：边界测试、异常测试
       */
    }
  },

  /*
   * ==========================================
   * 🎲 测试抽奖数据（基于UnifiedLotteryEngine）
   * 🔴 P0-1修复：lottery_campaign_id 和 user_id 通过 getter 动态获取
   * ==========================================
   */
  lottery: {
    // 测试活动信息
    // 🔴 P0-1修复：lottery_campaign_id 使用 getter 动态获取
    get testCampaign() {
      return {
        lottery_campaign_id: getTestCampaignId(), // 🔴 P0-1修复：动态获取，不再硬编码
        name: global.testData?.testCampaign?.campaign_name || '餐厅积分抽奖活动'
        /*
         * 业务含义：默认测试活动
         * 使用场景：所有抽奖相关测试
         */
      }
    },

    // 普通抽奖流水线配置（对应 NormalDrawPipeline）
    // 🔴 P0-1修复：user_id 使用 getter 动态获取
    get normalDraw() {
      return {
        user_id: getTestUserId(), // 🔴 P0-1修复：动态获取，不再硬编码
        is_first_lottery: false,
        last_win_date: null,
        lottery_count: 5 // 5次不中必中
        /*
         * 业务含义：普通抽奖流水线测试数据
         * 使用场景：测试普通用户抽奖（5次不中必中）
         * 技术背景：对应 UnifiedLotteryEngine 的 NormalDrawPipeline
         */
      }
    },

    // 首次抽奖特殊场景
    // 🔴 P0-1修复：user_id 使用 getter 动态获取
    get firstLottery() {
      return {
        user_id: getTestUserId(), // 🔴 P0-1修复：动态获取，不再硬编码
        is_first_lottery: true,
        guaranteed_prize: 100 // 首次必得100积分
        /*
         * 业务含义：首次抽奖测试数据
         * 使用场景：测试新用户首次抽奖100%中奖
         * 技术背景：V4架构的首次抽奖保底机制
         */
      }
    }
  },

  /*
   * ==========================================
   * 🔐 测试认证数据
   * ==========================================
   */
  auth: {
    // 测试验证码（基于项目约定）
    verificationCode: '123456', // 万能验证码（仅用于测试环境）
    /*
     * 业务含义：测试环境的万能验证码
     * 使用场景：登录测试、注册测试
     * 安全说明：仅在测试环境启用，生产环境禁用
     */

    // JWT密钥
    jwtSecret: 'test-jwt-secret-key-for-development-only'
    /*
     * 业务含义：测试环境JWT密钥
     * 使用场景：生成测试token
     */
  }
}

/**
 * 🛠️ 测试数据工厂函数
 *
 * 用于创建可变的测试数据副本，避免测试间数据污染
 * 🔴 P0-1修复：所有 user_id 和 lottery_campaign_id 通过动态获取
 */
const createTestData = {
  /**
   * 创建测试用户数据副本
   * @param {Object} overrides - 覆盖的字段
   * @returns {Object} 用户数据副本
   *
   * 使用示例：
   * const user = createTestData.user({ nickname: '新昵称' });
   *
   * 🔴 P0-1修复：user_id 动态获取
   */
  user: (overrides = {}) => ({
    ...TEST_DATA.users.testUser,
    ...overrides
  }),

  /**
   * 创建测试积分数据副本
   * @param {Object} overrides - 覆盖的字段
   * @returns {Object} 积分数据副本
   *
   * 使用示例：
   * const points = createTestData.points({ amount: 200, source: 'daily' });
   *
   * 🔴 P0-1修复：user_id 动态获取
   */
  points: (overrides = {}) => ({
    user_id: getTestUserId(), // 🔴 P0-1修复：动态获取
    amount: TEST_DATA.points.standard.lottery,
    source: 'lottery',
    ...overrides
  }),

  /**
   * 创建测试抽奖请求数据
   * @param {Object} overrides - 覆盖的字段
   * @returns {Object} 抽奖请求数据
   *
   * 使用示例：
   * const lotteryRequest = createTestData.lotteryRequest();
   *
   * 🔴 P0-1修复：user_id 和 lottery_campaign_id 动态获取
   */
  lotteryRequest: (overrides = {}) => ({
    user_id: getTestUserId(), // 🔴 P0-1修复：动态获取
    lottery_campaign_id: getTestCampaignId(), // 🔴 P0-1修复：动态获取
    timestamp: BeijingTimeHelper.formatToISO(), // 使用北京时间ISO格式
    ...overrides
  })
}

/**
 * 🔧 测试数据验证工具
 *
 * 用于验证测试数据的一致性和正确性
 */
const validateTestData = {
  /**
   * 验证用户数据
   * @param {Object} userData - 用户数据
   * @returns {boolean} 是否有效
   */
  user: userData => {
    if (!userData) return false
    if (!userData.user_id || !userData.mobile) return false
    // 验证手机号格式
    if (!/^1[3-9]\d{9}$/.test(userData.mobile)) return false
    return true
  },

  /**
   * 验证积分数据
   * @param {Object} pointsData - 积分数据
   * @returns {boolean} 是否有效
   */
  points: pointsData => {
    if (!pointsData) return false
    if (!pointsData.user_id || typeof pointsData.amount !== 'number') return false
    // 积分不能为负数
    if (pointsData.amount < 0) return false
    return true
  }
}

/**
 * 🎲 测试数据生成器
 *
 * 用于批量生成测试数据，支持各种业务场景
 * 创建时间: 2025-11-14
 */
const testDataGenerator = {
  /**
   * 生成批量用户数据
   * @param {number} count - 生成数量
   * @param {string} prefix - 手机号前缀
   * @returns {Array} 用户数据数组
   *
   * 使用示例：
   * const users = testDataGenerator.generateUsers(10, '138')
   */
  generateUsers: (count = 5, prefix = '138') => {
    return Array.from({ length: count }, (_, index) => ({
      mobile: `${prefix}${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`,
      nickname: `测试用户${index + 1}`,
      created_at: BeijingTimeHelper.createBeijingISO() // 使用北京时间
    }))
  },

  /**
   * 生成批量积分日志数据
   * @param {number} userId - 用户ID（默认使用动态测试用户ID）
   * @param {number} count - 生成数量
   * @param {Array<string>} types - 积分类型数组
   * @returns {Array} 积分日志数据数组
   *
   * 使用示例：
   * const logs = testDataGenerator.generatePointsLogs(null, 20, ['earn', 'spend'])
   *
   * 🔴 P0-1修复：userId 默认动态获取
   */
  generatePointsLogs: (userId = null, count = 10, types = ['earn', 'spend', 'expire']) => {
    // 🔴 P0-1修复：如果 userId 为 null，使用动态获取的测试用户ID
    const actualUserId = userId !== null ? userId : getTestUserId()
    return Array.from({ length: count }, (_, index) => {
      const type = types[index % types.length]
      const amount =
        type === 'earn'
          ? Math.floor(Math.random() * 100) + 10
          : -(Math.floor(Math.random() * 50) + 5)

      return {
        user_id: actualUserId, // 🔴 P0-1修复：使用 actualUserId
        amount,
        type,
        source: type === 'earn' ? 'lottery' : 'exchange',
        description: `测试${type}积分_${index + 1}`,
        created_at: BeijingTimeHelper.getDaysAgo(index) // 使用北京时间，每条记录间隔1天
      }
    })
  },

  /**
   * 生成批量抽奖记录数据
   * @param {number} userId - 用户ID（默认使用动态测试用户ID）
   * @param {number} campaignId - 活动ID（默认使用动态测试活动ID）
   * @param {number} count - 生成数量
   * @returns {Array} 抽奖记录数据数组
   *
   * 使用示例：
   * const records = testDataGenerator.generateLotteryRecords(null, null, 15)
   *
   * 🔴 P0-1修复：userId 和 campaignId 默认动态获取
   */
  generateLotteryRecords: (userId = null, campaignId = null, count = 10) => {
    // 🔴 P0-1修复：如果为 null，使用动态获取的测试数据
    const actualUserId = userId !== null ? userId : getTestUserId()
    const actualCampaignId = campaignId !== null ? campaignId : getTestCampaignId()

    return Array.from({ length: count }, (_, index) => {
      // V4.0语义更新：使用 reward_tier 替代 is_winner
      // 按奖品价值档位分布：low(<300), mid(300-699), high(>=700)
      const tierRandom = Math.random()
      const rewardTier = tierRandom < 0.5 ? 'low' : tierRandom < 0.85 ? 'mid' : 'high'
      const prizeValues = { low: [50, 100, 200], mid: [300, 400, 500], high: [700, 800, 1000] }

      return {
        user_id: actualUserId, // 🔴 P0-1修复：使用 actualUserId
        lottery_campaign_id: actualCampaignId, // 🔴 P0-1修复：使用 actualCampaignId
        lottery_campaign_prize_id: (index % 3) + 1, // 奖品ID轮换（V4.0：每次抽奖必得奖品）
        reward_tier: rewardTier, // V4.0语义更新：替代 is_winner
        prize_value: prizeValues[rewardTier][index % 3],
        lottery_time: BeijingTimeHelper.getHoursAgo(index), // 使用北京时间，每条记录间隔1小时
        status: 'completed'
      }
    })
  },

  /**
   * 生成时间序列数据（用于测试时间范围查询）
   * @param {Date} startDate - 开始日期
   * @param {Date} endDate - 结束日期
   * @param {string} interval - 时间间隔('hour', 'day', 'week')
   * @returns {Array} 时间戳数组
   *
   * 使用示例：
   * const timestamps = testDataGenerator.generateTimeSeriesData(
   *   new Date('2025-01-01'),
   *   new Date('2025-01-31'),
   *   'day'
   * )
   */
  generateTimeSeriesData: (startDate, endDate, interval = 'day') => {
    const result = []
    const start = new Date(startDate).getTime()
    const end = new Date(endDate).getTime()

    const intervalMs =
      {
        hour: 60 * 60 * 1000,
        day: 24 * 60 * 60 * 1000,
        week: 7 * 24 * 60 * 60 * 1000
      }[interval] || 24 * 60 * 60 * 1000

    for (let time = start; time <= end; time += intervalMs) {
      // 转换为北京时间ISO格式
      result.push(BeijingTimeHelper.formatToBeijingISO(new Date(time)))
    }

    return result
  },

  /**
   * 生成符合边界条件的测试数据
   * @param {string} dataType - 数据类型('points', 'page', 'limit')
   * @returns {Object} 边界测试数据
   *
   * 使用示例：
   * const boundaries = testDataGenerator.generateBoundaryData('points')
   */
  generateBoundaryData: dataType => {
    const boundaries = {
      points: {
        validMin: 1,
        validMax: 10000,
        invalidNegative: -1,
        invalidZero: 0,
        invalidOverflow: 999999
      },
      page: {
        validMin: 1,
        validMax: 100,
        invalidZero: 0,
        invalidNegative: -1
      },
      limit: {
        validMin: 1,
        validMax: 100,
        invalidZero: 0,
        invalidOverMax: 101
      }
    }

    return boundaries[dataType] || {}
  }
}

/**
 * 🧪 测试场景模板
 *
 * 提供常见业务场景的完整测试数据
 * 创建时间: 2025-11-14
 *
 * 🔴 P0修复（2026-01-28）：
 * - 使用 getter 延迟求值，避免在模块加载时访问 global.testData
 * - 解决 Jest 测试初始化顺序问题（jest.setup.js beforeAll 在模块加载后执行）
 */
const testScenarios = {
  /**
   * 场景1: 新用户首次抽奖
   * 业务规则: 首次抽奖100%获得积分奖品（V4.0：每次必得奖品，首次保底高档）
   * 🔴 P0修复：使用 getter 延迟求值
   */
  get newUserFirstLottery() {
    return {
      user: createTestData.user(),
      lottery_campaign_id: getTestCampaignId(),
      is_first_lottery: true,
      expected_result: {
        // V4.0语义更新：使用 reward_tier 替代 is_winner
        reward_tier: 'high', // 首次抽奖保底高档奖励
        prize_type: 'points'
      }
    }
  },

  /**
   * 场景2: 老用户5次未中高档保底
   * 业务规则: 5次未获得高档奖励后第6次必得高档（V4.0语义更新）
   * 🔴 P0修复：使用 getter 延迟求值
   */
  get oldUserGuarantee() {
    return {
      user: createTestData.user(),
      lottery_campaign_id: getTestCampaignId(),
      previous_lottery_count: 5,
      all_previous_low_tier: true, // V4.0：改为低档计数
      expected_result: {
        reward_tier: 'high', // V4.0语义更新：替代 is_winner
        trigger_reason: 'guarantee_mechanism'
      }
    }
  },

  /**
   * 场景4: 积分不足兑换失败
   * 业务规则: 积分不足时兑换失败并提示
   * 🔴 P0修复：使用 getter 延迟求值
   */
  get insufficientPointsExchange() {
    return {
      user: createTestData.user(),
      user_points: 50,
      prize_cost: 100,
      expected_result: {
        success: false,
        error_code: 'INSUFFICIENT_POINTS',
        error_message: '积分不足'
      }
    }
  },

  /**
   * 场景5: 并发抽奖幂等性
   * 业务规则: 相同request_id的请求只处理一次
   * 🔴 P0修复：使用 getter 延迟求值
   */
  get concurrentLotteryIdempotency() {
    return {
      user: createTestData.user(),
      lottery_campaign_id: getTestCampaignId(),
      request_id: 'test-request-' + Date.now(),
      concurrent_requests: 3,
      expected_result: {
        processed_count: 1,
        duplicate_count: 2
      }
    }
  }
}

/*
 * ==========================================
 * 🔐 测试账号角色契约表（单一真相源 - 2026-06-14 新增）
 * ==========================================
 *
 * 设计目的（解决长期技术债）：
 * - 历史问题：96 个测试文件各自内联硬编码 mobile（如 '13612227930'），
 *   换账号要改几十个文件；且常误把 regional_manager(80) 当管理员用 →
 *   访问 requireRoleLevel(100) 接口被后端正确拒绝(403) → 测试整片失败。
 * - 解决方案：所有测试账号在此处「按角色语义」集中定义，
 *   测试只声明「我要一个 admin / 一个普通 user」，不再关心具体手机号。
 *   换账号只改这一处即可全局生效。
 *
 * 真实库核对（restaurant_points_dev，2026-06-14 通过 Node.js+Sequelize 实连核对）：
 *   13612227910 → admin(100)+super_admin(110)，maxRoleLevel=110  ← 真正的管理员
 *   13612227930 → regional_manager(80)，maxRoleLevel=80          ← 区域经理（非管理员！）
 *   13612227911 → user(0)
 *
 * 字段说明：
 * - mobile：登录手机号（业务标识，开发/测试环境万能验证码 123456）
 * - expected_role_level：该账号在真实库中应有的最高 role_level（启动时由 jest.setup.js 校验，防止角色漂移）
 * - description：业务语义说明，便于团队成员理解该账号用途
 */
const TEST_ACCOUNTS = {
  // 超级管理员：role_level>=100，用于所有后台管理接口（requireRoleLevel(100)）测试
  admin: {
    mobile: '13612227910',
    expected_role_level: 100, // 真实库 110（admin+super_admin），断言 >= 100 即视为管理员
    description: '超级管理员（admin+super_admin），用于 Console 后台管理接口测试'
  },
  // 区域经理：role_level=80，用于商家域/区域级权限测试（注意：不是管理员）
  regional_manager: {
    mobile: '13612227930',
    expected_role_level: 80,
    description: '区域经理（regional_manager:80），用于区域级业务测试，无管理员权限'
  },
  // 普通用户：role_level=0，用于 C 端用户场景（抽奖/积分/兑换等）测试
  user: {
    mobile: '13612227911',
    expected_role_level: 0,
    description: '普通用户（user:0），用于 C 端用户身份测试'
  }
}

// 导出测试数据
module.exports = {
  TEST_DATA, // 静态测试数据（只读）
  TEST_ACCOUNTS, // 🔐 测试账号角色契约表（单一真相源）
  createTestData, // 测试数据工厂（创建副本）
  validateTestData, // 测试数据验证工具
  testDataGenerator, // 测试数据生成器（批量生成）
  testScenarios, // 测试场景模板（完整业务场景）
  // 🔴 P0-1修复：导出动态获取函数
  getTestUserId, // 获取动态测试用户ID
  getTestCampaignId // 获取动态测试活动ID
}
