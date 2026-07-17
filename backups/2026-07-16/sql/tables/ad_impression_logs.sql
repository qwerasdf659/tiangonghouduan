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
-- Table structure for table `ad_impression_logs`
--

DROP TABLE IF EXISTS `ad_impression_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `ad_impression_logs` (
  `ad_impression_log_id` bigint NOT NULL AUTO_INCREMENT COMMENT '广告曝光日志主键',
  `ad_campaign_id` int NOT NULL COMMENT '广告计划 ID',
  `user_id` int NOT NULL COMMENT '曝光用户 ID',
  `ad_slot_id` int NOT NULL COMMENT '广告位 ID',
  `is_valid` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否有效曝光（反作弊判定结果）',
  `invalid_reason` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '无效原因：self_view / frequency_limit / batch_suspect',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '曝光时间',
  PRIMARY KEY (`ad_impression_log_id`),
  KEY `ad_slot_id` (`ad_slot_id`),
  KEY `idx_ail_campaign` (`ad_campaign_id`),
  KEY `idx_ail_user` (`user_id`),
  KEY `idx_ail_created` (`created_at`),
  CONSTRAINT `ad_impression_logs_ibfk_1` FOREIGN KEY (`ad_campaign_id`) REFERENCES `ad_campaigns` (`ad_campaign_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ad_impression_logs_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ad_impression_logs_ibfk_3` FOREIGN KEY (`ad_slot_id`) REFERENCES `ad_slots` (`ad_slot_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='广告曝光日志表 — Phase 5 反作弊过滤';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ad_impression_logs`
--

LOCK TABLES `ad_impression_logs` WRITE;
/*!40000 ALTER TABLE `ad_impression_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `ad_impression_logs` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-16  3:11:47
