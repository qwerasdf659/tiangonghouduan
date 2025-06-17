/**
 * API接口测试脚本
 * 🔴 前端对接说明：此脚本用于测试所有API接口的功能和响应格式
 * 🔴 使用方法：node scripts/test-apis.js [--endpoint=url] [--auth] [--verbose]
 * 🔴 参数说明：
 *   --endpoint: 指定测试的服务器地址（默认localhost:3000）
 *   --auth: 执行需要认证的接口测试
 *   --verbose: 显示详细的请求响应信息
 */

require('dotenv').config();
const axios = require('axios');

// 解析命令行参数
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const testAuth = args.includes('--auth');

// 获取测试端点
let endpoint = 'http://localhost:3000';
const endpointArg = args.find(arg => arg.startsWith('--endpoint='));
if (endpointArg) {
  endpoint = endpointArg.split('=')[1];
}

// 🔴 测试配置
const config = {
  baseURL: endpoint,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'API-Test-Script/1.0'
  }
};

let authToken = null; // 存储登录后的token

// 🔴 日志函数
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const levelColors = {
    INFO: '\x1b[36m',  // 青色
    SUCCESS: '\x1b[32m', // 绿色
    WARNING: '\x1b[33m', // 黄色
    ERROR: '\x1b[31m',   // 红色
    RESET: '\x1b[0m'     // 重置
  };
  
  console.log(`${levelColors[level]}[${level}] ${timestamp} - ${message}${levelColors.RESET}`);
  
  if (verbose && data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

// 🔴 HTTP请求包装函数
async function makeRequest(method, url, data = null, headers = {}) {
  const startTime = Date.now(); // 🔴 将startTime移到这里避免作用域问题
  
  try {
    const requestConfig = {
      method,
      url,
      ...config,
      headers: {
        ...config.headers,
        ...headers
      }
    };
    
    if (data) {
      requestConfig.data = data;
    }
    
    if (verbose) {
      log('INFO', `发送请求: ${method} ${url}`, { data, headers });
    }
    
    const response = await axios(requestConfig);
    const responseTime = Date.now() - startTime;
    
    return {
      success: true,
      status: response.status,
      data: response.data,
      responseTime,
      headers: response.headers
    };
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      success: false,
      status: error.response?.status || 0,
      data: error.response?.data || null,
      error: error.message,
      responseTime
    };
  }
}

// 🔴 基础健康检查测试
async function testHealthCheck() {
  log('INFO', '测试健康检查接口...');
  
  const result = await makeRequest('GET', '/health');
  
  if (result.success && result.status === 200) {
    log('SUCCESS', `健康检查通过 (${result.responseTime}ms)`);
    if (verbose) {
      log('INFO', '健康检查响应:', result.data);
    }
    return true;
  } else {
    log('ERROR', `健康检查失败: ${result.error || result.status}`);
    return false;
  }
}

// 🔴 认证接口测试
async function testAuthAPIs() {
  log('INFO', '测试认证相关接口...');
  
  // 测试1: 发送验证码
  log('INFO', '测试发送验证码接口...');
  const codeResult = await makeRequest('POST', '/api/auth/send-code', {
    phone: '13900000001'
  });
  
  if (codeResult.success) {
    log('SUCCESS', `发送验证码成功 (${codeResult.responseTime}ms)`);
  } else {
    log('WARNING', `发送验证码失败: ${codeResult.error || codeResult.status}`);
  }
  
  // 测试2: 用户登录 (使用测试数据)
  log('INFO', '测试用户登录接口...');
  const loginResult = await makeRequest('POST', '/api/auth/login', {
    phone: '13900000001',
    code: '123456' // 测试验证码
  });
  
  if (loginResult.success && loginResult.data.code === 200) {
    authToken = loginResult.data.data.token;
    log('SUCCESS', `用户登录成功 (${loginResult.responseTime}ms)`);
    if (verbose) {
      log('INFO', '登录响应:', loginResult.data);
    }
  } else {
    log('WARNING', `用户登录失败: ${loginResult.data?.msg || loginResult.error}`);
  }
  
  // 测试3: Token验证
  if (authToken) {
    log('INFO', '测试Token验证接口...');
    const verifyResult = await makeRequest('GET', '/api/auth/verify-token', null, {
      'Authorization': `Bearer ${authToken}`
    });
    
    if (verifyResult.success) {
      log('SUCCESS', `Token验证成功 (${verifyResult.responseTime}ms)`);
    } else {
      log('ERROR', `Token验证失败: ${verifyResult.error || verifyResult.status}`);
      authToken = null; // 清除无效token
    }
  }
  
  return authToken !== null;
}

// 🔴 抽奖系统接口测试
async function testLotteryAPIs() {
  log('INFO', '测试抽奖系统接口...');
  
  // 测试1: 获取抽奖配置
  log('INFO', '测试获取抽奖配置接口...');
  const configResult = await makeRequest('GET', '/api/lottery/config');
  
  if (configResult.success && configResult.data.code === 200) {
    log('SUCCESS', `获取抽奖配置成功 (${configResult.responseTime}ms)`);
    const prizes = configResult.data.data.prizes;
    log('INFO', `抽奖配置: ${prizes ? prizes.length : 0} 个奖品`);
  } else {
    log('ERROR', `获取抽奖配置失败: ${configResult.data?.msg || configResult.error}`);
  }
  
  // 测试2: 抽奖统计
  log('INFO', '测试抽奖统计接口...');
  const statsResult = await makeRequest('GET', '/api/lottery/statistics');
  
  if (statsResult.success) {
    log('SUCCESS', `获取抽奖统计成功 (${statsResult.responseTime}ms)`);
  } else {
    log('WARNING', `获取抽奖统计失败: ${statsResult.error || statsResult.status}`);
  }
  
  // 测试3: 执行抽奖 (需要认证)
  if (authToken) {
    log('INFO', '测试执行抽奖接口...');
    const drawResult = await makeRequest('POST', '/api/lottery/draw', {
      draw_type: 'points'
    }, {
      'Authorization': `Bearer ${authToken}`
    });
    
    if (drawResult.success) {
      log('SUCCESS', `执行抽奖成功 (${drawResult.responseTime}ms)`);
      if (verbose && drawResult.data.data) {
        log('INFO', '抽奖结果:', drawResult.data.data);
      }
    } else {
      log('WARNING', `执行抽奖失败: ${drawResult.data?.msg || drawResult.error}`);
    }
  }
}

// 🔴 商品兑换接口测试
async function testExchangeAPIs() {
  log('INFO', '测试商品兑换接口...');
  
  // 测试1: 获取商品列表
  log('INFO', '测试获取商品列表接口...');
  const productsResult = await makeRequest('GET', '/api/exchange/products?page=1&limit=10');
  
  if (productsResult.success && productsResult.data.code === 200) {
    log('SUCCESS', `获取商品列表成功 (${productsResult.responseTime}ms)`);
    const products = productsResult.data.data.products;
    log('INFO', `商品数量: ${products ? products.length : 0}`);
  } else {
    log('ERROR', `获取商品列表失败: ${productsResult.data?.msg || productsResult.error}`);
  }
  
  // 测试2: 获取商品分类
  log('INFO', '测试获取商品分类接口...');
  const categoriesResult = await makeRequest('GET', '/api/exchange/categories');
  
  if (categoriesResult.success) {
    log('SUCCESS', `获取商品分类成功 (${categoriesResult.responseTime}ms)`);
  } else {
    log('WARNING', `获取商品分类失败: ${categoriesResult.error || categoriesResult.status}`);
  }
  
  // 测试3: 提交兑换订单 (需要认证)
  if (authToken) {
    log('INFO', '测试提交兑换订单接口...');
    const exchangeResult = await makeRequest('POST', '/api/exchange/submit', {
      product_id: 1,
      quantity: 1,
      delivery_address: '测试地址'
    }, {
      'Authorization': `Bearer ${authToken}`
    });
    
    if (exchangeResult.success) {
      log('SUCCESS', `提交兑换订单成功 (${exchangeResult.responseTime}ms)`);
    } else {
      log('WARNING', `提交兑换订单失败: ${exchangeResult.data?.msg || exchangeResult.error}`);
    }
  }
}

// 🔴 用户接口测试
async function testUserAPIs() {
  if (!authToken) {
    log('WARNING', '跳过用户接口测试（需要认证）');
    return;
  }
  
  log('INFO', '测试用户相关接口...');
  
  // 测试1: 获取用户信息
  log('INFO', '测试获取用户信息接口...');
  const userInfoResult = await makeRequest('GET', '/api/user/profile', null, {
    'Authorization': `Bearer ${authToken}`
  });
  
  if (userInfoResult.success) {
    log('SUCCESS', `获取用户信息成功 (${userInfoResult.responseTime}ms)`);
  } else {
    log('ERROR', `获取用户信息失败: ${userInfoResult.error || userInfoResult.status}`);
  }
  
  // 测试2: 获取积分记录
  log('INFO', '测试获取积分记录接口...');
  const pointsResult = await makeRequest('GET', '/api/user/points/records?page=1&limit=10', null, {
    'Authorization': `Bearer ${authToken}`
  });
  
  if (pointsResult.success) {
    log('SUCCESS', `获取积分记录成功 (${pointsResult.responseTime}ms)`);
  } else {
    log('WARNING', `获取积分记录失败: ${pointsResult.error || pointsResult.status}`);
  }
  
  // 测试3: 获取抽奖记录
  log('INFO', '测试获取抽奖记录接口...');
  const lotteryRecordsResult = await makeRequest('GET', '/api/user/lottery/records?page=1&limit=10', null, {
    'Authorization': `Bearer ${authToken}`
  });
  
  if (lotteryRecordsResult.success) {
    log('SUCCESS', `获取抽奖记录成功 (${lotteryRecordsResult.responseTime}ms)`);
  } else {
    log('WARNING', `获取抽奖记录失败: ${lotteryRecordsResult.error || lotteryRecordsResult.status}`);
  }
}

// 🔴 错误处理测试
async function testErrorHandling() {
  log('INFO', '测试错误处理...');
  
  // 测试1: 404错误
  log('INFO', '测试404错误处理...');
  const notFoundResult = await makeRequest('GET', '/api/nonexistent');
  
  if (notFoundResult.status === 404) {
    log('SUCCESS', '404错误处理正常');
  } else {
    log('WARNING', `404错误处理异常: ${notFoundResult.status}`);
  }
  
  // 测试2: 参数错误
  log('INFO', '测试参数验证错误...');
  const badParamResult = await makeRequest('POST', '/api/auth/login', {
    phone: 'invalid-phone'
  });
  
  if (badParamResult.status === 400 || badParamResult.data?.code >= 1000) {
    log('SUCCESS', '参数验证错误处理正常');
  } else {
    log('WARNING', '参数验证错误处理可能存在问题');
  }
  
  // 测试3: 认证错误
  log('INFO', '测试认证错误处理...');
  const authErrorResult = await makeRequest('GET', '/api/user/profile', null, {
    'Authorization': 'Bearer invalid-token'
  });
  
  if (authErrorResult.status === 401) {
    log('SUCCESS', '认证错误处理正常');
  } else {
    log('WARNING', `认证错误处理异常: ${authErrorResult.status}`);
  }
}

// 🔴 性能测试
async function testPerformance() {
  log('INFO', '执行性能测试...');
  
  const testCases = [
    { name: '健康检查', method: 'GET', url: '/health' },
    { name: '抽奖配置', method: 'GET', url: '/api/lottery/config' },
    { name: '商品列表', method: 'GET', url: '/api/exchange/products?page=1&limit=5' }
  ];
  
  for (const testCase of testCases) {
    log('INFO', `性能测试: ${testCase.name}`);
    
    const times = [];
    const concurrentRequests = 5;
    const requests = [];
    
    // 并发请求测试
    for (let i = 0; i < concurrentRequests; i++) {
      requests.push(makeRequest(testCase.method, testCase.url));
    }
    
    const startTime = Date.now();
    const results = await Promise.all(requests);
    const totalTime = Date.now() - startTime;
    
    const successCount = results.filter(r => r.success).length;
    const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
    
    log('INFO', `${testCase.name} 性能结果:`);
    log('INFO', `  - 成功率: ${successCount}/${concurrentRequests} (${(successCount/concurrentRequests*100).toFixed(1)}%)`);
    log('INFO', `  - 平均响应时间: ${avgResponseTime.toFixed(2)}ms`);
    log('INFO', `  - 总耗时: ${totalTime}ms`);
    
    if (avgResponseTime < 100) {
      log('SUCCESS', `${testCase.name} 性能优秀`);
    } else if (avgResponseTime < 500) {
      log('WARNING', `${testCase.name} 性能一般`);
    } else {
      log('ERROR', `${testCase.name} 性能较差`);
    }
  }
}

// 🔴 主测试函数
async function runAPITests() {
  try {
    console.log('🚀 开始API测试...');
    console.log('=' .repeat(60));
    console.log(`📍 测试端点: ${endpoint}`);
    console.log(`🔧 认证测试: ${testAuth ? '启用' : '禁用'}`);
    console.log(`📝 详细日志: ${verbose ? '启用' : '禁用'}`);
    console.log('=' .repeat(60));
    
    // 1. 健康检查
    const healthOK = await testHealthCheck();
    if (!healthOK) {
      log('ERROR', '服务器不可用，停止测试');
      return;
    }
    
    console.log();
    
    // 2. 认证接口测试
    if (testAuth) {
      await testAuthAPIs();
      console.log();
    }
    
    // 3. 抽奖系统测试
    await testLotteryAPIs();
    console.log();
    
    // 4. 商品兑换测试
    await testExchangeAPIs();
    console.log();
    
    // 5. 用户接口测试
    if (testAuth) {
      await testUserAPIs();
      console.log();
    }
    
    // 6. 错误处理测试
    await testErrorHandling();
    console.log();
    
    // 7. 性能测试
    if (verbose) {
      await testPerformance();
      console.log();
    }
    
    console.log('=' .repeat(60));
    log('SUCCESS', 'API测试完成！');
    
    if (!testAuth) {
      console.log('\n💡 提示: 使用 --auth 参数可以测试需要认证的接口');
    }
    
    if (!verbose) {
      console.log('💡 提示: 使用 --verbose 参数可以查看详细信息和性能测试');
    }
    
  } catch (error) {
    log('ERROR', `测试过程中发生错误: ${error.message}`);
  }
}

// 🔴 显示使用帮助
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
🧪 API接口测试脚本

使用方法:
  node scripts/test-apis.js [选项]

选项:
  --endpoint=URL  指定测试的服务器地址 (默认: http://localhost:3000)
  --auth          执行需要认证的接口测试
  --verbose       显示详细的请求响应信息和性能测试
  --help          显示此帮助信息

示例:
  node scripts/test-apis.js                                    # 基础接口测试
  node scripts/test-apis.js --auth --verbose                   # 完整测试
  node scripts/test-apis.js --endpoint=https://api.example.com # 测试生产环境
  node scripts/test-apis.js --endpoint=http://localhost:3000   # 测试开发环境

📋 测试内容:
  ✅ 健康检查接口
  🔐 认证相关接口 (可选)
  🎰 抽奖系统接口
  🛒 商品兑换接口
  👤 用户管理接口 (可选)
  ❌ 错误处理测试
  ⚡ 性能测试 (详细模式)

🔗 前端对接说明:
  - 所有API返回标准格式: {code, msg, data}
  - 认证使用Bearer Token
  - 支持CORS跨域访问
  - 错误码说明请参考API文档
  `);
  process.exit(0);
}

// 🔴 执行测试
runAPITests(); 