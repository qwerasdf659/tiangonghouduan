/**
 * 🎯 统一测试数据管理中心
 *
 * 创建时间: 2025年11月12日
 * 版本: V4.0
 *
 * 业务背景：
 * - 项目使用真实MySQL数据库进行测试(restaurant_points_dev)
 * - 所有测试共用一个测试用户(mobile: 13612227930, user_id: 31)
 * - 需要避免测试数据冲突和不一致
 *
 * 设计原则：
 * - 单一数据源：所有测试数据从这里获取
 * - 业务语义明确：每个测试数据都有清晰的业务含义
 * - 易于维护：修改测试数据只需要改这一个文件
 * - 真实数据：不使用Mock数据,使用真实数据库数据
 */

const TEST_DATA = {
  /*
   * ==========================================
   * 📱 测试用户数据（基于项目实际使用）
   * ==========================================
   */
  users: {
    // 默认测试用户（基于 tests/helpers/test-setup.js）
    testUser: {
      user_id: 31, // 用户ID（项目约定的测试用户）
      mobile: '13612227930', // 测试手机号
      nickname: '测试用户' // 用户昵称
      /*
       * 业务含义：默认测试用户，用于所有需要用户身份的测试场景
       * 使用场景：积分测试、抽奖测试、订单测试等
       */
    },

    // 管理员测试用户（同一账号既是用户也是管理员）
    adminUser: {
      user_id: 31, // 管理员用户ID
      mobile: '13612227930', // 管理员手机号
      role: 'admin' // 角色：管理员
      /*
       * 业务含义：管理员用户，用于测试后台管理功能
       * 使用场景：商家审核、订单管理、数据统计等
       * 注意：在真实系统中,同一账号可能同时拥有用户和管理员权限
       */
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
      prize_id: 1, // 奖品ID（假设值,需要从数据库确认）
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
      prize_id: 2, // 奖品ID（假设值,需要从数据库确认）
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
      prize_id: 3, // 奖品ID（假设值,需要从数据库确认）
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
      daily: 10, // 每日签到积分
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
   * ==========================================
   */
  lottery: {
    // 测试活动信息
    testCampaign: {
      campaign_id: 2, // 测试活动ID（基于test-setup.js）
      name: '餐厅积分抽奖活动'
      /*
       * 业务含义：默认测试活动
       * 使用场景：所有抽奖相关测试
       */
    },

    // 基础保底策略配置（对应 BasicGuaranteeStrategy）
    basicGuarantee: {
      user_id: 31,
      is_first_lottery: false,
      last_win_date: null,
      lottery_count: 5 // 5次不中必中
      /*
       * 业务含义：基础保底策略测试数据
       * 使用场景：测试普通用户抽奖（5次不中必中）
       * 技术背景：对应 UnifiedLotteryEngine 的 BasicGuaranteeStrategy
       */
    },

    // 管理策略配置（对应 ManagementStrategy）
    management: {
      user_id: 31,
      is_management_target: true,
      custom_probability: 1.0 // 100%必中
      /*
       * 业务含义：管理策略测试数据
       * 使用场景：测试特定用户的定向中奖
       * 技术背景：对应 UnifiedLotteryEngine 的 ManagementStrategy
       */
    },

    // 首次抽奖特殊场景
    firstLottery: {
      user_id: 31,
      is_first_lottery: true,
      guaranteed_prize: 100 // 首次必得100积分
      /*
       * 业务含义：首次抽奖测试数据
       * 使用场景：测试新用户首次抽奖100%中奖
       * 技术背景：V4架构的首次抽奖保底机制
       */
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
 */
const createTestData = {
  /**
   * 创建测试用户数据副本
   * @param {Object} overrides - 覆盖的字段
   * @returns {Object} 用户数据副本
   *
   * 使用示例：
   * const user = createTestData.user({ nickname: '新昵称' });
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
   */
  points: (overrides = {}) => ({
    user_id: TEST_DATA.users.testUser.user_id,
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
   * const lotteryRequest = createTestData.lotteryRequest({ campaign_id: 2 });
   */
  lotteryRequest: (overrides = {}) => ({
    user_id: TEST_DATA.users.testUser.user_id,
    campaign_id: TEST_DATA.lottery.testCampaign.campaign_id,
    timestamp: new Date().toISOString(),
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
  user: (userData) => {
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
  points: (pointsData) => {
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
      created_at: new Date().toISOString()
    }))
  },

  /**
   * 生成批量积分日志数据
   * @param {number} userId - 用户ID
   * @param {number} count - 生成数量
   * @param {Array<string>} types - 积分类型数组
   * @returns {Array} 积分日志数据数组
   *
   * 使用示例：
   * const logs = testDataGenerator.generatePointsLogs(31, 20, ['earn', 'spend'])
   */
  generatePointsLogs: (userId = 31, count = 10, types = ['earn', 'spend', 'expire']) => {
    return Array.from({ length: count }, (_, index) => {
      const type = types[index % types.length]
      const amount = type === 'earn' ? Math.floor(Math.random() * 100) + 10 : -(Math.floor(Math.random() * 50) + 5)

      return {
        user_id: userId,
        amount,
        type,
        source: type === 'earn' ? 'lottery' : 'exchange',
        description: `测试${type}积分_${index + 1}`,
        created_at: new Date(Date.now() - index * 24 * 60 * 60 * 1000).toISOString() // 每条记录间隔1天
      }
    })
  },

  /**
   * 生成批量抽奖记录数据
   * @param {number} userId - 用户ID
   * @param {number} campaignId - 活动ID
   * @param {number} count - 生成数量
   * @returns {Array} 抽奖记录数据数组
   *
   * 使用示例：
   * const records = testDataGenerator.generateLotteryRecords(31, 2, 15)
   */
  generateLotteryRecords: (userId = 31, campaignId = 2, count = 10) => {
    return Array.from({ length: count }, (_, index) => {
      const isWinner = Math.random() > 0.3 // 70%中奖率

      return {
        user_id: userId,
        campaign_id: campaignId,
        prize_id: isWinner ? (index % 3) + 1 : 3, // 奖品ID轮换
        is_winner: isWinner,
        prize_value: isWinner ? [100, 50, 20][index % 3] : 0,
        lottery_time: new Date(Date.now() - index * 60 * 60 * 1000).toISOString(), // 每条记录间隔1小时
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

    const intervalMs = {
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000
    }[interval] || 24 * 60 * 60 * 1000

    for (let time = start; time <= end; time += intervalMs) {
      result.push(new Date(time).toISOString())
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
  generateBoundaryData: (dataType) => {
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
 */
const testScenarios = {
  /**
   * 场景1: 新用户首次抽奖
   * 业务规则: 首次抽奖100%获得积分奖品
   */
  newUserFirstLottery: {
    user: createTestData.user(),
    campaign_id: TEST_DATA.lottery.testCampaign.campaign_id,
    is_first_lottery: true,
    expected_result: {
      is_winner: true,
      prize_type: 'points'
    }
  },

  /**
   * 场景2: 老用户5次未中保底
   * 业务规则: 5次未中奖后第6次必中
   */
  oldUserGuarantee: {
    user: createTestData.user(),
    campaign_id: TEST_DATA.lottery.testCampaign.campaign_id,
    previous_lottery_count: 5,
    all_previous_lost: true,
    expected_result: {
      is_winner: true,
      trigger_reason: 'guarantee_mechanism'
    }
  },

  /**
   * 场景3: 管理策略定向中奖
   * 业务规则: 特定用户100%中奖
   */
  managementTargetWin: {
    user: createTestData.user(),
    campaign_id: TEST_DATA.lottery.testCampaign.campaign_id,
    is_management_target: true,
    custom_probability: 1.0,
    expected_result: {
      is_winner: true,
      trigger_reason: 'management_strategy'
    }
  },

  /**
   * 场景4: 积分不足兑换失败
   * 业务规则: 积分不足时兑换失败并提示
   */
  insufficientPointsExchange: {
    user: createTestData.user(),
    user_points: 50,
    prize_cost: 100,
    expected_result: {
      success: false,
      error_code: 'INSUFFICIENT_POINTS',
      error_message: '积分不足'
    }
  },

  /**
   * 场景5: 并发抽奖幂等性
   * 业务规则: 相同request_id的请求只处理一次
   */
  concurrentLotteryIdempotency: {
    user: createTestData.user(),
    campaign_id: TEST_DATA.lottery.testCampaign.campaign_id,
    request_id: 'test-request-' + Date.now(),
    concurrent_requests: 3,
    expected_result: {
      processed_count: 1,
      duplicate_count: 2
    }
  }
}

// 导出测试数据
module.exports = {
  TEST_DATA, // 静态测试数据（只读）
  createTestData, // 测试数据工厂（创建副本）
  validateTestData, // 测试数据验证工具
  testDataGenerator, // 测试数据生成器（批量生成）
  testScenarios // 测试场景模板（完整业务场景）
}
