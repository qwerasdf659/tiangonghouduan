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
-- Table structure for table `ad_antifraud_logs`
--

DROP TABLE IF EXISTS `ad_antifraud_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `ad_antifraud_logs` (
  `ad_antifraud_log_id` bigint NOT NULL AUTO_INCREMENT COMMENT '反作弊判定日志主键',
  `user_id` int NOT NULL COMMENT '触发用户 ID',
  `ad_campaign_id` int NOT NULL COMMENT '关联广告计划 ID',
  `event_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '事件类型：impression / click',
  `rule_triggered` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '触发的反作弊规则名称',
  `verdict` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '判定结果：valid / invalid / suspicious',
  `raw_data` json DEFAULT NULL COMMENT '原始事件数据（调试用）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '判定时间',
  PRIMARY KEY (`ad_antifraud_log_id`),
  KEY `idx_aaf_user` (`user_id`),
  KEY `idx_aaf_campaign` (`ad_campaign_id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='反作弊判定日志表 — Phase 5 无效流量识别';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ad_antifraud_logs`
--

LOCK TABLES `ad_antifraud_logs` WRITE;
/*!40000 ALTER TABLE `ad_antifraud_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `ad_antifraud_logs` ENABLE KEYS */;
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
