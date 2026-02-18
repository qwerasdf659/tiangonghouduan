/**
 * 抽奖管理后台页面 API 数据流测试
 * 
 * @description 测试截图中涉及的5个业务页面的API数据联通性：
 *   1. 抽奖子预设管理（presets）
 *   2. 批量工具（batch-operations）
 *   3. 核销码管理（redemption-orders）
 *   4. 策略配置管理（lottery-configs/strategies）
 *   5. 策略规则管理（lottery-tier-rules）
 * 
 * @requires 测试账号 13612227930 (ID:31, 验证码:123456)
 */

const { describe, test, expect, beforeAll } = require('@jest/globals');

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';
const API_PREFIX = `${API_BASE}/api/v4`;

let accessToken = null;

/**
 * 发送API请求的通用封装
 */
async function apiRequest(method, path, body = null) {
  const url = path.startsWith('http') ? path : `${API_PREFIX}${path}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const response = await fetch(url, options);
  const data = await response.json();
  return { status: response.status, ...data };
}

beforeAll(async () => {
  const result = await apiRequest('POST', '/auth/login', {
    mobile: '13612227930',
    verification_code: '123456',
  });
  expect(result.success).toBe(true);
  accessToken = result.data?.access_token;
  expect(accessToken).toBeTruthy();
}, 15000);

describe('页面1: 抽奖子预设管理 (presets.html)', () => {
  test('预设列表 - 能正确获取数据', async () => {
    const result = await apiRequest('GET', '/console/lottery-presets?page=1&page_size=10');
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();

    const { list, pagination } = result.data;
    expect(Array.isArray(list)).toBe(true);
    expect(pagination).toBeDefined();
    expect(typeof pagination.total).toBe('number');
    expect(typeof pagination.page).toBe('number');
    expect(typeof pagination.page_size).toBe('number');
  });

  test('预设列表 - 数据结构与前端期望一致', async () => {
    const result = await apiRequest('GET', '/console/lottery-presets?page=1&page_size=5');
    expect(result.success).toBe(true);

    if (result.data.list.length > 0) {
      const preset = result.data.list[0];
      expect(preset).toHaveProperty('lottery_preset_id');
      expect(preset).toHaveProperty('user_id');
      expect(preset).toHaveProperty('status');
      expect(preset).toHaveProperty('approval_status');
      expect(preset).toHaveProperty('target_user');
      expect(preset).toHaveProperty('prize');
    }
  });

  test('预设统计 - 能获取统计数据', async () => {
    const result = await apiRequest('GET', '/console/lottery-presets/stats');
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });
});

describe('页面2: 批量工具 (lottery-management.html 批量操作Tab)', () => {
  test('批量操作日志 - 能正确获取日志列表', async () => {
    const result = await apiRequest('GET', '/console/batch-operations/logs?page=1&page_size=10');
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();

    const { logs, pagination } = result.data;
    expect(Array.isArray(logs)).toBe(true);
    expect(pagination).toBeDefined();
    expect(typeof pagination.total_count).toBe('number');
  });

  test('批量操作日志 - 数据结构完整', async () => {
    const result = await apiRequest('GET', '/console/batch-operations/logs?page=1&page_size=5');

    if (result.data.logs.length > 0) {
      const log = result.data.logs[0];
      expect(log).toHaveProperty('batch_operation_log_id');
      expect(log).toHaveProperty('operation_type');
      expect(log).toHaveProperty('operation_type_name');
      expect(log).toHaveProperty('status');
      expect(log).toHaveProperty('total_count');
      expect(log).toHaveProperty('success_count');
      expect(log).toHaveProperty('fail_count');
      expect(log).toHaveProperty('operator_name');
      expect(log).toHaveProperty('created_at');
    }
  });

  test('批量操作配置 - 能获取可用操作类型', async () => {
    const result = await apiRequest('GET', '/console/batch-operations/config');
    expect(result.success).toBe(true);
  });
});

describe('页面3: 核销码管理 (lottery-management.html 核销码Tab)', () => {
  test('核销码统计 - 能获取统计概览', async () => {
    const result = await apiRequest(
      'GET',
      '/console/business-records/redemption-orders/statistics'
    );
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();

    const stats = result.data;
    expect(stats).toHaveProperty('total');
    expect(typeof stats.total).toBe('number');
  });

  test('核销码列表 - 能正确获取数据', async () => {
    const result = await apiRequest(
      'GET',
      '/console/business-records/redemption-orders?page=1&page_size=10'
    );
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });
});

describe('页面4: 策略配置管理 (lottery-management.html 策略Tab)', () => {
  test('策略配置列表 - 能正确获取数据', async () => {
    const result = await apiRequest('GET', '/console/lottery-configs/strategies');
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();

    const data = result.data;
    expect(data).toHaveProperty('list');
    expect(Array.isArray(data.list)).toBe(true);
  });

  test('策略配置 - 数据按分组组织', async () => {
    const result = await apiRequest('GET', '/console/lottery-configs/strategies');

    if (result.data.list.length > 0) {
      const config = result.data.list[0];
      expect(config).toHaveProperty('lottery_strategy_config_id');
      expect(config).toHaveProperty('config_group');
      expect(config).toHaveProperty('config_key');
      expect(config).toHaveProperty('config_value');
      expect(config).toHaveProperty('value_type');
      expect(config).toHaveProperty('description');
      expect(config).toHaveProperty('is_active');
    }
  });

  test('矩阵配置 - 能获取矩阵列表', async () => {
    const result = await apiRequest('GET', '/console/lottery-configs/matrix');
    expect(result.success).toBe(true);
  });
});

describe('页面5: 策略规则管理 (lottery-management.html 规则Tab)', () => {
  test('档位规则列表 - 能正确获取数据', async () => {
    const result = await apiRequest('GET', '/console/lottery-tier-rules?page=1&page_size=20');
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();

    const data = result.data;
    expect(data).toHaveProperty('list');
    expect(Array.isArray(data.list)).toBe(true);
    expect(data).toHaveProperty('total');
    expect(typeof data.total).toBe('number');
  });

  test('档位规则 - 数据结构完整', async () => {
    const result = await apiRequest('GET', '/console/lottery-tier-rules?page=1&page_size=5');

    if (result.data.list.length > 0) {
      const rule = result.data.list[0];
      expect(rule).toHaveProperty('lottery_campaign_id');
      expect(rule).toHaveProperty('segment_key');
      expect(rule).toHaveProperty('tier_name');
      expect(rule).toHaveProperty('tier_weight');
      expect(rule).toHaveProperty('probability');
      expect(rule).toHaveProperty('status');
      expect(rule).toHaveProperty('campaign');
      expect(rule.campaign).toHaveProperty('campaign_name');
    }
  });

  test('档位规则概览 - 能获取所有活动的档位概览', async () => {
    const result = await apiRequest('GET', '/console/lottery-tier-rules/overview');
    expect(result.success).toBe(true);
  });
});

describe('数据联通性 - 跨页面数据一致性', () => {
  test('活动列表 - 供各页面下拉选择使用', async () => {
    const result = await apiRequest('GET', '/console/lottery-campaigns');
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  test('奖品列表 - 供预设管理选择使用', async () => {
    const result = await apiRequest('GET', '/console/prize-pool/list');
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  test('用户解析 - 供批量操作解析手机号使用', async () => {
    const result = await apiRequest(
      'GET',
      '/console/user-management/users/resolve?mobile=13612227930'
    );
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.user_id).toBe(31);
  });
});
