// 测试数据统一配置文件
// 遵循cursor规则：统一测试数据管理

module.exports = {
  // 🔴 测试用户配置 - 与 scripts/init-database.js 保持一致
  TEST_USERS: {
    USER1: {
      mobile: '13800000001',
      nickname: '测试用户1',
      total_points: 2000,
      is_merchant: false
    },
    USER2: {
      mobile: '13800000002', 
      nickname: '商家用户',
      total_points: 5000,
      is_merchant: true
    }
  },

  // 🔴 API测试配置
  API: {
    BASE_URL: process.env.NODE_ENV === 'production' 
      ? 'https://rqchrlqndora.sealosbja.site' 
      : 'http://localhost:3000',
    TIMEOUT: 10000
  },

  // 🔴 抽奖测试配置
  LOTTERY: {
    EXPECTED_PRIZES_COUNT: 8,
    SINGLE_DRAW_COST: 100,
    PITY_LIMIT: 10
  },

  // 🔴 商品测试配置  
  PRODUCTS: {
    EXPECTED_COUNT: 5,
    MIN_STOCK: 30
  }
}; 