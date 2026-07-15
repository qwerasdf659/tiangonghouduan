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
) ENGINE=InnoDB AUTO_INCREMENT=611 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='账户资产余额表（可用余额 + 冻结余额）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `account_asset_balances`
--

LOCK TABLES `account_asset_balances` WRITE;
/*!40000 ALTER TABLE `account_asset_balances` DISABLE KEYS */;
INSERT INTO `account_asset_balances` VALUES
(13,6,'red_core_shard',145255,0,'2025-12-16 02:55:38','2026-04-02 04:32:27',NULL,'GLOBAL'),
(14,6,'star_stone',393355,0,'2025-12-16 02:55:38','2026-04-02 04:32:27',NULL,'GLOBAL'),
(19,1,'points',0,0,'2025-12-21 03:29:17','2026-04-02 04:32:27',NULL,'GLOBAL'),
(21,2,'points',0,0,'2025-12-21 03:29:17','2026-04-22 11:28:40',NULL,'GLOBAL'),
(23,3,'points',12370,0,'2025-12-21 03:29:17','2026-04-02 04:32:27',NULL,'GLOBAL'),
(25,4,'points',55040,0,'2025-12-21 03:29:17','2026-04-22 03:09:32',NULL,'GLOBAL'),
(27,12,'points',0,0,'2025-12-21 03:29:17','2026-04-22 11:28:40',NULL,'GLOBAL'),
(29,5,'points',20731,39050,'2025-12-21 03:53:46','2026-06-14 04:04:49',NULL,'GLOBAL'),
(62,5,'red_core_shard',60002495,7330,'2025-12-27 01:11:26','2026-06-14 06:43:57',NULL,'GLOBAL'),
(63,14,'points',0,0,'2025-12-30 21:41:40','2026-04-02 04:32:27',NULL,'GLOBAL'),
(66,20,'points',200,0,'2026-01-09 09:32:59','2026-04-02 04:32:27',NULL,'GLOBAL'),
(67,21,'points',300,0,'2026-01-09 09:33:02','2026-04-02 04:32:27',NULL,'GLOBAL'),
(68,22,'points',400,0,'2026-01-09 09:36:18','2026-04-02 04:32:27',NULL,'GLOBAL'),
(69,23,'points',100,0,'2026-01-09 09:38:51','2026-04-02 04:32:27',NULL,'GLOBAL'),
(70,24,'points',150,0,'2026-01-09 09:39:57','2026-04-02 04:32:27',NULL,'GLOBAL'),
(75,1,'star_stone',6083,0,'2026-01-14 08:29:27','2026-06-05 05:35:58',NULL,'GLOBAL'),
(76,5,'star_stone',0,27500,'2026-01-14 08:45:01','2026-06-13 08:33:34',NULL,'GLOBAL'),
(77,26,'points',2,0,'2026-01-21 21:15:45','2026-04-02 04:32:27',NULL,'GLOBAL'),
(79,28,'star_stone',0,0,'2026-01-28 16:32:22','2026-04-02 04:32:27',NULL,'GLOBAL'),
(80,26,'star_stone',162340,14410,'2026-01-28 16:59:25','2026-06-05 05:35:58',NULL,'GLOBAL'),
(81,7,'star_stone',11788,8570,'2026-01-28 17:15:51','2026-06-22 02:12:44',NULL,'GLOBAL'),
(82,20,'star_stone',23640,0,'2026-01-28 17:15:51','2026-04-02 04:32:27',NULL,'GLOBAL'),
(83,21,'star_stone',0,0,'2026-01-28 17:15:51','2026-04-02 04:32:27',NULL,'GLOBAL'),
(84,22,'star_stone',0,0,'2026-01-28 17:15:51','2026-04-02 04:32:27',NULL,'GLOBAL'),
(85,23,'star_stone',0,0,'2026-01-28 17:15:51','2026-04-02 04:32:27',NULL,'GLOBAL'),
(86,7,'red_core_shard',5629,0,'2026-01-28 17:37:54','2026-06-21 05:54:38',NULL,'GLOBAL'),
(133,83,'star_stone',0,0,'2026-01-28 23:01:00','2026-04-02 04:32:27',NULL,'GLOBAL'),
(146,98,'star_stone',50,0,'2026-01-29 00:44:26','2026-04-02 04:32:27',NULL,'GLOBAL'),
(155,112,'star_stone',0,0,'2026-01-29 01:08:56','2026-04-02 04:32:27',NULL,'GLOBAL'),
(158,113,'star_stone',0,0,'2026-01-29 06:04:36','2026-04-02 04:32:27',NULL,'GLOBAL'),
(167,13,'star_stone',239900,16800,'2026-01-30 04:51:56','2026-06-05 05:39:14',NULL,'GLOBAL'),
(168,25,'star_stone',32000,1800,'2026-01-30 08:15:25','2026-06-05 05:39:14',NULL,'GLOBAL'),
(171,122,'star_stone',50,0,'2026-01-30 20:32:25','2026-04-02 04:32:27',NULL,'GLOBAL'),
(174,131,'star_stone',50,0,'2026-01-30 20:42:08','2026-04-02 04:32:27',NULL,'GLOBAL'),
(185,140,'star_stone',50,0,'2026-02-02 18:13:04','2026-04-02 04:32:27',NULL,'GLOBAL'),
(192,164,'star_stone',0,0,'2026-02-04 09:05:12','2026-04-02 04:32:27',NULL,'GLOBAL'),
(195,173,'star_stone',50,0,'2026-02-06 20:25:48','2026-04-02 04:32:27',NULL,'GLOBAL'),
(196,7,'points',123007,0,'2026-02-12 00:45:25','2026-06-16 02:12:28',NULL,'GLOBAL'),
(200,174,'star_stone',50,0,'2026-02-15 02:06:51','2026-04-02 04:32:27',NULL,'GLOBAL'),
(201,133,'star_stone',190,0,'2026-02-18 02:17:47','2026-04-02 04:32:27',NULL,'GLOBAL'),
(202,175,'star_stone',5000,0,'2026-02-18 23:40:00','2026-04-02 04:32:27',NULL,'GLOBAL'),
(203,175,'red_core_shard',2000,0,'2026-02-18 23:40:00','2026-04-02 04:32:27',NULL,'GLOBAL'),
(204,175,'red_core_gem',200,0,'2026-02-18 23:40:00','2026-04-02 04:32:27',NULL,'GLOBAL'),
(205,175,'orange_core_shard',500,0,'2026-02-18 23:40:00','2026-04-02 04:32:27',NULL,'GLOBAL'),
(206,17,'star_stone',5000,0,'2026-02-18 23:40:00','2026-04-02 04:32:27',NULL,'GLOBAL'),
(207,17,'red_core_shard',2000,0,'2026-02-18 23:40:00','2026-04-02 04:32:27',NULL,'GLOBAL'),
(208,17,'red_core_gem',200,0,'2026-02-18 23:40:00','2026-04-02 04:32:27',NULL,'GLOBAL'),
(209,17,'orange_core_shard',500,0,'2026-02-18 23:40:00','2026-04-02 04:32:27',NULL,'GLOBAL'),
(210,176,'star_stone',4950,0,'2026-02-18 23:40:00','2026-04-02 04:32:27',NULL,'GLOBAL'),
(211,176,'red_core_shard',2000,0,'2026-02-18 23:40:00','2026-04-02 04:32:27',NULL,'GLOBAL'),
(212,176,'red_core_gem',200,0,'2026-02-18 23:40:00','2026-04-02 04:32:27',NULL,'GLOBAL'),
(213,176,'orange_core_shard',500,0,'2026-02-18 23:40:00','2026-04-02 04:32:27',NULL,'GLOBAL'),
(214,16,'star_stone',5000,0,'2026-02-18 23:40:00','2026-04-02 04:32:27',NULL,'GLOBAL'),
(215,16,'red_core_shard',2000,0,'2026-02-18 23:40:00','2026-04-02 04:32:27',NULL,'GLOBAL'),
(216,16,'red_core_gem',200,0,'2026-02-18 23:40:00','2026-04-02 04:32:27',NULL,'GLOBAL'),
(217,16,'orange_core_shard',500,0,'2026-02-18 23:40:00','2026-04-02 04:32:27',NULL,'GLOBAL'),
(221,181,'star_stone',50,0,'2026-02-20 18:03:01','2026-04-02 04:32:27',NULL,'GLOBAL'),
(226,187,'star_stone',50,0,'2026-02-20 21:46:32','2026-04-02 04:32:27',NULL,'GLOBAL'),
(229,192,'star_stone',50,0,'2026-02-21 01:50:51','2026-04-02 04:32:27',NULL,'GLOBAL'),
(232,197,'star_stone',50,0,'2026-02-21 20:07:59','2026-04-02 04:32:27',NULL,'GLOBAL'),
(257,12,'star_stone',0,0,'2026-02-24 03:22:38','2026-04-22 11:28:40',NULL,'GLOBAL'),
(258,12,'red_core_shard',0,0,'2026-02-24 03:22:38','2026-04-22 11:28:40',NULL,'GLOBAL'),
(265,1,'orange_core_shard',1000,0,'2026-02-25 01:11:02','2026-04-02 04:32:27',NULL,'GLOBAL'),
(266,1,'red_core_gem',400,0,'2026-02-25 01:11:02','2026-04-02 04:32:27',NULL,'GLOBAL'),
(267,1,'red_core_shard',4190,0,'2026-02-25 01:11:02','2026-04-02 04:32:27',NULL,'GLOBAL'),
(269,2,'star_stone',0,0,'2026-02-25 01:11:02','2026-04-22 11:28:40',NULL,'GLOBAL'),
(271,2,'orange_core_shard',0,0,'2026-02-25 01:11:02','2026-04-22 11:28:40',NULL,'GLOBAL'),
(272,2,'red_core_gem',0,0,'2026-02-25 01:11:02','2026-04-22 11:28:40',NULL,'GLOBAL'),
(273,2,'red_core_shard',0,0,'2026-02-25 01:11:02','2026-04-22 11:28:40',NULL,'GLOBAL'),
(275,3,'red_core_shard',267065,0,'2026-02-25 01:11:02','2026-04-02 04:32:27',NULL,'GLOBAL'),
(276,4,'star_stone',255646,0,'2026-02-25 01:11:02','2026-04-22 03:09:32',NULL,'GLOBAL'),
(277,4,'red_core_shard',39565,0,'2026-02-25 01:11:02','2026-04-22 03:09:32',NULL,'GLOBAL'),
(279,12,'orange_core_shard',0,0,'2026-02-25 01:11:02','2026-04-22 11:28:40',NULL,'GLOBAL'),
(280,12,'red_core_gem',0,0,'2026-02-25 01:11:02','2026-04-22 11:28:40',NULL,'GLOBAL'),
(282,239,'star_stone',0,0,'2026-02-25 01:11:02','2026-04-22 11:28:40',NULL,'GLOBAL'),
(283,239,'red_core_shard',230,0,'2026-02-25 01:11:02','2026-04-02 04:32:27',NULL,'GLOBAL'),
(286,248,'star_stone',0,0,'2026-02-25 03:56:35','2026-04-22 11:28:40',NULL,'GLOBAL'),
(291,5,'star_stone_quota',8429,0,'2026-03-02 07:51:25','2026-06-13 00:35:29',NULL,'GLOBAL'),
(296,265,'star_stone',0,0,'2026-03-02 21:21:25','2026-04-02 04:32:27',NULL,'GLOBAL'),
(307,266,'star_stone',50,0,'2026-03-03 04:28:33','2026-04-02 04:32:27',NULL,'GLOBAL'),
(322,304,'star_stone',50,0,'2026-03-06 15:50:20','2026-04-02 04:32:27',NULL,'GLOBAL'),
(329,310,'star_stone',50,0,'2026-03-06 17:22:26','2026-04-02 04:32:27',NULL,'GLOBAL'),
(332,5,'budget_points',1990,0,'2026-03-07 02:56:09','2026-06-14 04:04:49','CONSUMPTION_DEFAULT','CONSUMPTION_DEFAULT'),
(345,327,'star_stone',50,0,'2026-03-10 09:02:56','2026-04-02 04:32:27',NULL,'GLOBAL'),
(354,333,'star_stone',50,0,'2026-03-14 05:02:08','2026-04-02 04:32:27',NULL,'GLOBAL'),
(359,342,'star_stone',0,0,'2026-03-14 05:35:19','2026-04-02 04:32:27',NULL,'GLOBAL'),
(372,363,'star_stone',50,0,'2026-03-17 08:45:02','2026-04-02 04:32:27',NULL,'GLOBAL'),
(379,368,'star_stone',0,0,'2026-03-17 08:58:39','2026-04-02 04:32:27',NULL,'GLOBAL'),
(388,377,'star_stone',50,0,'2026-03-21 07:00:13','2026-04-02 04:32:27',NULL,'GLOBAL'),
(395,394,'star_stone',50,0,'2026-03-21 07:45:55','2026-04-02 04:32:27',NULL,'GLOBAL'),
(400,399,'star_stone',50,0,'2026-03-21 08:50:23','2026-04-02 04:32:27',NULL,'GLOBAL'),
(405,404,'star_stone',50,0,'2026-03-22 07:30:12','2026-04-02 04:32:27',NULL,'GLOBAL'),
(412,410,'star_stone',0,0,'2026-03-23 00:18:35','2026-04-02 04:32:27',NULL,'GLOBAL'),
(427,423,'star_stone',50,0,'2026-03-23 08:12:55','2026-04-02 04:32:27',NULL,'GLOBAL'),
(432,428,'star_stone',50,0,'2026-03-23 08:21:50','2026-04-02 04:32:27',NULL,'GLOBAL'),
(437,433,'star_stone',50,0,'2026-03-23 08:23:33','2026-04-02 04:32:27',NULL,'GLOBAL'),
(446,437,'star_stone',50,0,'2026-03-23 08:32:39','2026-04-02 04:32:27',NULL,'GLOBAL'),
(459,446,'star_stone',50,0,'2026-03-23 09:36:58','2026-04-02 04:32:27',NULL,'GLOBAL'),
(468,453,'star_stone',50,0,'2026-03-23 09:45:43','2026-04-02 04:32:27',NULL,'GLOBAL'),
(473,458,'star_stone',50,0,'2026-03-24 02:07:25','2026-04-02 04:32:27',NULL,'GLOBAL'),
(480,464,'star_stone',0,0,'2026-03-24 02:20:11','2026-04-02 04:32:27',NULL,'GLOBAL'),
(487,473,'star_stone',50,0,'2026-03-24 04:40:05','2026-04-02 04:32:27',NULL,'GLOBAL'),
(494,479,'star_stone',0,0,'2026-03-24 04:45:41','2026-04-02 04:32:27',NULL,'GLOBAL'),
(501,488,'star_stone',0,0,'2026-03-24 05:17:33','2026-04-10 06:44:22',NULL,'GLOBAL'),
(508,499,'star_stone',50,0,'2026-04-22 11:40:08','2026-04-22 11:40:08',NULL,'GLOBAL'),
(511,504,'star_stone',50,0,'2026-04-22 11:42:54','2026-04-22 11:42:54',NULL,'GLOBAL'),
(516,509,'star_stone',50,0,'2026-04-23 00:20:59','2026-04-23 00:20:59',NULL,'GLOBAL'),
(521,514,'star_stone',0,0,'2026-04-23 02:53:12','2026-04-23 02:55:11',NULL,'GLOBAL'),
(526,519,'star_stone',0,0,'2026-04-23 02:56:57','2026-04-23 02:57:51',NULL,'GLOBAL'),
(531,524,'star_stone',0,0,'2026-04-23 03:00:31','2026-04-23 03:02:54',NULL,'GLOBAL'),
(536,529,'star_stone',50,0,'2026-04-24 03:38:16','2026-04-24 03:38:16',NULL,'GLOBAL'),
(543,534,'star_stone',50,0,'2026-04-24 07:41:42','2026-04-24 07:41:42',NULL,'GLOBAL'),
(548,543,'star_stone',0,0,'2026-04-25 05:42:25','2026-04-25 06:11:32',NULL,'GLOBAL'),
(555,552,'star_stone',50,0,'2026-04-25 06:33:57','2026-04-25 06:33:57',NULL,'GLOBAL'),
(560,557,'star_stone',50,0,'2026-04-25 06:43:35','2026-04-25 06:43:36',NULL,'GLOBAL'),
(563,5,'budget_points',100000,0,'2026-05-21 05:20:19','2026-05-21 05:24:03','1','1'),
(564,7,'budget_points',50983,0,'2026-05-21 05:24:25','2026-06-16 02:12:28','CONSUMPTION_DEFAULT','CONSUMPTION_DEFAULT'),
(565,7,'star_stone_quota',854227,0,'2026-05-21 06:11:46','2026-06-15 03:00:17',NULL,'GLOBAL'),
(568,565,'star_stone',0,0,'2026-05-26 03:49:12','2026-06-03 00:00:19',NULL,'GLOBAL'),
(571,5,'green_core_gem',69999988,0,'2026-06-01 07:19:54','2026-06-01 07:19:54',NULL,'GLOBAL'),
(572,5,'purple_core_gem',9999999,0,'2026-06-01 07:20:11','2026-06-01 07:20:11',NULL,'GLOBAL'),
(580,574,'star_stone',50,0,'2026-06-03 01:32:41','2026-06-03 01:32:42',NULL,'GLOBAL'),
(584,583,'star_stone',50,0,'2026-06-03 02:59:42','2026-06-03 02:59:43',NULL,'GLOBAL'),
(588,588,'star_stone',0,0,'2026-06-03 03:30:32','2026-06-03 03:35:23',NULL,'GLOBAL'),
(592,597,'star_stone',50,0,'2026-06-05 03:08:18','2026-06-05 03:08:18',NULL,'GLOBAL');
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

-- Dump completed on 2026-06-21 19:08:07
