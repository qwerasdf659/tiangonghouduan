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
-- Table structure for table `account_asset_balances`
--

DROP TABLE IF EXISTS `account_asset_balances`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `account_asset_balances` (
  `account_asset_balance_id` bigint NOT NULL AUTO_INCREMENT,
  `account_id` bigint NOT NULL COMMENT '账户ID（Account ID）：关联 accounts.account_id，外键约束CASCADE更新/RESTRICT删除',
  `asset_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '资产代码（Asset Code）：如 DIAMOND、red_shard、red_crystal 等；唯一约束：(account_id, asset_code)',
  `available_amount` bigint NOT NULL DEFAULT '0' COMMENT '可用余额（Available Amount）：可直接支付、转让、挂牌的余额；业务规则：不可为负数，所有扣减操作必须验证余额充足；单位：整数（BIGINT避免浮点精度问题）',
  `frozen_amount` bigint NOT NULL DEFAULT '0' COMMENT '冻结余额（Frozen Amount）：下单冻结、挂牌冻结的余额；业务规则：交易市场购买时冻结买家DIAMOND，挂牌时冻结卖家标的资产；成交后从冻结转为扣减或入账；取消/超时时解冻回到 available_amount；不可为负数',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  `lottery_campaign_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '抽奖活动ID（仅 BUDGET_POINTS 需要，其他资产为 NULL）',
  `lottery_campaign_key` varchar(50) COLLATE utf8mb4_unicode_ci GENERATED ALWAYS AS (coalesce(`lottery_campaign_id`,_utf8mb4'GLOBAL')) STORED NOT NULL COMMENT '抽奖活动键（自动生成）：COALESCE(lottery_campaign_id, GLOBAL)',
  PRIMARY KEY (`account_asset_balance_id`),
  UNIQUE KEY `uk_account_asset_lottery_campaign_key` (`account_id`,`asset_code`,`lottery_campaign_key`),
  KEY `idx_account_asset_balances_asset_code` (`asset_code`),
  KEY `idx_account_asset_balances_account_id` (`account_id`),
  KEY `idx_account_asset_balances_lottery_campaign_id` (`lottery_campaign_id`),
  CONSTRAINT `account_asset_balances_ibfk_1` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`account_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `chk_available_non_negative` CHECK ((`available_amount` >= 0)),
  CONSTRAINT `chk_budget_points_lottery_campaign` CHECK (((`asset_code` <> _utf8mb4'BUDGET_POINTS') or (`lottery_campaign_id` is not null))),
  CONSTRAINT `chk_frozen_amount_non_negative` CHECK ((`frozen_amount` >= 0))
) ENGINE=InnoDB AUTO_INCREMENT=664 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='账户资产余额表（可用余额 + 冻结余额）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `account_asset_balances`
--

LOCK TABLES `account_asset_balances` WRITE;
/*!40000 ALTER TABLE `account_asset_balances` DISABLE KEYS */;
INSERT INTO `account_asset_balances` VALUES
(614,7,'star_stone',2420,0,'2026-06-22 13:13:44','2026-07-16 02:37:37',NULL,'GLOBAL'),
(615,7,'star_stone_quota',25250,0,'2026-06-22 13:13:54','2026-07-16 02:37:37',NULL,'GLOBAL'),
(616,7,'budget_points',57574,0,'2026-06-22 13:14:12','2026-07-16 02:37:37','CONSUMPTION_DEFAULT','CONSUMPTION_DEFAULT'),
(617,7,'red_core_shard',73976,0,'2026-06-22 13:14:22','2026-07-16 02:37:37',NULL,'GLOBAL'),
(618,7,'points',55000,3480,'2026-06-22 13:14:30','2026-07-16 02:37:36',NULL,'GLOBAL'),
(619,640,'points',3365,0,'2026-06-25 03:16:09','2026-06-25 04:32:48',NULL,'GLOBAL'),
(620,640,'budget_points',735,0,'2026-06-25 03:16:10','2026-06-25 04:32:48','CONSUMPTION_DEFAULT','CONSUMPTION_DEFAULT'),
(621,640,'STAR_STONE_QUOTA',3695,0,'2026-06-25 03:16:10','2026-06-25 04:32:48',NULL,'GLOBAL'),
(622,640,'star_stone',3640,0,'2026-06-25 03:18:12','2026-06-25 03:20:16',NULL,'GLOBAL'),
(623,640,'red_core_shard',379,0,'2026-06-25 03:18:12','2026-06-25 03:19:59',NULL,'GLOBAL'),
(624,637,'points',5168,0,'2026-06-25 04:32:17','2026-06-26 00:18:01',NULL,'GLOBAL'),
(625,637,'budget_points',1137,0,'2026-06-25 04:32:17','2026-06-26 00:18:01','CONSUMPTION_DEFAULT','CONSUMPTION_DEFAULT'),
(626,637,'STAR_STONE_QUOTA',5168,0,'2026-06-25 04:32:17','2026-06-26 00:18:01',NULL,'GLOBAL'),
(627,638,'points',365,0,'2026-06-25 04:32:19','2026-06-25 04:32:19',NULL,'GLOBAL'),
(628,638,'budget_points',80,0,'2026-06-25 04:32:19','2026-06-25 04:32:19','CONSUMPTION_DEFAULT','CONSUMPTION_DEFAULT'),
(629,638,'STAR_STONE_QUOTA',365,0,'2026-06-25 04:32:19','2026-06-25 04:32:19',NULL,'GLOBAL'),
(630,641,'points',1000,0,'2026-06-26 00:20:30','2026-06-26 00:20:30',NULL,'GLOBAL'),
(631,641,'budget_points',220,0,'2026-06-26 00:20:30','2026-06-26 00:20:30','CONSUMPTION_DEFAULT','CONSUMPTION_DEFAULT'),
(632,641,'STAR_STONE_QUOTA',1000,0,'2026-06-26 00:20:30','2026-06-26 00:20:30',NULL,'GLOBAL'),
(633,643,'points',29,0,'2026-06-26 07:06:48','2026-06-27 07:54:20',NULL,'GLOBAL'),
(634,643,'budget_points',222,0,'2026-06-26 07:06:48','2026-06-27 07:54:04','CONSUMPTION_DEFAULT','CONSUMPTION_DEFAULT'),
(635,643,'STAR_STONE_QUOTA',399,0,'2026-06-26 07:06:48','2026-06-27 07:54:05',NULL,'GLOBAL'),
(636,643,'red_core_shard',259,0,'2026-06-26 07:07:07','2026-06-27 07:54:04',NULL,'GLOBAL'),
(637,643,'star_stone',2970,0,'2026-06-26 07:07:08','2026-06-27 07:54:05',NULL,'GLOBAL'),
(638,644,'points',430,0,'2026-06-27 08:02:56','2026-06-28 03:01:06',NULL,'GLOBAL'),
(639,644,'budget_points',0,0,'2026-06-27 08:02:56','2026-06-28 02:40:03','CONSUMPTION_DEFAULT','CONSUMPTION_DEFAULT'),
(640,644,'STAR_STONE_QUOTA',0,0,'2026-06-27 08:02:57','2026-06-28 02:40:02',NULL,'GLOBAL'),
(641,644,'star_stone',7040,0,'2026-06-27 08:03:23','2026-06-29 00:12:26',NULL,'GLOBAL'),
(642,644,'red_core_shard',700,0,'2026-06-27 08:03:30','2026-06-28 02:40:03',NULL,'GLOBAL'),
(643,645,'points',20,0,'2026-06-28 03:06:42','2026-06-28 03:11:32',NULL,'GLOBAL'),
(644,645,'budget_points',0,0,'2026-06-28 03:06:42','2026-06-28 03:10:04','CONSUMPTION_DEFAULT','CONSUMPTION_DEFAULT'),
(645,645,'STAR_STONE_QUOTA',0,0,'2026-06-28 03:06:42','2026-06-28 03:10:03',NULL,'GLOBAL'),
(646,645,'star_stone',3000,0,'2026-06-28 03:09:43','2026-06-28 03:10:03',NULL,'GLOBAL'),
(647,645,'red_core_shard',240,0,'2026-06-28 03:09:43','2026-06-28 03:10:04',NULL,'GLOBAL');
/*!40000 ALTER TABLE `account_asset_balances` ENABLE KEYS */;
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
