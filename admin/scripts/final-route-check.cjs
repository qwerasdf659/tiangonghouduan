const http = require('http');
const BASE_URL = 'http://localhost:3000';

// 完整的正确路径（基于后端路由定义）
const ROUTES = [
  // 用户管理
  { name: '用户管理-列表', path: '/api/v4/console/user-management' },
  { name: '用户管理-角色', path: '/api/v4/console/user-management/roles' },
  
  // 抽奖配置（需要子路径）
  { name: '抽奖-策略列表', path: '/api/v4/console/lottery-configs/strategies' },
  { name: '抽奖-矩阵配置', path: '/api/v4/console/lottery-configs/matrix' },
  
  // 数据字典（检查根路径）
  { name: '数据字典-列表', path: '/api/v4/console/dictionaries' },
  
  // 分析数据
  { name: '分析-概览', path: '/api/v4/console/analytics/overview' },
  { name: '分析-趋势', path: '/api/v4/console/analytics/trend' },
  
  // 市场管理
  { name: '市场-统计', path: '/api/v4/console/marketplace/listing-stats' },
  { name: '市场-兑换商品', path: '/api/v4/console/marketplace/exchange_market/items' },
  
  // 欠账管理
  { name: '欠账-仪表板', path: '/api/v4/console/debt-management/dashboard' },
  
  // 消费记录
  { name: '消费-待审核', path: '/api/v4/console/consumption/pending' },
  { name: '消费-记录', path: '/api/v4/console/consumption/records' },
  
  // 策略统计（需要campaign_id）
  { name: '策略统计-实时', path: '/api/v4/console/lottery-strategy-stats/realtime/1' },
];

function testRoute(path) {
  return new Promise((resolve) => {
    const url = new URL(path, BASE_URL);
    const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'GET', timeout: 3000 }, (res) => {
      resolve(res.statusCode);
    });
    req.on('error', () => resolve('ERR'));
    req.on('timeout', () => { req.destroy(); resolve('TMO'); });
    req.end();
  });
}

async function main() {
  console.log('📋 后端API路由完整路径验证：\n');
  
  let ok = 0, fail = 0;
  for (const route of ROUTES) {
    const status = await testRoute(route.path);
    const isOk = status === 200 || status === 401;
    if (isOk) ok++; else fail++;
    const icon = isOk ? '✅' : '❌';
    const st = status === 401 ? '需认证' : status === 404 ? '不存在' : status;
    console.log(`${icon} ${route.name.padEnd(16)} ${route.path.padEnd(55)} [${st}]`);
  }
  
  console.log(`\n📊 结果：${ok} 正常 / ${fail} 异常`);
}

main();
