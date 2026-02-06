# 天工小程序 - 测试文档

## 📚 测试体系概述

本项目建立了完整的测试体系，包括单元测试、集成测试、回归测试，确保代码质量和功能稳定性。

---

## 🎯 测试目标

1. **预防问题**：通过测试在开发阶段发现问题
2. **防止回归**：确保修复的问题不会再次出现
3. **标准符合**：验证实现符合相关标准（RFC、W3C等）
4. **质量保证**：维持高代码覆盖率（>80%）

---

## 📁 测试文件结构

```
test/
├── utils/                  # 工具函数测试
│   ├── jwt-test.spec.js   # JWT Token处理测试
│   └── api-test.spec.js   # API调用测试（待补充）
├── pages/                  # 页面功能测试
│   └── auth-test.spec.js  # 认证页面测试（待补充）
└── README.md              # 本文档
```

---

## 🚀 快速开始

### 安装测试依赖

```powershell
npm install --save-dev jest
```

### 运行测试

```powershell
# 运行所有测试
npm test

# 运行特定测试文件
npm test test/utils/jwt-test.spec.js

# 生成覆盖率报告
npm run test:coverage

# 持续监听模式（开发时使用）
npm run test:watch
```

---

## 📊 测试覆盖率要求

### 全局要求

| 指标 | 最低要求 | 推荐目标 |
|-----|---------|---------|
| 分支覆盖率 | 60% | 80% |
| 函数覆盖率 | 70% | 90% |
| 行覆盖率 | 70% | 90% |
| 语句覆盖率 | 70% | 90% |

### 关键模块要求

**utils/util.js**（工具函数）：
- 分支覆盖率：≥80%
- 函数覆盖率：≥85%
- 行覆盖率：≥85%

**pages/auth/auth.js**（认证模块）：
- 分支覆盖率：≥70%
- 函数覆盖率：≥75%
- 行覆盖率：≥75%

---

## 📝 测试编写指南

### 测试文件命名规范

```
被测试文件：utils/util.js
测试文件：  test/utils/util-test.spec.js

或

被测试文件：pages/auth/auth.js
测试文件：  test/pages/auth-test.spec.js
```

### 测试用例结构

```javascript
describe('功能模块名称', () => {
  // ===== 第一组：基本功能测试 =====
  describe('基本功能', () => {
    test('✅ 正常情况应该成功', () => {
      // Arrange（准备）
      const input = 'test data'
      
      // Act（执行）
      const result = functionUnderTest(input)
      
      // Assert（断言）
      expect(result).toBeDefined()
      expect(result.success).toBe(true)
    })
  })
  
  // ===== 第二组：边界条件测试 =====
  describe('边界条件', () => {
    test('❌ 空值应该被拒绝', () => {
      expect(() => functionUnderTest(null)).toThrow()
    })
    
    test('❌ 无效格式应该被拒绝', () => {
      const result = functionUnderTest('invalid')
      expect(result.success).toBe(false)
    })
  })
  
  // ===== 第三组：回归测试 =====
  describe('回归测试', () => {
    test('🐛 [BUG-2025-11-08] 修复的问题不应复现', () => {
      // 重现之前的bug场景
      const problematicInput = '...'
      const result = functionUnderTest(problematicInput)
      
      // 验证问题已修复
      expect(result.error).not.toContain('之前的错误信息')
    })
  })
})
```

### 测试数据管理

```javascript
// ✅ 好的实践：集中管理测试数据
const TEST_DATA = {
  VALID_JWT_TOKENS: {
    standard: 'eyJhbGciOiJIUzI1NiJ9...',
    admin: 'eyJhbGciOiJIUzI1NiJ9...'
  },
  INVALID_JWT_TOKENS: {
    truncated: 'eyJhbGciOiJ...',
    malformed: 'not-a-jwt'
  }
}

// 在测试中使用
test('✅ 应该解码有效Token', () => {
  const result = decodeJWT(TEST_DATA.VALID_JWT_TOKENS.standard)
  expect(result).toBeDefined()
})
```

---

## 🔍 测试类型说明

### 1. 基本功能测试

验证正常情况下功能是否按预期工作。

```javascript
test('✅ 有效Token应该被成功解码', () => {
  const payload = decodeJWTPayload(VALID_TOKEN)
  
  expect(payload).not.toBeNull()
  expect(payload.user_id).toBeDefined()
  expect(payload.exp).toBeGreaterThan(Date.now() / 1000)
})
```

### 2. 边界条件测试

测试极端情况和异常输入。

```javascript
test('❌ 空Token应该被拒绝', () => {
  const result = validateJWTTokenIntegrity('')
  expect(result.isValid).toBe(false)
})

test('❌ 超长Token应该被处理', () => {
  const longToken = 'A'.repeat(100000)
  // 不应该崩溃或挂起
  expect(() => validateJWTTokenIntegrity(longToken)).not.toThrow()
})
```

### 3. 标准符合性测试

验证实现是否符合相关标准（RFC、W3C等）。

```javascript
test('✅ JWT应该使用Base64 URL编码（RFC 7519）', () => {
  // 包含 - 和 _ 字符的Token（Base64 URL标准）
  const tokenWithUrlChars = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoxMjMtNDU2fQ.abc_def'
  
  const result = validateJWTTokenIntegrity(tokenWithUrlChars)
  
  // 不应该因为 - 和 _ 字符而失败
  if (!result.isValid) {
    expect(result.error).not.toContain('Base64')
  }
})
```

### 4. 回归测试

防止已修复的bug再次出现。

```javascript
test('🐛 [BUG-2025-11-08] Base64 URL字符应该被接受', () => {
  // 这个测试确保 2025-11-08 修复的问题不会再次出现
  const payload = 'eyJ1c2VyX2lkIjoxMjMsInRlc3QtZmllbGQiOiJ2YWx1ZSJ9'
  
  // 之前这里会失败，因为包含 - 字符
  const result = validateJWTTokenIntegrity(`header.${payload}.signature`)
  
  // 现在应该通过
  expect(result.details.payloadValid).not.toBe(false)
})
```

### 5. 性能测试

确保代码性能符合要求。

```javascript
test('⚡ 验证1000个Token应在1秒内完成', () => {
  const startTime = Date.now()
  
  for (let i = 0; i < 1000; i++) {
    validateJWTTokenIntegrity(VALID_TOKEN)
  }
  
  const duration = Date.now() - startTime
  expect(duration).toBeLessThan(1000)
})
```

---

## 🐛 Bug追踪测试

每个修复的bug都应该有对应的回归测试。

### Bug测试命名规范

```javascript
test('🐛 [BUG-YYYY-MM-DD] 简短描述', () => {
  // 测试内容
})
```

### Bug测试模板

```javascript
/**
 * 回归测试 - [Bug ID或日期]
 * 
 * 问题描述：
 * - 什么情况下发生的
 * - 为什么会发生
 * 
 * 修复方案：
 * - 如何修复的
 * 
 * 验证方法：
 * - 如何确认已修复
 */
test('🐛 [BUG-2025-11-08] Base64 URL字符验证错误', () => {
  // 1. 重现问题场景
  const tokenWithUrlChars = 'header.payload-with_url-chars.signature'
  
  // 2. 验证修复效果
  const result = validateJWTTokenIntegrity(tokenWithUrlChars)
  
  // 3. 断言：之前会失败，现在应该通过
  if (!result.isValid) {
    // 如果验证失败，不应该是因为字符问题
    expect(result.error).not.toContain('无效的Base64')
  }
})
```

---

## 📈 查看覆盖率报告

### 生成报告

```powershell
npm run test:coverage
```

### 查看报告

**终端摘要**：
```
=============================== Coverage summary ===============================
Statements   : 85% ( 170/200 )
Branches     : 75% ( 60/80 )
Functions    : 90% ( 36/40 )
Lines        : 85% ( 168/197 )
================================================================================
```

**HTML详细报告**：
```powershell
# 报告位置
coverage/index.html

# 在浏览器中打开
start coverage/index.html
```

**LCOV报告**（CI集成）：
```
coverage/lcov.info
```

---

## 🔧 测试配置

### Jest配置文件

```javascript
// jest.config.js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.spec.js'],
  collectCoverageFrom: ['utils/**/*.js', 'pages/**/*.js'],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 70,
      lines: 70,
      statements: 70
    }
  }
}
```

---

## 📚 最佳实践

### 1. 测试先行（TDD）

```javascript
// 先写测试（描述期望行为）
test('✅ 应该验证JWT Token完整性', () => {
  const result = validateJWTTokenIntegrity(VALID_TOKEN)
  expect(result.isValid).toBe(true)
})

// 再写实现
function validateJWTTokenIntegrity(token) {
  // 实现逻辑
}
```

### 2. 独立性

每个测试应该独立，不依赖其他测试的执行结果。

```javascript
// ❌ 错误：依赖全局状态
let token
test('test 1', () => {
  token = 'xxx'
})
test('test 2', () => {
  // 依赖test 1设置的token
  expect(token).toBeDefined()
})

// ✅ 正确：每个测试独立
test('test 1', () => {
  const token = 'xxx'
  expect(token).toBeDefined()
})
test('test 2', () => {
  const token = 'yyy'
  expect(token).toBeDefined()
})
```

### 3. 清晰的断言

使用具体的断言，避免模糊的判断。

```javascript
// ❌ 模糊
expect(result).toBeTruthy()

// ✅ 清晰
expect(result.isValid).toBe(true)
expect(result.details).toBeDefined()
expect(result.details.tokenLength).toBeGreaterThan(150)
```

### 4. 有意义的测试名称

```javascript
// ❌ 不好
test('test 1', () => {})

// ✅ 好
test('✅ 有效的JWT Token应该通过完整性验证', () => {})
```

---

## 🚨 测试失败处理

### 查看失败详情

```powershell
npm test -- --verbose
```

### 调试单个测试

```powershell
# 运行特定测试
npm test -- --testNamePattern="JWT Token"

# 持续监听
npm test -- --watch --testNamePattern="JWT Token"
```

### 更新快照（如果使用快照测试）

```powershell
npm test -- --updateSnapshot
```

---

## 📝 TODO

- [ ] 补充API调用测试（`test/utils/api-test.spec.js`）
- [ ] 补充认证页面测试（`test/pages/auth-test.spec.js`）
- [ ] 补充工具函数测试（`test/utils/util-test.spec.js`）
- [ ] 集成测试自动化
- [ ] E2E测试框架选型

---

## 📞 联系方式

**问题反馈**：团队内部沟通渠道  
**技术支持**：天工小程序技术团队

---

**创建时间**：2025-11-08  
**最后更新**：2025-11-08  
**维护者**：天工小程序技术团队

