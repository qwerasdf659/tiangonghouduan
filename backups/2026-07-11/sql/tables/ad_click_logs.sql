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
-- Table structure for table `ad_click_logs`
--

DROP TABLE IF EXISTS `ad_click_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `ad_click_logs` (
  `ad_click_log_id` bigint NOT NULL AUTO_INCREMENT COMMENT '广告点击日志主键',
  `ad_campaign_id` int NOT NULL COMMENT '广告计划 ID',
  `user_id` int NOT NULL COMMENT '点击用户 ID',
  `ad_slot_id` int NOT NULL COMMENT '广告位 ID',
  `click_target` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '跳转目标 URL',
  `is_valid` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否有效点击（反作弊判定结果）',
  `invalid_reason` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '无效原因：fake_click / self_click',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '点击时间',
  PRIMARY KEY (`ad_click_log_id`),
  KEY `ad_slot_id` (`ad_slot_id`),
  KEY `idx_acl_campaign` (`ad_campaign_id`),
  KEY `idx_acl_user_created` (`user_id`,`created_at`),
  CONSTRAINT `ad_click_logs_ibfk_1` FOREIGN KEY (`ad_campaign_id`) REFERENCES `ad_campaigns` (`ad_campaign_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ad_click_logs_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ad_click_logs_ibfk_3` FOREIGN KEY (`ad_slot_id`) REFERENCES `ad_slots` (`ad_slot_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='广告点击日志表 — Phase 5 归因数据源';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ad_click_logs`
--

LOCK TABLES `ad_click_logs` WRITE;
/*!40000 ALTER TABLE `ad_click_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `ad_click_logs` ENABLE KEYS */;
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
