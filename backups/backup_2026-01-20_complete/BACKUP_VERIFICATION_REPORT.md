# 数据库备份验证报告

## 备份日期（北京时间）: 2026年01月20日 19:35:43

---

## 1. 备份完整性验证

### ✅ 表数量验证

- 数据库表数量: **65个**
- 备份表数量: **65个**
- **验证结果: 通过**

### ✅ 数据行数验证

- 总数据行数: **61,501行**
- 空表数量: **10个**
  - authentication_sessions
  - lottery_campaign_quota_grants
  - lottery_campaign_user_quota
  - lottery_draw_decisions
  - lottery_hourly_metrics
  - lottery_user_experience_state
  - lottery_user_global_state
  - preset_budget_debt
  - preset_inventory_debt
  - trade_orders
- 错误表数量: **0个**
- **验证结果: 通过**

### ✅ 外键约束验证

- 外键约束总数: **96个**
- 涉及表数量: **46个**
- **验证结果: 通过**

---

## 2. 与上一次备份对比 (2026-01-18)

### 表数量变化

| 项目   | 2026-01-18 | 2026-01-20 | 变化    |
| ------ | ---------- | ---------- | ------- |
| 表数量 | 52         | 65         | +13     |
| 总行数 | 56,436     | 61,501     | +5,065  |
| 外键数 | 80         | 96         | +16     |
| 空表   | 2          | 10         | +8      |

### 新增的表（13个）

1. **lottery_campaign_pricing_config** - 抽奖活动定价配置 (4行)
2. **lottery_campaign_quota_grants** - 抽奖活动配额授予 (0行，空表)
3. **lottery_campaign_user_quota** - 用户活动配额 (0行，空表)
4. **lottery_draw_decisions** - 抽奖决策记录 (0行，空表)
5. **lottery_hourly_metrics** - 每小时指标统计 (0行，空表)
6. **lottery_strategy_config** - 抽奖策略配置 (17行)
7. **lottery_tier_matrix_config** - 层级矩阵配置 (12行)
8. **lottery_tier_rules** - 层级规则表 (9行)
9. **lottery_user_experience_state** - 用户体验状态 (0行，空表)
10. **lottery_user_global_state** - 用户全局状态 (0行，空表)
11. **preset_budget_debt** - 预设预算欠款 (0行，空表)
12. **preset_debt_limits** - 预设欠款限制 (1行)
13. **preset_inventory_debt** - 预设库存欠款 (0行，空表)

### 行数显著变化的表

| 表名                          | 1月18日  | 1月20日 | 变化    |
| ----------------------------- | -------- | ------- | ------- |
| admin_operation_logs          | 2,272    | 3,436   | +1,164  |
| asset_transactions            | 2,996    | 4,315   | +1,319  |
| api_idempotency_requests      | 460      | 952     | +492    |
| item_instance_events          | 617      | 912     | +295    |
| item_instances                | 1,184    | 1,723   | +539    |
| lottery_management_settings   | 1,443    | 2,065   | +622    |
| lottery_clear_setting_records | 214      | 402     | +188    |
| redemption_orders             | 560      | 804     | +244    |
| content_review_records        | 82       | 208     | +126    |
| user_role_change_records      | 73       | 145     | +72     |
| user_status_change_records    | 72       | 144     | +72     |
| websocket_startup_logs        | 905      | 942     | +37     |
| lottery_prizes                | 9        | 16      | +7      |
| merchant_operation_logs       | 12       | 27      | +15     |
| sequelizemeta                 | 257      | 271     | +14     |
| market_listings               | 217      | 33      | -184    |

---

## 3. 备份文件清单

| 文件名                                                     | 大小     | MD5校验和                        |
| ---------------------------------------------------------- | -------- | -------------------------------- |
| complete_backup_2026-01-20_2026-01-20_19-35-43.json        | 30.21 MB | 见 BACKUP_MD5.txt                |
| complete_backup_2026-01-20_2026-01-20_19-35-43.sql         | 10.62 MB | 见 BACKUP_MD5.txt                |
| BACKUP_MD5.txt                                             | -        | -                                |
| BACKUP_SUMMARY.txt                                         | -        | -                                |
| README.md                                                  | -        | -                                |
| BACKUP_VERIFICATION_REPORT.md                              | -        | -                                |
| BACKUP_FINAL_CONFIRMATION.txt                              | -        | -                                |

---

## 4. 备份内容详情

### 4.1 所有表列表（65个）

| #   | 表名                             | 行数   | 状态      |
| --- | -------------------------------- | ------ | --------- |
| 1   | account_asset_balances           | 23     | ✅        |
| 2   | accounts                         | 23     | ✅        |
| 3   | admin_operation_logs             | 3,436  | ✅        |
| 4   | administrative_regions           | 44,703 | ✅        |
| 5   | api_idempotency_requests         | 952    | ✅        |
| 6   | asset_group_defs                 | 8      | ✅        |
| 7   | asset_transactions               | 4,315  | ✅        |
| 8   | authentication_sessions          | 0      | ✅ (空表) |
| 9   | category_defs                    | 6      | ✅        |
| 10  | chat_messages                    | 5      | ✅        |
| 11  | consumption_records              | 11     | ✅        |
| 12  | content_review_records           | 208    | ✅        |
| 13  | customer_service_sessions        | 1      | ✅        |
| 14  | exchange_items                   | 26     | ✅        |
| 15  | exchange_records                 | 7      | ✅        |
| 16  | feedbacks                        | 26     | ✅        |
| 17  | image_resources                  | 1      | ✅        |
| 18  | item_instance_events             | 912    | ✅        |
| 19  | item_instances                   | 1,723  | ✅        |
| 20  | item_templates                   | 16     | ✅        |
| 21  | lottery_campaign_pricing_config  | 4      | ✅ (新表) |
| 22  | lottery_campaign_quota_grants    | 0      | ✅ (新表,空表) |
| 23  | lottery_campaign_user_quota      | 0      | ✅ (新表,空表) |
| 24  | lottery_campaigns                | 1      | ✅        |
| 25  | lottery_clear_setting_records    | 402    | ✅        |
| 26  | lottery_draw_decisions           | 0      | ✅ (新表,空表) |
| 27  | lottery_draw_quota_rules         | 5      | ✅        |
| 28  | lottery_draws                    | 2      | ✅        |
| 29  | lottery_hourly_metrics           | 0      | ✅ (新表,空表) |
| 30  | lottery_management_settings      | 2,065  | ✅        |
| 31  | lottery_presets                  | 2      | ✅        |
| 32  | lottery_prizes                   | 16     | ✅        |
| 33  | lottery_strategy_config          | 17     | ✅ (新表) |
| 34  | lottery_tier_matrix_config       | 12     | ✅ (新表) |
| 35  | lottery_tier_rules               | 9      | ✅ (新表) |
| 36  | lottery_user_daily_draw_quota    | 7      | ✅        |
| 37  | lottery_user_experience_state    | 0      | ✅ (新表,空表) |
| 38  | lottery_user_global_state        | 0      | ✅ (新表,空表) |
| 39  | market_listings                  | 33     | ✅        |
| 40  | material_asset_types             | 4      | ✅        |
| 41  | material_conversion_rules        | 1      | ✅        |
| 42  | merchant_operation_logs          | 27     | ✅        |
| 43  | popup_banners                    | 2      | ✅        |
| 44  | preset_budget_debt               | 0      | ✅ (新表,空表) |
| 45  | preset_debt_limits               | 1      | ✅ (新表) |
| 46  | preset_inventory_debt            | 0      | ✅ (新表,空表) |
| 47  | products                         | 52     | ✅        |
| 48  | rarity_defs                      | 5      | ✅        |
| 49  | redemption_orders                | 804    | ✅        |
| 50  | risk_alerts                      | 1      | ✅        |
| 51  | roles                            | 10     | ✅        |
| 52  | sequelizemeta                    | 271    | ✅        |
| 53  | store_staff                      | 2      | ✅        |
| 54  | stores                           | 4      | ✅        |
| 55  | system_announcements             | 9      | ✅        |
| 56  | system_settings                  | 39     | ✅        |
| 57  | trade_orders                     | 0      | ✅ (空表) |
| 58  | user_hierarchy                   | 9      | ✅        |
| 59  | user_premium_status              | 1      | ✅        |
| 60  | user_risk_profiles               | 3      | ✅        |
| 61  | user_role_change_records         | 145    | ✅        |
| 62  | user_roles                       | 20     | ✅        |
| 63  | user_status_change_records       | 144    | ✅        |
| 64  | users                            | 28     | ✅        |
| 65  | websocket_startup_logs           | 942    | ✅        |

### 4.2 索引信息

每个表的索引信息已完整备份到JSON文件中的 `indexes` 字段。

### 4.3 外键约束信息

96个外键约束已完整备份到JSON文件中的 `foreign_keys` 字段，包含：

- constraint_name: 约束名称
- column: 列名
- references_table: 引用表
- references_column: 引用列
- on_delete: 删除规则
- on_update: 更新规则

---

## 5. 备份验证结论

| 检查项         | 状态    | 说明                               |
| -------------- | ------- | ---------------------------------- |
| 表结构完整性   | ✅ 通过 | 所有65个表的CREATE TABLE语句已备份 |
| 数据完整性     | ✅ 通过 | 所有61,501行数据已备份             |
| 索引完整性     | ✅ 通过 | 所有索引信息已备份                 |
| 外键约束完整性 | ✅ 通过 | 所有96个外键约束已备份             |
| 空表备份       | ✅ 通过 | 10个空表的结构已完整备份           |
| SQL格式备份    | ✅ 通过 | 10.62 MB SQL文件已生成             |
| JSON格式备份   | ✅ 通过 | 30.21 MB JSON文件已生成            |
| MD5校验和      | ✅ 通过 | 已生成校验文件                     |

### 🎉 总结

**备份验证结果: ✅ 全部通过**

本次备份（2026年01月20日北京时间）是最新的、完整的、正确的备份，包含：

- ✅ 当前数据库全部65个表
- ✅ 所有表结构（含列定义、约束）
- ✅ 所有表数据（含10个空表）
- ✅ 所有索引信息
- ✅ 所有96个外键约束及规则
- ✅ SQL和JSON两种备份格式
- ✅ MD5校验和

---

生成时间（北京时间）: 2026年01月20日 19:35:43


