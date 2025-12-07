#!/usr/bin/env node
/**
 * 路由重复检测脚本
 * 检测整个项目中的API路径重复情况
 */

const fs = require('fs');
const path = require('path');

// 解析 app.js 中的挂载点
function parseAppMounts() {
  const appPath = path.join(__dirname, '../app.js');
  const content = fs.readFileSync(appPath, 'utf8');
  const mounts = {};
  
  // 匹配 app.use('/api/v4/xxx', require('./routes/xxx'))
  const regex = /app\.use\(['"]([^'"]+)['"]\s*,\s*require\(['"]([^'"]+)['"]\)/g;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    const prefix = match[1];
    const file = match[2];
    if (prefix.startsWith('/api/v4')) {
      mounts[file] = prefix;
    }
  }
  
  return mounts;
}

// 解析路由文件中的端点
function parseRouteFile(filePath, prefix) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const routes = [];
    
    // 匹配 router.method('path', ...)
    const regex = /router\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]*)['"]/g;
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      const relativePath = match[2];
      const fullPath = (prefix + relativePath).replace(/\/+/g, '/');
      
      routes.push({
        method,
        path: fullPath,
        file: filePath.replace(/.*\/routes\//, 'routes/')
      });
    }
    
    return routes;
  } catch (error) {
    return [];
  }
}

// 主函数
function main() {
  console.log('🔍 开始检测路由重复...\n');
  
  // 1. 解析挂载点
  const mounts = parseAppMounts();
  console.log('=== 发现的路由挂载点 ===');
  Object.entries(mounts).forEach(([file, prefix]) => {
    console.log(`${prefix} => ${file}`);
  });
  console.log('');
  
  // 2. 解析所有端点
  const allRoutes = [];
  Object.entries(mounts).forEach(([file, prefix]) => {
    const fullPath = path.join(__dirname, '..', file + '.js');
    if (fs.existsSync(fullPath)) {
      const routes = parseRouteFile(fullPath, prefix);
      allRoutes.push(...routes);
    }
  });
  
  console.log(`总计扫描: ${allRoutes.length}个端点\n`);
  
  // 3. 检测重复
  const pathMap = new Map();
  allRoutes.forEach(route => {
    const key = `${route.method} ${route.path}`;
    if (!pathMap.has(key)) {
      pathMap.set(key, []);
    }
    pathMap.get(key).push(route.file);
  });
  
  console.log('=== 重复路径检测结果 ===');
  let duplicateCount = 0;
  const duplicates = [];
  
  pathMap.forEach((files, key) => {
    if (files.length > 1) {
      duplicateCount++;
      duplicates.push({ key, files });
      console.log(`❌ 重复: ${key}`);
      files.forEach(f => console.log(`   - ${f}`));
      console.log('');
    }
  });
  
  if (duplicateCount === 0) {
    console.log('✅ 未发现真正的路径重复（同一URL+方法被多次注册）\n');
  } else {
    console.log(`⚠️ 发现 ${duplicateCount} 个重复路径\n`);
  }
  
  // 4. 功能相似性分析
  console.log('=== 功能相似性分析 ===');
  
  const categories = {
    exchange: [],
    inventory: [],
    points: [],
    lottery: [],
    auth: [],
    admin: [],
    announcement: [],
    notification: []
  };
  
  allRoutes.forEach(route => {
    const path = route.path.toLowerCase();
    if (path.includes('exchange') || path.includes('兑换')) categories.exchange.push(route);
    if (path.includes('inventory') || path.includes('库存')) categories.inventory.push(route);
    if (path.includes('point') || path.includes('积分')) categories.points.push(route);
    if (path.includes('lottery') || path.includes('抽奖') || path.includes('draw')) categories.lottery.push(route);
    if (path.includes('auth') || path.includes('login') || path.includes('register')) categories.auth.push(route);
    if (path.includes('admin')) categories.admin.push(route);
    if (path.includes('announcement') || path.includes('公告')) categories.announcement.push(route);
    if (path.includes('notification') || path.includes('通知')) categories.notification.push(route);
  });
  
  Object.entries(categories).forEach(([category, routes]) => {
    if (routes.length > 0) {
      console.log(`\n📦 ${category.toUpperCase()} 相关端点 (${routes.length}个):`);
      
      // 按文件分组
      const byFile = {};
      routes.forEach(r => {
        if (!byFile[r.file]) byFile[r.file] = [];
        byFile[r.file].push(`${r.method} ${r.path}`);
      });
      
      Object.entries(byFile).forEach(([file, paths]) => {
        console.log(`  ${file}:`);
        paths.slice(0, 3).forEach(p => console.log(`    - ${p}`));
        if (paths.length > 3) {
          console.log(`    ... 还有 ${paths.length - 3} 个`);
        }
      });
    }
  });
  
  console.log('\n✅ 检测完成');
  return duplicates.length;
}

// 执行
const exitCode = main();
process.exit(exitCode);

