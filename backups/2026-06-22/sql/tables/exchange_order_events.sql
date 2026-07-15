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
) ENGINE=InnoDB AUTO_INCREMENT=940 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='兑换订单状态变更事件表（审计追踪）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `exchange_order_events`
--

LOCK TABLES `exchange_order_events` WRITE;
/*!40000 ALTER TABLE `exchange_order_events` DISABLE KEYS */;
INSERT INTO `exchange_order_events` VALUES
(330,'EM26032300069178',NULL,'pending',31,'user','用户兑换商品','{\"sku_id\": 7, \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": 39809, \"exchange_item_id\": 7}','order_event_EM1774200895192OAUSXJ_pending_31_1774200895','2026-03-23 01:34:55'),
(331,'EM260323000692FE',NULL,'pending',31,'user','用户兑换商品','{\"sku_id\": 7, \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": 39810, \"exchange_item_id\": 7}','order_event_EM1774201431234XEXT9K_pending_31_1774201431','2026-03-23 01:43:51'),
(338,'EM26032300069933',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM26032300069933_pending_32_1774224349','2026-03-23 08:05:49'),
(356,'EM260323000717D4',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM260323000717D4_pending_32_1774225255','2026-03-23 08:20:55'),
(357,'EM26032300071846',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM26032300071846_pending_32_1774225337','2026-03-23 08:22:17'),
(358,'EM26032300071962',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM26032300071962_pending_32_1774225344','2026-03-23 08:22:24'),
(380,'EM260323000741CE',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM260323000741CE_pending_32_1774225870','2026-03-23 08:31:10'),
(409,'EM260323000770B6',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM260323000770B6_pending_32_1774226587','2026-03-23 08:43:07'),
(417,'EM260323000778FA',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM260323000778FA_pending_32_1774229689','2026-03-23 09:34:49'),
(432,'EM260323000793FF',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM260323000793FF_pending_32_1774229886','2026-03-23 09:38:06'),
(454,'EM260323000815A7',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM260323000815A7_pending_32_1774230271','2026-03-23 09:44:31'),
(462,'EM260324000823A6',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM260324000823A6_pending_32_1774288812','2026-03-24 02:00:12'),
(484,'EM26032400084563',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM26032400084563_pending_32_1774289961','2026-03-24 02:19:21'),
(492,'EM260324000853F9',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM260324000853F9_pending_32_1774298160','2026-03-24 04:36:00'),
(500,'EM2603240008612C',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM2603240008612C_pending_32_1774298226','2026-03-24 04:37:06'),
(508,'EM260324000869C5',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM260324000869C5_pending_32_1774298250','2026-03-24 04:37:30'),
(516,'EM260324000877BA',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM260324000877BA_pending_32_1774298307','2026-03-24 04:38:27'),
(524,'EM2603240008859E',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM2603240008859E_pending_32_1774298337','2026-03-24 04:38:57'),
(539,'EM2603240009001F',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM2603240009001F_pending_32_1774298661','2026-03-24 04:44:21'),
(540,'EM260324000901A9',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM260324000901A9_pending_32_1774298675','2026-03-24 04:44:35'),
(548,'EM260324000909A0',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM260324000909A0_pending_32_1774299584','2026-03-24 04:59:44'),
(556,'EM26032400091794',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM26032400091794_pending_32_1774300571','2026-03-24 05:16:11'),
(557,'EM26032400091794','pending','approved',31,'admin','测试审核通过',NULL,'order_event_EM26032400091794_approved_31_1774369222','2026-03-25 00:20:22'),
(558,'EM26032400091794','approved','shipped',31,'admin','测试发货',NULL,'order_event_EM26032400091794_shipped_31_1774369222','2026-03-25 00:20:22'),
(559,'EM26032400091794','shipped','completed',31,'admin','测试完成',NULL,'order_event_EM26032400091794_completed_31_1774369222','2026-03-25 00:20:22'),
(567,'EM26032500092596',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM26032500092596_pending_32_1774380884','2026-03-25 03:34:44'),
(568,'EM26040200092699',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM26040200092699_pending_32_1775083748','2026-04-02 06:49:08'),
(569,'EM26040200092769',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM26040200092769_pending_32_1775084660','2026-04-02 07:04:20'),
(570,'EM26040800092846',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM26040800092846_pending_32_1775596233','2026-04-08 05:10:33'),
(578,'EM2604100009398B',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM2604100009398B_pending_32_1775774240','2026-04-10 06:37:20'),
(593,'EM260422000954AF',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM260422000954AF_pending_32_1776827515','2026-04-22 11:11:55'),
(601,'EM26042200096248',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM26042200096248_pending_32_1776827600','2026-04-22 11:13:20'),
(609,'EM2604220009704F',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM2604220009704F_pending_32_1776829149','2026-04-22 11:39:09'),
(617,'EM260422000978B1',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM260422000978B1_pending_32_1776829309','2026-04-22 11:41:49'),
(625,'EM26042300098609',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM26042300098609_pending_32_1776874776','2026-04-23 00:19:36'),
(633,'EM260423000994A5',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM260423000994A5_pending_32_1776883914','2026-04-23 02:51:54'),
(641,'EM26042300100225',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM26042300100225_pending_32_1776884138','2026-04-23 02:55:38'),
(649,'EM26042300101099',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM26042300101099_pending_32_1776884350','2026-04-23 02:59:10'),
(650,'EM260424001011EB',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM260424001011EB_pending_32_1776972976','2026-04-24 03:36:16'),
(665,'EM2604240010268A',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM2604240010268A_pending_32_1776987117','2026-04-24 07:31:57'),
(673,'EM2604240010345B',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM2604240010345B_pending_32_1776987214','2026-04-24 07:33:34'),
(681,'EM26042400104234',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM26042400104234_pending_32_1776987632','2026-04-24 07:40:32'),
(689,'EM26042500105057',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM26042500105057_pending_32_1777066883','2026-04-25 05:41:23'),
(697,'EM26042500105825',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM26042500105825_pending_32_1777068487','2026-04-25 06:08:07'),
(698,'EM260425001059D1',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM260425001059D1_pending_32_1777069922','2026-04-25 06:32:02'),
(706,'EM26042500106785',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM26042500106785_pending_32_1777070499','2026-04-25 06:41:39'),
(714,'EM2604250010753F',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM2604250010753F_pending_32_1777071185','2026-04-25 06:53:05'),
(722,'EM2604250010837D',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM2604250010837D_pending_32_1777071285','2026-04-25 06:54:45'),
(730,'EM2604250010916C',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM2604250010916C_pending_32_1777079120','2026-04-25 09:05:20'),
(738,'EM26052600109994',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM26052600109994_pending_32_1779738469','2026-05-26 03:47:49'),
(746,'EM2606030011076A',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM2606030011076A_pending_32_1780416890','2026-06-03 00:14:50'),
(754,'EM26060300111578',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM26060300111578_pending_32_1780421598','2026-06-03 01:33:18'),
(762,'EM260603001123D0',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM260603001123D0_pending_32_1780422132','2026-06-03 01:42:12'),
(770,'EM260603001131EC',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM260603001131EC_pending_32_1780424064','2026-06-03 02:14:24'),
(778,'EM26060300113952',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM26060300113952_pending_32_1780426835','2026-06-03 03:00:35'),
(786,'EM26060300114749',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM26060300114749_pending_32_1780427396','2026-06-03 03:09:56'),
(794,'EM260603001155BC',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM260603001155BC_pending_32_1780428687','2026-06-03 03:31:27'),
(801,'EM260603001162A5',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": \"116\", \"quantity\": 1, \"pay_amount\": 100, \"minted_item_id\": null, \"exchange_item_id\": \"248\"}','order_event_EM260603001162A5_pending_32_1780428973','2026-06-03 03:36:13'),
(858,'EM26061200121994',NULL,'pending',31,'user','用户兑换商品','{\"sku_id\": 6, \"quantity\": 1, \"pay_amount\": 10, \"is_prop_order\": false, \"minted_item_id\": 45243, \"exchange_item_id\": 6}','order_event_EM26061200121994_pending_31_1781218311','2026-06-12 06:51:51'),
(859,'EM260612001220D6',NULL,'pending',31,'user','用户兑换商品','{\"sku_id\": 6, \"quantity\": 1, \"pay_amount\": 10, \"is_prop_order\": false, \"minted_item_id\": 45244, \"exchange_item_id\": 6}','order_event_EM260612001220D6_pending_31_1781218321','2026-06-12 06:52:01'),
(860,'EM26061200122131',NULL,'pending',31,'user','用户兑换商品','{\"sku_id\": 6, \"quantity\": 1, \"pay_amount\": 10, \"is_prop_order\": false, \"minted_item_id\": 45245, \"exchange_item_id\": 6}','order_event_EM26061200122131_pending_31_1781218325','2026-06-12 06:52:05'),
(861,'EM26061200122242',NULL,'pending',31,'user','用户兑换商品','{\"sku_id\": 6, \"quantity\": 1, \"pay_amount\": 10, \"is_prop_order\": false, \"minted_item_id\": 45246, \"exchange_item_id\": 6}','order_event_EM26061200122242_pending_31_1781271701','2026-06-12 21:41:41'),
(862,'EM260612001223CD',NULL,'pending',31,'user','用户兑换商品','{\"sku_id\": 6, \"quantity\": 1, \"pay_amount\": 10, \"is_prop_order\": false, \"minted_item_id\": 45247, \"exchange_item_id\": 6}','order_event_EM260612001223CD_pending_31_1781271756','2026-06-12 21:42:36'),
(863,'EM26061200122432',NULL,'pending',31,'user','用户兑换商品','{\"sku_id\": 6, \"quantity\": 1, \"pay_amount\": 10, \"is_prop_order\": false, \"minted_item_id\": 45248, \"exchange_item_id\": 6}','order_event_EM26061200122432_pending_31_1781272410','2026-06-12 21:53:30'),
(864,'EM2606120012250D',NULL,'pending',31,'user','用户兑换商品','{\"sku_id\": 6, \"quantity\": 1, \"pay_amount\": 10, \"is_prop_order\": false, \"minted_item_id\": 45249, \"exchange_item_id\": 6}','order_event_EM2606120012250D_pending_31_1781272420','2026-06-12 21:53:40'),
(865,'EM26061200122636',NULL,'pending',31,'user','用户兑换商品','{\"sku_id\": 6, \"quantity\": 1, \"pay_amount\": 10, \"is_prop_order\": false, \"minted_item_id\": 45250, \"exchange_item_id\": 6}','order_event_EM26061200122636_pending_31_1781272817','2026-06-12 22:00:17'),
(866,'EM2606120012273D',NULL,'pending',31,'user','用户兑换商品','{\"sku_id\": 6, \"quantity\": 1, \"pay_amount\": 10, \"is_prop_order\": false, \"minted_item_id\": 45251, \"exchange_item_id\": 6}','order_event_EM2606120012273D_pending_31_1781273029','2026-06-12 22:03:49'),
(867,'EM26061300122845',NULL,'completed',31,'user','用户购买虚拟道具（即时完成）','{\"sku_id\": 401, \"quantity\": 1, \"pay_amount\": 500, \"is_prop_order\": true, \"minted_item_id\": 45252, \"exchange_item_id\": 535}','order_event_EM26061300122845_completed_31_1781284636','2026-06-13 01:17:16'),
(868,'EM260613001229E2',NULL,'completed',31,'user','用户购买虚拟道具（即时完成）','{\"sku_id\": 401, \"quantity\": 1, \"pay_amount\": 500, \"is_prop_order\": true, \"minted_item_id\": 45253, \"exchange_item_id\": 535}','order_event_EM260613001229E2_completed_31_1781284744','2026-06-13 01:19:04'),
(869,'EM260613001230A6',NULL,'completed',31,'user','用户购买虚拟道具（即时完成）','{\"sku_id\": 403, \"quantity\": 1, \"pay_amount\": 50, \"is_prop_order\": true, \"minted_item_id\": 45254, \"exchange_item_id\": 537}','order_event_EM260613001230A6_completed_31_1781290206','2026-06-13 02:50:06'),
(870,'EM260613001231F2',NULL,'completed',31,'user','用户购买虚拟道具（即时完成）','{\"sku_id\": 401, \"quantity\": 1, \"pay_amount\": 500, \"is_prop_order\": true, \"minted_item_id\": 45255, \"exchange_item_id\": 535}','order_event_EM260613001231F2_completed_31_1781294786','2026-06-13 04:06:26'),
(928,'EM260615001289B4',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": 6, \"quantity\": 1, \"pay_amount\": 10, \"is_prop_order\": false, \"minted_item_id\": 45268, \"exchange_item_id\": 6, \"fulfillment_type\": \"physical\"}','order_event_EM260615001289B4_pending_32_1781459177','2026-06-15 01:46:17'),
(929,'EM26061500129040',NULL,'pending',32,'user','用户兑换商品','{\"sku_id\": 6, \"quantity\": 1, \"pay_amount\": 10, \"is_prop_order\": false, \"minted_item_id\": 45269, \"exchange_item_id\": 6, \"fulfillment_type\": \"physical\"}','order_event_EM26061500129040_pending_32_1781459828','2026-06-15 01:57:08'),
(930,'EM26061500129040','pending','approved',32,'admin','管理员审核通过',NULL,'order_event_EM26061500129040_approved_32_1781460848','2026-06-15 02:14:08'),
(932,'EM26061500129040','approved','shipped',32,'admin','管理员变更状态为 shipped',NULL,'order_event_EM26061500129040_shipped_32_1781460861','2026-06-15 02:14:21'),
(933,'EM260615001289B4','pending','approved',32,'admin','管理员审核通过',NULL,'order_event_EM260615001289B4_approved_32_1781461480','2026-06-15 02:24:40'),
(934,'EM26061500129040','shipped','completed',32,'admin','管理员标记完成',NULL,'order_event_EM26061500129040_completed_32_1781461523','2026-06-15 02:25:23'),
(935,'EM260621001291E7',NULL,'completed',32,'user','用户兑换商品（即时完成）','{\"sku_id\": 499, \"quantity\": 1, \"pay_amount\": 100, \"is_prop_order\": false, \"minted_item_id\": 45382, \"exchange_item_id\": 627, \"fulfillment_type\": \"voucher\"}','order_event_EM260621001291E7_completed_32_1781992433','2026-06-21 05:53:53'),
(936,'EM26062100129243',NULL,'completed',32,'user','用户兑换商品（即时完成）','{\"sku_id\": 499, \"quantity\": 1, \"pay_amount\": 100, \"is_prop_order\": false, \"minted_item_id\": 45383, \"exchange_item_id\": 627, \"fulfillment_type\": \"voucher\"}','order_event_EM26062100129243_completed_32_1781992478','2026-06-21 05:54:38'),
(937,'EM26062100129333',NULL,'completed',32,'user','用户兑换商品（即时完成）','{\"sku_id\": 499, \"quantity\": 1, \"pay_amount\": 100, \"is_prop_order\": false, \"minted_item_id\": 45384, \"exchange_item_id\": 627, \"fulfillment_type\": \"voucher\"}','order_event_EM26062100129333_completed_32_1781992478','2026-06-21 05:54:38'),
(938,'EM26062200129464',NULL,'completed',32,'user','用户兑换商品（即时完成）','{\"sku_id\": 402, \"quantity\": 1, \"pay_amount\": 1, \"is_prop_order\": true, \"minted_item_id\": 45448, \"exchange_item_id\": 536, \"fulfillment_type\": \"virtual\"}','order_event_EM26062200129464_completed_32_1782063381','2026-06-22 01:36:21'),
(939,'EM2606220012958B',NULL,'completed',32,'user','用户兑换商品（即时完成）','{\"sku_id\": 402, \"quantity\": 1, \"pay_amount\": 1, \"is_prop_order\": true, \"minted_item_id\": 45449, \"exchange_item_id\": 536, \"fulfillment_type\": \"virtual\"}','order_event_EM2606220012958B_completed_32_1782065564','2026-06-22 02:12:44');
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

-- Dump completed on 2026-06-21 19:08:12
