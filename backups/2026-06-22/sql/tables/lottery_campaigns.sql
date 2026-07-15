/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19  Distrib 10.11.14-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: dbconn.sealosbja.site    Database: restaurant_points_dev
-- ------------------------------------------------------
-- Server version	8.0.30

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `lottery_campaigns`
--

DROP TABLE IF EXISTS `lottery_campaigns`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `lottery_campaigns` (
  `lottery_campaign_id` int NOT NULL AUTO_INCREMENT,
  `campaign_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '活动名称',
  `campaign_code` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '活动代码(唯一)',
  `campaign_type` enum('daily','weekly','event','permanent','pool_basic','pool_advanced','pool_vip','pool_newbie') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '活动类型，新增池类型支持',
  `max_draws_per_user_daily` int NOT NULL DEFAULT '1',
  `max_draws_per_user_total` int DEFAULT NULL COMMENT '每用户总最大抽奖次数',
  `total_prize_pool` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT '总奖池价值',
  `remaining_prize_pool` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT '剩余奖池价值',
  `prize_distribution_config` json NOT NULL COMMENT '奖品分布配置',
  `start_time` datetime NOT NULL COMMENT '活动开始时间',
  `end_time` datetime NOT NULL COMMENT '活动结束时间',
  `daily_reset_time` time NOT NULL DEFAULT '00:00:00',
  `description` text COLLATE utf8mb4_unicode_ci COMMENT '活动描述',
  `rules_text` text COLLATE utf8mb4_unicode_ci COMMENT '活动规则说明',
  `status` enum('draft','active','paused','ended','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft' COMMENT '活动状态: draft=草稿, active=进行中, paused=已暂停, ended=已结束, cancelled=已取消',
  `budget_mode` enum('user','pool','none') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'user' COMMENT '预算模式：user=用户预算账户扣减，pool=活动池预算扣减，none=不限制预算（测试用）',
  `pick_method` enum('normalize','tier_first') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'tier_first' COMMENT '选奖方法：normalize=归一化百分比选奖, tier_first=先选档位再选奖品',
  `tier_weight_scale` int unsigned NOT NULL DEFAULT '1000000' COMMENT '档位权重比例因子（默认1,000,000，所有档位权重之和必须等于此值）',
  `pool_budget_total` bigint DEFAULT NULL COMMENT '活动池总预算（仅 budget_mode=pool 时使用）',
  `pool_budget_remaining` bigint DEFAULT NULL COMMENT '活动池剩余预算（仅 budget_mode=pool 时使用，实时扣减）',
  `allowed_campaign_ids` json DEFAULT NULL COMMENT '允许使用的用户预算来源活动ID列表（JSON数组，仅 budget_mode=user 时使用）',
  `total_participants` int NOT NULL DEFAULT '0',
  `total_draws` int NOT NULL DEFAULT '0',
  `total_prizes_awarded` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `participation_conditions` json DEFAULT NULL COMMENT '参与条件配置（JSON格式，用途：存储活动参与条件规则，如用户积分≥100、用户类型=VIP等，业务场景：管理员在Web后台配置，用户端API自动验证，NULL表示无条件限制所有用户可参与）',
  `condition_error_messages` json DEFAULT NULL COMMENT '条件不满足时的提示语（JSON格式，用途：存储每个条件对应的用户友好错误提示，业务场景：用户不满足条件时显示具体原因，如"您的积分不足100分，快去消费获取积分吧！"）',
  `preset_budget_policy` enum('follow_campaign','pool_first','user_first') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'follow_campaign' COMMENT '预设预算扣减策略：follow_campaign-遵循budget_mode(默认), pool_first-先pool后user, user_first-先user后pool',
  `default_quota` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '默认用户配额（pool+quota模式按需初始化时使用）',
  `quota_init_mode` enum('on_demand','pre_allocated') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'on_demand' COMMENT '配额初始化模式：on_demand-按需初始化(默认), pre_allocated-预分配',
  `public_pool_remaining` decimal(12,2) DEFAULT NULL COMMENT '公共池剩余预算（普通用户可用，预留池模式时使用）',
  `reserved_pool_remaining` decimal(12,2) DEFAULT NULL COMMENT '预留池剩余预算（白名单专用，预留池模式时使用）',
  `max_budget_debt` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '该活动预算欠账上限（0=不限制，强烈不推荐）',
  `max_inventory_debt_quantity` int NOT NULL DEFAULT '0' COMMENT '该活动库存欠账总数量上限（0=不限制，强烈不推荐）',
  `daily_budget_limit` decimal(15,2) DEFAULT NULL COMMENT '每日预算上限（积分），NULL表示不限制每日预算',
  `display_mode` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'grid_3x3' COMMENT '前端展示方式（16种玩法）: grid_3x3/grid_4x3/grid_4x4/wheel/card_flip/golden_egg/scratch_card/blind_box/gashapon/lucky_bag/red_packet/slot_machine/whack_mole/pinball/card_collect/flash_sale',
  `grid_cols` int NOT NULL DEFAULT '3' COMMENT '网格列数（仅 grid 模式有效）: 3/4/5',
  `effect_theme` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '活动级特效主题: null=继承全局app_theme | default/gold_luxury/purple_mystery/spring_festival/christmas/summer',
  `rarity_effects_enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用稀有度光效（前端根据 rarity_code 显示不同颜色光效）',
  `win_animation` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'simple' COMMENT '中奖动画类型: simple（简单弹窗）/card_flip（卡牌翻转）/fireworks（烟花特效）',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '展示排序（数值越小越靠前）',
  `is_featured` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否精选/主推活动（前端可高亮展示）',
  `is_hidden` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否隐藏（active 但不在列表展示，用于内测/定向活动）',
  `display_tags` json DEFAULT NULL COMMENT '展示标签，如 ["限时","新活动","热门"]',
  `display_start_time` datetime DEFAULT NULL COMMENT '展示开始时间（可早于 start_time 做预热展示）',
  `display_end_time` datetime DEFAULT NULL COMMENT '展示结束时间（可晚于 end_time 做收尾展示）',
  PRIMARY KEY (`lottery_campaign_id`),
  UNIQUE KEY `campaign_code` (`campaign_code`),
  KEY `idx_campaign_type` (`campaign_type`),
  KEY `idx_time_range` (`start_time`,`end_time`),
  KEY `idx_lc_status` (`status`),
  KEY `idx_lottery_campaigns_status_time` (`status`,`start_time`,`end_time`),
  KEY `idx_lc_pool_type` (`campaign_type`),
  KEY `idx_campaigns_status` (`status`),
  KEY `idx_campaigns_time_range` (`start_time`,`end_time`),
  KEY `idx_campaigns_budget_policy` (`preset_budget_policy`)
) ENGINE=InnoDB AUTO_INCREMENT=50 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖活动配置表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lottery_campaigns`
--

LOCK TABLES `lottery_campaigns` WRITE;
/*!40000 ALTER TABLE `lottery_campaigns` DISABLE KEYS */;
INSERT INTO `lottery_campaigns` VALUES
(1,'餐厅消费回馈','CAMP20250901001','event',3,NULL,10000.00,10000.00,'{\"tiers\": [{\"weight\": 1000, \"tier_id\": 1, \"tier_name\": \"头号好礼\"}, {\"weight\": 9000, \"tier_id\": 2, \"tier_name\": \"尊享回馈\"}, {\"weight\": 90000, \"tier_id\": 3, \"tier_name\": \"优享回馈\"}, {\"weight\": 400000, \"tier_id\": 4, \"tier_name\": \"常享回馈\"}, {\"weight\": 500000, \"tier_id\": 5, \"tier_name\": \"基础礼遇\"}]}','2025-07-30 16:00:00','2026-12-09 15:59:00','00:00:00','','回馈好礼在您的消费回馈额度内随机发放，分高 / 中 / 低三档。实际可得档位受您的累计消费额度与近期获取情况影响，消费越多越有机会获得高档回馈。每次参与均会获得回馈，不存在\"未获得\"的情况。未成年人请在监护人指导下参与。','active','user','tier_first',1000000,10000,10000,'[\"CONSUMPTION_DEFAULT\"]',0,4995,4995,'2025-08-20 03:55:06','2026-06-16 05:29:24','{\"user_points\": {\"value\": 100, \"operator\": \">=\"}}','{\"user_points\": \"您的积分不足100分，快去消费获取积分吧！\"}','user_first',0.00,'on_demand',NULL,NULL,0.00,0,NULL,'golden_egg',4,'purple_mystery',1,'simple',0,0,0,NULL,NULL,NULL);
/*!40000 ALTER TABLE `lottery_campaigns` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-21 19:08:13
