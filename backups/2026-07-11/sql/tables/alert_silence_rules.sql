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
-- Table structure for table `alert_silence_rules`
--

DROP TABLE IF EXISTS `alert_silence_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `alert_silence_rules` (
  `alert_silence_rule_id` bigint NOT NULL AUTO_INCREMENT COMMENT '静默规则主键ID',
  `rule_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '规则名称（如：节假日静默、夜间静默）',
  `alert_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '告警类型（如：risk、lottery、system）',
  `alert_level` enum('critical','warning','info','all') COLLATE utf8mb4_unicode_ci DEFAULT 'all' COMMENT '静默的告警级别（critical/warning/info/all）',
  `condition_json` json DEFAULT NULL COMMENT '静默条件JSON（如：{ user_id: [1,2], keyword: "测试" }）',
  `start_time` time DEFAULT NULL COMMENT '每日静默开始时间（如：22:00:00）',
  `end_time` time DEFAULT NULL COMMENT '每日静默结束时间（如：08:00:00）',
  `effective_start_date` date DEFAULT NULL COMMENT '规则生效开始日期',
  `effective_end_date` date DEFAULT NULL COMMENT '规则生效结束日期',
  `is_active` tinyint(1) DEFAULT '1' COMMENT '是否启用',
  `created_by` int NOT NULL COMMENT '创建人用户ID',
  `updated_by` int DEFAULT NULL COMMENT '最后修改人用户ID',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`alert_silence_rule_id`),
  KEY `idx_alert_silence_type_active` (`alert_type`,`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='告警静默规则表（运营后台优化 DB-2）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `alert_silence_rules`
--

LOCK TABLES `alert_silence_rules` WRITE;
/*!40000 ALTER TABLE `alert_silence_rules` DISABLE KEYS */;
/*!40000 ALTER TABLE `alert_silence_rules` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-10 18:10:55
