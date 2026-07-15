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
-- Table structure for table `lottery_user_daily_draw_quota`
--

DROP TABLE IF EXISTS `lottery_user_daily_draw_quota`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `lottery_user_daily_draw_quota` (
  `lottery_user_daily_draw_quota_id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL COMMENT '用户ID',
  `lottery_campaign_id` int NOT NULL,
  `quota_date` date NOT NULL COMMENT '配额日期：北京时间日期',
  `limit_value` int unsigned NOT NULL DEFAULT '50' COMMENT '当日上限：来自规则计算结果',
  `used_draw_count` int unsigned NOT NULL DEFAULT '0' COMMENT '已使用抽奖次数',
  `bonus_draw_count` int unsigned NOT NULL DEFAULT '0' COMMENT '当日临时补偿的抽奖次数（客服加次数用）',
  `last_draw_at` datetime DEFAULT NULL COMMENT '最后一次抽奖时间',
  `matched_rule_id` bigint DEFAULT NULL COMMENT '命中的规则ID（便于审计追溯）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`lottery_user_daily_draw_quota_id`),
  UNIQUE KEY `idx_user_campaign_date_unique` (`user_id`,`lottery_campaign_id`,`quota_date`),
  KEY `idx_date_campaign` (`quota_date`,`lottery_campaign_id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=518 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lottery_user_daily_draw_quota`
--

LOCK TABLES `lottery_user_daily_draw_quota` WRITE;
/*!40000 ALTER TABLE `lottery_user_daily_draw_quota` DISABLE KEYS */;
INSERT INTO `lottery_user_daily_draw_quota` VALUES
(505,32,1,'2026-06-21',9999,11,0,'2026-06-22 23:24:10',15,'2026-06-22 13:24:17','2026-06-22 23:24:10'),
(506,32,1,'2026-06-23',9999,21,0,'2026-06-24 02:52:59',15,'2026-06-24 02:52:45','2026-06-24 02:52:59'),
(507,12799,1,'2026-06-24',200,149,0,'2026-06-25 03:20:16',17,'2026-06-25 03:18:12','2026-06-25 03:20:16'),
(508,12802,1,'2026-06-25',200,14,0,'2026-06-26 07:07:25',17,'2026-06-26 07:07:07','2026-06-26 07:07:25'),
(509,12802,1,'2026-06-26',200,115,0,'2026-06-27 07:54:20',17,'2026-06-27 06:33:56','2026-06-27 07:54:20'),
(510,12803,1,'2026-06-26',200,38,0,'2026-06-27 08:05:38',17,'2026-06-27 08:03:22','2026-06-27 08:05:38'),
(511,12803,1,'2026-06-27',200,200,0,'2026-06-28 03:01:06',17,'2026-06-28 01:56:34','2026-06-28 03:01:06'),
(512,12804,1,'2026-06-27',200,117,0,'2026-06-28 03:11:32',17,'2026-06-28 03:09:43','2026-06-28 03:11:32'),
(513,32,1,'2026-06-27',9999,12,0,'2026-06-28 21:17:59',15,'2026-06-28 21:05:54','2026-06-28 21:17:59'),
(514,32,1,'2026-07-02',9999,4,0,'2026-07-03 19:56:28',15,'2026-07-03 19:55:49','2026-07-03 19:56:28'),
(516,32,1,'2026-07-05',9999,47,30,'2026-07-06 06:57:04',15,'2026-07-06 03:33:10','2026-07-06 06:57:04');
/*!40000 ALTER TABLE `lottery_user_daily_draw_quota` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-10 18:10:58
