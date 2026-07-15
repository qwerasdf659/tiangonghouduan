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
-- Table structure for table `ad_campaigns`
--

DROP TABLE IF EXISTS `ad_campaigns`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `ad_campaigns` (
  `ad_campaign_id` int NOT NULL AUTO_INCREMENT COMMENT '广告计划主键',
  `business_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '幂等键（复用 IdempotencyService）',
  `advertiser_user_id` int DEFAULT NULL COMMENT '广告主/创建人用户ID（operational/system 类型存运营人员 user_id）',
  `ad_slot_id` int NOT NULL COMMENT '投放广告位 ID',
  `campaign_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '广告计划名称',
  `billing_mode` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '计费模式：fixed_daily（固定包天）/ bidding（竞价排名）',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft' COMMENT '状态：draft / pending_review / approved / active / paused / completed / rejected / cancelled',
  `daily_bid_star_stone` int DEFAULT NULL COMMENT '竞价日出价（仅 bidding 模式）',
  `budget_total_star_stone` int DEFAULT NULL COMMENT '总预算星石（仅 bidding 模式）',
  `budget_spent_star_stone` int NOT NULL DEFAULT '0' COMMENT '已消耗星石',
  `fixed_days` int DEFAULT NULL COMMENT '固定包天天数（仅 fixed_daily 模式）',
  `fixed_total_star_stone` int DEFAULT NULL COMMENT '固定包天总价 = daily_price × days',
  `targeting_rules` json DEFAULT NULL COMMENT '定向规则 JSON（Phase 5 启用）：{ match_all: [...], match_any: [...] }',
  `priority` int NOT NULL DEFAULT '50' COMMENT '展示优先级（广告范围 1~99，拍板决策6）',
  `start_date` date DEFAULT NULL COMMENT '投放开始日期',
  `end_date` date DEFAULT NULL COMMENT '投放结束日期',
  `review_note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '审核备注',
  `reviewed_by` int DEFAULT NULL COMMENT '审核管理员 ID',
  `reviewed_at` datetime DEFAULT NULL COMMENT '审核时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `campaign_category` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'commercial' COMMENT '计划分类：commercial=商业广告 / operational=运营内容 / system=系统通知',
  `frequency_rule` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT 'once_per_day' COMMENT '频次规则：always/once/once_per_session/once_per_day/once_per_n_days/n_times_total',
  `frequency_value` int DEFAULT '1' COMMENT '频次参数（once_per_n_days 的 N 天，n_times_total 的 N 次）',
  `force_show` tinyint(1) DEFAULT '0' COMMENT '是否强制弹出（忽略用户关闭行为）',
  `internal_notes` text COLLATE utf8mb4_unicode_ci COMMENT '内部备注（运营人员可见，不展示给前端用户）',
  `announcement_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '公告类型(仅announcement槽位用，值对齐字典announcement_type：system=系统公告/activity=活动公告/maintenance=维护公告/notice=通知；NULL=非公告)',
  PRIMARY KEY (`ad_campaign_id`),
  UNIQUE KEY `business_id` (`business_id`),
  KEY `reviewed_by` (`reviewed_by`),
  KEY `idx_ac_advertiser` (`advertiser_user_id`),
  KEY `idx_ac_slot` (`ad_slot_id`),
  KEY `idx_ac_status` (`status`),
  KEY `idx_ac_billing_status` (`billing_mode`,`status`),
  KEY `idx_campaign_category` (`campaign_category`),
  CONSTRAINT `ad_campaigns_ibfk_1` FOREIGN KEY (`advertiser_user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ad_campaigns_ibfk_2` FOREIGN KEY (`ad_slot_id`) REFERENCES `ad_slots` (`ad_slot_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ad_campaigns_ibfk_3` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=354 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='广告投放计划表 — Phase 3 广告主自助投放';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ad_campaigns`
--

LOCK TABLES `ad_campaigns` WRITE;
/*!40000 ALTER TABLE `ad_campaigns` DISABLE KEYS */;
INSERT INTO `ad_campaigns` VALUES
(349,'81131973-88a4-4c2b-b4dc-00febabe10d8',32,16,'首页','free','active',NULL,NULL,0,NULL,NULL,NULL,500,'2026-06-20','2026-06-27',NULL,NULL,NULL,'2026-06-21 07:39:16','2026-06-21 07:39:21','operational','always',1,0,NULL,NULL);
/*!40000 ALTER TABLE `ad_campaigns` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-21 19:08:07
