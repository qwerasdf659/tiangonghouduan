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
-- Table structure for table `lottery_presets`
--

DROP TABLE IF EXISTS `lottery_presets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `lottery_presets` (
  `lottery_preset_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` int NOT NULL,
  `lottery_campaign_prize_id` bigint DEFAULT NULL COMMENT '活动奖品关联ID（FK→lottery_campaign_prizes.lottery_campaign_prize_id）',
  `lottery_campaign_id` int DEFAULT NULL,
  `queue_order` int NOT NULL,
  `status` enum('pending','used') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `approval_status` enum('pending','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'approved' COMMENT '审批状态：pending-待审批, approved-已批准, rejected-已拒绝',
  `advance_mode` enum('none','inventory','budget','both') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'both' COMMENT '垫付模式：none-不垫付, inventory-仅库存垫付, budget-仅预算垫付, both-全部垫付',
  `approved_by` int DEFAULT NULL COMMENT '审批人ID（外键关联users.user_id）',
  `approved_at` datetime DEFAULT NULL COMMENT '审批时间',
  `rejection_reason` text COLLATE utf8mb4_unicode_ci COMMENT '拒绝原因（审批拒绝时填写）',
  `created_by` int DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `reason` text COLLATE utf8mb4_unicode_ci COMMENT '创建预设的原因/备注（审计追责用）',
  PRIMARY KEY (`lottery_preset_id`),
  KEY `idx_user_status` (`user_id`,`status`),
  KEY `idx_queue_order` (`queue_order`),
  KEY `idx_created_by` (`created_by`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_presets_approval_status` (`approval_status`),
  KEY `idx_presets_campaign_status` (`lottery_campaign_id`,`status`),
  KEY `fk_lottery_presets_campaign_prize` (`lottery_campaign_prize_id`),
  CONSTRAINT `fk_lottery_presets_campaign_prize` FOREIGN KEY (`lottery_campaign_prize_id`) REFERENCES `lottery_campaign_prizes` (`lottery_campaign_prize_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_lottery_presets_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_lottery_presets_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖结果预设表（简化版）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lottery_presets`
--

LOCK TABLES `lottery_presets` WRITE;
/*!40000 ALTER TABLE `lottery_presets` DISABLE KEYS */;
/*!40000 ALTER TABLE `lottery_presets` ENABLE KEYS */;
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
