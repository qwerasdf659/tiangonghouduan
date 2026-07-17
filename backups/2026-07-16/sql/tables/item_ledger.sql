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
-- Table structure for table `item_ledger`
--

DROP TABLE IF EXISTS `item_ledger`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `item_ledger` (
  `ledger_entry_id` bigint NOT NULL AUTO_INCREMENT COMMENT '账本条目ID（主键，自增）',
  `item_id` bigint NOT NULL COMMENT '物品ID（关联 items.item_id）',
  `account_id` bigint NOT NULL COMMENT '当前方账户ID（关联 accounts.account_id）',
  `delta` tinyint NOT NULL COMMENT '变动方向：+1=入账（获得物品），-1=出账（失去物品）',
  `counterpart_id` bigint NOT NULL COMMENT '对手方账户ID（双录的另一方，关联 accounts.account_id）',
  `event_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '事件类型：mint=铸造, transfer=转移, use=使用/核销, expire=过期, destroy=销毁',
  `operator_id` bigint DEFAULT NULL COMMENT '操作者ID（用户ID或管理员ID）',
  `operator_type` enum('user','admin','system') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'system' COMMENT '操作者类型：user=用户, admin=管理员, system=系统',
  `business_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '业务类型：lottery_mint=抽奖铸造, market_transfer=市场交易, redemption_use=兑换核销, backpack_use=背包使用, admin_mint=管理员发放',
  `idempotency_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '幂等键（同一物品内唯一，防止重复记账）',
  `meta` json DEFAULT NULL COMMENT '扩展信息（仅存真正动态的信息，如交易价格、兑换码等）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（不可变表，无 updated_at）',
  PRIMARY KEY (`ledger_entry_id`),
  UNIQUE KEY `uk_item_idempotency` (`item_id`,`idempotency_key`),
  KEY `counterpart_id` (`counterpart_id`),
  KEY `idx_ledger_item_time` (`item_id`,`created_at`),
  KEY `idx_ledger_account_time` (`account_id`,`created_at`),
  KEY `idx_ledger_event_type` (`event_type`,`created_at`),
  KEY `idx_ledger_business` (`business_type`,`created_at`),
  CONSTRAINT `item_ledger_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `items` (`item_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `item_ledger_ibfk_2` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`account_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `item_ledger_ibfk_3` FOREIGN KEY (`counterpart_id`) REFERENCES `accounts` (`account_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=32483 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='物品所有权账本（唯一真相，双录记账，只追加不修改不删除）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `item_ledger`
--

LOCK TABLES `item_ledger` WRITE;
/*!40000 ALTER TABLE `item_ledger` DISABLE KEYS */;
INSERT INTO `item_ledger` VALUES
(31903,45533,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783636885194_success:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783636885194\", \"source_ref_id\": \"633\", \"consumed_item_ids\": [\"45527\"]}','2026-07-10 06:41:29'),
(31904,45533,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783636885194_success:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783636885194\", \"source_ref_id\": \"633\", \"consumed_item_ids\": [\"45527\"]}','2026-07-10 06:41:29'),
(31935,45546,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783637034635_success:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783637034635\", \"source_ref_id\": \"633\", \"consumed_item_ids\": [\"45540\"]}','2026-07-10 06:43:57'),
(31936,45546,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783637034635_success:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783637034635\", \"source_ref_id\": \"633\", \"consumed_item_ids\": [\"45540\"]}','2026-07-10 06:43:57'),
(31939,45547,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783637034635_limit2:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783637034635\", \"source_ref_id\": \"633\", \"consumed_item_ids\": [\"45541\"]}','2026-07-10 06:43:57'),
(31940,45547,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783637034635_limit2:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783637034635\", \"source_ref_id\": \"633\", \"consumed_item_ids\": [\"45541\"]}','2026-07-10 06:43:57'),
(31957,45554,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783650932810_success:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783650932810\", \"source_ref_id\": \"633\", \"consumed_item_ids\": [\"45548\"]}','2026-07-10 10:35:35'),
(31958,45554,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783650932810_success:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783650932810\", \"source_ref_id\": \"633\", \"consumed_item_ids\": [\"45548\"]}','2026-07-10 10:35:35'),
(31961,45555,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783650932810_limit2:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783650932810\", \"source_ref_id\": \"633\", \"consumed_item_ids\": [\"45549\"]}','2026-07-10 10:35:35'),
(31962,45555,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783650932810_limit2:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783650932810\", \"source_ref_id\": \"633\", \"consumed_item_ids\": [\"45549\"]}','2026-07-10 10:35:35'),
(31979,45562,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783670610130_success:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783670610130\", \"source_ref_id\": \"633\", \"consumed_item_ids\": [\"45556\"]}','2026-07-10 16:03:33'),
(31980,45562,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783670610130_success:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783670610130\", \"source_ref_id\": \"633\", \"consumed_item_ids\": [\"45556\"]}','2026-07-10 16:03:33'),
(31983,45563,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783670610130_limit2:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783670610130\", \"source_ref_id\": \"633\", \"consumed_item_ids\": [\"45557\"]}','2026-07-10 16:03:33'),
(31984,45563,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783670610130_limit2:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783670610130\", \"source_ref_id\": \"633\", \"consumed_item_ids\": [\"45557\"]}','2026-07-10 16:03:33'),
(32001,45570,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783670784695_success:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783670784695\", \"source_ref_id\": \"633\", \"consumed_item_ids\": [\"45564\"]}','2026-07-10 16:06:27'),
(32002,45570,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783670784695_success:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783670784695\", \"source_ref_id\": \"633\", \"consumed_item_ids\": [\"45564\"]}','2026-07-10 16:06:27'),
(32005,45571,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783670784695_limit2:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783670784695\", \"source_ref_id\": \"633\", \"consumed_item_ids\": [\"45565\"]}','2026-07-10 16:06:27'),
(32006,45571,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783670784695_limit2:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783670784695\", \"source_ref_id\": \"633\", \"consumed_item_ids\": [\"45565\"]}','2026-07-10 16:06:27'),
(32023,45578,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783700233858_success:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783700233858\", \"source_ref_id\": \"633\", \"consumed_item_ids\": [\"45572\"]}','2026-07-11 00:17:16'),
(32024,45578,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783700233858_success:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783700233858\", \"source_ref_id\": \"633\", \"consumed_item_ids\": [\"45572\"]}','2026-07-11 00:17:16'),
(32027,45579,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783700233858_limit2:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783700233858\", \"source_ref_id\": \"633\", \"consumed_item_ids\": [\"45573\"]}','2026-07-11 00:17:17'),
(32028,45579,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783700233858_limit2:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783700233858\", \"source_ref_id\": \"633\", \"consumed_item_ids\": [\"45573\"]}','2026-07-11 00:17:17'),
(32045,45586,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783702906304_success:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783702906304\", \"source_ref_id\": \"633\", \"consumed_item_ids\": [\"45580\"]}','2026-07-11 01:01:49'),
(32046,45586,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783702906304_success:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783702906304\", \"source_ref_id\": \"633\", \"consumed_item_ids\": [\"45580\"]}','2026-07-11 01:01:49'),
(32049,45587,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783702906304_limit2:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783702906304\", \"source_ref_id\": \"633\", \"consumed_item_ids\": [\"45581\"]}','2026-07-11 01:01:49'),
(32050,45587,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783702906304_limit2:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783702906304\", \"source_ref_id\": \"633\", \"consumed_item_ids\": [\"45581\"]}','2026-07-11 01:01:49'),
(32067,45594,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783703713160_success:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783703713160\", \"source_ref_id\": \"633\", \"consumed_item_ids\": [\"45588\"]}','2026-07-11 01:15:15'),
(32068,45594,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783703713160_success:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783703713160\", \"source_ref_id\": \"633\", \"consumed_item_ids\": [\"45588\"]}','2026-07-11 01:15:15'),
(32071,45595,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783703713160_limit2:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783703713160\", \"source_ref_id\": \"633\", \"consumed_item_ids\": [\"45589\"]}','2026-07-11 01:15:15'),
(32072,45595,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783703713160_limit2:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783703713160\", \"source_ref_id\": \"633\", \"consumed_item_ids\": [\"45589\"]}','2026-07-11 01:15:15'),
(32075,45533,7,-1,3,'expire',NULL,'system','auto_expire','expire_45533:out','{\"reason\": \"换物产出缺陷物品作废：产出商品未挂 item_template_id 被误当券铸造（2026-07-11 根因已修复，BARTER_OUTPUT_TEMPLATE_MISSING 守卫上线）\"}','2026-07-11 01:28:29'),
(32076,45533,3,1,7,'expire',NULL,'system','auto_expire','expire_45533:in','{\"reason\": \"换物产出缺陷物品作废：产出商品未挂 item_template_id 被误当券铸造（2026-07-11 根因已修复，BARTER_OUTPUT_TEMPLATE_MISSING 守卫上线）\"}','2026-07-11 01:28:29'),
(32077,45546,7,-1,3,'expire',NULL,'system','auto_expire','expire_45546:out','{\"reason\": \"换物产出缺陷物品作废：产出商品未挂 item_template_id 被误当券铸造（2026-07-11 根因已修复，BARTER_OUTPUT_TEMPLATE_MISSING 守卫上线）\"}','2026-07-11 01:28:29'),
(32078,45546,3,1,7,'expire',NULL,'system','auto_expire','expire_45546:in','{\"reason\": \"换物产出缺陷物品作废：产出商品未挂 item_template_id 被误当券铸造（2026-07-11 根因已修复，BARTER_OUTPUT_TEMPLATE_MISSING 守卫上线）\"}','2026-07-11 01:28:29'),
(32079,45547,7,-1,3,'expire',NULL,'system','auto_expire','expire_45547:out','{\"reason\": \"换物产出缺陷物品作废：产出商品未挂 item_template_id 被误当券铸造（2026-07-11 根因已修复，BARTER_OUTPUT_TEMPLATE_MISSING 守卫上线）\"}','2026-07-11 01:28:29'),
(32080,45547,3,1,7,'expire',NULL,'system','auto_expire','expire_45547:in','{\"reason\": \"换物产出缺陷物品作废：产出商品未挂 item_template_id 被误当券铸造（2026-07-11 根因已修复，BARTER_OUTPUT_TEMPLATE_MISSING 守卫上线）\"}','2026-07-11 01:28:29'),
(32081,45554,7,-1,3,'expire',NULL,'system','auto_expire','expire_45554:out','{\"reason\": \"换物产出缺陷物品作废：产出商品未挂 item_template_id 被误当券铸造（2026-07-11 根因已修复，BARTER_OUTPUT_TEMPLATE_MISSING 守卫上线）\"}','2026-07-11 01:28:29'),
(32082,45554,3,1,7,'expire',NULL,'system','auto_expire','expire_45554:in','{\"reason\": \"换物产出缺陷物品作废：产出商品未挂 item_template_id 被误当券铸造（2026-07-11 根因已修复，BARTER_OUTPUT_TEMPLATE_MISSING 守卫上线）\"}','2026-07-11 01:28:29'),
(32083,45555,7,-1,3,'expire',NULL,'system','auto_expire','expire_45555:out','{\"reason\": \"换物产出缺陷物品作废：产出商品未挂 item_template_id 被误当券铸造（2026-07-11 根因已修复，BARTER_OUTPUT_TEMPLATE_MISSING 守卫上线）\"}','2026-07-11 01:28:29'),
(32084,45555,3,1,7,'expire',NULL,'system','auto_expire','expire_45555:in','{\"reason\": \"换物产出缺陷物品作废：产出商品未挂 item_template_id 被误当券铸造（2026-07-11 根因已修复，BARTER_OUTPUT_TEMPLATE_MISSING 守卫上线）\"}','2026-07-11 01:28:29'),
(32085,45562,7,-1,3,'expire',NULL,'system','auto_expire','expire_45562:out','{\"reason\": \"换物产出缺陷物品作废：产出商品未挂 item_template_id 被误当券铸造（2026-07-11 根因已修复，BARTER_OUTPUT_TEMPLATE_MISSING 守卫上线）\"}','2026-07-11 01:28:29'),
(32086,45562,3,1,7,'expire',NULL,'system','auto_expire','expire_45562:in','{\"reason\": \"换物产出缺陷物品作废：产出商品未挂 item_template_id 被误当券铸造（2026-07-11 根因已修复，BARTER_OUTPUT_TEMPLATE_MISSING 守卫上线）\"}','2026-07-11 01:28:29'),
(32087,45563,7,-1,3,'expire',NULL,'system','auto_expire','expire_45563:out','{\"reason\": \"换物产出缺陷物品作废：产出商品未挂 item_template_id 被误当券铸造（2026-07-11 根因已修复，BARTER_OUTPUT_TEMPLATE_MISSING 守卫上线）\"}','2026-07-11 01:28:29'),
(32088,45563,3,1,7,'expire',NULL,'system','auto_expire','expire_45563:in','{\"reason\": \"换物产出缺陷物品作废：产出商品未挂 item_template_id 被误当券铸造（2026-07-11 根因已修复，BARTER_OUTPUT_TEMPLATE_MISSING 守卫上线）\"}','2026-07-11 01:28:29'),
(32089,45570,7,-1,3,'expire',NULL,'system','auto_expire','expire_45570:out','{\"reason\": \"换物产出缺陷物品作废：产出商品未挂 item_template_id 被误当券铸造（2026-07-11 根因已修复，BARTER_OUTPUT_TEMPLATE_MISSING 守卫上线）\"}','2026-07-11 01:28:29'),
(32090,45570,3,1,7,'expire',NULL,'system','auto_expire','expire_45570:in','{\"reason\": \"换物产出缺陷物品作废：产出商品未挂 item_template_id 被误当券铸造（2026-07-11 根因已修复，BARTER_OUTPUT_TEMPLATE_MISSING 守卫上线）\"}','2026-07-11 01:28:29'),
(32091,45571,7,-1,3,'expire',NULL,'system','auto_expire','expire_45571:out','{\"reason\": \"换物产出缺陷物品作废：产出商品未挂 item_template_id 被误当券铸造（2026-07-11 根因已修复，BARTER_OUTPUT_TEMPLATE_MISSING 守卫上线）\"}','2026-07-11 01:28:29'),
(32092,45571,3,1,7,'expire',NULL,'system','auto_expire','expire_45571:in','{\"reason\": \"换物产出缺陷物品作废：产出商品未挂 item_template_id 被误当券铸造（2026-07-11 根因已修复，BARTER_OUTPUT_TEMPLATE_MISSING 守卫上线）\"}','2026-07-11 01:28:29'),
(32093,45578,7,-1,3,'expire',NULL,'system','auto_expire','expire_45578:out','{\"reason\": \"换物产出缺陷物品作废：产出商品未挂 item_template_id 被误当券铸造（2026-07-11 根因已修复，BARTER_OUTPUT_TEMPLATE_MISSING 守卫上线）\"}','2026-07-11 01:28:29'),
(32094,45578,3,1,7,'expire',NULL,'system','auto_expire','expire_45578:in','{\"reason\": \"换物产出缺陷物品作废：产出商品未挂 item_template_id 被误当券铸造（2026-07-11 根因已修复，BARTER_OUTPUT_TEMPLATE_MISSING 守卫上线）\"}','2026-07-11 01:28:29'),
(32095,45579,7,-1,3,'expire',NULL,'system','auto_expire','expire_45579:out','{\"reason\": \"换物产出缺陷物品作废：产出商品未挂 item_template_id 被误当券铸造（2026-07-11 根因已修复，BARTER_OUTPUT_TEMPLATE_MISSING 守卫上线）\"}','2026-07-11 01:28:29'),
(32096,45579,3,1,7,'expire',NULL,'system','auto_expire','expire_45579:in','{\"reason\": \"换物产出缺陷物品作废：产出商品未挂 item_template_id 被误当券铸造（2026-07-11 根因已修复，BARTER_OUTPUT_TEMPLATE_MISSING 守卫上线）\"}','2026-07-11 01:28:29'),
(32097,45586,7,-1,3,'expire',NULL,'system','auto_expire','expire_45586:out','{\"reason\": \"换物产出缺陷物品作废：产出商品未挂 item_template_id 被误当券铸造（2026-07-11 根因已修复，BARTER_OUTPUT_TEMPLATE_MISSING 守卫上线）\"}','2026-07-11 01:28:29'),
(32098,45586,3,1,7,'expire',NULL,'system','auto_expire','expire_45586:in','{\"reason\": \"换物产出缺陷物品作废：产出商品未挂 item_template_id 被误当券铸造（2026-07-11 根因已修复，BARTER_OUTPUT_TEMPLATE_MISSING 守卫上线）\"}','2026-07-11 01:28:29'),
(32099,45587,7,-1,3,'expire',NULL,'system','auto_expire','expire_45587:out','{\"reason\": \"换物产出缺陷物品作废：产出商品未挂 item_template_id 被误当券铸造（2026-07-11 根因已修复，BARTER_OUTPUT_TEMPLATE_MISSING 守卫上线）\"}','2026-07-11 01:28:29'),
(32100,45587,3,1,7,'expire',NULL,'system','auto_expire','expire_45587:in','{\"reason\": \"换物产出缺陷物品作废：产出商品未挂 item_template_id 被误当券铸造（2026-07-11 根因已修复，BARTER_OUTPUT_TEMPLATE_MISSING 守卫上线）\"}','2026-07-11 01:28:29'),
(32101,45594,7,-1,3,'expire',NULL,'system','auto_expire','expire_45594:out','{\"reason\": \"换物产出缺陷物品作废：产出商品未挂 item_template_id 被误当券铸造（2026-07-11 根因已修复，BARTER_OUTPUT_TEMPLATE_MISSING 守卫上线）\"}','2026-07-11 01:28:29'),
(32102,45594,3,1,7,'expire',NULL,'system','auto_expire','expire_45594:in','{\"reason\": \"换物产出缺陷物品作废：产出商品未挂 item_template_id 被误当券铸造（2026-07-11 根因已修复，BARTER_OUTPUT_TEMPLATE_MISSING 守卫上线）\"}','2026-07-11 01:28:29'),
(32103,45595,7,-1,3,'expire',NULL,'system','auto_expire','expire_45595:out','{\"reason\": \"换物产出缺陷物品作废：产出商品未挂 item_template_id 被误当券铸造（2026-07-11 根因已修复，BARTER_OUTPUT_TEMPLATE_MISSING 守卫上线）\"}','2026-07-11 01:28:29'),
(32104,45595,3,1,7,'expire',NULL,'system','auto_expire','expire_45595:in','{\"reason\": \"换物产出缺陷物品作废：产出商品未挂 item_template_id 被误当券铸造（2026-07-11 根因已修复，BARTER_OUTPUT_TEMPLATE_MISSING 守卫上线）\"}','2026-07-11 01:28:29'),
(32127,45604,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783705488896_success:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783705488896\", \"source_ref_id\": \"698\", \"consumed_item_ids\": [\"45598\"]}','2026-07-11 01:44:51'),
(32128,45604,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783705488896_success:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783705488896\", \"source_ref_id\": \"698\", \"consumed_item_ids\": [\"45598\"]}','2026-07-11 01:44:51'),
(32131,45605,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783705488896_limit2:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783705488896\", \"source_ref_id\": \"698\", \"consumed_item_ids\": [\"45599\"]}','2026-07-11 01:44:51'),
(32132,45605,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783705488896_limit2:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783705488896\", \"source_ref_id\": \"698\", \"consumed_item_ids\": [\"45599\"]}','2026-07-11 01:44:51'),
(32161,45615,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783705733622_success:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783705733622\", \"source_ref_id\": \"720\", \"consumed_item_ids\": [\"45609\"]}','2026-07-11 01:48:54'),
(32162,45615,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783705733622_success:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783705733622\", \"source_ref_id\": \"720\", \"consumed_item_ids\": [\"45609\"]}','2026-07-11 01:48:54'),
(32165,45616,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783705733622_limit2:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783705733622\", \"source_ref_id\": \"720\", \"consumed_item_ids\": [\"45610\"]}','2026-07-11 01:48:54'),
(32166,45616,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783705733622_limit2:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783705733622\", \"source_ref_id\": \"720\", \"consumed_item_ids\": [\"45610\"]}','2026-07-11 01:48:54'),
(32183,45623,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783705774978_success:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783705774978\", \"source_ref_id\": \"724\", \"consumed_item_ids\": [\"45617\"]}','2026-07-11 01:49:36'),
(32184,45623,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783705774978_success:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783705774978\", \"source_ref_id\": \"724\", \"consumed_item_ids\": [\"45617\"]}','2026-07-11 01:49:36'),
(32187,45624,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783705774978_limit2:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783705774978\", \"source_ref_id\": \"724\", \"consumed_item_ids\": [\"45618\"]}','2026-07-11 01:49:36'),
(32188,45624,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783705774978_limit2:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783705774978\", \"source_ref_id\": \"724\", \"consumed_item_ids\": [\"45618\"]}','2026-07-11 01:49:36'),
(32205,45631,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783706006922_success:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783706006922\", \"source_ref_id\": \"728\", \"consumed_item_ids\": [\"45625\"]}','2026-07-11 01:53:28'),
(32206,45631,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783706006922_success:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783706006922\", \"source_ref_id\": \"728\", \"consumed_item_ids\": [\"45625\"]}','2026-07-11 01:53:28'),
(32209,45632,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783706006922_limit2:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783706006922\", \"source_ref_id\": \"728\", \"consumed_item_ids\": [\"45626\"]}','2026-07-11 01:53:28'),
(32210,45632,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783706006922_limit2:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783706006922\", \"source_ref_id\": \"728\", \"consumed_item_ids\": [\"45626\"]}','2026-07-11 01:53:28'),
(32231,45640,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783707336967_success:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783707336967\", \"source_ref_id\": \"743\", \"consumed_item_ids\": [\"45634\"]}','2026-07-11 02:15:39'),
(32232,45640,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783707336967_success:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783707336967\", \"source_ref_id\": \"743\", \"consumed_item_ids\": [\"45634\"]}','2026-07-11 02:15:39'),
(32235,45641,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783707336967_limit2:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783707336967\", \"source_ref_id\": \"743\", \"consumed_item_ids\": [\"45635\"]}','2026-07-11 02:15:39'),
(32236,45641,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783707336967_limit2:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783707336967\", \"source_ref_id\": \"743\", \"consumed_item_ids\": [\"45635\"]}','2026-07-11 02:15:39'),
(32253,45648,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783707625396_success:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783707625396\", \"source_ref_id\": \"747\", \"consumed_item_ids\": [\"45642\"]}','2026-07-11 02:20:28'),
(32254,45648,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783707625396_success:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783707625396\", \"source_ref_id\": \"747\", \"consumed_item_ids\": [\"45642\"]}','2026-07-11 02:20:28'),
(32257,45649,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783707625396_limit2:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783707625396\", \"source_ref_id\": \"747\", \"consumed_item_ids\": [\"45643\"]}','2026-07-11 02:20:28'),
(32258,45649,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783707625396_limit2:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783707625396\", \"source_ref_id\": \"747\", \"consumed_item_ids\": [\"45643\"]}','2026-07-11 02:20:28'),
(32279,45657,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783710430538_success:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783710430538\", \"source_ref_id\": \"763\", \"consumed_item_ids\": [\"45651\"]}','2026-07-11 03:07:13'),
(32280,45657,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783710430538_success:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783710430538\", \"source_ref_id\": \"763\", \"consumed_item_ids\": [\"45651\"]}','2026-07-11 03:07:13'),
(32283,45658,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783710430538_limit2:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783710430538\", \"source_ref_id\": \"763\", \"consumed_item_ids\": [\"45652\"]}','2026-07-11 03:07:13'),
(32284,45658,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783710430538_limit2:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783710430538\", \"source_ref_id\": \"763\", \"consumed_item_ids\": [\"45652\"]}','2026-07-11 03:07:13'),
(32313,45680,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783732007915_success:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783732007915\", \"source_ref_id\": \"789\", \"consumed_item_ids\": [\"45674\"]}','2026-07-11 09:06:49'),
(32314,45680,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783732007915_success:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783732007915\", \"source_ref_id\": \"789\", \"consumed_item_ids\": [\"45674\"]}','2026-07-11 09:06:49'),
(32317,45681,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783732007915_limit2:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783732007915\", \"source_ref_id\": \"789\", \"consumed_item_ids\": [\"45675\"]}','2026-07-11 09:06:49'),
(32318,45681,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783732007915_limit2:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783732007915\", \"source_ref_id\": \"789\", \"consumed_item_ids\": [\"45675\"]}','2026-07-11 09:06:49'),
(32351,45724,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783734008490_success:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783734008490\", \"source_ref_id\": \"803\", \"consumed_item_ids\": [\"45718\"]}','2026-07-11 09:40:09'),
(32352,45724,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783734008490_success:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783734008490\", \"source_ref_id\": \"803\", \"consumed_item_ids\": [\"45718\"]}','2026-07-11 09:40:09'),
(32355,45725,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783734008490_limit2:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783734008490\", \"source_ref_id\": \"803\", \"consumed_item_ids\": [\"45719\"]}','2026-07-11 09:40:09'),
(32356,45725,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783734008490_limit2:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783734008490\", \"source_ref_id\": \"803\", \"consumed_item_ids\": [\"45719\"]}','2026-07-11 09:40:09'),
(32389,45768,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783735183178_success:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783735183178\", \"source_ref_id\": \"817\", \"consumed_item_ids\": [\"45762\"]}','2026-07-11 09:59:44'),
(32390,45768,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783735183178_success:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783735183178\", \"source_ref_id\": \"817\", \"consumed_item_ids\": [\"45762\"]}','2026-07-11 09:59:44'),
(32393,45769,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783735183178_limit2:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783735183178\", \"source_ref_id\": \"817\", \"consumed_item_ids\": [\"45763\"]}','2026-07-11 09:59:44'),
(32394,45769,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1783735183178_limit2:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1783735183178\", \"source_ref_id\": \"817\", \"consumed_item_ids\": [\"45763\"]}','2026-07-11 09:59:44'),
(32449,45829,2,-1,7,'mint',NULL,'system','test_mint','barter_test_mint_1784122021581_v0:out','{\"source\": \"test\", \"source_ref_id\": \"barter_contract_test\"}','2026-07-15 21:27:02'),
(32450,45829,7,1,2,'mint',NULL,'system','test_mint','barter_test_mint_1784122021581_v0:in','{\"source\": \"test\", \"source_ref_id\": \"barter_contract_test\"}','2026-07-15 21:27:02'),
(32451,45830,2,-1,7,'mint',NULL,'system','test_mint','barter_test_mint_1784122021581_v1:out','{\"source\": \"test\", \"source_ref_id\": \"barter_contract_test\"}','2026-07-15 21:27:02'),
(32452,45830,7,1,2,'mint',NULL,'system','test_mint','barter_test_mint_1784122021581_v1:in','{\"source\": \"test\", \"source_ref_id\": \"barter_contract_test\"}','2026-07-15 21:27:02'),
(32453,45831,2,-1,7,'mint',NULL,'system','test_mint','barter_test_mint_1784122021581_v2:out','{\"source\": \"test\", \"source_ref_id\": \"barter_contract_test\"}','2026-07-15 21:27:02'),
(32454,45831,7,1,2,'mint',NULL,'system','test_mint','barter_test_mint_1784122021581_v2:in','{\"source\": \"test\", \"source_ref_id\": \"barter_contract_test\"}','2026-07-15 21:27:02'),
(32455,45832,2,-1,7,'mint',NULL,'system','test_mint','barter_test_mint_1784122021581_v3:out','{\"source\": \"test\", \"source_ref_id\": \"barter_contract_test\"}','2026-07-15 21:27:02'),
(32456,45832,7,1,2,'mint',NULL,'system','test_mint','barter_test_mint_1784122021581_v3:in','{\"source\": \"test\", \"source_ref_id\": \"barter_contract_test\"}','2026-07-15 21:27:02'),
(32457,45833,2,-1,7,'mint',NULL,'system','test_mint','barter_test_mint_1784122021581_p0:out','{\"source\": \"test\", \"source_ref_id\": \"barter_contract_test\"}','2026-07-15 21:27:02'),
(32458,45833,7,1,2,'mint',NULL,'system','test_mint','barter_test_mint_1784122021581_p0:in','{\"source\": \"test\", \"source_ref_id\": \"barter_contract_test\"}','2026-07-15 21:27:02'),
(32459,45834,2,-1,7,'mint',NULL,'system','test_mint','barter_test_mint_1784122021581_p1:out','{\"source\": \"test\", \"source_ref_id\": \"barter_contract_test\"}','2026-07-15 21:27:02'),
(32460,45834,7,1,2,'mint',NULL,'system','test_mint','barter_test_mint_1784122021581_p1:in','{\"source\": \"test\", \"source_ref_id\": \"barter_contract_test\"}','2026-07-15 21:27:02'),
(32461,45829,7,-1,3,'use',32,'user','barter_consume','barter_consume_barter_test_1784122021581_success_45829:out','{\"recipe_code\": \"test_barter_voucher_1784122021581\", \"output_exchange_item_id\": 835}','2026-07-15 21:27:02'),
(32462,45829,3,1,7,'use',32,'user','barter_consume','barter_consume_barter_test_1784122021581_success_45829:in','{\"recipe_code\": \"test_barter_voucher_1784122021581\", \"output_exchange_item_id\": 835}','2026-07-15 21:27:02'),
(32463,45835,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1784122021581_success:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1784122021581\", \"source_ref_id\": \"835\", \"consumed_item_ids\": [\"45829\"]}','2026-07-15 21:27:02'),
(32464,45835,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1784122021581_success:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1784122021581\", \"source_ref_id\": \"835\", \"consumed_item_ids\": [\"45829\"]}','2026-07-15 21:27:02'),
(32465,45830,7,-1,3,'use',32,'user','barter_consume','barter_consume_barter_test_1784122021581_limit2_45830:out','{\"recipe_code\": \"test_barter_voucher_1784122021581\", \"output_exchange_item_id\": 835}','2026-07-15 21:27:02'),
(32466,45830,3,1,7,'use',32,'user','barter_consume','barter_consume_barter_test_1784122021581_limit2_45830:in','{\"recipe_code\": \"test_barter_voucher_1784122021581\", \"output_exchange_item_id\": 835}','2026-07-15 21:27:02'),
(32467,45836,2,-1,7,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1784122021581_limit2:out','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1784122021581\", \"source_ref_id\": \"835\", \"consumed_item_ids\": [\"45830\"]}','2026-07-15 21:27:02'),
(32468,45836,7,1,2,'mint',NULL,'system','barter_mint','barter_mint_barter_test_1784122021581_limit2:in','{\"source\": \"barter\", \"recipe_code\": \"test_barter_voucher_1784122021581\", \"source_ref_id\": \"835\", \"consumed_item_ids\": [\"45830\"]}','2026-07-15 21:27:02'),
(32469,45833,7,-1,3,'use',32,'user','barter_consume','barter_consume_barter_test_1784122021581_physical_45833:out','{\"recipe_code\": \"test_barter_physical_1784122021581\", \"output_exchange_item_id\": 837}','2026-07-15 21:27:02'),
(32470,45833,3,1,7,'use',32,'user','barter_consume','barter_consume_barter_test_1784122021581_physical_45833:in','{\"recipe_code\": \"test_barter_physical_1784122021581\", \"output_exchange_item_id\": 837}','2026-07-15 21:27:02');
/*!40000 ALTER TABLE `item_ledger` ENABLE KEYS */;
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
