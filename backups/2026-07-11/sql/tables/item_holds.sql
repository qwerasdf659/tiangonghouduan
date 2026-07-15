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
-- Table structure for table `item_holds`
--

DROP TABLE IF EXISTS `item_holds`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `item_holds` (
  `hold_id` bigint NOT NULL AUTO_INCREMENT COMMENT '锁定记录ID（主键，自增）',
  `item_id` bigint NOT NULL COMMENT '物品ID（关联 items.item_id）',
  `hold_type` enum('trade','redemption','security','trade_cooldown') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '锁定类型：trade=交易锁 redemption=核销锁 security=安全锁 trade_cooldown=交易冷却期',
  `holder_ref` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '持有者引用（trade_order_id / redemption_order_id / risk_case_id）',
  `priority` tinyint NOT NULL DEFAULT '1' COMMENT '锁优先级：trade=1, redemption=2, security=3（高优先级可覆盖低优先级）',
  `status` enum('active','released','expired','overridden') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '锁状态：active=生效中, released=已释放, expired=已过期, overridden=被覆盖',
  `reason` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '锁定原因说明',
  `expires_at` datetime DEFAULT NULL COMMENT '过期时间（NULL=永不过期，仅security类型）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `released_at` datetime DEFAULT NULL COMMENT '释放时间（released/expired/overridden 时记录）',
  PRIMARY KEY (`hold_id`),
  KEY `idx_holds_item` (`item_id`,`status`),
  KEY `idx_holds_active_expiry` (`status`,`expires_at`),
  KEY `idx_holds_holder` (`holder_ref`),
  CONSTRAINT `item_holds_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `items` (`item_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2642 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='物品锁定记录表（替代 item_instances.locks JSON 字段，可索引、可查询）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `item_holds`
--

LOCK TABLES `item_holds` WRITE;
/*!40000 ALTER TABLE `item_holds` DISABLE KEYS */;
INSERT INTO `item_holds` VALUES
(2594,45462,'redemption','5cb26a11-4a54-465d-938d-ab82aa7d3b40',2,'released','兑换订单锁定','2026-07-22 07:41:09','2026-06-22 07:41:09','2026-06-22 07:41:09'),
(2595,45463,'redemption','1b0a8f42-4d9a-473f-8d5d-8d0bb8f991d5',2,'active','兑换订单锁定','2026-07-22 07:41:09','2026-06-22 07:41:09',NULL),
(2597,45465,'redemption','5fda8097-fcaf-428e-97fd-e1edf175aa59',2,'released','兑换订单锁定','2026-07-22 07:41:09','2026-06-22 07:41:09','2026-06-22 07:41:09'),
(2598,45466,'redemption','dda7bff4-acb2-44a8-aa7f-125e0093f611',2,'active','兑换订单锁定','2026-07-22 07:41:09','2026-06-22 07:41:09',NULL),
(2613,45483,'redemption','446dc570-b4eb-4a81-bf29-7f2a799005e4',2,'released','兑换订单锁定','2026-07-24 20:40:26','2026-06-24 20:40:26','2026-06-24 20:40:27'),
(2614,45484,'redemption','cbe53507-8c35-465d-a4b6-220c8a834f2f',2,'active','兑换订单锁定','2026-07-24 20:40:26','2026-06-24 20:40:26',NULL),
(2616,45486,'redemption','38b87541-c772-4dc0-a952-d0dc6a534d64',2,'released','兑换订单锁定','2026-07-24 20:40:27','2026-06-24 20:40:27','2026-06-24 20:40:27'),
(2617,45487,'redemption','09c169c5-7eb5-486d-b6f2-b1a88dd55530',2,'active','兑换订单锁定','2026-07-24 20:40:27','2026-06-24 20:40:27',NULL),
(2622,45486,'redemption','f59824e6-042f-422b-87ea-acf8e8298a2a',2,'active','兑换订单锁定','2026-08-05 03:33:08','2026-07-06 03:33:08',NULL),
(2633,45516,'redemption','3cbc4c9c-bb92-43f8-84fc-3bdf3f0690e4',2,'released','兑换订单锁定','2026-08-05 03:34:40','2026-07-06 03:34:40','2026-07-06 03:34:40'),
(2634,45517,'redemption','efc39044-e3f5-408b-92f2-509c28e6f47d',2,'active','兑换订单锁定','2026-08-05 03:34:40','2026-07-06 03:34:40',NULL),
(2636,45519,'redemption','a25c46bb-9f40-48f3-94d9-46de023db8bd',2,'released','兑换订单锁定','2026-08-05 03:34:40','2026-07-06 03:34:40','2026-07-06 03:34:40'),
(2637,45520,'redemption','21e52b0c-5db4-4181-804d-e0e8b24135b5',2,'active','兑换订单锁定','2026-08-05 03:34:40','2026-07-06 03:34:40',NULL);
/*!40000 ALTER TABLE `item_holds` ENABLE KEYS */;
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
