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
-- Table structure for table `consumption_records`
--

DROP TABLE IF EXISTS `consumption_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `consumption_records` (
  `consumption_record_id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL COMMENT '消费用户ID',
  `merchant_id` int DEFAULT NULL COMMENT '商家ID（录入人，可为空）',
  `consumption_amount` decimal(10,2) NOT NULL COMMENT '消费金额（元）',
  `points_to_award` int NOT NULL COMMENT '预计奖励积分数（单位：分），计算规则：Math.round(consumption_amount)，即1元=1分，四舍五入',
  `status` enum('pending','approved','rejected','expired') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '状态：pending-待审核，approved-已通过，rejected-已拒绝，expired-已过期',
  `qr_code` varchar(300) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '用户动态二维码（v2格式: QRV2_{payload}_{signature}，约200-250字符）',
  `idempotency_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `business_id` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '业务唯一键（格式：consumption_{merchant_id}_{timestamp}_{random}）- 必填',
  `reward_transaction_id` bigint DEFAULT NULL COMMENT '关联奖励积分流水ID（逻辑外键，用于对账，审核通过后填充）',
  `merchant_notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime NOT NULL COMMENT '创建时间（北京时间）',
  `updated_at` datetime NOT NULL COMMENT '更新时间（北京时间）',
  `admin_notes` text COLLATE utf8mb4_unicode_ci COMMENT '平台审核备注（审核员填写）',
  `reviewed_by` int DEFAULT NULL COMMENT '审核员ID（谁审核的？可为空）',
  `reviewed_at` datetime DEFAULT NULL COMMENT '审核时间（什么时候审核的？），时区：北京时间（GMT+8）',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0' COMMENT '软删除标记：0=未删除，1=已删除',
  `deleted_at` datetime(3) DEFAULT NULL COMMENT '删除时间',
  `settled_at` datetime DEFAULT NULL COMMENT '结算时间（审批完成时落地，北京时间）',
  `store_id` int NOT NULL COMMENT '门店ID（外键关联 stores 表，消费小票必属某一门店）',
  `anomaly_flags` json DEFAULT NULL COMMENT '异常标记JSON数组，如["large_amount","high_frequency"]',
  `anomaly_score` tinyint unsigned NOT NULL DEFAULT '0' COMMENT '异常评分 0-100，0=正常，分数越高越可疑',
  `order_no` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '消费买单订单号（CS 前缀）',
  `level_key_locked` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '提交时点锁定的成长等级码（关联 user_growth_levels.level_key，NULL=存量记录按1.0）',
  `earn_multiplier_locked` decimal(4,2) DEFAULT NULL COMMENT '提交时点锁定的等级发放倍数（审核发分按此值执行，NULL=存量记录按1.00）',
  `activity_bonus_rate_locked` decimal(4,2) DEFAULT NULL COMMENT '活动加成率提交时锁定值（拍板⑮-(b) 加法叠加；NULL=无活动加成，审核发分按锁定值出 activity_bonus_reward 笔）',
  PRIMARY KEY (`consumption_record_id`),
  UNIQUE KEY `uk_consumption_records_idempotency_key` (`idempotency_key`),
  UNIQUE KEY `uk_consumption_records_business_id` (`business_id`),
  UNIQUE KEY `uk_consumption_records_order_no` (`order_no`),
  KEY `idx_user_status` (`user_id`,`status`,`created_at`),
  KEY `idx_merchant_time` (`merchant_id`,`created_at`),
  KEY `idx_status_created` (`status`,`created_at`),
  KEY `idx_qr_code` (`qr_code`),
  KEY `idx_reviewed` (`reviewed_by`,`reviewed_at`),
  KEY `idx_consumption_is_deleted` (`is_deleted`),
  KEY `idx_consumption_records_reward_tx_id` (`reward_transaction_id`),
  KEY `idx_consumption_store_status` (`store_id`,`status`,`created_at`),
  KEY `idx_consumption_store_merchant` (`store_id`,`merchant_id`,`created_at`),
  KEY `idx_anomaly_score` (`anomaly_score`),
  KEY `idx_status_anomaly` (`status`,`anomaly_score`),
  KEY `idx_cr_status_created_at` (`status`,`created_at`),
  CONSTRAINT `fk_consumption_records_merchant_id` FOREIGN KEY (`merchant_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_consumption_records_reviewed_by` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_consumption_records_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_consumption_store` FOREIGN KEY (`store_id`) REFERENCES `stores` (`store_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `chk_approved_has_reward` CHECK (((`status` <> _utf8mb4'approved') or (`reward_transaction_id` is not null)))
) ENGINE=InnoDB AUTO_INCREMENT=3230 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户消费记录表 - 记录用户通过商家扫码提交的消费信息';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `consumption_records`
--

LOCK TABLES `consumption_records` WRITE;
/*!40000 ALTER TABLE `consumption_records` DISABLE KEYS */;
INSERT INTO `consumption_records` VALUES
(3060,12796,32,2588.00,2588,'approved','QRV2_eyJ1c2VyX3V1aWQiOiI3ZDIwMTMwYS02ODdjLTQ0MzEtYTYwMS1lZGEzNjNiNWNjODUiLCJleHAiOjE3ODIxMzIxNzEzMDMsIm5vbmNlIjoiY2M0NDYzYzAzYjQyNWY2MWE2NmQwOTZmMGUzMzA4OTUifQ_187f126b17e2d2cd3f84ad3c1b819b4ddafb4aac9070dfe48a4ee84497a01ed4','consumption_submit_1782131919104_9b4cbee71615ae23','consume_32_12796_1782131919322',155971,NULL,'2026-06-22 20:38:39','2026-06-25 04:32:17','核实无误，审核通过',32,'2026-06-25 04:32:17',0,NULL,'2026-06-25 04:32:17',7,NULL,0,'CS26062200306030',NULL,NULL,NULL),
(3061,12797,32,365.00,365,'approved','QRV2_eyJ1c2VyX3V1aWQiOiJmYTllYjRjNi00Nzc3LTQ5MzUtYjAyOS0xMzQyZjg1MjRkZDgiLCJleHAiOjE3ODIxMzg5OTkwNDUsIm5vbmNlIjoiNzc5OWIxNTg2M2IyMTNmOWQzMTQ5M2VjYmMwNzg4MzIifQ_6014063f221199e594b57bb1ea37029f6cfbcd318f8441fdb5f8f92531cb7ebb','consumption_submit_1782138744004_7d47f428aa5b6c41','consume_32_12797_1782138744200',155977,NULL,'2026-06-22 22:32:24','2026-06-25 04:32:19','核实无误，审核通过',32,'2026-06-25 04:32:19',0,NULL,'2026-06-25 04:32:19',7,NULL,0,'CS26062200306119',NULL,NULL,NULL),
(3080,12799,12796,3999.00,3999,'approved','QRV2_eyJ1c2VyX3V1aWQiOiIyOTY3Yzc1Zi1kZWU3LTRjODEtYjJjMy0xOTg4MDFkMzZlNDkiLCJleHAiOjE3ODIzMjg0MjIwOTQsIm5vbmNlIjoiYWNiZjJiODNiYjA1OTEwZjY3NjZhMmY5ZmNiNjhhOTUifQ_6c626d556ddc652c316f90b2a8111c7d6aedb71b40273615a686c15f8a9245a6','consumption_submit_1782328138869_66e8e24a151c203b','consume_12796_12799_1782328140058',155335,NULL,'2026-06-25 03:09:00','2026-06-25 03:16:10','核实无误，审核通过',32,'2026-06-25 03:16:10',0,NULL,'2026-06-25 03:16:10',7,NULL,0,'CS26062500308040',NULL,NULL,NULL),
(3081,12799,12796,3336.00,3336,'approved','QRV2_eyJ1c2VyX3V1aWQiOiIyOTY3Yzc1Zi1kZWU3LTRjODEtYjJjMy0xOTg4MDFkMzZlNDkiLCJleHAiOjE3ODIzMjg3MjQ2NDYsIm5vbmNlIjoiMjExMWRiZjcwZTBlZDBjN2I2OWM2NmJmYjY3OTA1NjAifQ_b9662329b3b498e6f42f4bd920d12d1bcce5d2992141ef9ed222962f0df1df5c','consumption_submit_1782328448613_f57dc4139a51283b','consume_12796_12799_1782328449794',155983,NULL,'2026-06-25 03:14:09','2026-06-25 04:32:48','核实无误，审核通过',32,'2026-06-25 04:32:48',0,NULL,'2026-06-25 04:32:48',7,NULL,0,'CS26062500308193',NULL,NULL,NULL),
(3084,12796,12798,2580.00,2580,'approved','QRV2_eyJ1c2VyX3V1aWQiOiI3ZDIwMTMwYS02ODdjLTQ0MzEtYTYwMS1lZGEzNjNiNWNjODUiLCJleHAiOjE3ODI0MDQyMjE4MjUsIm5vbmNlIjoiMmIyZDM0YTY4MzYyZjJiZmZiY2RhMzk2MWQ4ZjA5ODYifQ_f083dab06040f84beef978074400f822f3273b59bb48a31a7ad09556a88396a5','consumption_submit_1782404043479_9cbbf022d960024b','consume_12798_12796_1782404044838',155989,NULL,'2026-06-26 00:14:04','2026-06-26 00:18:01','核实无误，审核通过',32,'2026-06-26 00:18:01',0,NULL,'2026-06-26 00:18:01',838,NULL,0,'CS2606260030840D',NULL,NULL,NULL),
(3085,12800,12796,1000.00,1000,'approved','QRV2_eyJ1c2VyX3V1aWQiOiJlNzE0NGM5NC04NTFlLTRkMTYtODY3Ni1kNWFiYzVjM2EyYTMiLCJleHAiOjE3ODI0MDQ2MjIwMTcsIm5vbmNlIjoiMjJiNTMzY2ZhMzNmMDM5Njk2Nzc2ZWU1ZDExNzY2NGUifQ_6df9ffea9529deb2ebd819b93b11ded28db1fdcd2010f77172bc2a352bd1cdbf','consumption_submit_1782404353914_f85c146d31232da3','consume_12796_12800_1782404354753',155995,NULL,'2026-06-26 00:19:14','2026-06-26 00:20:30','核实无误，审核通过',32,'2026-06-26 00:20:30',0,NULL,'2026-06-26 00:20:30',7,NULL,0,'CS260626003085C7',NULL,NULL,NULL),
(3086,12802,12801,369.00,369,'approved','QRV2_eyJ1c2VyX3V1aWQiOiJlOGM2NjFlZi0zNWMwLTRjYzAtYmU3Mi0xYTcyOWQxNDJhYmMiLCJleHAiOjE3ODI0Mjg3NzM1MzMsIm5vbmNlIjoiOGM1OTVjZWQwOTBjYjI3N2Y3OWI2NzBhYTNmOTkxMzYifQ_db17bf24cf1635d88d2366520a6b03d491d277a2483ccd01a5e60fbb8638f93b','consumption_submit_1782428495553_0ecfa9262912f0dc','consume_12801_12802_1782428496484',156005,NULL,'2026-06-26 07:01:36','2026-06-26 07:06:48','核实无误，审核通过',32,'2026-06-26 07:06:48',0,NULL,'2026-06-26 07:06:48',838,NULL,0,'CS260626003086DC',NULL,NULL,NULL),
(3087,12802,12801,1000.00,1000,'approved','QRV2_eyJ1c2VyX3V1aWQiOiJlOGM2NjFlZi0zNWMwLTRjYzAtYmU3Mi0xYTcyOWQxNDJhYmMiLCJleHAiOjE3ODI1MTMxMzMwMjcsIm5vbmNlIjoiYmUwMWFkMjc5MzYxMmVkYWE5MTU3ZTEyYzVjMTQ5ZTgifQ_0c26627f4cf267ca6d693f3364e3a1774fc6e11414e4e780d1161a8e3efc4153','consumption_submit_1782512932793_2ee818f813964465','consume_12801_12802_1782512933874',156073,NULL,'2026-06-27 06:28:53','2026-06-27 06:32:21','审核通过',32,'2026-06-27 06:32:21',0,NULL,'2026-06-27 06:32:21',838,NULL,0,'CS260627003087A6',NULL,NULL,NULL),
(3088,12802,12796,1000.00,1000,'approved','QRV2_eyJ1c2VyX3V1aWQiOiJlOGM2NjFlZi0zNWMwLTRjYzAtYmU3Mi0xYTcyOWQxNDJhYmMiLCJleHAiOjE3ODI1MTY4NjEwMTgsIm5vbmNlIjoiZGRkYjBjODk4MjE2MmM4ODNhODg3MzE2MTNhMTVhZDkifQ_7f174f9975fd8358d0f5cd80cea8e8e5f304fd71692a1e773116ae5a67c15b73','consumption_submit_1782516636422_cf34f536eaa6ef26','consume_12796_12802_1782516637524',156253,NULL,'2026-06-27 07:30:37','2026-06-27 07:30:54','核实无误，审核通过',32,'2026-06-27 07:30:54',0,NULL,'2026-06-27 07:30:54',7,NULL,0,'CS26062700308802',NULL,NULL,NULL),
(3089,12802,32,1000.00,1000,'approved','QRV2_eyJ1c2VyX3V1aWQiOiJlOGM2NjFlZi0zNWMwLTRjYzAtYmU3Mi0xYTcyOWQxNDJhYmMiLCJleHAiOjE3ODI1MTgyNjM3MzMsIm5vbmNlIjoiYTg4NGU0MWRlYzJlOTc0NWNiYzdkOTIyMjA3ZWMzOTQifQ_ce4c5cd947fbf77e2ce0c8f1bbae5918f9253698614bde3b77caa20a00de2a14','consumption_submit_1782518001729_62fce1568946ef8f','consume_32_12802_1782518002816',156389,NULL,'2026-06-27 07:53:22','2026-06-27 07:53:28','核实无误，审核通过',32,'2026-06-27 07:53:28',0,NULL,'2026-06-27 07:53:28',7,NULL,0,'CS26062700308947',NULL,NULL,NULL),
(3090,12803,32,1000.00,1000,'approved','QRV2_eyJ1c2VyX3V1aWQiOiIyOTg2YWViOC03MDk1LTRiYzYtODBhOC00ZWE3ZjM3OGNlYzYiLCJleHAiOjE3ODI1MTg4MzgxMzQsIm5vbmNlIjoiZTA3MzcwZWZhM2Y3YmE0NjY5NGM1MzQwMmYxZmVmZTUifQ_75978483265a07629eb948684451047d328e7fe22c999310fc0a7a323b80ee5c','consumption_submit_1782518569948_82acbb7ce6fd660c','consume_32_12803_1782518571042',156533,NULL,'2026-06-27 08:02:51','2026-06-27 08:02:56','核实无误，审核通过',32,'2026-06-27 08:02:56',0,NULL,'2026-06-27 08:02:56',838,NULL,0,'CS26062700309015',NULL,NULL,NULL),
(3091,12803,32,3000.00,3000,'approved','QRV2_eyJ1c2VyX3V1aWQiOiIyOTg2YWViOC03MDk1LTRiYzYtODBhOC00ZWE3ZjM3OGNlYzYiLCJleHAiOjE3ODI1ODMxNTIzOTAsIm5vbmNlIjoiOTI0ZjRiODZkN2E4YjgzOTU1OTkxMWQ3M2I1MGFiNmEifQ_93fc2f45d23133a97f51b76a3465ae275d9f3e6518fc93849fd839a3ddcb3cb6','consumption_submit_1782582887996_ce98f67b5177e530','consume_32_12803_1782582888227',156677,NULL,'2026-06-28 01:54:48','2026-06-28 01:56:24','核实无误，审核通过',32,'2026-06-28 01:56:24',0,NULL,'2026-06-28 01:56:24',838,NULL,0,'CS26062800309118',NULL,NULL,NULL),
(3092,12803,32,3000.00,3000,'approved','QRV2_eyJ1c2VyX3V1aWQiOiIyOTg2YWViOC03MDk1LTRiYzYtODBhOC00ZWE3ZjM3OGNlYzYiLCJleHAiOjE3ODI1ODU2MDAxNDksIm5vbmNlIjoiMzI0NDFjNmVkZjQ0Yzc5ODQ4YWVmYTgwOWYwZTU2Y2EifQ_d3a69b1f7af35477e30101f265d7df35788f8b02a416a6f0973c83bb5c5de1ee','consumption_submit_1782585324616_569d3529ee62ea18','consume_32_12803_1782585324804',157211,NULL,'2026-06-28 02:35:24','2026-06-28 02:35:30','核实无误，审核通过',32,'2026-06-28 02:35:30',0,NULL,'2026-06-28 02:35:30',838,NULL,0,'CS260628003092EC',NULL,NULL,NULL),
(3093,12804,32,3000.00,3000,'approved','QRV2_eyJ1c2VyX3V1aWQiOiJkMDFhNDkyYS1jMjYzLTRkODYtOGM5Mi0yMDQzM2JkZWRjZDYiLCJleHAiOjE3ODI1ODc0NDYxOTQsIm5vbmNlIjoiZmEzNDIxNzQyZTE5OGNmYTQ0MTliODI1MjdjMWVjMmQifQ_72528815af12c5d1af49bdc1af7449778623800e5605d83f12713b1a3773a3d6','consumption_submit_1782587190862_b4f1de66d5fa0a98','consume_32_12804_1782587191055',157611,NULL,'2026-06-28 03:06:31','2026-06-28 03:06:42','核实无误，审核通过',32,'2026-06-28 03:06:42',0,NULL,'2026-06-28 03:06:42',838,NULL,0,'CS26062800309327',NULL,NULL,NULL),
(3115,12805,32,3000.00,3000,'pending','QRV2_eyJ1c2VyX3V1aWQiOiIyZGE3NWFjNC02NTM0LTQwM2MtYTJiNS1hOGM3YjAzMDM3NTIiLCJleHAiOjE3ODI2MDUwNzY3MTUsIm5vbmNlIjoiM2NkZjdmOTczNjlkNDMxMGExODlkNzU3Y2MwZmIwMTEifQ_2f235222b7e3501593e28d86da63be637fedcc48b31bf0329bc5923d25dc0c11','consumption_submit_1782604809670_ba3852c00b4036e2','consume_32_12805_1782604809923',NULL,'6','2026-06-28 08:00:09','2026-06-28 08:00:09',NULL,NULL,NULL,0,NULL,NULL,838,NULL,0,'CS26062800311598',NULL,NULL,NULL);
/*!40000 ALTER TABLE `consumption_records` ENABLE KEYS */;
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
