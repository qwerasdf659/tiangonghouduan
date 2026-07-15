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
-- Table structure for table `redemption_orders`
--

DROP TABLE IF EXISTS `redemption_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `redemption_orders` (
  `redemption_order_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code_hash` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '核销码哈希（Code Hash）：12位Base32核销码的SHA-256哈希值（64位hex字符串），用于验证核销码，不存储明文',
  `item_id` bigint NOT NULL,
  `redeemer_user_id` int DEFAULT NULL COMMENT '核销用户ID（Redeemer User ID）：执行核销操作的用户ID，外键指向 users.user_id，核销前为NULL',
  `status` enum('pending','fulfilled','cancelled','expired') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '订单状态（Status）：pending-待核销 | fulfilled-已核销 | cancelled-已取消 | expired-已过期',
  `expires_at` datetime NOT NULL COMMENT '过期时间（Expires At）：核销码过期时间，创建后30天，北京时间',
  `fulfilled_at` datetime DEFAULT NULL COMMENT '核销时间（Fulfilled At）：实际核销时间，北京时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（Created At）：记录创建时间，北京时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（Updated At）：记录最后更新时间，北京时间',
  `fulfilled_store_id` int DEFAULT NULL COMMENT '核销门店ID（Fulfilled Store ID）：记录核销发生在哪个门店',
  `fulfilled_by_staff_id` bigint DEFAULT NULL COMMENT '核销员工ID（Fulfilled By Staff ID）：执行核销操作的门店员工',
  `redemption_seq` int unsigned NOT NULL AUTO_INCREMENT,
  `order_no` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '核销订单号（RD 前缀）',
  `scoped_store_id_list` json DEFAULT NULL COMMENT '核销允许门店集合，生成核销码时从商品固化；NULL=通用券任意门店可核',
  PRIMARY KEY (`redemption_order_id`),
  UNIQUE KEY `code_hash` (`code_hash`),
  UNIQUE KEY `redemption_seq` (`redemption_seq`),
  UNIQUE KEY `uk_redemption_orders_order_no` (`order_no`),
  KEY `idx_status_expires` (`status`,`expires_at`),
  KEY `idx_redeemer` (`redeemer_user_id`),
  KEY `idx_fulfilled_store` (`fulfilled_store_id`),
  KEY `idx_fulfilled_staff` (`fulfilled_by_staff_id`),
  KEY `idx_redemption_orders_item_id` (`item_id`),
  KEY `idx_redemption_orders_item_status` (`item_id`,`status`),
  CONSTRAINT `fk_redemption_orders_item_id` FOREIGN KEY (`item_id`) REFERENCES `items` (`item_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `redemption_orders_fulfilled_by_staff_id_foreign_idx` FOREIGN KEY (`fulfilled_by_staff_id`) REFERENCES `store_staff` (`store_staff_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `redemption_orders_fulfilled_store_id_foreign_idx` FOREIGN KEY (`fulfilled_store_id`) REFERENCES `stores` (`store_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `redemption_orders_ibfk_2` FOREIGN KEY (`redeemer_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2561 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='兑换订单表（Redemption Orders）：管理核销码生成和核销流程，替代 UserInventory.verification_code';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `redemption_orders`
--

LOCK TABLES `redemption_orders` WRITE;
/*!40000 ALTER TABLE `redemption_orders` DISABLE KEYS */;
INSERT INTO `redemption_orders` VALUES
('09c169c5-7eb5-486d-b6f2-b1a88dd55530','93a44a7d2609f2fe0eeace8f24aeac884f9c21c0bf62737cd26fcf9d9f5cb287',45487,NULL,'pending','2026-07-24 20:40:27',NULL,'2026-06-24 20:40:27','2026-06-24 20:40:27',NULL,NULL,2536,'RD26062400253690',NULL),
('1b0a8f42-4d9a-473f-8d5d-8d0bb8f991d5','ddd639d1d2d760fec3cb915e723b868e27542a6ba156cfe45de0c1afcfdc5581',45463,NULL,'pending','2026-07-22 07:41:09',NULL,'2026-06-22 07:41:09','2026-06-22 07:41:09',NULL,NULL,2514,'RD26062200251403',NULL),
('21e52b0c-5db4-4181-804d-e0e8b24135b5','1088d1927d551419ac9772d80793f74f8eff5e77195e3154f40231d0fb6abdcf',45520,NULL,'pending','2026-08-05 03:34:40',NULL,'2026-07-06 03:34:40','2026-07-06 03:34:40',NULL,NULL,2556,'RD260706002556E5',NULL),
('38b87541-c772-4dc0-a952-d0dc6a534d64','e717ff133f74be91b7be5edc11390f7a08f0c17356734e5bc873235c427cc8b9',45486,NULL,'expired','2026-06-23 20:40:27',NULL,'2026-06-24 20:40:27','2026-06-24 20:40:27',NULL,NULL,2535,'RD2606240025353C',NULL),
('3cbc4c9c-bb92-43f8-84fc-3bdf3f0690e4','73b5721f0044fbf370c78ca77b1b417e1085f7d364e41215c74e5f00643d2723',45516,NULL,'expired','2026-07-05 03:34:40',NULL,'2026-07-06 03:34:40','2026-07-06 03:34:40',NULL,NULL,2552,'RD2607060025521D',NULL),
('446dc570-b4eb-4a81-bf29-7f2a799005e4','73b76f61ee7a338cd9abf3991f0a69538259a4105dac910d64f9a5801758e9b1',45483,NULL,'expired','2026-06-23 20:40:26',NULL,'2026-06-24 20:40:26','2026-06-24 20:40:27',NULL,NULL,2532,'RD260624002532BB',NULL),
('5cb26a11-4a54-465d-938d-ab82aa7d3b40','a82dc6e82f8c521c3f5dd3f28007f8e82abed1cee785b5945f0f89e5ac0685b9',45462,NULL,'expired','2026-06-21 07:41:09',NULL,'2026-06-22 07:41:09','2026-06-22 07:41:09',NULL,NULL,2513,'RD260622002513E2',NULL),
('5fda8097-fcaf-428e-97fd-e1edf175aa59','82aa0b4584ced1208356267cbcdc7f25c142ffc9cf7ee565bca7fda6dc7e96de',45465,NULL,'expired','2026-06-21 07:41:09',NULL,'2026-06-22 07:41:09','2026-06-22 07:41:09',NULL,NULL,2516,'RD2606220025167C',NULL),
('a25c46bb-9f40-48f3-94d9-46de023db8bd','e1f33682a01c4833c6175c1319e74bfc60b47f7977ffb200c70499ca8ab8acbe',45519,NULL,'expired','2026-07-05 03:34:40',NULL,'2026-07-06 03:34:40','2026-07-06 03:34:40',NULL,NULL,2555,'RD260706002555A3',NULL),
('cbe53507-8c35-465d-a4b6-220c8a834f2f','4b6554f222133425d9bcdd1d4484f50bdb752972d20e4251700b9f1b1b7e9bb4',45484,NULL,'pending','2026-07-24 20:40:26',NULL,'2026-06-24 20:40:26','2026-06-24 20:40:26',NULL,NULL,2533,'RD260624002533C4',NULL),
('dda7bff4-acb2-44a8-aa7f-125e0093f611','36962e1003092769a2e7366c123fdc806efa9605854d35bb965873c2aa0b95d7',45466,NULL,'pending','2026-07-22 07:41:09',NULL,'2026-06-22 07:41:09','2026-06-22 07:41:09',NULL,NULL,2517,'RD2606220025172C',NULL),
('efc39044-e3f5-408b-92f2-509c28e6f47d','44fd02cf5d373f41c8d97f4ce88dd9841c505342d408f9884f358be27be4bf7c',45517,NULL,'pending','2026-08-05 03:34:40',NULL,'2026-07-06 03:34:40','2026-07-06 03:34:40',NULL,NULL,2553,'RD26070600255320',NULL),
('f59824e6-042f-422b-87ea-acf8e8298a2a','1e4394e48929113d7646c1db7ad473a3342373cb55192d9c9c32ed2a76902aa7',45486,NULL,'pending','2026-08-05 03:33:08',NULL,'2026-07-06 03:33:08','2026-07-06 03:33:08',NULL,NULL,2541,'RD26070600254109',NULL);
/*!40000 ALTER TABLE `redemption_orders` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-10 18:10:59
