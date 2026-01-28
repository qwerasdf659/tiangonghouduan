#!/usr/bin/env node
/**
 * 管理后台 API 测试脚本
 * 测试财务管理、门店管理相关 API
 * 
 * 用法: node scripts/test-admin-api.js
 */

const http = require('http');
const https = require('https');

const BASE_URL = 'http://localhost:3000';

// 测试用的管理员 token（需要替换为有效 token）
let adminToken = '';

/**
 * 发送 HTTP 请求
 */
function request(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

/**
 * 获取管理员 token
 */
async function getAdminToken() {
  console.log('\n🔐 获取管理员 Token...');
  try {
    const result = await request('POST', '/api/v4/auth/login', {
      login_type: 'wechat',
      openid: 'admin_test_openid_001'  // 测试用 openid
    });
    
    if (result.data?.success && result.data?.data?.token) {
      adminToken = result.data.data.token;
      console.log('✅ 获取 Token 成功');
      return true;
    } else {
      console.log('❌ 获取 Token 失败:', result.data);
      return false;
    }
  } catch (error) {
    console.log('❌ 登录请求失败:', error.message);
    return false;
  }
}

/**
 * 测试门店列表 API
 */
async function testStoreList() {
  console.log('\n📋 测试门店列表 API: GET /api/v4/console/stores');
  try {
    const result = await request('GET', '/api/v4/console/stores?page=1&page_size=10', null, adminToken);
    console.log(`   状态码: ${result.status}`);
    console.log(`   成功: ${result.data?.success}`);
    console.log(`   消息: ${result.data?.message}`);
    
    if (result.data?.success) {
      const data = result.data.data;
      console.log(`   总数: ${data?.total || 0}`);
      console.log(`   当前页: ${data?.page || 1}`);
      console.log(`   数据条数: ${data?.items?.length || 0}`);
      if (data?.items?.length > 0) {
        console.log(`   第一条门店: ${data.items[0].store_name}`);
      }
    } else {
      console.log(`   错误详情:`, JSON.stringify(result.data, null, 2));
    }
    return result.status === 200 && result.data?.success;
  } catch (error) {
    console.log(`   ❌ 请求失败: ${error.message}`);
    return false;
  }
}

/**
 * 测试门店统计 API
 */
async function testStoreStats() {
  console.log('\n📊 测试门店统计 API: GET /api/v4/console/stores/stats');
  try {
    const result = await request('GET', '/api/v4/console/stores/stats', null, adminToken);
    console.log(`   状态码: ${result.status}`);
    console.log(`   成功: ${result.data?.success}`);
    console.log(`   消息: ${result.data?.message}`);
    
    if (result.data?.success) {
      const stats = result.data.data;
      console.log(`   总门店: ${stats?.total || 0}`);
      console.log(`   营业中: ${stats?.active || 0}`);
      console.log(`   已关闭: ${stats?.inactive || 0}`);
      console.log(`   待审核: ${stats?.pending || 0}`);
      console.log(`   员工总数: ${stats?.total_staff || 0}`);
    } else {
      console.log(`   错误详情:`, JSON.stringify(result.data, null, 2));
    }
    return result.status === 200 && result.data?.success;
  } catch (error) {
    console.log(`   ❌ 请求失败: ${error.message}`);
    return false;
  }
}

/**
 * 测试员工列表 API
 */
async function testStaffList() {
  console.log('\n👥 测试员工列表 API: GET /api/v4/console/staff');
  try {
    const result = await request('GET', '/api/v4/console/staff?page=1&page_size=10', null, adminToken);
    console.log(`   状态码: ${result.status}`);
    console.log(`   成功: ${result.data?.success}`);
    console.log(`   消息: ${result.data?.message}`);
    
    if (result.data?.success) {
      const data = result.data.data;
      console.log(`   总数: ${data?.total || 0}`);
      console.log(`   数据条数: ${data?.staff?.length || data?.items?.length || 0}`);
    } else {
      console.log(`   错误详情:`, JSON.stringify(result.data, null, 2));
    }
    return result.status === 200 && result.data?.success;
  } catch (error) {
    console.log(`   ❌ 请求失败: ${error.message}`);
    return false;
  }
}

/**
 * 测试消费记录 API
 */
async function testConsumptionRecords() {
  console.log('\n💰 测试消费记录 API: GET /api/v4/console/consumption/records');
  try {
    const result = await request('GET', '/api/v4/console/consumption/records?page=1&page_size=10', null, adminToken);
    console.log(`   状态码: ${result.status}`);
    console.log(`   成功: ${result.data?.success}`);
    console.log(`   消息: ${result.data?.message}`);
    
    if (result.data?.success) {
      const data = result.data.data;
      console.log(`   总数: ${data?.total || 0}`);
      console.log(`   数据条数: ${data?.records?.length || data?.list?.length || 0}`);
    } else {
      console.log(`   错误详情:`, JSON.stringify(result.data, null, 2));
    }
    return result.status === 200;
  } catch (error) {
    console.log(`   ❌ 请求失败: ${error.message}`);
    return false;
  }
}

/**
 * 测试区域数据 API
 */
async function testRegionProvinces() {
  console.log('\n🗺️ 测试省份列表 API: GET /api/v4/console/regions/provinces');
  try {
    const result = await request('GET', '/api/v4/console/regions/provinces', null, adminToken);
    console.log(`   状态码: ${result.status}`);
    console.log(`   成功: ${result.data?.success}`);
    console.log(`   消息: ${result.data?.message}`);
    
    if (result.data?.success) {
      const provinces = result.data.data?.provinces || result.data.data;
      console.log(`   省份数量: ${Array.isArray(provinces) ? provinces.length : 0}`);
      if (Array.isArray(provinces) && provinces.length > 0) {
        console.log(`   第一个省份: ${provinces[0].name || provinces[0].region_name}`);
      }
    } else {
      console.log(`   错误详情:`, JSON.stringify(result.data, null, 2));
    }
    return result.status === 200 && result.data?.success;
  } catch (error) {
    console.log(`   ❌ 请求失败: ${error.message}`);
    return false;
  }
}

/**
 * 测试健康检查
 */
async function testHealth() {
  console.log('\n🏥 测试服务健康: GET /health');
  try {
    const result = await request('GET', '/health');
    console.log(`   状态码: ${result.status}`);
    console.log(`   状态: ${result.data?.status}`);
    return result.status === 200;
  } catch (error) {
    console.log(`   ❌ 请求失败: ${error.message}`);
    return false;
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('=' .repeat(60));
  console.log('🧪 管理后台 API 测试');
  console.log('=' .repeat(60));
  console.log(`📍 测试服务器: ${BASE_URL}`);
  console.log(`📅 测试时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);

  const results = {};
  
  // 1. 健康检查
  results.health = await testHealth();
  
  if (!results.health) {
    console.log('\n❌ 服务不可用，请先启动后端服务');
    process.exit(1);
  }

  // 2. 获取管理员 Token
  const hasToken = await getAdminToken();
  
  if (!hasToken) {
    console.log('\n⚠️ 无法获取管理员 Token，将尝试无认证测试...');
    // 尝试使用已有的测试管理员 token
    adminToken = process.env.ADMIN_TOKEN || '';
  }

  // 3. 测试各 API
  results.stores = await testStoreList();
  results.storeStats = await testStoreStats();
  results.staff = await testStaffList();
  results.consumption = await testConsumptionRecords();
  results.regions = await testRegionProvinces();

  // 4. 结果汇总
  console.log('\n' + '=' .repeat(60));
  console.log('📊 测试结果汇总');
  console.log('=' .repeat(60));
  
  const passed = Object.values(results).filter(r => r).length;
  const total = Object.keys(results).length;
  
  Object.entries(results).forEach(([name, passed]) => {
    console.log(`   ${passed ? '✅' : '❌'} ${name}: ${passed ? 'PASS' : 'FAIL'}`);
  });
  
  console.log('-'.repeat(60));
  console.log(`   总计: ${passed}/${total} 通过`);
  console.log('=' .repeat(60));

  if (passed < total) {
    console.log('\n💡 诊断建议:');
    if (!results.stores || !results.storeStats) {
      console.log('   - 门店相关 API 可能需要管理员权限');
      console.log('   - 检查 stores 表是否有数据');
    }
    if (!results.staff) {
      console.log('   - 员工 API 可能未实现或路径不正确');
    }
    if (!results.regions) {
      console.log('   - 区域数据可能未导入 administrative_regions 表');
    }
  }

  process.exit(passed === total ? 0 : 1);
}

main().catch(error => {
  console.error('❌ 测试脚本错误:', error);
  process.exit(1);
});

















