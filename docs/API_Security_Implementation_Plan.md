# API数据安全加固实施计划

## 📅 **实施时间表**

### 第一阶段：核心安全加固（3-4天）

#### Day 1: 基础架构搭建
- ✅ 创建统一数据访问控制中间件 (`middleware/dataAccessControl.js`)
- ✅ 创建统一数据脱敏服务 (`services/DataSanitizer.js`)
- ✅ 编写基础单元测试

**验收标准**：
- 中间件正确识别管理员和普通用户
- 数据脱敏服务通过所有测试用例
- 代码覆盖率达到90%以上

#### Day 2: 抽奖系统API改造
- 🔄 改造 `/api/v4/unified-engine/lottery/prizes` - 奖品列表脱敏
- 🔄 改造 `/api/v4/unified-engine/lottery/config` - 配置信息脱敏
- 🔄 改造 `/api/v4/unified-engine/lottery/draw` - 抽奖结果脱敏

**验收标准**：
- 普通用户无法获取概率、库存、成本等敏感信息
- 管理员仍能获取完整运营数据
- 预设奖品机制完全隐藏

#### Day 3: 库存和用户系统API改造
- 🔄 改造 `/api/v4/inventory/user/:id` - 库存管理脱敏
- 🔄 改造 `/api/v4/unified-engine/auth/` - 用户认证脱敏
- 🔄 改造 `/api/v4/points/` - 积分系统脱敏

**验收标准**：
- 获取方式、转让历史等敏感信息完全隐藏
- JWT权限信息不再暴露
- 积分经济模型得到保护

#### Day 4: 管理员和其他API改造
- 🔄 改造 `/api/v4/admin/statistics` - 管理员统计脱敏
- 🔄 改造 `/api/v4/admin/chat/sessions` - 聊天管理脱敏
- 🔄 改造 `/api/v4/photo/upload` - 图片上传脱敏

**验收标准**：
- 运营数据仅管理员可见
- 用户隐私信息得到保护
- 存储架构信息不再泄露

### 第二阶段：全面测试和优化（2-3天）

#### Day 5: 安全性测试
```bash
# 安全测试脚本
npm run test:security

# 测试内容：
# 1. 普通用户权限边界测试
# 2. 管理员功能完整性测试  
# 3. 数据脱敏效果验证
# 4. API响应时间性能测试
```

#### Day 6: 前端适配和集成测试
- 🔄 更新前端API调用代码
- 🔄 适配新的数据格式
- 🔄 测试用户界面显示效果

#### Day 7: 生产环境部署准备
- 🔄 生产环境配置检查
- 🔄 数据库迁移脚本准备
- 🔄 回滚方案制定

## 🧪 **测试验证方案**

### 1. 单元测试覆盖

```javascript
// tests/services/DataSanitizer.test.js
describe('DataSanitizer', () => {
  describe('sanitizePrizes', () => {
    it('should hide sensitive data for public users', () => {
      const prizes = [{
        prize_id: 1,
        prize_name: 'iPhone 15',
        win_probability: 0.01,  // 敏感数据
        stock_quantity: 10,     // 敏感数据
        prize_value: 7999       // 敏感数据
      }]
      
      const result = DataSanitizer.sanitizePrizes(prizes, 'public')
      
      expect(result[0]).not.toHaveProperty('win_probability')
      expect(result[0]).not.toHaveProperty('stock_quantity')
      expect(result[0]).not.toHaveProperty('prize_value')
      expect(result[0]).toHaveProperty('rarity')
      expect(result[0]).toHaveProperty('display_value')
    })
    
    it('should return full data for admin users', () => {
      const prizes = [{ /* 完整数据 */ }]
      const result = DataSanitizer.sanitizePrizes(prizes, 'full')
      expect(result).toEqual(prizes)
    })
  })
})
```

### 2. 集成测试验证

```javascript
// tests/integration/api.security.test.js
describe('API Security Integration Tests', () => {
  describe('Lottery API', () => {
    it('should not expose probability to regular users', async () => {
      const response = await request(app)
        .get('/api/v4/unified-engine/lottery/prizes/1')
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(200)
      
      expect(response.body.data).not.toContainKey('win_probability')
      expect(response.body.data).not.toContainKey('stock_quantity')
    })
    
    it('should expose full data to admin users', async () => {
      const response = await request(app)
        .get('/api/v4/unified-engine/lottery/prizes/1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
      
      expect(response.body.data).toContainKey('win_probability')
      expect(response.body.data).toContainKey('stock_quantity')
    })
  })
})
```

### 3. 安全渗透测试

```bash
# 使用工具进行安全测试
# 1. JWT Token解析测试
echo "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..." | base64 -d
# 验证：不应该能解析出敏感权限信息

# 2. API响应抓包测试
curl -H "Authorization: Bearer $USER_TOKEN" \
     http://localhost:3000/api/v4/unified-engine/lottery/prizes/1
# 验证：响应中不包含敏感字段

# 3. 权限提升测试
curl -H "Authorization: Bearer $USER_TOKEN" \
     -H "X-Admin-Override: true" \
     http://localhost:3000/api/v4/admin/statistics
# 验证：应该返回403权限不足
```

## 📊 **风险覆盖验证清单**

### 极高风险问题验证（15个）
- [ ] **抽奖概率泄露**：`win_probability` 字段已移除
- [ ] **预设奖品暴露**：`is_preset` 等标识已隐藏
- [ ] **库存成本透明**：`prize_value`, `cost_points` 已移除
- [ ] **JWT权限泄露**：`role`, `permissions` 已脱敏
- [ ] **库存管理暴露**：`acquisition_method` 等已转换
- [ ] **图片上传元数据**：`storage_info` 已移除

### 高风险问题验证（16个）
- [ ] **保底机制透明**：具体规则已隐藏，仅显示模糊描述
- [ ] **积分经济模型**：`earning_rules` 等策略已移除
- [ ] **用户分层暴露**：`unlock_conditions` 已隐藏
- [ ] **管理员数据泄露**：运营统计仅管理员可见
- [ ] **聊天系统数据**：用户隐私信息已脱敏

### 中风险问题验证（7个）
- [ ] **商品兑换策略**：`profit_margin` 等已移除
- [ ] **交易市场定价**：`market_trends` 已隐藏
- [ ] **系统运营数据**：性能指标仅管理员可见

## 🚀 **上线部署流程**

### 1. 预生产环境验证
```bash
# 部署到预生产环境
npm run deploy:staging

# 执行完整测试套件
npm run test:full

# 性能基准测试
npm run test:performance

# 安全扫描
npm run security:scan
```

### 2. 生产环境部署
```bash
# 数据库备份
mysqldump restaurant_lottery > backup_$(date +%Y%m%d).sql

# 部署新版本
npm run deploy:production

# 验证部署结果
npm run health:check

# 监控关键指标
npm run monitor:start
```

### 3. 回滚方案
```bash
# 如果发现问题，立即回滚
git checkout previous-version
npm run deploy:rollback

# 恢复数据库（如需要）
mysql restaurant_lottery < backup_$(date +%Y%m%d).sql
```

## 📈 **成功指标**

### 安全性指标
- ✅ 0个敏感数据泄露点
- ✅ 100%的API通过安全扫描
- ✅ 权限控制准确率100%

### 性能指标
- ✅ API响应时间增加<10%
- ✅ 系统吞吐量保持不变
- ✅ 内存使用增加<5%

### 功能指标
- ✅ 管理员功能100%正常
- ✅ 用户体验无负面影响
- ✅ 前端界面显示正常

## 🔍 **监控和维护**

### 持续监控
```javascript
// 安全监控脚本
setInterval(() => {
  // 检查是否有敏感数据泄露
  checkDataLeakage()
  
  // 监控异常的权限访问
  monitorPermissionAccess()
  
  // 检查API响应格式
  validateApiResponses()
}, 60000) // 每分钟检查一次
```

### 定期审计
- 🔄 每周进行安全审计
- 🔄 每月更新威胁模型
- 🔄 每季度进行渗透测试

---

**实施负责人**：后端开发团队  
**质量保证**：测试团队 + 安全团队  
**上线审批**：技术总监 + 产品负责人  

**紧急联系**：如实施过程中遇到问题，立即联系技术负责人进行处理。 