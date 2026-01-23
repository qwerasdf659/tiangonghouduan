const http = require('http');

// 按前端页面分组的API检查
const PAGE_API_MAPPING = [
  // feedbacks.html
  { page: 'feedbacks.html', api: '/api/v4/console/feedback', desc: '反馈列表' },
  { page: 'feedbacks.html', api: '/api/v4/console/feedback/1', desc: '反馈详情' },
  { page: 'feedbacks.html', api: '/api/v4/console/feedback/1/reply', desc: '回复反馈' },
  
  // content-management.html
  { page: 'content-management.html', api: '/api/v4/console/announcements', desc: '公告列表' },
  { page: 'content-management.html', api: '/api/v4/console/popup-banners', desc: 'Banner列表' },
  { page: 'content-management.html', api: '/api/v4/console/images', desc: '图片列表' },
  
  // activity-conditions.html
  { page: 'activity-conditions.html', api: '/api/v4/console/lottery-management/campaigns/test/conditions', desc: '活动条件' },
  
  // trade-management.html
  { page: 'trade-management.html', api: '/api/v4/console/trade-orders', desc: '交易订单' },
  { page: 'trade-management.html', api: '/api/v4/console/marketplace/listing-stats', desc: '市场统计' },
  { page: 'trade-management.html', api: '/api/v4/console/redemption/orders', desc: '兑换订单审核' },
  
  // statistics.html
  { page: 'statistics.html', api: '/api/v4/system/statistics/charts', desc: '统计图表' },
  { page: 'statistics.html', api: '/api/v4/system/statistics/export', desc: '统计导出' },
  
  // charts.html
  { page: 'charts.html', api: '/api/v4/stats/user-growth', desc: '用户增长统计' },
  { page: 'charts.html', api: '/api/v4/stats/active-users', desc: '活跃用户统计' },
  { page: 'charts.html', api: '/api/v4/stats/lottery', desc: '抽奖统计' },
  { page: 'charts.html', api: '/api/v4/stats/revenue', desc: '收入统计' },
  
  // config-tools.html
  { page: 'config-tools.html', api: '/api/v4/console/config/cache/clear', desc: '清理缓存' },
  { page: 'config-tools.html', api: '/api/v4/console/settings', desc: '系统设置' },
  
  // lottery-management.html
  { page: 'lottery-management.html', api: '/api/v4/console/lottery-management/pricing-config', desc: '定价配置' },
  { page: 'lottery-management.html', api: '/api/v4/console/lottery-configs/strategies', desc: '策略配置' },
  { page: 'lottery-management.html', api: '/api/v4/console/lottery-tier-rules', desc: '层级规则' },
  
  // assets-portfolio.html
  { page: 'assets-portfolio.html', api: '/api/v4/console/assets/overview', desc: '资产概览' },
  { page: 'assets-portfolio.html', api: '/api/v4/console/material/asset-types', desc: '资产类型' },
  
  // customer-service.html
  { page: 'customer-service.html', api: '/api/v4/console/customer-service/sessions', desc: '客服会话' },
];

async function test(item) {
  return new Promise(resolve => {
    const req = http.request({ hostname: 'localhost', port: 3000, path: item.api, method: 'GET', timeout: 3000 }, res => {
      resolve({ ...item, status: res.statusCode, exists: res.statusCode !== 404 });
    });
    req.on('error', () => resolve({ ...item, status: 'ERR', exists: false }));
    req.on('timeout', () => { req.destroy(); resolve({ ...item, status: 'TMO', exists: false }); });
    req.end();
  });
}

async function main() {
  console.log('🔍 前端页面功能 vs 后端API 完整审计\n');
  
  const results = new Map();
  for (const item of PAGE_API_MAPPING) {
    const r = await test(item);
    if (!results.has(r.page)) results.set(r.page, { ok: [], missing: [] });
    if (r.exists) results.get(r.page).ok.push(r);
    else results.get(r.page).missing.push(r);
  }
  
  let totalOk = 0, totalMissing = 0;
  
  for (const [page, data] of results) {
    const icon = data.missing.length === 0 ? '✅' : '⚠️';
    console.log(`${icon} ${page}:`);
    data.ok.forEach(a => { console.log(`   ✅ ${a.desc}: ${a.api}`); totalOk++; });
    data.missing.forEach(a => { console.log(`   ❌ ${a.desc}: ${a.api} [后端不存在]`); totalMissing++; });
    console.log('');
  }
  
  console.log('='.repeat(80));
  console.log(`\n📊 汇总: ${totalOk} 个API存在, ${totalMissing} 个API不存在`);
  
  if (totalMissing > 0) {
    console.log('\n🔴 需要处理的页面（后端API缺失）:');
    for (const [page, data] of results) {
      if (data.missing.length > 0) {
        console.log(`   - ${page}: ${data.missing.length}个功能需移除或后端需实现`);
      }
    }
  }
}

main();
