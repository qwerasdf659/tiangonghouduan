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
-- Table structure for table `ad_attribution_logs`
--

DROP TABLE IF EXISTS `ad_attribution_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `ad_attribution_logs` (
  `ad_attribution_log_id` bigint NOT NULL AUTO_INCREMENT COMMENT '归因日志主键',
  `ad_click_log_id` bigint NOT NULL COMMENT '关联的广告点击日志 ID',
  `ad_campaign_id` int NOT NULL COMMENT '广告计划 ID',
  `user_id` int NOT NULL COMMENT '转化用户 ID',
  `conversion_type` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '转化类型：lottery_draw / exchange / market_buy / page_view',
  `conversion_entity_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '转化实体 ID（如 draw_id / exchange_record_id）',
  `click_at` datetime NOT NULL COMMENT '广告点击时间',
  `conversion_at` datetime NOT NULL COMMENT '转化发生时间',
  `attribution_window_hours` int NOT NULL DEFAULT '24' COMMENT '归因窗口期（拍板决策7：24小时）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ad_attribution_log_id`),
  KEY `ad_click_log_id` (`ad_click_log_id`),
  KEY `idx_aal_campaign` (`ad_campaign_id`),
  KEY `idx_aal_user` (`user_id`),
  KEY `idx_aal_type` (`conversion_type`),
  KEY `idx_aal_click_at` (`click_at`),
  CONSTRAINT `ad_attribution_logs_ibfk_1` FOREIGN KEY (`ad_click_log_id`) REFERENCES `ad_click_logs` (`ad_click_log_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ad_attribution_logs_ibfk_2` FOREIGN KEY (`ad_campaign_id`) REFERENCES `ad_campaigns` (`ad_campaign_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ad_attribution_logs_ibfk_3` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='归因追踪日志表 — Phase 6 点击→转化关联';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ad_attribution_logs`
--

LOCK TABLES `ad_attribution_logs` WRITE;
/*!40000 ALTER TABLE `ad_attribution_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `ad_attribution_logs` ENABLE KEYS */;
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
