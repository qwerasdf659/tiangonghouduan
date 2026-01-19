/**
 * 幂等性映射覆盖率检查脚本（修正版）
 * 
 * @description 检测所有写操作 API 是否在 CANONICAL_OPERATION_MAP 中有定义
 * @author 后端开发
 * @date 2026-01-19
 */

const fs = require('fs');
const path = require('path');

// 读取 IdempotencyService 中的映射
function extractCanonicalOperationMap() {
  const idempotencyServicePath = path.join(__dirname, '../services/IdempotencyService.js');
  const content = fs.readFileSync(idempotencyServicePath, 'utf8');
  
  // 提取 CANONICAL_OPERATION_MAP 中的路径
  const mappedPaths = new Set();
  const regex = /'([^']+)':\s*'[A-Z_]+'/g;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    const apiPath = match[1];
    if (apiPath.startsWith('/api/v4/')) {
      mappedPaths.add(apiPath);
    }
  }
  
  return mappedPaths;
}

// 人工定义的正确路由映射（基于实际路由结构）
function getActualWriteRoutes() {
  return [
    // ===== 抽奖系统 =====
    { method: 'POST', path: '/api/v4/lottery/draw', file: 'lottery/draw.js' },
    { method: 'POST', path: '/api/v4/lottery/preset/create', file: 'lottery/lottery-preset.js' },
    
    // ===== 市场交易 =====
    { method: 'POST', path: '/api/v4/market/list', file: 'market/sell.js' },
    { method: 'POST', path: '/api/v4/market/listings/:id/purchase', file: 'market/buy.js' },
    { method: 'POST', path: '/api/v4/market/listings/:id/withdraw', file: 'market/manage.js' },
    { method: 'POST', path: '/api/v4/market/fungible-assets/list', file: 'market/sell.js' },
    { method: 'POST', path: '/api/v4/market/fungible-assets/:id/purchase', file: 'market/buy.js' },
    { method: 'POST', path: '/api/v4/market/fungible-assets/:id/withdraw', file: 'market/manage.js' },
    
    // ===== 商城兑换 =====
    { method: 'POST', path: '/api/v4/shop/exchange', file: 'shop/exchange/exchange.js' },
    { method: 'POST', path: '/api/v4/shop/exchange/orders/:id/status', file: 'shop/exchange/orders.js' },
    { method: 'POST', path: '/api/v4/shop/assets/convert', file: 'shop/assets/convert.js' },
    { method: 'POST', path: '/api/v4/shop/premium/unlock', file: 'shop/premium.js' },
    
    // ===== 核销系统 =====
    { method: 'POST', path: '/api/v4/shop/redemption/fulfill', file: 'shop/redemption/fulfill.js' },
    { method: 'POST', path: '/api/v4/shop/redemption/orders', file: 'shop/redemption/orders.js' },
    { method: 'POST', path: '/api/v4/shop/redemption/orders/:id/cancel', file: 'shop/redemption/orders.js' },
    
    // ===== 消费记录 =====
    { method: 'POST', path: '/api/v4/shop/consumption/submit', file: 'shop/consumption/submit.js' },
    { method: 'DELETE', path: '/api/v4/shop/consumption/:id', file: 'shop/consumption/query.js' },
    { method: 'POST', path: '/api/v4/shop/consumption/:id/restore', file: 'shop/consumption/query.js' },
    
    // ===== 活动系统 =====
    { method: 'POST', path: '/api/v4/activities/:id/participate', file: 'activities.js' },
    { method: 'POST', path: '/api/v4/activities/:id/configure-conditions', file: 'activities.js' },
    
    // ===== 认证系统 =====
    { method: 'POST', path: '/api/v4/auth/login', file: 'auth/login.js' },
    { method: 'POST', path: '/api/v4/auth/decrypt-phone', file: 'auth/login.js' },
    { method: 'POST', path: '/api/v4/auth/quick-login', file: 'auth/login.js' },
    { method: 'POST', path: '/api/v4/auth/refresh', file: 'auth/token.js' },
    { method: 'POST', path: '/api/v4/auth/logout', file: 'auth/token.js' },
    { method: 'POST', path: '/api/v4/auth/permissions/check', file: 'auth/permissions.js' },
    { method: 'POST', path: '/api/v4/auth/permissions/cache/invalidate', file: 'auth/permissions.js' },
    { method: 'POST', path: '/api/v4/auth/permissions/batch-check', file: 'auth/permissions.js' },
    
    // ===== 系统功能 =====
    { method: 'POST', path: '/api/v4/system/chat/sessions', file: 'system/chat.js' },
    { method: 'POST', path: '/api/v4/system/chat/sessions/:id/messages', file: 'system/chat.js' },
    { method: 'POST', path: '/api/v4/system/feedback', file: 'system/feedback.js' },
    
    // ===== 控制台管理 - 客服 =====
    { method: 'POST', path: '/api/v4/console/customer-service/sessions/:id/send', file: 'console/customer-service/messages.js' },
    { method: 'POST', path: '/api/v4/console/customer-service/sessions/:id/mark-read', file: 'console/customer-service/messages.js' },
    { method: 'POST', path: '/api/v4/console/customer-service/sessions/:id/transfer', file: 'console/customer-service/operations.js' },
    { method: 'POST', path: '/api/v4/console/customer-service/sessions/:id/close', file: 'console/customer-service/operations.js' },
    
    // ===== 控制台管理 - 抽奖管理 =====
    { method: 'POST', path: '/api/v4/console/lottery-management/force-win', file: 'console/lottery-management/force-control.js' },
    { method: 'POST', path: '/api/v4/console/lottery-management/force-lose', file: 'console/lottery-management/force-control.js' },
    { method: 'POST', path: '/api/v4/console/lottery-management/probability-adjust', file: 'console/lottery-management/adjustment.js' },
    { method: 'POST', path: '/api/v4/console/lottery-management/user-specific-queue', file: 'console/lottery-management/adjustment.js' },
    { method: 'POST', path: '/api/v4/console/lottery-management/interventions/:id/cancel', file: 'console/lottery-management/interventions.js' },
    { method: 'DELETE', path: '/api/v4/console/lottery-management/user-settings/:id', file: 'console/lottery-management/user-status.js' },
    
    // ===== 控制台管理 - 定价配置 =====
    { method: 'POST', path: '/api/v4/console/lottery-management/campaigns/:id/pricing', file: 'console/lottery-management/pricing-config.js' },
    { method: 'PUT', path: '/api/v4/console/lottery-management/campaigns/:id/pricing/:version/activate', file: 'console/lottery-management/pricing-config.js' },
    { method: 'PUT', path: '/api/v4/console/lottery-management/campaigns/:id/pricing/:version/archive', file: 'console/lottery-management/pricing-config.js' },
    { method: 'POST', path: '/api/v4/console/lottery-management/campaigns/:id/pricing/rollback', file: 'console/lottery-management/pricing-config.js' },
    { method: 'PUT', path: '/api/v4/console/lottery-management/campaigns/:id/pricing/:version/schedule', file: 'console/lottery-management/pricing-config.js' },
    { method: 'DELETE', path: '/api/v4/console/lottery-management/campaigns/:id/pricing/:version/schedule', file: 'console/lottery-management/pricing-config.js' },
    
    // ===== 控制台管理 - 材料 =====
    { method: 'PUT', path: '/api/v4/console/material/asset-types/:id/disable', file: 'console/material.js' },
    
    // ===== 控制台管理 - 设置 =====
    { method: 'PUT', path: '/api/v4/console/settings/:category', file: 'console/settings.js' },
    { method: 'POST', path: '/api/v4/console/cache/clear', file: 'console/settings.js' },
    
    // ===== 控制台管理 - 弹窗Banner =====
    { method: 'POST', path: '/api/v4/console/popup-banners/', file: 'console/popup-banners.js' },
    { method: 'PUT', path: '/api/v4/console/popup-banners/:id', file: 'console/popup-banners.js' },
    { method: 'DELETE', path: '/api/v4/console/popup-banners/:id', file: 'console/popup-banners.js' },
    { method: 'PATCH', path: '/api/v4/console/popup-banners/:id/toggle', file: 'console/popup-banners.js' },
    { method: 'PATCH', path: '/api/v4/console/popup-banners/order', file: 'console/popup-banners.js' },
    
    // ===== 控制台管理 - 员工 =====
    { method: 'POST', path: '/api/v4/console/staff/', file: 'console/staff.js' },
    { method: 'POST', path: '/api/v4/console/staff/transfer', file: 'console/staff.js' },
    { method: 'POST', path: '/api/v4/console/staff/disable/:id', file: 'console/staff.js' },
    { method: 'POST', path: '/api/v4/console/staff/enable', file: 'console/staff.js' },
    { method: 'PUT', path: '/api/v4/console/staff/:id/role', file: 'console/staff.js' },
    { method: 'DELETE', path: '/api/v4/console/staff/:id', file: 'console/staff.js' },
    
    // ===== 控制台管理 - 门店 =====
    { method: 'POST', path: '/api/v4/console/stores/', file: 'console/stores.js' },
    { method: 'POST', path: '/api/v4/console/stores/batch-import', file: 'console/stores.js' },
    { method: 'PUT', path: '/api/v4/console/stores/:id', file: 'console/stores.js' },
    { method: 'DELETE', path: '/api/v4/console/stores/:id', file: 'console/stores.js' },
    { method: 'POST', path: '/api/v4/console/stores/:id/activate', file: 'console/stores.js' },
    { method: 'POST', path: '/api/v4/console/stores/:id/deactivate', file: 'console/stores.js' },
    
    // ===== 控制台管理 - 用户层级 =====
    { method: 'POST', path: '/api/v4/console/user-hierarchy/', file: 'console/user-hierarchy.js' },
    { method: 'POST', path: '/api/v4/console/user-hierarchy/:id/deactivate', file: 'console/user-hierarchy.js' },
    { method: 'POST', path: '/api/v4/console/user-hierarchy/:id/activate', file: 'console/user-hierarchy.js' },
    
    // ===== 控制台管理 - 公告 =====
    { method: 'POST', path: '/api/v4/console/system/announcements/', file: 'console/system/announcements.js' },
    { method: 'PUT', path: '/api/v4/console/system/announcements/:id', file: 'console/system/announcements.js' },
    { method: 'DELETE', path: '/api/v4/console/system/announcements/:id', file: 'console/system/announcements.js' },
    
    // ===== 控制台管理 - 反馈 =====
    { method: 'POST', path: '/api/v4/console/system/feedbacks/:id/reply', file: 'console/system/feedbacks.js' },
    { method: 'PUT', path: '/api/v4/console/system/feedbacks/:id/status', file: 'console/system/feedbacks.js' },
    
    // ===== 控制台管理 - 奖品池 =====
    { method: 'POST', path: '/api/v4/console/prize-pool/batch-add', file: 'console/prize_pool.js' },
    { method: 'POST', path: '/api/v4/console/prize-pool/:id', file: 'console/prize_pool.js' },
    { method: 'PUT', path: '/api/v4/console/prize-pool/prize/:id', file: 'console/prize_pool.js' },
    { method: 'DELETE', path: '/api/v4/console/prize-pool/prize/:id', file: 'console/prize_pool.js' },
    
    // ===== 控制台管理 - 用户管理 =====
    { method: 'POST', path: '/api/v4/console/user-management/points/adjust', file: 'console/user_management.js' },
    
    // ===== 控制台管理 - 材料系统 =====
    { method: 'POST', path: '/api/v4/console/material/asset-types/', file: 'console/material.js' },
    { method: 'PUT', path: '/api/v4/console/material/asset-types/:id', file: 'console/material.js' },
    { method: 'DELETE', path: '/api/v4/console/material/asset-types/:id', file: 'console/material.js' },
    { method: 'POST', path: '/api/v4/console/material/conversion-rules/', file: 'console/material.js' },
    { method: 'PUT', path: '/api/v4/console/material/conversion-rules/:id', file: 'console/material.js' },
    { method: 'DELETE', path: '/api/v4/console/material/conversion-rules/:id', file: 'console/material.js' },
    { method: 'POST', path: '/api/v4/console/material/users/:id/adjust', file: 'console/material.js' },
    
    // ===== 控制台管理 - 抽奖配额 =====
    { method: 'POST', path: '/api/v4/console/lottery-quota/rules/', file: 'console/lottery-quota.js' },
    { method: 'PUT', path: '/api/v4/console/lottery-quota/rules/:id', file: 'console/lottery-quota.js' },
    { method: 'POST', path: '/api/v4/console/lottery-quota/rules/:id/disable', file: 'console/lottery-quota.js' },
    { method: 'POST', path: '/api/v4/console/lottery-quota/users/:id/bonus', file: 'console/lottery-quota.js' },
    
    // ===== 控制台管理 - 资产调整 =====
    { method: 'POST', path: '/api/v4/console/asset-adjustment/adjust', file: 'console/asset-adjustment.js' },
    { method: 'POST', path: '/api/v4/console/asset-adjustment/batch-adjust', file: 'console/asset-adjustment.js' },
    
    // ===== 控制台管理 - 活动预算 =====
    { method: 'PUT', path: '/api/v4/console/campaign-budget/campaigns/:id', file: 'console/campaign-budget.js' },
    { method: 'POST', path: '/api/v4/console/campaign-budget/campaigns/:id/pool/add', file: 'console/campaign-budget.js' },
    
    // ===== 控制台管理 - 资产中心 =====
    { method: 'POST', path: '/api/v4/console/assets/portfolio/items/', file: 'console/assets.js' },
    { method: 'PUT', path: '/api/v4/console/assets/portfolio/items/:id', file: 'console/assets.js' },
    { method: 'DELETE', path: '/api/v4/console/assets/portfolio/items/:id', file: 'console/assets.js' },
    
    // ===== 控制台管理 - 图片上传 =====
    { method: 'POST', path: '/api/v4/console/images/upload', file: 'console/images.js' },
    { method: 'DELETE', path: '/api/v4/console/images/:id', file: 'console/images.js' },
    { method: 'POST', path: '/api/v4/console/images/:id/bind', file: 'console/images.js' },
    
    // ===== 控制台管理 - 孤儿冻结 =====
    { method: 'POST', path: '/api/v4/console/orphan-frozen/cleanup', file: 'console/orphan-frozen.js' },
    
    // ===== 控制台管理 - 商家积分 =====
    { method: 'POST', path: '/api/v4/console/merchant-points/:id/approve', file: 'console/merchant-points.js' },
    { method: 'POST', path: '/api/v4/console/merchant-points/:id/reject', file: 'console/merchant-points.js' },
    
    // ===== 控制台管理 - 消费审核 =====
    { method: 'POST', path: '/api/v4/console/consumption/approve/:id', file: 'console/consumption.js' },
    { method: 'POST', path: '/api/v4/console/consumption/reject/:id', file: 'console/consumption.js' },
    
    // ===== 控制台管理 - 审计日志 =====
    { method: 'POST', path: '/api/v4/console/audit-logs/cleanup', file: 'console/audit-logs.js' },
    
    // ===== 控制台管理 - 风控告警 =====
    { method: 'POST', path: '/api/v4/console/risk-alerts/:id/review', file: 'console/risk-alerts.js' },
    
    // ===== 控制台管理 - 欠账管理 =====
    { method: 'POST', path: '/api/v4/console/debt-management/clear', file: 'console/debt-management.js' },
    { method: 'PUT', path: '/api/v4/console/debt-management/limits/:id', file: 'console/debt-management.js' }
  ];
}

// 标准化路径参数
function normalizePathParams(apiPath) {
  // 将各种命名参数统一为 :id（和 IdempotencyService.normalizePath 保持一致）
  return apiPath
    .replace(/:(\w+_)?id\b/g, ':id')
    .replace(/:\w+_id\b/g, ':id')
    .replace(/:version\b/g, ':id') // 版本号也是ID
    .replace(/:category\b/g, ':id');
}

// 主程序
function main() {
  console.log('🔍 幂等性映射覆盖率检查（修正版）\n');
  console.log('=' .repeat(60));
  
  // 1. 提取已映射的路径
  const mappedPaths = extractCanonicalOperationMap();
  console.log(`\n📋 CANONICAL_OPERATION_MAP 已定义 ${mappedPaths.size} 个映射\n`);
  
  // 2. 获取正确的写操作路由
  const writeRoutes = getActualWriteRoutes();
  console.log(`📝 实际写操作路由共 ${writeRoutes.length} 个\n`);
  
  // 3. 检查覆盖率
  const coveredRoutes = [];
  const uncoveredRoutes = [];
  
  for (const route of writeRoutes) {
    const normalizedPath = normalizePathParams(route.path);
    const pathWithTrailingSlash = normalizedPath.endsWith('/') ? normalizedPath : normalizedPath + '/';
    const pathWithoutTrailingSlash = normalizedPath.endsWith('/') ? normalizedPath.slice(0, -1) : normalizedPath;
    
    // 检查是否有映射（考虑尾斜杠）
    const isCovered = mappedPaths.has(normalizedPath) || 
                      mappedPaths.has(pathWithTrailingSlash) ||
                      mappedPaths.has(pathWithoutTrailingSlash);
    
    if (isCovered) {
      coveredRoutes.push(route);
    } else {
      uncoveredRoutes.push({ ...route, normalizedPath });
    }
  }
  
  // 4. 输出结果
  const coverageRate = ((coveredRoutes.length / writeRoutes.length) * 100).toFixed(1);
  
  console.log('=' .repeat(60));
  console.log('📊 覆盖率统计');
  console.log('=' .repeat(60));
  console.log(`✅ 已覆盖: ${coveredRoutes.length} 个`);
  console.log(`❌ 未覆盖: ${uncoveredRoutes.length} 个`);
  console.log(`📈 覆盖率: ${coverageRate}%`);
  console.log('');
  
  if (uncoveredRoutes.length > 0) {
    console.log('=' .repeat(60));
    console.log('⚠️ 未覆盖的写操作路由（需要添加映射）:');
    console.log('=' .repeat(60));
    
    // 按文件分组
    const groupedByFile = {};
    for (const route of uncoveredRoutes) {
      if (!groupedByFile[route.file]) {
        groupedByFile[route.file] = [];
      }
      groupedByFile[route.file].push(route);
    }
    
    for (const [file, routes] of Object.entries(groupedByFile)) {
      console.log(`\n📁 ${file}:`);
      for (const route of routes) {
        console.log(`   ${route.method.padEnd(6)} ${route.path}`);
        console.log(`         -> 标准化: ${route.normalizedPath}`);
      }
    }
    
    // 输出建议添加的映射
    console.log('\n' + '=' .repeat(60));
    console.log('💡 建议添加到 CANONICAL_OPERATION_MAP 的映射:');
    console.log('=' .repeat(60));
    
    for (const route of uncoveredRoutes) {
      const operationName = generateOperationName(route);
      console.log(`'${route.normalizedPath}': '${operationName}',`);
    }
  } else {
    console.log('✅ 所有写操作路由都有幂等性映射覆盖！');
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('检查完成');
}

function generateOperationName(route) {
  // 根据路径生成操作名称
  const parts = route.path.split('/').filter(p => p && !p.startsWith(':'));
  const method = route.method.toUpperCase();
  
  // 移除 api/v4 前缀
  const relevantParts = parts.slice(2);
  
  // 转换为 UPPER_SNAKE_CASE
  const baseName = relevantParts
    .map(p => p.replace(/-/g, '_').toUpperCase())
    .join('_');
  
  // 根据方法添加后缀
  let suffix = '';
  switch (method) {
    case 'POST': suffix = 'CREATE'; break;
    case 'PUT': suffix = 'UPDATE'; break;
    case 'PATCH': suffix = 'TOGGLE'; break;
    case 'DELETE': suffix = 'DELETE'; break;
  }
  
  // 避免重复
  if (baseName.endsWith('_' + suffix) || baseName.includes(suffix)) {
    return baseName;
  }
  
  return baseName + '_' + suffix;
}

main();
