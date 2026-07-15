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
-- Table structure for table `exchange_order_events`
--

DROP TABLE IF EXISTS `exchange_order_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `exchange_order_events` (
  `event_id` bigint NOT NULL AUTO_INCREMENT COMMENT '事件ID',
  `order_no` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '订单号（关联 exchange_records.order_no）',
  `old_status` enum('pending','approved','shipped','received','rated','rejected','refunded','cancelled','completed') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '变更前状态（首次创建时为NULL）',
  `new_status` enum('pending','approved','shipped','received','rated','rejected','refunded','cancelled','completed') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '变更后状态',
  `operator_id` int NOT NULL COMMENT '操作人ID（用户/管理员/系统）',
  `operator_type` enum('user','admin','system') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '操作人类型：user=用户 | admin=管理员 | system=系统定时任务',
  `reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '变更原因/备注',
  `metadata` json DEFAULT NULL COMMENT '额外元数据（退款信息、快照等）',
  `idempotency_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '幂等键（防止重复事件写入）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`event_id`),
  UNIQUE KEY `idempotency_key` (`idempotency_key`),
  KEY `idx_exchange_order_events_order_no` (`order_no`),
  KEY `idx_exchange_order_events_operator_id` (`operator_id`),
  KEY `idx_exchange_order_events_status_time` (`new_status`,`created_at`),
  CONSTRAINT `exchange_order_events_ibfk_2` FOREIGN KEY (`operator_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `exchange_order_events_order_no_fk` FOREIGN KEY (`order_no`) REFERENCES `exchange_records` (`order_no`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1015 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='兑换订单状态变更事件表（审计追踪）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `exchange_order_events`
--

LOCK TABLES `exchange_order_events` WRITE;
/*!40000 ALTER TABLE `exchange_order_events` DISABLE KEYS */;
INSERT INTO `exchange_order_events` VALUES
(941,'EM2606220012973F',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": 508, \"quantity\": 1, \"pay_amount\": 1000, \"is_prop_order\": false, \"minted_item_id\": null, \"exchange_item_id\": 637, \"fulfillment_type\": \"physical\"}','order_event_EM2606220012973F_pending_32_1782140463','2026-06-22 23:01:03'),
(942,'EM260622001298F9',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": 508, \"quantity\": 1, \"pay_amount\": 1000, \"is_prop_order\": false, \"minted_item_id\": null, \"exchange_item_id\": 637, \"fulfillment_type\": \"physical\"}','order_event_EM260622001298F9_pending_32_1782140470','2026-06-22 23:01:10'),
(943,'EM260624001299D6',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": 508, \"quantity\": 1, \"pay_amount\": 1000, \"is_prop_order\": false, \"minted_item_id\": null, \"exchange_item_id\": 637, \"fulfillment_type\": \"physical\"}','order_event_EM260624001299D6_pending_32_1782241961','2026-06-24 03:12:41'),
(944,'EM26062400130032',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": 508, \"quantity\": 1, \"pay_amount\": 1000, \"is_prop_order\": false, \"minted_item_id\": null, \"exchange_item_id\": 637, \"fulfillment_type\": \"physical\"}','order_event_EM26062400130032_pending_32_1782241969','2026-06-24 03:12:49'),
(945,'EM260624001301FB',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": 508, \"quantity\": 1, \"pay_amount\": 1000, \"is_prop_order\": false, \"minted_item_id\": null, \"exchange_item_id\": 637, \"fulfillment_type\": \"physical\"}','order_event_EM260624001301FB_pending_32_1782244162','2026-06-24 03:49:22'),
(946,'EM26062400130259',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": 508, \"quantity\": 1, \"pay_amount\": 1000, \"is_prop_order\": false, \"minted_item_id\": null, \"exchange_item_id\": 637, \"fulfillment_type\": \"physical\"}','order_event_EM26062400130259_pending_32_1782244166','2026-06-24 03:49:26'),
(947,'EM260624001303E5',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": 508, \"quantity\": 1, \"pay_amount\": 1000, \"is_prop_order\": false, \"minted_item_id\": null, \"exchange_item_id\": 637, \"fulfillment_type\": \"physical\"}','order_event_EM260624001303E5_pending_32_1782249047','2026-06-24 05:10:47'),
(948,'EM2606240013047F',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": 508, \"quantity\": 1, \"pay_amount\": 1000, \"is_prop_order\": false, \"minted_item_id\": null, \"exchange_item_id\": 637, \"fulfillment_type\": \"physical\"}','order_event_EM2606240013047F_pending_32_1782249051','2026-06-24 05:10:51'),
(949,'EM26062400130531',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": 508, \"quantity\": 1, \"pay_amount\": 1000, \"is_prop_order\": false, \"minted_item_id\": null, \"exchange_item_id\": 637, \"fulfillment_type\": \"physical\"}','order_event_EM26062400130531_pending_32_1782249726','2026-06-24 05:22:06'),
(950,'EM2606240013064F',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": 504, \"quantity\": 1, \"pay_amount\": 100, \"is_prop_order\": false, \"minted_item_id\": null, \"exchange_item_id\": 633, \"fulfillment_type\": \"physical\"}','order_event_EM2606240013064F_pending_32_1782250451','2026-06-24 05:34:11'),
(951,'EM26062400130741',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": 508, \"quantity\": 1, \"pay_amount\": 1000, \"is_prop_order\": false, \"minted_item_id\": null, \"exchange_item_id\": 637, \"fulfillment_type\": \"physical\"}','order_event_EM26062400130741_pending_32_1782250606','2026-06-24 05:36:46'),
(952,'EM26062400130853',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": 508, \"quantity\": 1, \"pay_amount\": 1000, \"is_prop_order\": false, \"minted_item_id\": null, \"exchange_item_id\": 637, \"fulfillment_type\": \"physical\"}','order_event_EM26062400130853_pending_32_1782250616','2026-06-24 05:36:56'),
(953,'EM260624001309E2',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": 508, \"quantity\": 1, \"pay_amount\": 1000, \"is_prop_order\": false, \"minted_item_id\": null, \"exchange_item_id\": 637, \"fulfillment_type\": \"physical\"}','order_event_EM260624001309E2_pending_32_1782250788','2026-06-24 05:39:48'),
(954,'EM26062400131018',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": 508, \"quantity\": 1, \"pay_amount\": 1000, \"is_prop_order\": false, \"minted_item_id\": null, \"exchange_item_id\": 637, \"fulfillment_type\": \"physical\"}','order_event_EM26062400131018_pending_32_1782250836','2026-06-24 05:40:36'),
(955,'EM26062400131158',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": 508, \"quantity\": 1, \"pay_amount\": 1000, \"is_prop_order\": false, \"minted_item_id\": null, \"exchange_item_id\": 637, \"fulfillment_type\": \"physical\"}','order_event_EM26062400131158_pending_32_1782251323','2026-06-24 05:48:43'),
(956,'EM2606240013127A',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": 508, \"quantity\": 1, \"pay_amount\": 1000, \"is_prop_order\": false, \"minted_item_id\": null, \"exchange_item_id\": 637, \"fulfillment_type\": \"physical\"}','order_event_EM2606240013127A_pending_32_1782251743','2026-06-24 05:55:43'),
(964,'EM260624001320D8',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": 504, \"quantity\": 1, \"pay_amount\": 100, \"is_prop_order\": false, \"minted_item_id\": null, \"exchange_item_id\": 633, \"fulfillment_type\": \"physical\"}','order_event_EM260624001320D8_pending_32_1782255628','2026-06-24 07:00:28'),
(965,'EM260626001321BF',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": 508, \"quantity\": 1, \"pay_amount\": 1000, \"is_prop_order\": false, \"minted_item_id\": null, \"exchange_item_id\": 637, \"fulfillment_type\": \"physical\"}','order_event_EM260626001321BF_pending_32_1782425948','2026-06-26 06:19:08'),
(966,'EM2606260013225C',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": 508, \"quantity\": 1, \"pay_amount\": 1000, \"is_prop_order\": false, \"minted_item_id\": null, \"exchange_item_id\": 637, \"fulfillment_type\": \"physical\"}','order_event_EM2606260013225C_pending_32_1782425955','2026-06-26 06:19:15'),
(967,'EM26062800132305',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": 508, \"quantity\": 1, \"pay_amount\": 1000, \"is_prop_order\": false, \"minted_item_id\": null, \"exchange_item_id\": 637, \"fulfillment_type\": \"physical\"}','order_event_EM26062800132305_pending_32_1782652691','2026-06-28 21:18:11'),
(968,'EM2606280013247A',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": 508, \"quantity\": 1, \"pay_amount\": 1000, \"is_prop_order\": false, \"minted_item_id\": null, \"exchange_item_id\": 637, \"fulfillment_type\": \"physical\"}','order_event_EM2606280013247A_pending_32_1782652732','2026-06-28 21:18:52'),
(969,'EM26062800132538',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": 508, \"quantity\": 1, \"pay_amount\": 1000, \"is_prop_order\": false, \"minted_item_id\": null, \"exchange_item_id\": 637, \"fulfillment_type\": \"physical\"}','order_event_EM26062800132538_pending_32_1782652749','2026-06-28 21:19:09'),
(977,'EM26062800133325',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": 508, \"quantity\": 1, \"pay_amount\": 1000, \"is_prop_order\": false, \"minted_item_id\": null, \"exchange_item_id\": 637, \"fulfillment_type\": \"physical\"}','order_event_EM26062800133325_pending_32_1782658183','2026-06-28 22:49:43'),
(978,'EM26062800133425',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": 504, \"quantity\": 1, \"pay_amount\": 100, \"is_prop_order\": false, \"minted_item_id\": null, \"exchange_item_id\": 633, \"fulfillment_type\": \"physical\"}','order_event_EM26062800133425_pending_32_1782658191','2026-06-28 22:49:51'),
(979,'EM26062800133589',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": 508, \"quantity\": 1, \"pay_amount\": 1000, \"is_prop_order\": false, \"minted_item_id\": null, \"exchange_item_id\": 637, \"fulfillment_type\": \"physical\"}','order_event_EM26062800133589_pending_32_1782661228','2026-06-28 23:40:28'),
(980,'EM260629001336EE',NULL,'pending',12803,'user','用户兑换商品','{\"sku_id\": 504, \"quantity\": 1, \"pay_amount\": 100, \"is_prop_order\": false, \"minted_item_id\": null, \"exchange_item_id\": 633, \"fulfillment_type\": \"physical\"}','order_event_EM260629001336EE_pending_12803_1782663146','2026-06-29 00:12:26'),
(981,'EM2606290013374C',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": 504, \"quantity\": 1, \"pay_amount\": 100, \"is_prop_order\": false, \"minted_item_id\": null, \"exchange_item_id\": 633, \"fulfillment_type\": \"physical\"}','order_event_EM2606290013374C_pending_32_1782684489','2026-06-29 06:08:09'),
(982,'EM260629001338B9',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": 504, \"quantity\": 1, \"pay_amount\": 100, \"is_prop_order\": false, \"minted_item_id\": null, \"exchange_item_id\": 633, \"fulfillment_type\": \"physical\"}','order_event_EM260629001338B9_pending_32_1782684525','2026-06-29 06:08:45'),
(1010,'EM26070600136675',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": 508, \"quantity\": 1, \"pay_amount\": 1000, \"is_prop_order\": false, \"minted_item_id\": null, \"exchange_item_id\": 637, \"fulfillment_type\": \"physical\"}','order_event_EM26070600136675_pending_32_1783297803','2026-07-06 08:30:03');
/*!40000 ALTER TABLE `exchange_order_events` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-10 18:10:57
