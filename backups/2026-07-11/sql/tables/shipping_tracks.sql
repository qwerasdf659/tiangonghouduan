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
-- Table structure for table `shipping_tracks`
--

DROP TABLE IF EXISTS `shipping_tracks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `shipping_tracks` (
  `shipping_track_id` bigint NOT NULL AUTO_INCREMENT COMMENT '物流轨迹主键',
  `exchange_record_id` bigint NOT NULL COMMENT '关联兑换订单ID，FK→exchange_records.exchange_record_id',
  `order_no` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '订单号（冗余，便于直查，与 exchange_records.order_no 一致）',
  `shipping_no` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '快递单号（与 exchange_records.shipping_no 一致）',
  `shipping_company` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '内部快递公司代码（sf/yt/zt…，对齐 services/shipping/constants.js 字典）',
  `track_status` enum('picked_up','in_transit','delivering','delivered','returned','exception') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '统一轨迹状态：picked_up揽收/in_transit运输中/delivering派送中/delivered已签收/returned退回/exception异常',
  `track_detail` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '轨迹文字描述（第三方 context 原文）',
  `track_time` datetime NOT NULL COMMENT '该轨迹节点发生时间（北京时间）',
  `provider` enum('kuaidi100','kdniao','manual') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'kuaidi100' COMMENT '轨迹来源通道：kuaidi100快递100/kdniao快递鸟/manual人工补录',
  `raw_data` json DEFAULT NULL COMMENT '第三方推送原始报文（便于排查与对账）',
  `dedup_key` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '幂等去重键（shipping_no+track_time+status 哈希，防 webhook 重复推送）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '入库时间（北京时间）',
  PRIMARY KEY (`shipping_track_id`),
  UNIQUE KEY `uk_shipping_tracks_dedup` (`dedup_key`),
  KEY `idx_shipping_tracks_record_time` (`exchange_record_id`,`track_time`),
  KEY `idx_shipping_tracks_no` (`shipping_no`),
  KEY `idx_shipping_tracks_status_time` (`track_status`,`track_time`),
  CONSTRAINT `shipping_tracks_ibfk_1` FOREIGN KEY (`exchange_record_id`) REFERENCES `exchange_records` (`exchange_record_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='物流轨迹表（一节点一行，webhook 推送落库，支撑签收回推/超时预警/对账）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `shipping_tracks`
--

LOCK TABLES `shipping_tracks` WRITE;
/*!40000 ALTER TABLE `shipping_tracks` DISABLE KEYS */;
/*!40000 ALTER TABLE `shipping_tracks` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-10 18:11:00
