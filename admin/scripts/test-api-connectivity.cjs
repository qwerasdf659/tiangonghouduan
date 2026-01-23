/**
 * 前端API连通性测试 - 使用正确的后端路由
 */
const http = require('http');

const BASE_URL = 'http://localhost:3000';

// 基于后端 routes/v4/console/index.js 的实际路由
const API_TESTS = [
  // 认证（无需token）
  { name: '健康检查', path: '/health', needAuth: false },
  
  // Console API（需要token，但先测试路由是否存在）
  { name: '用户列表', path: '/api/v4/console/users' },
  { name: '角色列表', path: '/api/v4/console/users/roles' },
  { name: '门店列表', path: '/api/v4/console/stores' },
  { name: '员工列表', path: '/api/v4/console/staff' },
  { name: '抽奖预设', path: '/api/v4/console/lottery-presets' },
  { name: '抽奖配置', path: '/api/v4/console/lottery/configs' },
  { name: '层级规则', path: '/api/v4/console/lottery/tier-rules' },
  { name: '物品模板', path: '/api/v4/console/item-templates' },
  { name: '风控告警', path: '/api/v4/console/risk-alerts' },
  { name: '会话列表', path: '/api/v4/console/sessions' },
  { name: '系统设置', path: '/api/v4/console/settings' },
  { name: '数据字典', path: '/api/v4/console/dictionaries' },
  { name: '分析数据', path: '/api/v4/console/analytics/overview' },
  { name: '用户层级', path: '/api/v4/console/user-hierarchy' },
  { name: '功能开关', path: '/api/v4/console/feature-flags' },
  { name: '弹窗Banner', path: '/api/v4/console/popup-banners' },
  { name: '市场列表', path: '/api/v4/console/marketplace/listings' },
  { name: '交易订单', path: '/api/v4/console/trade-orders' },
  { name: '欠账管理', path: '/api/v4/console/debt' },
  { name: '消费记录', path: '/api/v4/console/consumption' },
  { name: '客服会话', path: '/api/v4/console/customer-service/sessions' },
  { name: '审计日志', path: '/api/v4/console/admin-audit-logs' },
  { name: '抽奖监控', path: '/api/v4/console/lottery-monitoring/stats' },
  { name: '策略统计', path: '/api/v4/console/lottery-strategy-stats' },
];

function testAPI(test) {
  return new Promise((resolve) => {
    const url = new URL(test.path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          name: test.name,
          path: test.path,
          status: res.statusCode,
          // 401=未授权(路由存在), 404=路由不存在, 200=成功
          routeExists: res.statusCode !== 404,
          success: res.statusCode === 200 || res.statusCode === 401
        });
      });
    });

    req.on('error', (e) => {
      resolve({ name: test.name, path: test.path, status: 'ERROR', error: e.message, routeExists: false });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({ name: test.name, path: test.path, status: 'TIMEOUT', routeExists: false });
    });

    req.end();
  });
}

async function main() {
  console.log('🔍 前端API连通性测试\n');
  console.log('=' .repeat(70));
  
  const results = { success: [], authRequired: [], notFound: [], error: [] };
  
  for (const test of API_TESTS) {
    const result = await testAPI(test);
    
    if (result.status === 200) {
      results.success.push(result);
      console.log(`✅ ${result.name.padEnd(12)} ${result.path.padEnd(45)} [200 OK]`);
    } else if (result.status === 401) {
      results.authRequired.push(result);
      console.log(`🔒 ${result.name.padEnd(12)} ${result.path.padEnd(45)} [401 需认证]`);
    } else if (result.status === 404) {
      results.notFound.push(result);
      console.log(`❌ ${result.name.padEnd(12)} ${result.path.padEnd(45)} [404 路由不存在]`);
    } else {
      results.error.push(result);
      console.log(`⚠️  ${result.name.padEnd(12)} ${result.path.padEnd(45)} [${result.status}]`);
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('\n📊 测试结果汇总：');
  console.log(`   ✅ 路由正常: ${results.success.length + results.authRequired.length}`);
  console.log(`   ❌ 路由不存在: ${results.notFound.length}`);
  console.log(`   ⚠️  其他错误: ${results.error.length}`);
  
  if (results.notFound.length > 0) {
    console.log('\n🔴 以下API路由不存在（前端调用会失败）：');
    results.notFound.forEach(r => console.log(`   - ${r.name}: ${r.path}`));
  }
}

main().catch(console.error);
