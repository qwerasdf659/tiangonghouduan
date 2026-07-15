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
) ENGINE=InnoDB AUTO_INCREMENT=6302 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `content_review_records`
--

LOCK TABLES `content_review_records` WRITE;
/*!40000 ALTER TABLE `content_review_records` DISABLE KEYS */;
INSERT INTO `content_review_records` VALUES
(1616,'merchant_points',31,'approved',135,'批量审核通过','{\"user_id\": 31, \"description\": \"测试申请1 - 销售奖励\", \"submitted_at\": \"2026-01-09T01:16:17.449+08:00\", \"points_amount\": 100}','high','2026-01-09 09:16:17','2026-01-09 09:26:22','2026-01-09 09:16:17','2026-01-09 09:26:22'),
(1618,'merchant_points',32,'rejected',135,'11111','{\"user_id\": 32, \"description\": \"测试申请3 - 特殊贡献奖励\", \"submitted_at\": \"2026-01-09T01:16:17.474+08:00\", \"points_amount\": 500}','high','2026-01-09 09:16:17','2026-01-09 09:26:32','2026-01-09 09:16:17','2026-01-09 09:26:32'),
(1625,'merchant_points',33,'approved',135,NULL,'{\"user_id\": 33, \"description\": \"测试积分申请 - 200积分\", \"submitted_at\": \"2026-01-09T01:28:03.145+08:00\", \"points_amount\": 200}','medium','2026-01-09 09:28:03','2026-01-09 09:32:59','2026-01-09 09:28:03','2026-01-09 09:32:59'),
(1626,'merchant_points',34,'approved',135,NULL,'{\"user_id\": 34, \"description\": \"测试积分申请 - 300积分\", \"submitted_at\": \"2026-01-09T01:28:03.150+08:00\", \"points_amount\": 300}','medium','2026-01-09 09:28:03','2026-01-09 09:33:02','2026-01-09 09:28:03','2026-01-09 09:33:02'),
(1627,'merchant_points',35,'approved',135,NULL,'{\"user_id\": 35, \"description\": \"测试积分申请 - 400积分\", \"submitted_at\": \"2026-01-09T01:28:03.153+08:00\", \"points_amount\": 400}','medium','2026-01-09 09:28:03','2026-01-09 09:36:18','2026-01-09 09:28:03','2026-01-09 09:36:18'),
(1628,'merchant_points',36,'approved',135,'批量审核通过','{\"user_id\": 36, \"description\": \"新申请-100积分\", \"points_amount\": 100}','medium','2026-01-09 09:37:49','2026-01-09 09:38:51','2026-01-09 09:37:49','2026-01-09 09:38:51'),
(1629,'merchant_points',37,'approved',135,'批量审核通过','{\"user_id\": 37, \"description\": \"新申请-150积分\", \"points_amount\": 150}','medium','2026-01-09 09:37:49','2026-01-09 09:39:57','2026-01-09 09:37:49','2026-01-09 09:39:57'),
(1630,'merchant_points',38,'approved',31,NULL,'{\"user_id\": 38, \"description\": \"新申请-200积分\", \"points_amount\": 200}','medium','2026-01-09 09:37:49','2026-02-02 22:14:12','2026-01-09 09:37:49','2026-02-02 22:14:12'),
(1631,'merchant_points',39,'cancelled',NULL,'数据清理: merchant_points审核记录不一致（2026-03-10审核链上线前清理）','{\"user_id\": 39, \"description\": \"新申请-250积分\", \"points_amount\": 250}','medium','2026-01-09 09:37:49','2026-03-10 08:18:51','2026-01-09 09:37:49','2026-03-10 08:18:51'),
(1632,'merchant_points',40,'cancelled',NULL,'数据清理: merchant_points审核记录不一致（2026-03-10审核链上线前清理）','{\"user_id\": 40, \"description\": \"新申请-300积分\", \"points_amount\": 300}','medium','2026-01-09 09:37:49','2026-03-10 08:18:51','2026-01-09 09:37:49','2026-03-10 08:18:51'),
(1791,'consumption',394,'approved',31,'核实无误，审核通过',NULL,'medium','2026-01-13 08:09:10','2026-02-15 12:53:13','2026-01-13 08:09:10','2026-02-15 12:53:13'),
(1792,'consumption',395,'approved',31,'核实无误，审核通过',NULL,'medium','2026-01-13 08:09:39','2026-02-15 19:41:38','2026-01-13 08:09:39','2026-02-15 19:41:38'),
(1793,'consumption',396,'approved',31,'审核通过',NULL,'medium','2026-01-13 08:09:58','2026-01-26 08:39:48','2026-01-13 08:09:58','2026-01-26 08:39:48'),
(1794,'consumption',397,'approved',31,'审核通过',NULL,'medium','2026-01-13 08:09:58','2026-01-28 07:29:38','2026-01-13 08:09:58','2026-01-28 07:29:38'),
(1795,'consumption',398,'approved',31,'核实无误，审核通过',NULL,'medium','2026-01-13 08:09:58','2026-03-07 02:56:09','2026-01-13 08:09:58','2026-03-07 02:56:09'),
(1796,'consumption',399,'approved',31,'核实无误，审核通过',NULL,'medium','2026-01-13 08:09:58','2026-03-07 02:56:21','2026-01-13 08:09:58','2026-03-07 02:56:21'),
(1797,'consumption',400,'approved',31,'核实无误，审核通过',NULL,'medium','2026-01-13 08:09:58','2026-03-07 02:56:29','2026-01-13 08:09:58','2026-03-07 02:56:29'),
(1798,'consumption',401,'approved',31,'核实无误，审核通过',NULL,'medium','2026-01-13 08:09:58','2026-03-07 02:56:14','2026-01-13 08:09:58','2026-03-07 02:56:14'),
(1799,'consumption',402,'approved',31,'核实无误，审核通过',NULL,'medium','2026-01-13 08:09:58','2026-03-07 02:56:18','2026-01-13 08:09:58','2026-03-07 02:56:18'),
(1800,'consumption',403,'approved',31,'批量审核通过',NULL,'medium','2026-01-13 08:09:58','2026-03-09 02:12:15','2026-01-13 08:09:58','2026-03-09 02:12:15'),
(4201,'consumption',1870,'approved',31,'批量审核通过',NULL,'medium','2026-02-01 17:13:31','2026-03-09 02:12:15','2026-02-01 17:13:31','2026-03-09 02:12:15'),
(4202,'consumption',1871,'approved',31,'批量审核通过',NULL,'medium','2026-02-01 17:13:31','2026-03-09 02:12:15','2026-02-01 17:13:31','2026-03-09 02:12:15'),
(4217,'consumption',1886,'approved',31,'批量审核通过',NULL,'medium','2026-02-01 20:11:49','2026-03-09 02:12:15','2026-02-01 20:11:49','2026-03-09 02:12:15'),
(4218,'consumption',1887,'approved',31,'批量审核通过',NULL,'medium','2026-02-01 20:11:49','2026-03-09 02:12:15','2026-02-01 20:11:49','2026-03-09 02:12:15'),
(4226,'consumption',1895,'approved',31,'批量审核通过',NULL,'medium','2026-02-01 20:18:40','2026-03-09 02:05:00','2026-02-01 20:18:40','2026-03-09 02:05:00'),
(4227,'consumption',1896,'approved',31,'批量审核通过',NULL,'medium','2026-02-01 20:18:41','2026-03-09 02:05:00','2026-02-01 20:18:41','2026-03-09 02:05:00'),
(4235,'consumption',1904,'approved',31,'批量审核通过',NULL,'medium','2026-02-01 20:21:44','2026-03-09 02:05:01','2026-02-01 20:21:44','2026-03-09 02:05:01'),
(4236,'consumption',1905,'approved',31,'批量审核通过',NULL,'medium','2026-02-01 20:21:44','2026-03-09 02:05:01','2026-02-01 20:21:44','2026-03-09 02:05:01'),
(4244,'consumption',1913,'approved',31,'批量审核通过',NULL,'medium','2026-02-01 20:46:37','2026-03-09 02:05:01','2026-02-01 20:46:37','2026-03-09 02:05:01'),
(4245,'consumption',1914,'approved',31,'批量审核通过',NULL,'medium','2026-02-01 20:46:37','2026-03-09 02:05:01','2026-02-01 20:46:37','2026-03-09 02:05:01'),
(4253,'consumption',1922,'approved',31,'批量审核通过',NULL,'medium','2026-02-01 20:46:44','2026-03-09 02:05:01','2026-02-01 20:46:44','2026-03-09 02:05:01'),
(4254,'consumption',1923,'approved',31,'批量审核通过',NULL,'medium','2026-02-01 20:46:44','2026-03-09 02:05:01','2026-02-01 20:46:44','2026-03-09 02:05:01'),
(4262,'consumption',1931,'approved',31,'批量审核通过',NULL,'medium','2026-02-01 20:47:49','2026-03-09 02:05:01','2026-02-01 20:47:49','2026-03-09 02:05:01'),
(4263,'consumption',1932,'approved',31,'批量审核通过',NULL,'medium','2026-02-01 20:47:49','2026-03-09 02:05:01','2026-02-01 20:47:49','2026-03-09 02:05:01'),
(4271,'consumption',1940,'approved',31,'批量审核通过',NULL,'medium','2026-02-01 20:58:27','2026-03-09 02:05:01','2026-02-01 20:58:27','2026-03-09 02:05:01'),
(4272,'consumption',1941,'approved',31,'批量审核通过',NULL,'medium','2026-02-01 20:58:27','2026-03-09 02:05:01','2026-02-01 20:58:27','2026-03-09 02:05:01'),
(4280,'consumption',1949,'approved',31,'批量审核通过',NULL,'medium','2026-02-01 21:01:29','2026-03-09 02:05:01','2026-02-01 21:01:29','2026-03-09 02:05:01'),
(4281,'consumption',1950,'approved',31,'批量审核通过',NULL,'medium','2026-02-01 21:01:29','2026-03-09 02:05:01','2026-02-01 21:01:29','2026-03-09 02:05:01'),
(4289,'consumption',1958,'approved',31,'批量审核通过',NULL,'medium','2026-02-01 21:12:47','2026-03-09 02:05:01','2026-02-01 21:12:47','2026-03-09 02:05:01'),
(4290,'consumption',1959,'approved',31,'批量审核通过',NULL,'medium','2026-02-01 21:12:47','2026-03-09 02:05:01','2026-02-01 21:12:47','2026-03-09 02:05:01'),
(4298,'consumption',1967,'approved',31,'批量审核通过',NULL,'medium','2026-02-01 21:14:57','2026-03-09 02:05:01','2026-02-01 21:14:57','2026-03-09 02:05:01'),
(4299,'consumption',1968,'approved',31,'批量审核通过',NULL,'medium','2026-02-01 21:14:57','2026-03-09 02:05:01','2026-02-01 21:14:57','2026-03-09 02:05:01'),
(4307,'consumption',1976,'approved',31,'批量审核通过',NULL,'medium','2026-02-01 21:20:32','2026-03-09 02:05:01','2026-02-01 21:20:32','2026-03-09 02:05:01'),
(4308,'consumption',1977,'approved',31,'批量审核通过',NULL,'medium','2026-02-01 21:20:32','2026-03-09 02:05:01','2026-02-01 21:20:32','2026-03-09 02:05:01'),
(4316,'consumption',1985,'approved',31,'批量审核通过',NULL,'medium','2026-02-01 21:36:28','2026-03-09 01:56:30','2026-02-01 21:36:28','2026-03-09 01:56:30'),
(4317,'consumption',1986,'approved',31,'批量审核通过',NULL,'medium','2026-02-01 21:36:28','2026-03-09 01:56:30','2026-02-01 21:36:28','2026-03-09 01:56:30'),
(4325,'consumption',1994,'approved',31,'审核通过',NULL,'medium','2026-02-01 21:46:36','2026-02-20 15:57:06','2026-02-01 21:46:36','2026-02-20 15:57:06'),
(4326,'consumption',1995,'approved',31,'审核通过',NULL,'medium','2026-02-01 21:46:37','2026-02-20 15:56:30','2026-02-01 21:46:37','2026-02-20 15:56:30'),
(4334,'consumption',2003,'approved',31,'测试脚本审核通过',NULL,'medium','2026-02-01 21:54:52','2026-02-16 06:13:31','2026-02-01 21:54:52','2026-02-16 06:13:31'),
(4335,'consumption',2004,'approved',31,'审核通过',NULL,'medium','2026-02-01 21:54:52','2026-02-02 18:37:16','2026-02-01 21:54:52','2026-02-02 18:37:16'),
(4343,'consumption',2012,'approved',31,'审核通过',NULL,'medium','2026-02-02 01:48:03','2026-02-02 07:33:15','2026-02-02 01:48:03','2026-02-02 07:33:15'),
(4344,'consumption',2013,'approved',31,'审核通过',NULL,'medium','2026-02-02 01:48:03','2026-02-02 07:31:23','2026-02-02 01:48:03','2026-02-02 07:31:23'),
(4352,'consumption',2021,'approved',31,'审核通过',NULL,'medium','2026-02-02 02:26:17','2026-02-02 07:26:32','2026-02-02 02:26:17','2026-02-02 07:26:32'),
(4361,'consumption',2030,'approved',31,'审核通过',NULL,'medium','2026-02-02 03:17:01','2026-02-02 07:05:13','2026-02-02 03:17:01','2026-02-02 07:05:13'),
(4362,'consumption',2031,'approved',31,'审核通过',NULL,'medium','2026-02-02 03:17:01','2026-02-02 06:36:40','2026-02-02 03:17:01','2026-02-02 06:36:40'),
(4370,'consumption',2039,'approved',31,'审核通过',NULL,'medium','2026-02-02 03:17:19','2026-02-02 06:36:36','2026-02-02 03:17:19','2026-02-02 06:36:36'),
(4371,'consumption',2040,'approved',31,'审核通过',NULL,'medium','2026-02-02 03:17:19','2026-02-02 06:28:28','2026-02-02 03:17:19','2026-02-02 06:28:28'),
(6283,'consumption',3053,'approved',31,'审核通过','{\"store_id\": 11, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 2222}','medium','2026-06-12 05:22:51','2026-06-12 08:06:56','2026-06-12 05:22:51','2026-06-12 08:06:56'),
(6284,'consumption',3054,'approved',31,'审核通过','{\"store_id\": 11, \"merchant_id\": 31, \"operator_id\": 31, \"submitted_by\": 31, \"consumption_amount\": 3666}','medium','2026-06-12 05:31:07','2026-06-12 08:06:48','2026-06-12 05:31:07','2026-06-12 08:06:48'),
(6287,'consumption',3057,'approved',32,'核实无误，审核通过','{\"store_id\": 11, \"merchant_id\": 31, \"operator_id\": 31, \"submitted_by\": 31, \"consumption_amount\": 1369}','medium','2026-06-13 02:31:05','2026-06-14 08:47:16','2026-06-13 02:31:05','2026-06-14 08:47:16'),
(6288,'consumption',3058,'pending',NULL,NULL,'{\"store_id\": 11, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 3669}','medium','2026-06-13 02:32:26',NULL,'2026-06-13 02:32:26','2026-06-13 02:32:26'),
(6289,'consumption',3059,'approved',32,'审核通过','{\"store_id\": 11, \"merchant_id\": 31, \"operator_id\": 31, \"submitted_by\": 31, \"consumption_amount\": 222}','medium','2026-06-13 07:09:08','2026-06-13 07:29:15','2026-06-13 07:09:08','2026-06-13 07:29:15');
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

-- Dump completed on 2026-06-21 19:08:11
