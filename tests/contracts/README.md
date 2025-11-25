# API契约测试

## 概述

API契约测试用于验证后端API返回的数据结构是否符合预定义的契约（JSON Schema）。

## 契约测试的作用

1. **自动发现数据结构不匹配问题**: 在开发阶段就能发现前后端数据不一致
2. **防止回归**: API变更时自动检测是否破坏了契约
3. **文档即契约**: 契约定义本身就是最准确的API文档
4. **提高协作效率**: 前后端开发者基于契约并行开发

## 目录结构

```
tests/contracts/
├── README.md                          # 本文件
├── admin-dashboard.contract.test.js   # Dashboard API契约测试
└── (其他API的契约测试...)
```

##运行方式

```bash
# 运行所有契约测试
npm run test:contract

# 运行特定契约测试
npm test tests/contracts/admin-dashboard.contract.test.js
```

## 契约测试编写指南

### 1. 测试结构

每个契约测试文件应包含：

- **数据结构验证**: 使用JSON Schema验证响应结构
- **字段存在性检查**: 验证所有必需字段都存在
- **字段类型检查**: 验证字段类型正确
- **业务逻辑验证**: 验证数据的合理性（如：中奖次数不超过抽奖次数）

### 2. 测试示例

```javascript
describe('API契约测试: YourAPI', () => {
  let authToken = null
  
  beforeAll(async () => {
    // 登录获取token
    const response = await request(app)
      .post('/api/v4/auth/login')
      .send({
        mobile: '13612227930',
        verification_code: '123456'
      })
    authToken = response.body.data.access_token
  })
  
  test('应该返回符合契约的数据结构', async () => {
    const response = await request(app)
      .get('/api/v4/your-endpoint')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200)
    
    // 验证必需字段存在
    expect(response.body.success).toBeDefined()
    expect(response.body.data).toBeDefined()
    
    // 验证字段类型
    expect(typeof response.body.data.field1).toBe('string')
    expect(typeof response.body.data.field2).toBe('number')
  })
})
```

### 3. 最佳实践

- ✅ 每个API端点一个契约测试文件
- ✅ 测试所有必需字段的存在性
- ✅ 测试字段类型的正确性
- ✅ 测试业务规则的合理性
- ✅ 使用有意义的测试描述
- ❌ 不要测试业务逻辑的具体数值（这应该在业务测试中）
- ❌ 不要依赖特定的测试数据（测试应该可重复运行）

## 契约变更流程

当API需要修改时：

1. **更新契约定义**: 修改 `docs/api-contracts/{api-name}.contract.json`
2. **更新契约测试**: 修改对应的测试文件
3. **运行测试**: 确保所有测试通过
4. **同步前端**: 通知前端开发者更新代码
5. **记录变更**: 在契约文件的 `changeLog` 中记录变更

## 注意事项

### 测试环境配置

契约测试会连接真实的数据库和服务，因此：

- 使用测试账号进行登录（13612227930）
- 确保测试环境数据库有基础测试数据
- 测试不应该修改数据库状态（使用只读查询）

### 常见问题

#### Q: 测试报错 "Cannot find module 'ajv-formats'"
A: 运行 `npm install --save-dev ajv-formats` 安装依赖

#### Q: 测试超时
A: 增加测试超时时间：在测试文件中设置 `jest.setTimeout(30000)`

#### Q: 数据结构不匹配
A: 检查后端API返回的实际数据结构，对比契约定义，找出差异并修复

## 相关文档

- [API契约定义](../../docs/api-contracts/)
- [前后端数据契约管理与自动验证系统](../../docs/前后端数据契约管理与自动验证系统.md)

