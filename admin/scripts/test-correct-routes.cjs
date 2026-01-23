const http = require('http');
const BASE_URL = 'http://localhost:3000';

// 修正后的API路径（基于后端 index.js 路由注册）
const CORRECTED_ROUTES = [
  { name: '用户管理', wrong: '/api/v4/console/users', correct: '/api/v4/console/user-management' },
  { name: '角色列表', wrong: '/api/v4/console/users/roles', correct: '/api/v4/console/user-management/roles' },
  { name: '抽奖配置', wrong: '/api/v4/console/lottery/configs', correct: '/api/v4/console/lottery-configs' },
  { name: '层级规则', wrong: '/api/v4/console/lottery/tier-rules', correct: '/api/v4/console/lottery-tier-rules' },
  { name: '数据字典', wrong: '/api/v4/console/dictionaries', correct: '/api/v4/console/dictionaries' },
  { name: '分析概览', wrong: '/api/v4/console/analytics/overview', correct: '/api/v4/console/analytics/overview' },
  { name: '市场列表', wrong: '/api/v4/console/marketplace/listings', correct: '/api/v4/console/marketplace/listings' },
  { name: '欠账管理', wrong: '/api/v4/console/debt', correct: '/api/v4/console/debt-management' },
  { name: '消费记录', wrong: '/api/v4/console/consumption', correct: '/api/v4/console/consumption' },
  { name: '策略统计', wrong: '/api/v4/console/lottery-strategy-stats', correct: '/api/v4/console/lottery-strategy-stats' },
];

function testRoute(path) {
  return new Promise((resolve) => {
    const url = new URL(path, BASE_URL);
    const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'GET', timeout: 3000 }, (res) => {
      resolve(res.statusCode);
    });
    req.on('error', () => resolve('ERROR'));
    req.on('timeout', () => { req.destroy(); resolve('TIMEOUT'); });
    req.end();
  });
}

async function main() {
  console.log('🔄 验证API路径对照：\n');
  console.log('名称'.padEnd(12) + '前端配置路径'.padEnd(45) + '后端实际状态');
  console.log('-'.repeat(80));
  
  for (const route of CORRECTED_ROUTES) {
    const status = await testRoute(route.correct);
    const icon = status === 200 || status === 401 ? '✅' : '❌';
    const statusText = status === 401 ? '需认证' : status === 404 ? '不存在' : status;
    console.log(`${icon} ${route.name.padEnd(10)} ${route.correct.padEnd(43)} [${statusText}]`);
  }
}

main().catch(console.error);
