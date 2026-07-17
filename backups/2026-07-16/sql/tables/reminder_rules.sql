/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19  Distrib 10.11.14-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: test-db-12-mysql.ns-br0za7uc.svc    Database: restaurant_points_dev
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
-- Table structure for table `reminder_rules`
--

DROP TABLE IF EXISTS `reminder_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `reminder_rules` (
  `reminder_rule_id` int NOT NULL AUTO_INCREMENT COMMENT '提醒规则ID（主键，符合{table_name}_id规范）',
  `rule_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '规则编码（唯一标识，如 pending_audit_24h）',
  `rule_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '规则名称（中文，如"待审核超24小时提醒"）',
  `rule_description` text COLLATE utf8mb4_unicode_ci COMMENT '规则描述',
  `rule_type` enum('pending_timeout','stock_low','budget_alert','activity_status','anomaly_detect','scheduled','custom','issuance_alert') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '规则类型',
  `trigger_condition` json NOT NULL COMMENT '触发条件配置（JSON格式，如 {"threshold": 24, "unit": "hours", "target_status": "pending"}）',
  `target_entity` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '目标实体类型（如 consumption_record, lottery_campaign, exchange_record）',
  `notification_channels` json NOT NULL COMMENT '通知渠道配置（数组，如 ["admin_broadcast", "websocket", "wechat"]）',
  `notification_template` text COLLATE utf8mb4_unicode_ci COMMENT '通知模板（支持变量占位符，如 "有{count}条{entity}待处理超过{threshold}{unit}"）',
  `notification_priority` enum('low','normal','high','urgent') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'normal' COMMENT '通知优先级（low=低, normal=普通, high=高, urgent=紧急）与 admin_notifications.priority 枚举一致',
  `check_interval_minutes` int NOT NULL DEFAULT '60' COMMENT '检测间隔（分钟）',
  `last_check_at` datetime DEFAULT NULL COMMENT '上次检测时间',
  `next_check_at` datetime DEFAULT NULL COMMENT '下次检测时间',
  `is_enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  `is_system` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否系统内置规则（系统规则不可删除）',
  `created_by` int DEFAULT NULL COMMENT '创建者ID',
  `updated_by` int DEFAULT NULL COMMENT '最后更新者ID',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`reminder_rule_id`),
  UNIQUE KEY `rule_code` (`rule_code`),
  UNIQUE KEY `idx_reminder_rules_code` (`rule_code`),
  KEY `created_by` (`created_by`),
  KEY `updated_by` (`updated_by`),
  KEY `idx_reminder_rules_type` (`rule_type`),
  KEY `idx_reminder_rules_enabled` (`is_enabled`),
  KEY `idx_reminder_rules_next_check` (`next_check_at`),
  CONSTRAINT `reminder_rules_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `reminder_rules_ibfk_2` FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='智能提醒规则表（运营后台提醒管理）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reminder_rules`
--

LOCK TABLES `reminder_rules` WRITE;
/*!40000 ALTER TABLE `reminder_rules` DISABLE KEYS */;
INSERT INTO `reminder_rules` VALUES
(1,'pending_consumption_24h','消费待审核超24小时提醒','检测待审核消费记录超过24小时未处理，通知管理员及时审核','pending_timeout','{\"unit\": \"hours\", \"threshold\": 24, \"target_status\": \"pending\"}','consumption_record','[\"admin_broadcast\", \"websocket\"]','有{count}条消费记录待审核超过24小时，请及时处理','high',60,'2026-02-24 02:04:00','2026-02-24 03:04:00',0,0,NULL,NULL,'2026-02-01 02:00:31','2026-02-24 22:45:13'),
(2,'pending_exchange_12h','兑换待审核超12小时提醒','检测待审核兑换申请超过12小时未处理，通知管理员','pending_timeout','{\"unit\": \"hours\", \"threshold\": 12, \"target_status\": \"pending\"}','exchange_record','[\"admin_broadcast\"]','有{count}条兑换申请待审核超过12小时','normal',30,'2026-07-16 03:06:00','2026-07-16 03:36:00',1,0,NULL,NULL,'2026-02-01 02:00:31','2026-07-16 03:06:00'),
(3,'daily_budget_alert','每日预算消耗告警','当活动每日预算消耗超过80%时发出告警','budget_alert','{\"check_field\": \"daily_budget_used\", \"threshold_percentage\": 80}','lottery_campaign','[\"admin_broadcast\", \"websocket\"]','活动【{campaign_name}】今日预算已消耗{percentage}%，请关注','high',15,'2026-07-16 02:59:00','2026-07-16 03:14:00',1,0,NULL,NULL,'2026-02-01 02:00:31','2026-07-16 02:59:00'),
(4,'daily_level_bonus_issuance_alert','日等级加成积分发放量告警','监控当日 level_bonus_reward（成长等级发放线加成积分）发放总量，超阈值告警——配合\"九档倍数归一\"应急回滚形成发现→回滚闭环（拍板⑭-(c)）。⚠️ daily_threshold 当前为建议占位值，运营须按真实营收规模确认后修改并启用','issuance_alert','{\"business_type\": \"level_bonus_reward\", \"daily_threshold\": 50000}','asset_transaction','[\"admin_broadcast\", \"websocket\"]','今日等级加成积分发放量已达 {issued_today}（阈值 {daily_threshold}），请核查是否存在刷分行为，必要时将九档 earn_multiplier 归一回滚','high',60,NULL,NULL,0,1,NULL,NULL,'2026-07-11 01:11:41','2026-07-11 01:11:41'),
(5,'daily_budget_injection_alert','日预算积分注入量告警','监控当日 consumption_budget_allocation（消费预算积分注入）总量，超阈值告警（拍板⑭-(c)）。⚠️ daily_threshold 当前为建议占位值，运营须按真实营收规模确认后修改并启用','issuance_alert','{\"business_type\": \"consumption_budget_allocation\", \"daily_threshold\": 20000}','asset_transaction','[\"admin_broadcast\", \"websocket\"]','今日预算积分注入量已达 {issued_today}（阈值 {daily_threshold}），请核查消费审核是否存在异常放量','high',60,NULL,NULL,0,1,NULL,NULL,'2026-07-11 01:11:41','2026-07-11 01:11:41');
/*!40000 ALTER TABLE `reminder_rules` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-16  3:11:51
