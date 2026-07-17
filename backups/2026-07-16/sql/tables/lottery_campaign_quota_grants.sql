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
-- Table structure for table `lottery_campaign_quota_grants`
--

DROP TABLE IF EXISTS `lottery_campaign_quota_grants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `lottery_campaign_quota_grants` (
  `lottery_campaign_quota_grant_id` bigint NOT NULL AUTO_INCREMENT,
  `quota_id` bigint NOT NULL COMMENT '关联的配额记录ID（外键关联lottery_campaign_user_quota.quota_id）',
  `user_id` int NOT NULL COMMENT '用户ID（冗余，便于查询）',
  `lottery_campaign_id` int NOT NULL,
  `grant_amount` int unsigned NOT NULL COMMENT '发放配额金额（整数分值）',
  `grant_source` enum('initial','topup','refund','compensation','admin') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '发放来源：initial-初始配额, topup-充值, refund-退款, compensation-补偿, admin-管理员调整',
  `source_reference_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '来源引用ID（如订单ID、退款ID等，用于追溯）',
  `grant_reason` text COLLATE utf8mb4_unicode_ci COMMENT '发放原因/备注',
  `granted_by` int DEFAULT NULL COMMENT '操作人ID（管理员user_id，系统操作为null）',
  `balance_after` int unsigned NOT NULL COMMENT '发放后配额总余额',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`lottery_campaign_quota_grant_id`),
  KEY `idx_grants_quota_id` (`quota_id`),
  KEY `idx_grants_user_campaign` (`user_id`,`lottery_campaign_id`),
  KEY `idx_grants_source_time` (`grant_source`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='配额发放记录表 - 记录配额的发放来源和金额';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lottery_campaign_quota_grants`
--

LOCK TABLES `lottery_campaign_quota_grants` WRITE;
/*!40000 ALTER TABLE `lottery_campaign_quota_grants` DISABLE KEYS */;
/*!40000 ALTER TABLE `lottery_campaign_quota_grants` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-16  3:11:50
