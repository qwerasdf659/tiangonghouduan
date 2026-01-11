# 商家域API对接指南（前端开发人员）

> 本文档供前端开发人员使用，描述商家员工域相关API接口规范。
>
> 生成时间：2026-01-12
>
> 后端联系人：【请填写】

---

## 一、概述

### 1.1 基础信息

- **Base URL**: `/api/v4/shop`
- **认证方式**: JWT Bearer Token
- **响应格式**: JSON
- **时区**: 北京时间 (UTC+8)

### 1.2 通用响应结构

```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "操作成功",
  "data": { ... },
  "timestamp": "2026-01-12T10:30:00.000+08:00",
  "version": "v4.0",
  "request_id": "req_abc123..."
}
```

### 1.3 错误响应示例

```json
{
  "success": false,
  "code": "UNAUTHORIZED",
  "message": "未登录或Token已过期",
  "data": null,
  "timestamp": "2026-01-12T10:30:00.000+08:00",
  "version": "v4.0",
  "request_id": "req_abc123..."
}
```

### 1.4 常见错误码

| 错误码                             | HTTP状态 | 说明                     |
| ---------------------------------- | -------- | ------------------------ |
| `UNAUTHORIZED`                     | 401      | 未登录或Token过期        |
| `FORBIDDEN`                        | 403      | 权限不足                 |
| `NOT_FOUND`                        | 404      | 资源不存在               |
| `BAD_REQUEST`                      | 400      | 参数错误                 |
| `NO_STORE_BINDING`                 | 403      | 用户未绑定门店           |
| `MULTIPLE_STORES_REQUIRE_STORE_ID` | 400      | 多门店用户需指定store_id |

---

## 二、消费记录模块

### 2.1 生成用户动态二维码

**用途**：用户出示二维码供店员扫描

```
GET /api/v4/shop/consumption/qrcode/{user_id}
```

**请求头**：

```
Authorization: Bearer <token>
```

**响应示例**：

```json
{
  "success": true,
  "code": "SUCCESS",
  "data": {
    "qr_code": "QRV2_eyJ1c2VyX3V1..._签名",
    "user_id": 31,
    "user_uuid": "550e8400-e29b-41d4-a716-446655440000",
    "expires_in": 300,
    "expires_at": "2026-01-12T10:35:00.000+08:00"
  }
}
```

**前端处理**：

- `qr_code` 用于生成二维码图片
- `expires_in` 单位为秒，用于倒计时显示
- 二维码过期需重新获取

---

### 2.2 扫码获取用户信息

**用途**：店员扫描用户二维码后获取用户信息

```
GET /api/v4/shop/consumption/user-info?qr_code={qr_code}&store_id={store_id}
```

**参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| qr_code | string | 是 | 扫描得到的二维码内容 |
| store_id | number | 条件必填 | 多门店用户必须指定 |

**响应示例**：

```json
{
  "success": true,
  "code": "SUCCESS",
  "data": {
    "user_id": 31,
    "user_uuid": "550e8400-e29b-41d4-a716-446655440000",
    "nickname": "用户昵称",
    "mobile": "136****7930",
    "avatar_url": "https://...",
    "qr_code": "QRV2_..."
  }
}
```

**注意**：

- 手机号会脱敏显示
- 此接口不消耗二维码nonce，后续提交仍可使用同一二维码

---

### 2.3 提交消费记录

**用途**：店员录入消费金额

```
POST /api/v4/shop/consumption/submit
```

**请求头**：

```
Authorization: Bearer <token>
Content-Type: application/json
Idempotency-Key: <唯一请求ID>  // 必填！防重复提交
```

**请求体**：

```json
{
  "qr_code": "QRV2_eyJ1c2VyX3V1...",
  "amount": 128.5,
  "store_id": 1,
  "notes": "午餐消费"
}
```

**参数说明**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| qr_code | string | 是 | 用户动态二维码 |
| amount | number | 是 | 消费金额（>0） |
| store_id | number | 条件必填 | 多门店用户必须指定 |
| notes | string | 否 | 备注 |

**响应示例**：

```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "消费记录提交成功",
  "data": {
    "record_id": 123,
    "status": "pending",
    "amount": 128.5,
    "points_earned": 12,
    "created_at": "2026-01-12T10:30:00.000+08:00"
  }
}
```

**前端处理**：

- `Idempotency-Key` 建议使用 UUID，用于防止重复提交
- 网络超时后重试时使用相同的 `Idempotency-Key`
- 3分钟内同一用户同金额提交会被拒绝

---

## 三、员工管理模块

### 3.1 查询员工列表

```
GET /api/v4/shop/staff/list
```

**参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| store_id | number | 条件必填 | 门店ID（多门店用户必填） |
| status | string | 否 | 状态筛选：active/inactive |
| page | number | 否 | 页码，默认1 |
| page_size | number | 否 | 每页条数，默认20 |

**响应示例**：

```json
{
  "success": true,
  "data": {
    "staff": [
      {
        "store_staff_id": 1,
        "user_id": 31,
        "store_id": 1,
        "role_in_store": "manager",
        "status": "active",
        "nickname": "张店长",
        "mobile": "136****7930",
        "joined_at": "2026-01-01T00:00:00.000+08:00"
      }
    ],
    "total": 1,
    "page": 1,
    "page_size": 20
  }
}
```

---

### 3.2 添加员工

```
POST /api/v4/shop/staff/add
```

**请求体**：

```json
{
  "user_mobile": "13800138000",
  "store_id": 1,
  "role_in_store": "staff"
}
```

**参数说明**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| user_mobile | string | 是 | 员工手机号（需已注册） |
| store_id | number | 是 | 绑定的门店ID |
| role_in_store | string | 是 | 角色：manager/staff |

---

### 3.3 员工调岗

```
POST /api/v4/shop/staff/transfer
```

**请求体**：

```json
{
  "user_id": 32,
  "from_store_id": 1,
  "to_store_id": 2,
  "role_in_store": "staff"
}
```

---

### 3.4 禁用员工

```
POST /api/v4/shop/staff/disable
```

**请求体**：

```json
{
  "user_id": 32,
  "reason": "离职"
}
```

---

### 3.5 启用员工

```
POST /api/v4/shop/staff/enable
```

**请求体**：

```json
{
  "user_id": 32,
  "store_id": 1
}
```

---

## 四、审计日志模块

### 4.1 查询审计日志

```
GET /api/v4/shop/audit/logs
```

**参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| store_id | number | 否 | 门店ID筛选 |
| operator_id | number | 否 | 操作员ID筛选 |
| operation_type | string | 否 | 操作类型筛选 |
| result | string | 否 | 结果筛选：success/failed/blocked |
| start_date | string | 否 | 开始日期（YYYY-MM-DD） |
| end_date | string | 否 | 结束日期（YYYY-MM-DD） |
| page | number | 否 | 页码 |
| page_size | number | 否 | 每页条数 |

**操作类型枚举**：

- `scan_user` - 扫描用户二维码
- `submit_consumption` - 提交消费记录
- `view_consumption_list` - 查看消费列表
- `view_consumption_detail` - 查看消费详情
- `staff_login` - 员工登录
- `staff_logout` - 员工登出
- `staff_add` - 添加员工
- `staff_transfer` - 员工调岗
- `staff_disable` - 禁用员工
- `staff_enable` - 启用员工

**响应示例**：

```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "log_id": 1,
        "operator_id": 31,
        "operator_name": "张店长",
        "store_id": 1,
        "store_name": "测试餐厅总店",
        "operation_type": "submit_consumption",
        "action": "create",
        "result": "success",
        "ip_address": "192.168.1.100",
        "created_at": "2026-01-12T10:30:00.000+08:00"
      }
    ],
    "total": 1,
    "page": 1,
    "page_size": 20
  }
}
```

---

## 五、风控告警模块

### 5.1 查询风控告警

```
GET /api/v4/shop/risk/alerts
```

**参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| store_id | number | 否 | 门店ID |
| alert_type | string | 否 | 告警类型 |
| severity | string | 否 | 严重程度：low/medium/high/critical |
| status | string | 否 | 状态：pending/reviewed/ignored |
| start_date | string | 否 | 开始日期 |
| end_date | string | 否 | 结束日期 |
| page | number | 否 | 页码 |
| page_size | number | 否 | 每页条数 |

**告警类型枚举**：

- `frequency_limit` - 频率超限
- `amount_alert` - 金额异常
- `duplicate_user` - 重复用户

**响应示例**：

```json
{
  "success": true,
  "data": {
    "alerts": [
      {
        "alert_id": 1,
        "alert_type": "frequency_limit",
        "severity": "medium",
        "status": "pending",
        "operator_id": 31,
        "operator_name": "张店长",
        "store_id": 1,
        "store_name": "测试餐厅总店",
        "trigger_value": "6次/分钟",
        "threshold": "5次/分钟",
        "created_at": "2026-01-12T10:30:00.000+08:00"
      }
    ],
    "total": 1,
    "page": 1,
    "page_size": 20
  }
}
```

---

### 5.2 复核告警

```
POST /api/v4/shop/risk/alerts/{alert_id}/review
```

**请求体**：

```json
{
  "review_notes": "已人工确认，无风险"
}
```

---

### 5.3 忽略告警

```
POST /api/v4/shop/risk/alerts/{alert_id}/ignore
```

**请求体**：

```json
{
  "review_notes": "误报"
}
```

---

### 5.4 风控统计概览

```
GET /api/v4/shop/risk/stats
```

**响应示例**：

```json
{
  "success": true,
  "data": {
    "today": 3,
    "pending_count": 2,
    "by_type": {
      "frequency_limit": 1,
      "amount_alert": 2
    },
    "by_severity": {
      "low": 1,
      "medium": 2
    }
  }
}
```

---

## 六、前端开发注意事项

### 6.1 认证流程

1. 用户登录获取 JWT Token
2. 所有请求携带 `Authorization: Bearer <token>` 头
3. Token 过期时收到 401 响应，需重新登录

### 6.2 多门店处理

- 单门店用户：API会自动使用绑定的门店
- 多门店用户：必须在请求中指定 `store_id` 参数
- 收到 `MULTIPLE_STORES_REQUIRE_STORE_ID` 错误时，提示用户选择门店

### 6.3 二维码流程

```
用户展示 → 店员扫描 → 获取用户信息 → 输入金额 → 提交
     ↑                                      ↓
     └──────── 二维码过期需重新获取 ─────────┘
```

### 6.4 幂等性处理

- 消费提交必须携带 `Idempotency-Key` 头
- 建议使用 UUID v4 生成
- 网络重试时使用相同的 Key

### 6.5 时间显示

- 所有时间均为北京时间 (UTC+8)
- 格式：`YYYY-MM-DDTHH:mm:ss.sss+08:00`
- 前端可直接展示，无需时区转换

---

## 七、联系方式

如有接口问题，请联系后端开发人员：

- **负责人**：【请填写】
- **联系方式**：【请填写】

---

_文档版本：v1.0 | 最后更新：2026-01-12_
