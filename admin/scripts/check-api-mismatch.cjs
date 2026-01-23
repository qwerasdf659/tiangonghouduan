const http = require('http');

// 从 api-config.js 提取的所有API路径（简化版）
const API_PATHS = [
  // FEEDBACK
  { name: 'FEEDBACK.LIST', path: '/api/v4/console/feedback' },
  { name: 'FEEDBACK.DETAIL', path: '/api/v4/console/feedback/1' },
  { name: 'FEEDBACK.REPLY', path: '/api/v4/console/feedback/1/reply' },
  
  // ANNOUNCEMENT
  { name: 'ANNOUNCEMENT.LIST', path: '/api/v4/console/announcements' },
  
  // NOTIFICATION
  { name: 'NOTIFICATION.LIST', path: '/api/v4/console/notifications' },
  
  // ACTIVITY_CONDITIONS
  { name: 'ACTIVITY_CONDITIONS', path: '/api/v4/console/lottery-management/campaigns/test/conditions' },
  
  // REDEMPTION
  { name: 'REDEMPTION.ORDERS', path: '/api/v4/console/redemption/orders' },
  
  // SYSTEM
  { name: 'SYSTEM.DASHBOARD', path: '/api/v4/console/system/dashboard' },
  { name: 'SYSTEM.CHARTS', path: '/api/v4/system/statistics/charts' },
  { name: 'SYSTEM.EXPORT', path: '/api/v4/system/statistics/export' },
  
  // PRICING
  { name: 'PRICING.LIST', path: '/api/v4/console/lottery-management/pricing-config' },
  
  // ASSETS
  { name: 'ASSETS.OVERVIEW', path: '/api/v4/console/assets/overview' },
  { name: 'ASSET_TYPES.LIST', path: '/api/v4/console/material/asset-types' },
  
  // CACHE
  { name: 'CACHE.CLEAR', path: '/api/v4/console/config/cache/clear' },
  
  // DIAMOND
  { name: 'DIAMOND.ACCOUNTS', path: '/api/v4/console/system-data/accounts' },
];

async function testPath(item) {
  return new Promise(resolve => {
    const req = http.request({ hostname: 'localhost', port: 3000, path: item.path, method: 'GET', timeout: 3000 }, res => {
      resolve({ ...item, status: res.statusCode, exists: res.statusCode !== 404 });
    });
    req.on('error', () => resolve({ ...item, status: 'ERR', exists: false }));
    req.on('timeout', () => { req.destroy(); resolve({ ...item, status: 'TMO', exists: false }); });
    req.end();
  });
}

async function main() {
  console.log('🔍 前端API vs 后端API 不匹配检查\n');
  console.log('API名称'.padEnd(30) + '路径'.padEnd(55) + '状态');
  console.log('-'.repeat(95));
  
  const missing = [];
  for (const item of API_PATHS) {
    const result = await testPath(item);
    const icon = result.exists ? '✅' : '❌';
    const statusText = result.status === 404 ? '不存在' : result.status === 401 ? '需认证' : result.status;
    console.log(`${icon} ${result.name.padEnd(28)} ${result.path.padEnd(53)} [${statusText}]`);
    if (!result.exists) missing.push(result);
  }
  
  console.log('\n' + '='.repeat(95));
  console.log(`\n📊 结果：${API_PATHS.length - missing.length} 存在 / ${missing.length} 不存在`);
  
  if (missing.length > 0) {
    console.log('\n🔴 后端不存在的API（前端功能需要移除或后端需要实现）：');
    missing.forEach(m => console.log(`   - ${m.name}: ${m.path}`));
  }
}

main();
