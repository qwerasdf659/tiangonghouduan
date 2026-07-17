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
-- Table structure for table `content_review_records`
--

DROP TABLE IF EXISTS `content_review_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `content_review_records` (
  `content_review_record_id` bigint NOT NULL AUTO_INCREMENT,
  `auditable_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '审核对象类型（exchange/image/feedback等）',
  `auditable_id` bigint NOT NULL COMMENT '审核对象ID',
  `audit_status` enum('pending','approved','rejected','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '审核状态：pending-待审核，approved-已通过，rejected-已拒绝，cancelled-已取消',
  `auditor_id` int DEFAULT NULL COMMENT '审核员ID',
  `audit_reason` text COLLATE utf8mb4_unicode_ci COMMENT '审核意见/拒绝原因',
  `audit_data` json DEFAULT NULL COMMENT '审核相关数据（JSON格式，存储业务特定信息）',
  `priority` enum('high','medium','low') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium' COMMENT '审核优先级',
  `submitted_at` datetime NOT NULL COMMENT '提交审核时间',
  `audited_at` datetime DEFAULT NULL COMMENT '审核完成时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`content_review_record_id`),
  UNIQUE KEY `uk_content_review_auditable` (`auditable_type`,`auditable_id`),
  KEY `idx_audit_records_status` (`audit_status`),
  KEY `idx_audit_records_auditor` (`auditor_id`),
  KEY `idx_audit_records_priority_time` (`priority`,`submitted_at`),
  KEY `idx_audit_records_created` (`created_at`),
  CONSTRAINT `content_review_records_ibfk_1` FOREIGN KEY (`auditor_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6475 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `content_review_records`
--

LOCK TABLES `content_review_records` WRITE;
/*!40000 ALTER TABLE `content_review_records` DISABLE KEYS */;
INSERT INTO `content_review_records` VALUES
(6302,'consumption',3060,'approved',32,'核实无误，审核通过','{\"store_id\": 7, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 2588}','medium','2026-06-22 20:38:39','2026-06-25 04:32:17','2026-06-22 20:38:39','2026-06-25 04:32:17'),
(6303,'consumption',3061,'approved',32,'核实无误，审核通过','{\"store_id\": 7, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 365}','medium','2026-06-22 22:32:24','2026-06-25 04:32:19','2026-06-22 22:32:24','2026-06-25 04:32:19'),
(6318,'consumption',3076,'approved',32,'核实无误，审核通过','{\"store_id\": 7, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 88.5}','medium','2026-06-24 20:41:32','2026-06-25 04:32:35','2026-06-24 20:41:32','2026-06-25 04:32:35'),
(6319,'consumption',3077,'approved',32,'核实无误，审核通过','{\"store_id\": 7, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 50}','medium','2026-06-24 20:41:32','2026-06-25 04:32:38','2026-06-24 20:41:32','2026-06-25 04:32:38'),
(6320,'consumption',3078,'approved',32,'核实无误，审核通过','{\"store_id\": 7, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 88.5}','medium','2026-06-24 21:03:07','2026-06-25 04:32:41','2026-06-24 21:03:07','2026-06-25 04:32:41'),
(6321,'consumption',3079,'approved',32,'核实无误，审核通过','{\"store_id\": 7, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 50}','medium','2026-06-24 21:03:07','2026-06-25 04:32:44','2026-06-24 21:03:07','2026-06-25 04:32:44'),
(6322,'consumption',3080,'approved',32,'核实无误，审核通过','{\"store_id\": 7, \"merchant_id\": 12796, \"operator_id\": 12796, \"submitted_by\": 12796, \"consumption_amount\": 3999}','medium','2026-06-25 03:09:00','2026-06-25 03:16:09','2026-06-25 03:09:00','2026-06-25 03:16:09'),
(6323,'consumption',3081,'approved',32,'核实无误，审核通过','{\"store_id\": 7, \"merchant_id\": 12796, \"operator_id\": 12796, \"submitted_by\": 12796, \"consumption_amount\": 3336}','medium','2026-06-25 03:14:09','2026-06-25 04:32:48','2026-06-25 03:14:09','2026-06-25 04:32:48'),
(6324,'consumption',3084,'approved',32,'核实无误，审核通过','{\"store_id\": 838, \"merchant_id\": 12798, \"operator_id\": 12798, \"submitted_by\": 12798, \"consumption_amount\": 2580}','medium','2026-06-26 00:14:04','2026-06-26 00:18:01','2026-06-26 00:14:04','2026-06-26 00:18:01'),
(6325,'consumption',3085,'approved',32,'核实无误，审核通过','{\"store_id\": 7, \"merchant_id\": 12796, \"operator_id\": 12796, \"submitted_by\": 12796, \"consumption_amount\": 1000}','medium','2026-06-26 00:19:14','2026-06-26 00:20:30','2026-06-26 00:19:14','2026-06-26 00:20:30'),
(6326,'consumption',3086,'approved',32,'核实无误，审核通过','{\"store_id\": 838, \"merchant_id\": 12801, \"operator_id\": 12801, \"submitted_by\": 12801, \"consumption_amount\": 369}','medium','2026-06-26 07:01:36','2026-06-26 07:06:48','2026-06-26 07:01:36','2026-06-26 07:06:48'),
(6327,'consumption',3087,'approved',32,'审核通过','{\"store_id\": 838, \"merchant_id\": 12801, \"operator_id\": 12801, \"submitted_by\": 12801, \"consumption_amount\": 1000}','medium','2026-06-27 06:28:53','2026-06-27 06:32:21','2026-06-27 06:28:53','2026-06-27 06:32:21'),
(6328,'consumption',3088,'approved',32,'核实无误，审核通过','{\"store_id\": 7, \"merchant_id\": 12796, \"operator_id\": 12796, \"submitted_by\": 12796, \"consumption_amount\": 1000}','medium','2026-06-27 07:30:37','2026-06-27 07:30:54','2026-06-27 07:30:37','2026-06-27 07:30:54'),
(6329,'consumption',3089,'approved',32,'核实无误，审核通过','{\"store_id\": 7, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 1000}','medium','2026-06-27 07:53:22','2026-06-27 07:53:28','2026-06-27 07:53:22','2026-06-27 07:53:28'),
(6330,'consumption',3090,'approved',32,'核实无误，审核通过','{\"store_id\": 838, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 1000}','medium','2026-06-27 08:02:51','2026-06-27 08:02:56','2026-06-27 08:02:51','2026-06-27 08:02:56'),
(6331,'consumption',3091,'approved',32,'核实无误，审核通过','{\"store_id\": 838, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 3000}','medium','2026-06-28 01:54:48','2026-06-28 01:56:24','2026-06-28 01:54:48','2026-06-28 01:56:24'),
(6332,'consumption',3092,'approved',32,'核实无误，审核通过','{\"store_id\": 838, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 3000}','medium','2026-06-28 02:35:24','2026-06-28 02:35:30','2026-06-28 02:35:24','2026-06-28 02:35:30'),
(6333,'consumption',3093,'approved',32,'核实无误，审核通过','{\"store_id\": 838, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 3000}','medium','2026-06-28 03:06:31','2026-06-28 03:06:42','2026-06-28 03:06:31','2026-06-28 03:06:42'),
(6355,'consumption',3115,'pending',NULL,NULL,'{\"store_id\": 838, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 3000}','medium','2026-06-28 08:00:09',NULL,'2026-06-28 08:00:09','2026-06-28 08:00:09'),
(6377,'consumption',3137,'pending',NULL,NULL,'{\"store_id\": 7, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 88.5}','medium','2026-07-06 03:35:40',NULL,'2026-07-06 03:35:40','2026-07-06 03:35:40'),
(6378,'consumption',3138,'pending',NULL,NULL,'{\"store_id\": 7, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 50}','medium','2026-07-06 03:35:40',NULL,'2026-07-06 03:35:40','2026-07-06 03:35:40'),
(6407,'consumption',3168,'pending',NULL,NULL,'{\"store_id\": 7, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 88.5}','medium','2026-07-10 15:52:38',NULL,'2026-07-10 15:52:38','2026-07-10 15:52:38'),
(6408,'consumption',3169,'pending',NULL,NULL,'{\"store_id\": 7, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 50}','medium','2026-07-10 15:52:38',NULL,'2026-07-10 15:52:38','2026-07-10 15:52:38'),
(6409,'consumption',3170,'pending',NULL,NULL,'{\"store_id\": 7, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 88.5}','medium','2026-07-11 01:15:18',NULL,'2026-07-11 01:15:18','2026-07-11 01:15:18'),
(6410,'consumption',3171,'pending',NULL,NULL,'{\"store_id\": 7, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 50}','medium','2026-07-11 01:15:18',NULL,'2026-07-11 01:15:18','2026-07-11 01:15:18'),
(6453,'consumption',3214,'pending',NULL,NULL,'{\"store_id\": 7, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 88.5}','medium','2026-07-11 10:02:06',NULL,'2026-07-11 10:02:06','2026-07-11 10:02:06'),
(6454,'consumption',3215,'pending',NULL,NULL,'{\"store_id\": 7, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 50}','medium','2026-07-11 10:02:06',NULL,'2026-07-11 10:02:06','2026-07-11 10:02:06');
/*!40000 ALTER TABLE `content_review_records` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-16  3:11:49
