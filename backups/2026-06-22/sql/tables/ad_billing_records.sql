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
-- Table structure for table `ad_billing_records`
--

DROP TABLE IF EXISTS `ad_billing_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `ad_billing_records` (
  `ad_billing_record_id` bigint NOT NULL AUTO_INCREMENT COMMENT '计费流水主键（BIGINT 预留大数据量）',
  `business_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '幂等键（防重复扣费）',
  `ad_campaign_id` int NOT NULL COMMENT '关联广告计划 ID',
  `advertiser_user_id` int NOT NULL COMMENT '广告主用户 ID',
  `billing_date` date NOT NULL COMMENT '计费日期',
  `amount_star_stone` int NOT NULL COMMENT '星石金额',
  `billing_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '计费类型：freeze / deduct / refund / daily_deduct',
  `asset_transaction_id` bigint DEFAULT NULL COMMENT '关联 asset_transactions 流水 ID',
  `remark` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备注',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `billing_no` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '广告账单号（AB 前缀）',
  PRIMARY KEY (`ad_billing_record_id`),
  UNIQUE KEY `business_id` (`business_id`),
  UNIQUE KEY `uk_ad_billing_records_billing_no` (`billing_no`),
  KEY `advertiser_user_id` (`advertiser_user_id`),
  KEY `idx_abr_campaign` (`ad_campaign_id`),
  KEY `idx_abr_date` (`billing_date`),
  KEY `idx_abr_type` (`billing_type`),
  CONSTRAINT `ad_billing_records_ibfk_1` FOREIGN KEY (`ad_campaign_id`) REFERENCES `ad_campaigns` (`ad_campaign_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ad_billing_records_ibfk_2` FOREIGN KEY (`advertiser_user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='广告计费流水表 — Phase 3 钻石冻结/扣款/退款';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ad_billing_records`
--

LOCK TABLES `ad_billing_records` WRITE;
/*!40000 ALTER TABLE `ad_billing_records` DISABLE KEYS */;
/*!40000 ALTER TABLE `ad_billing_records` ENABLE KEYS */;
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
