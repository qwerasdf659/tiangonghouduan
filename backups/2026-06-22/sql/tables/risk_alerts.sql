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
-- Table structure for table `risk_alerts`
--

DROP TABLE IF EXISTS `risk_alerts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `risk_alerts` (
  `risk_alert_id` int NOT NULL AUTO_INCREMENT,
  `alert_type` enum('frequency_limit','amount_limit','duplicate_user','suspicious_pattern') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '告警类型：frequency_limit-频次超限、amount_limit-金额超限、duplicate_user-用户被多店录入、suspicious_pattern-可疑模式',
  `severity` enum('low','medium','high','critical') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium' COMMENT '严重程度：low-低、medium-中、high-高、critical-严重',
  `operator_id` int DEFAULT NULL COMMENT '操作员ID（触发告警的员工），外键关联 users.user_id',
  `store_id` int DEFAULT NULL COMMENT '门店ID，外键关联 stores.store_id',
  `target_user_id` int DEFAULT NULL COMMENT '目标用户ID（被录入消费的用户），外键关联 users.user_id',
  `related_record_id` int DEFAULT NULL COMMENT '关联消费记录ID，外键关联 consumption_records.record_id',
  `rule_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '触发的规则名称（如 frequency_limit、single_amount_limit、duplicate_user_check）',
  `rule_threshold` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '规则阈值（如 10次/60秒、5000元/笔、3个门店/10分钟）',
  `actual_value` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '实际值（如 12次/60秒、8000元、5个门店）',
  `alert_message` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '告警消息（人类可读的完整描述）',
  `is_blocked` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否阻断提交：true-硬阻断（如频次超限）、false-仅告警（如金额告警）',
  `status` enum('pending','reviewed','ignored') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '状态：pending-待处理、reviewed-已复核、ignored-已忽略',
  `reviewed_by` int DEFAULT NULL COMMENT '复核人ID，外键关联 users.user_id',
  `review_notes` text COLLATE utf8mb4_unicode_ci COMMENT '复核备注',
  `reviewed_at` datetime DEFAULT NULL COMMENT '复核时间，时区：北京时间（GMT+8）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间，时区：北京时间（GMT+8）',
  PRIMARY KEY (`risk_alert_id`),
  KEY `reviewed_by` (`reviewed_by`),
  KEY `idx_risk_alerts_status_created` (`status`,`created_at`),
  KEY `idx_risk_alerts_type` (`alert_type`),
  KEY `idx_risk_alerts_operator` (`operator_id`,`created_at`),
  KEY `idx_risk_alerts_store` (`store_id`,`created_at`),
  KEY `idx_risk_alerts_target_user` (`target_user_id`),
  KEY `idx_risk_alerts_severity_status` (`severity`,`status`),
  CONSTRAINT `risk_alerts_ibfk_1` FOREIGN KEY (`operator_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `risk_alerts_ibfk_2` FOREIGN KEY (`store_id`) REFERENCES `stores` (`store_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `risk_alerts_ibfk_3` FOREIGN KEY (`target_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `risk_alerts_ibfk_4` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=128 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `risk_alerts`
--

LOCK TABLES `risk_alerts` WRITE;
/*!40000 ALTER TABLE `risk_alerts` DISABLE KEYS */;
/*!40000 ALTER TABLE `risk_alerts` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-21 19:08:15
