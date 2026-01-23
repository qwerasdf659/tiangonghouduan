/**
 * 前端页面功能联动测试脚本
 * 检查各页面API调用是否正常
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';

// 需要测试的核心API端点
const API_TESTS = [
  // 认证相关
  { name: '登录验证', method: 'POST', path: '/api/v4/console/auth/login', body: { mobile: '13800000001', verification_code: '123456' }, expectedStatus: [200, 401, 400] },
  
  // 用户管理
  { name: '用户列表', method: 'GET', path: '/api/v4/console/users', expectedStatus: [200, 401] },
  { name: '角色列表', method: 'GET', path: '/api/v4/console/users/roles', expectedStatus: [200, 401] },
  { name: '用户层级', method: 'GET', path: '/api/v4/console/user-hierarchy', expectedStatus: [200, 401] },
  
  // 门店管理
  { name: '门店列表', method: 'GET', path: '/api/v4/console/stores', expectedStatus: [200, 401] },
  { name: '员工列表', method: 'GET', path: '/api/v4/console/staff', expectedStatus: [200, 401] },
  
  // 抽奖管理
  { name: '抽奖预设', method: 'GET', path: '/api/v4/console/lottery-presets', expectedStatus: [200, 401] },
  { name: '奖品列表', method: 'GET', path: '/api/v4/console/prize-pool', expectedStatus: [200, 401] },
  { name: '抽奖策略', method: 'GET', path: '/api/v4/console/lottery/strategy', expectedStatus: [200, 401] },
  { name: '层级规则', method: 'GET', path: '/api/v4/console/lottery/tier-rules', expectedStatus: [200, 401] },
  
  // 资产管理
  { name: '物品模板', method: 'GET', path: '/api/v4/console/item-templates', expectedStatus: [200, 401] },
  { name: '资产调整类型', method: 'GET', path: '/api/v4/console/asset-adjustment/asset-types', expectedStatus: [200, 401] },
  { name: '材料资产类型', method: 'GET', path: '/api/v4/console/material/asset-types', expectedStatus: [200, 401] },
  
  // 市场交易
  { name: '市场挂单', method: 'GET', path: '/api/v4/console/marketplace/listings', expectedStatus: [200, 401] },
  { name: '交易订单', method: 'GET', path: '/api/v4/console/trade-orders', expectedStatus: [200, 401] },
  { name: '兑换商品', method: 'GET', path: '/api/v4/console/marketplace/exchange/items', expectedStatus: [200, 401] },
  
  // 系统管理
  { name: '系统设置', method: 'GET', path: '/api/v4/console/settings', expectedStatus: [200, 401] },
  { name: '数据字典', method: 'GET', path: '/api/v4/console/dictionaries', expectedStatus: [200, 401] },
  { name: '功能开关', method: 'GET', path: '/api/v4/console/feature-flags', expectedStatus: [200, 401] },
  { name: '会话列表', method: 'GET', path: '/api/v4/console/sessions', expectedStatus: [200, 401] },
  
  // 数据分析
  { name: '仪表盘数据', method: 'GET', path: '/api/v4/console/system-data/dashboard', expectedStatus: [200, 401] },
  { name: '分析概览', method: 'GET', path: '/api/v4/console/analytics/overview', expectedStatus: [200, 401] },
  
  // 内容管理
  { name: '公告列表', method: 'GET', path: '/api/v4/console/announcements', expectedStatus: [200, 401] },
  { name: '弹窗Banner', method: 'GET', path: '/api/v4/console/popup-banners', expectedStatus: [200, 401] },
  
  // 风控告警
  { name: '风控告警', method: 'GET', path: '/api/v4/console/risk-alerts', expectedStatus: [200, 401] },
  
  // 消费记录
  { name: '消费记录', method: 'GET', path: '/api/v4/console/consumption/records', expectedStatus: [200, 401] },
  { name: '业务记录', method: 'GET', path: '/api/v4/console/business-records', expectedStatus: [200, 401] },
  
  // 区域
  { name: '省份列表', method: 'GET', path: '/api/v4/console/regions/provinces', expectedStatus: [200, 401] },
  
  // 客服
  { name: '客服会话', method: 'GET', path: '/api/v4/console/customer-service/sessions', expectedStatus: [200, 401] },
  
  // 审计日志
  { name: '审计日志', method: 'GET', path: '/api/v4/console/admin-audit-logs', expectedStatus: [200, 401] },
];

function makeRequest(test) {
  return new Promise((resolve) => {
    const url = new URL(test.path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: test.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test_token'  // 模拟token
      },
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const passed = test.expectedStatus.includes(res.statusCode);
        resolve({
          name: test.name,
          path: test.path,
          status: res.statusCode,
          passed: passed,
          response: data.substring(0, 100)
        });
      });
    });

    req.on('error', (e) => {
      resolve({
        name: test.name,
        path: test.path,
        status: 'ERROR',
        passed: false,
        error: e.message
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        name: test.name,
        path: test.path,
        status: 'TIMEOUT',
        passed: false,
        error: 'Request timeout'
      });
    });

    if (test.body && test.method === 'POST') {
      req.write(JSON.stringify(test.body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('========================================');
  console.log('  前端页面功能联动测试');
  console.log('  测试时间:', new Date().toLocaleString('zh-CN'));
  console.log('========================================\n');

  const results = [];
  
  for (const test of API_TESTS) {
    const result = await makeRequest(test);
    results.push(result);
    
    const icon = result.passed ? '✅' : '❌';
    const statusStr = typeof result.status === 'number' ? result.status : result.status;
    console.log(`${icon} ${result.name.padEnd(15)} | ${result.path.substring(0, 45).padEnd(45)} | ${statusStr}`);
  }

  // 汇总
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log('\n========================================');
  console.log(`  测试完成: ${passed} 通过 / ${failed} 失败 (共 ${results.length} 个)`);
  console.log('========================================');
  
  // 输出失败详情
  if (failed > 0) {
    console.log('\n❌ 失败详情:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.path} (${r.status})`);
      if (r.error) console.log(`    错误: ${r.error}`);
    });
  }
  
  return { passed, failed, total: results.length };
}

runTests().then(summary => {
  process.exit(summary.failed > 0 ? 1 : 0);
});
