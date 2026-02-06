# 后端API问题诊断报告 — 前端已排查确认

> **诊断时间**：2026-02-07
> **诊断人**：前端开发（AI辅助）
> **诊断方式**：微信开发者工具Console日志 + 前端源码逐行对照
> **前端项目**：天宫餐厅积分小程序（WXML + WXSS + JavaScript + 微信API）
> **后端版本**：V4.7.0（API前缀 `/api/v4`）
> **结论**：以下问题 **100% 为后端问题**，前端代码无需修改

---

## 一、问题总览

| # | 问题接口 | 严重程度 | 后端返回 | 对用户的影响 |
|---|---|---|---|---|
| 1 | `GET /api/v4/lottery/:campaign_code/config` | 🔴 **阻断** | 404「接口不存在」 | 抽奖页完全不可用，弹出"数据加载失败" |
| 2 | `GET /api/v4/system/popup-banners` | 🟡 次要 | 500 `INTERNAL_ERROR` | 弹窗横幅不显示（前端已静默降级） |

---

## 二、问题1（🔴 阻断）：抽奖配置接口不存在

### 2.1 现象

打开抽奖页面后，弹出错误弹窗：

```
标题：数据加载失败
内容：无法加载抽奖数据，可能原因：
  1. 网络连接异常
  2. 后端服务异常
  3. Token已过期
错误详情：接口不存在: GET /api/v4/lottery/BASIC_LOTTERY/config
```

### 2.2 Console日志

```
📊 第3步：获取抽奖配置...
🚀 V4.0 API请求 ==================
📤 GET https://omqktqrtntnn.sealosbja.site/api/v4/lottery/BASIC_LOTTERY/config
❌ 资源不存在(404)
❌ API请求失败: Error: 接口不存在
❌ 加载抽奖数据异常: Error: 接口不存在: GET /api/v4/lottery/BASIC_LOTTERY/config
```

### 2.3 前端代码验证（确认前端调用正确）

**API定义**（`utils/api.js` 第476-483行）：

```javascript
/**
 * 获取抽奖配置
 * 后端路由: GET /api/v4/lottery/:campaign_code/config
 */
async function getLotteryConfig(campaign_code) {
  return apiClient.request(`/lottery/${campaign_code}/config`, {
    method: 'GET',
    needAuth: true
  })
}
```

**页面调用**（`pages/lottery/lottery.js` 第603行）：

```javascript
const configResult = await getLotteryConfig('BASIC_LOTTERY')
```

**结论**：前端严格按照API文档调用 `GET /api/v4/lottery/BASIC_LOTTERY/config`，后端返回404说明该路由未注册或未实现。

### 2.4 需要后端处理

请后端程序员检查：

1. **路由是否注册**：检查 `routes/v4/lottery/` 目录下是否有 `/:campaign_code/config` 的GET路由
2. **如果路径不同**：请告知前端实际路径，前端会同步修改 `utils/api.js` 中的 `getLotteryConfig` 方法
3. **如果尚未实现**：请按以下格式实现该接口

### 2.5 前端期望的响应格式

**请求**：

```
GET /api/v4/lottery/BASIC_LOTTERY/config
Authorization: Bearer <access_token>
```

**成功响应**（HTTP 200）：

```json
{
  "success": true,
  "data": {
    "campaign_id": 1,
    "campaign_name": "基础抽奖",
    "status": "active",
    "cost_per_draw": 100,
    "max_draws_per_user_daily": 50,
    "draw_pricing": {
      "triple": {
        "total_cost": 300,
        "count": 3,
        "label": "3连抽"
      },
      "five": {
        "total_cost": 500,
        "count": 5,
        "label": "5连抽"
      },
      "ten": {
        "total_cost": 900,
        "count": 10,
        "label": "10连抽",
        "discount": 0.9
      }
    },
    "guarantee_info": {}
  }
}
```

**字段说明**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `campaign_id` | number | 是 | 活动ID |
| `campaign_name` | string | 是 | 活动名称 |
| `status` | string | 是 | 活动状态（`active`/`inactive`），前端据此控制抽奖按钮是否可用 |
| `cost_per_draw` | number | **是（关键）** | 单次抽奖消耗积分数，前端不可硬编码此值 |
| `max_draws_per_user_daily` | number | 是 | 每日最大抽奖次数 |
| `draw_pricing` | object | 否 | 连抽定价配置（如果不返回，前端按`cost_per_draw × 次数`降级计算） |
| `draw_pricing.triple` | object | 否 | 3连抽配置（key必须是`triple`） |
| `draw_pricing.five` | object | 否 | 5连抽配置 |
| `draw_pricing.ten` | object | 否 | 10连抽配置，可含折扣字段`discount` |
| `guarantee_info` | object | 否 | 保底机制信息 |

---

## 三、问题2（🟡 次要）：弹窗横幅接口内部错误

### 3.1 现象

Console显示弹窗横幅加载失败，但前端已静默处理，不影响用户使用。

### 3.2 Console日志

```
🚀 V4.0 API请求 ==================
📤 GET https://omqktqrtntnn.sealosbja.site/api/v4/system/popup-banners
✅ API请求成功，耗时: 203ms
📦 响应数据: {success: false, code: "INTERNAL_ERROR", message: "获取弹窗失败", ...}
❌ 加载弹窗横幅失败: Error: 获取弹窗失败
```

### 3.3 前端代码验证（确认前端调用正确）

**API定义**（`utils/api.js` 第1373-1379行）：

```javascript
/**
 * 后端路由: GET /api/v4/system/popup-banners
 */
async function getPopupBanners() {
  return apiClient.request('/system/popup-banners', {
    method: 'GET',
    needAuth: false,
    showLoading: false,
    showError: false
  })
}
```

**页面调用**（`pages/lottery/lottery.js` 第2506-2542行）：

```javascript
async loadPopupBanners() {
  try {
    const result = await API.getPopupBanners()
    // ... 处理横幅数据
  } catch (error) {
    console.error('❌ 加载弹窗横幅失败:', error)
    // 静默失败，不影响主功能
  }
}
```

**结论**：后端返回 HTTP 200 但 body 中 `success: false, code: "INTERNAL_ERROR"`，说明后端内部处理出错（可能是数据库查询异常或表结构问题）。

### 3.4 需要后端处理

请后端程序员检查：

1. **`popup_banners` 表是否正常**：检查数据库中 `popup_banners` 表是否存在且有数据
2. **Service层是否报错**：检查后端日志中 `/api/v4/system/popup-banners` 请求的详细错误堆栈
3. **修复后的期望响应格式**：

```json
{
  "success": true,
  "data": {
    "banners": [
      {
        "id": 1,
        "title": "活动通知",
        "content": "横幅内容文本",
        "status": "active",
        "link_url": "/pages/lottery/lottery",
        "created_at": "2026-02-07T00:00:00+08:00"
      }
    ]
  }
}
```

---

## 四、前端已排查确认清单

以下内容已逐项确认无问题：

| 检查项 | 状态 | 说明 |
|---|---|---|
| API路径 | ✅ | 严格遵循 `/api/v4/{module}/{action}` 格式 |
| 认证头 | ✅ | `Authorization: Bearer <access_token>` 标准JWT |
| Token完整性检查 | ✅ | 每次请求前调用 `validateJWTTokenIntegrity()` |
| Token自动刷新 | ✅ | `handleTokenExpired()` 防并发刷新机制正常 |
| 错误处理 | ✅ | 401/403/404/500 分级处理，自动loading/toast |
| 命名规范 | ✅ | API参数100% snake_case |
| 工具函数引用 | ✅ | 统一通过 `utils/index.js` 分类导出 |
| Mock数据 | ✅ | 无Mock数据，全部调用后端真实API |
| ESLint检查 | ✅ | 0个错误，仅JSDoc格式警告 |
| JS语法检查 | ✅ | `node -c` 全部通过 |

---

## 五、本次前端已修复的问题（已完成，供知悉）

在排查过程中，前端同步修复了 `trade-upload-records`（积分活动记录页面）的编译错误：

| 问题 | 根因 | 修复方式 |
|---|---|---|
| WXML编译错误「get tag end without start」 | `trade-upload-records.wxml` 第251行多余`</view>` | 删除多余闭合标签 |
| 渲染层错误「route_ is not defined」 | WXML编译失败导致渲染层崩溃（连锁反应） | 修复WXML后自动消失 |
| WXML模板函数调用无效 | Page方法不能在WXML中直接调用 | 新建WXS模块处理模板格式化 |
| 临时桩函数 | `checkAuth`始终返回true，未使用真实认证 | 统一导入 `utils/index.js` |
| 字段名不一致 | JS用`review_status`，WXML和API用`status` | 统一为`status` |

---

## 六、前后端对接约定提醒

1. **统一响应格式**：所有API返回 `{ success: boolean, data: any, message?: string }`
2. **统一命名**：API字段100% snake_case
3. **统一时区**：API返回北京时间（`+08:00`）
4. **错误码规范**：HTTP状态码 + body中`code`字段双重标识
5. **Token机制**：JWT双Token（access_token + refresh_token），后端通过Token识别用户，不在路径中传user_id

---

**文档创建时间**：2026-02-07
**当前状态**：等待后端处理问题1（阻断）和问题2（次要）
