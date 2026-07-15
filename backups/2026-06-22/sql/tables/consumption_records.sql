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
  `final_status` enum('pending_review','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending_review' COMMENT '业务最终状态（审批通过/拒绝后落地）',
  `settled_at` datetime DEFAULT NULL COMMENT '结算时间（审批完成时落地，北京时间）',
  `store_id` int NOT NULL COMMENT '门店ID（外键关联 stores 表）',
  `anomaly_flags` json DEFAULT NULL COMMENT '异常标记JSON数组，如["large_amount","high_frequency"]',
  `anomaly_score` tinyint unsigned NOT NULL DEFAULT '0' COMMENT '异常评分 0-100，0=正常，分数越高越可疑',
  `order_no` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '消费买单订单号（CS 前缀）',
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
  KEY `idx_consumption_final_status` (`final_status`,`settled_at`),
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
) ENGINE=InnoDB AUTO_INCREMENT=3060 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户消费记录表 - 记录用户通过商家扫码提交的消费信息';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `consumption_records`
--

LOCK TABLES `consumption_records` WRITE;
/*!40000 ALTER TABLE `consumption_records` DISABLE KEYS */;
INSERT INTO `consumption_records` VALUES
(394,31,31,150.00,150,'approved','QRV2_eyJ1c2VyX3V1aWQiOiI1NWM4MzBjMC00NjY3LTRhNjEtOWI1Ni0wOTRkOTE0ZTk2YjkiLCJleHAiOjE3NjgyNjMyNTA0NTYsIm5vbmNlIjoiM2YxZmZiZTllYTkxM2QzMjVmZDZkNDM4ZTEzYWVhYzEifQ_48645eac074a83af3f256c0a0172f285d4abb224b80a51845db0d1c765b090eb','final-test-1768262950','consumption_31_1768262950519_tsvih9',38653,NULL,'2026-01-13 08:09:10','2026-02-15 12:53:13','核实无误，审核通过',31,'2026-02-15 12:53:13',0,NULL,'approved','2026-02-15 12:53:13',7,NULL,0,'CS260113000394F7'),
(395,31,31,50.00,50,'approved','QRV2_eyJ1c2VyX3V1aWQiOiI1NWM4MzBjMC00NjY3LTRhNjEtOWI1Ni0wOTRkOTE0ZTk2YjkiLCJleHAiOjE3NjgyNjMyNzg5NTIsIm5vbmNlIjoiOWI1ZDYzZjFlYmNlNzBmNzkyYjVlZTBlYTQ1YjdiMGUifQ_80838cd04e455b755b24ce3e444cdaee0035e4ae1239be36033599806137bfd7','replay-test-1768262978-1','consumption_31_1768262979007_uw4ogh',38684,NULL,'2026-01-13 08:09:39','2026-02-15 19:41:38','核实无误，审核通过',31,'2026-02-15 19:41:38',0,NULL,'approved','2026-02-15 19:41:38',7,NULL,0,'CS2601130003956D'),
(396,31,31,20.00,20,'approved','QRV2_eyJ1c2VyX3V1aWQiOiI1NWM4MzBjMC00NjY3LTRhNjEtOWI1Ni0wOTRkOTE0ZTk2YjkiLCJleHAiOjE3NjgyNjMyOTc5NTksIm5vbmNlIjoiNjllZjM2MjNmZGJiMTYwODAyODhiNmZkMzM0YzRlZmQifQ_2493c02ef04524be55af0141b8a85dfcfef399592497903dd6416f4617255b60','freq-test-1768262997-1-18468','consumption_31_1768262998000_wti5rx',11047,NULL,'2026-01-13 08:09:58','2026-01-26 08:39:48',NULL,31,'2026-01-26 08:39:48',0,NULL,'approved','2026-01-26 08:39:48',7,NULL,0,'CS260113000396CD'),
(397,31,31,20.00,20,'approved','QRV2_eyJ1c2VyX3V1aWQiOiI1NWM4MzBjMC00NjY3LTRhNjEtOWI1Ni0wOTRkOTE0ZTk2YjkiLCJleHAiOjE3NjgyNjMyOTgwNzgsIm5vbmNlIjoiNWI0MWQwYjc5NTM4ZGRiYjI5ZWU3ODkzYjgxMmQwZjQifQ_a4f13b058fbfdf42468347fe14701018f4f1aeedf46fda87c943a158d801da1a','freq-test-1768262998-2-18468','consumption_31_1768262998120_rz2jf2',16484,NULL,'2026-01-13 08:09:58','2026-01-28 07:29:38',NULL,31,'2026-01-28 07:29:38',0,NULL,'approved','2026-01-28 07:29:38',7,NULL,0,'CS26011300039714'),
(398,31,31,20.00,20,'approved','QRV2_eyJ1c2VyX3V1aWQiOiI1NWM4MzBjMC00NjY3LTRhNjEtOWI1Ni0wOTRkOTE0ZTk2YjkiLCJleHAiOjE3NjgyNjMyOTgyMDIsIm5vbmNlIjoiMGFmZGM5NzgwZWMyN2VmNmUxNDk1NGFlYjY0OGFjZDIifQ_7056561f28cc0e1b551d4f57c7f4703f4e612d6f0a47d533b61a4abecfbf33de','freq-test-1768262998-3-18468','consumption_31_1768262998241_b8rmbj',95474,NULL,'2026-01-13 08:09:58','2026-03-07 02:56:09','核实无误，审核通过',31,'2026-03-07 02:56:09',0,NULL,'approved','2026-03-07 02:56:09',7,NULL,0,'CS260113000398DD'),
(399,31,31,20.00,20,'approved','QRV2_eyJ1c2VyX3V1aWQiOiI1NWM4MzBjMC00NjY3LTRhNjEtOWI1Ni0wOTRkOTE0ZTk2YjkiLCJleHAiOjE3NjgyNjMyOTgzMjAsIm5vbmNlIjoiYjczZDA5N2IyZTczNTQ0YjE4NjUxNWVkMTE3NTQwMGYifQ_08b4f24b01b6956783403b24eea2693263deaa272b60f6d5fd7c2e47a6be7d8d','freq-test-1768262998-4-18468','consumption_31_1768262998360_sycvlq',95492,NULL,'2026-01-13 08:09:58','2026-03-07 02:56:21','核实无误，审核通过',31,'2026-03-07 02:56:21',0,NULL,'approved','2026-03-07 02:56:21',7,NULL,0,'CS2601130003997A'),
(400,31,31,20.00,20,'approved','QRV2_eyJ1c2VyX3V1aWQiOiI1NWM4MzBjMC00NjY3LTRhNjEtOWI1Ni0wOTRkOTE0ZTk2YjkiLCJleHAiOjE3NjgyNjMyOTg0MzksIm5vbmNlIjoiYjA3MDg2NTdjNjBkNDFkZGVhYjAxM2VlYzRlMGJkZjcifQ_4cc7bbf3e7d725071c38b8e900c51dbfaacbfc5f9d219f72e960000563d9e5e3','freq-test-1768262998-5-18468','consumption_31_1768262998478_zxobyc',95498,NULL,'2026-01-13 08:09:58','2026-03-07 02:56:29','核实无误，审核通过',31,'2026-03-07 02:56:29',0,NULL,'approved','2026-03-07 02:56:29',7,NULL,0,'CS26011300040010'),
(401,31,31,20.00,20,'approved','QRV2_eyJ1c2VyX3V1aWQiOiI1NWM4MzBjMC00NjY3LTRhNjEtOWI1Ni0wOTRkOTE0ZTk2YjkiLCJleHAiOjE3NjgyNjMyOTg1NTQsIm5vbmNlIjoiNDgwMDZkNDEyOTllNjJjN2FlNzRhNWY0ZDA4NzA1OGUifQ_581fb649b88aa444c77868b990ee0fd8cc0580e1a595d125af81381d803fe9b2','freq-test-1768262998-6-18468','consumption_31_1768262998595_gbfbjo',95480,NULL,'2026-01-13 08:09:58','2026-03-07 02:56:14','核实无误，审核通过',31,'2026-03-07 02:56:14',0,NULL,'approved','2026-03-07 02:56:14',7,NULL,0,'CS2601130004014C'),
(402,31,31,20.00,20,'approved','QRV2_eyJ1c2VyX3V1aWQiOiI1NWM4MzBjMC00NjY3LTRhNjEtOWI1Ni0wOTRkOTE0ZTk2YjkiLCJleHAiOjE3NjgyNjMyOTg2NzAsIm5vbmNlIjoiZjBhNDQyMGRlMDY4MmJkMmZhZmJkMDZmOTg3MzZhNjcifQ_bd40ee83df3fe933dd0bd93ba0a1541380a12e4e2645288cbfef3b15b019369d','freq-test-1768262998-7-18468','consumption_31_1768262998710_fryzgr',95486,NULL,'2026-01-13 08:09:58','2026-03-07 02:56:18','核实无误，审核通过',31,'2026-03-07 02:56:18',0,NULL,'approved','2026-03-07 02:56:18',7,NULL,0,'CS260113000402B9'),
(403,31,31,20.00,20,'approved','QRV2_eyJ1c2VyX3V1aWQiOiI1NWM4MzBjMC00NjY3LTRhNjEtOWI1Ni0wOTRkOTE0ZTk2YjkiLCJleHAiOjE3NjgyNjMyOTg3ODYsIm5vbmNlIjoiNzg3NGJjZWVjN2QwOTA5ZGNjMWI3OWVhY2RhYWVhZGMifQ_bc82e52f2cf971825ea910cb4a1ec14a3f74157fb5bb9457e8a63f132d1998bc','freq-test-1768262998-8-18468','consumption_31_1768262998825_v3cba7',96950,NULL,'2026-01-13 08:09:58','2026-03-09 02:12:15','批量审核通过',31,'2026-03-09 02:12:15',0,NULL,'approved','2026-03-09 02:12:15',7,NULL,0,'CS26011300040341'),
(1870,31,31,88.50,89,'approved','QRV2_test_business_flow_mock','test_success_1769937211086_gdzgqu','consumption_31_1769937211102_eeafay',96956,'单元测试消费记录','2026-02-01 17:13:31','2026-03-09 02:12:15','批量审核通过',31,'2026-03-09 02:12:15',0,NULL,'approved','2026-03-09 02:12:15',7,NULL,0,'CS2602010018700D'),
(1871,31,31,50.00,50,'approved','QRV2_test_business_flow_mock','test_duplicate_1769937211128','consumption_31_1769937211144_ip0u49',96962,NULL,'2026-02-01 17:13:31','2026-03-09 02:12:15','批量审核通过',31,'2026-03-09 02:12:15',0,NULL,'approved','2026-03-09 02:12:15',7,NULL,0,'CS260201001871F1'),
(1886,31,31,88.50,89,'approved','QRV2_test_business_flow_mock','test_success_1769947909796_lywq0e','consumption_31_1769947909814_ne6wff',96968,'单元测试消费记录','2026-02-01 20:11:49','2026-03-09 02:12:15','批量审核通过',31,'2026-03-09 02:12:15',0,NULL,'approved','2026-03-09 02:12:15',7,NULL,0,'CS260201001886A7'),
(1887,31,31,50.00,50,'approved','QRV2_test_business_flow_mock','test_duplicate_1769947909838','consumption_31_1769947909853_dympbs',96974,NULL,'2026-02-01 20:11:49','2026-03-09 02:12:15','批量审核通过',31,'2026-03-09 02:12:15',0,NULL,'approved','2026-03-09 02:12:15',7,NULL,0,'CS2602010018870F'),
(1895,31,31,88.50,89,'approved','QRV2_test_business_flow_mock','test_success_1769948320956_y8bjml','consumption_31_1769948320973_mwodu4',96830,'单元测试消费记录','2026-02-01 20:18:40','2026-03-09 02:05:00','批量审核通过',31,'2026-03-09 02:05:00',0,NULL,'approved','2026-03-09 02:05:00',7,NULL,0,'CS260201001895A4'),
(1896,31,31,50.00,50,'approved','QRV2_test_business_flow_mock','test_duplicate_1769948321006','consumption_31_1769948321022_zemc9v',96836,NULL,'2026-02-01 20:18:41','2026-03-09 02:05:00','批量审核通过',31,'2026-03-09 02:05:00',0,NULL,'approved','2026-03-09 02:05:00',7,NULL,0,'CS260201001896E7'),
(1904,31,31,88.50,89,'approved','QRV2_test_business_flow_mock','test_success_1769948504877_gih2nr','consumption_31_1769948504896_givef3',96842,'单元测试消费记录','2026-02-01 20:21:44','2026-03-09 02:05:00','批量审核通过',31,'2026-03-09 02:05:00',0,NULL,'approved','2026-03-09 02:05:00',7,NULL,0,'CS260201001904CF'),
(1905,31,31,50.00,50,'approved','QRV2_test_business_flow_mock','test_duplicate_1769948504959','consumption_31_1769948504975_vqxx62',96848,NULL,'2026-02-01 20:21:44','2026-03-09 02:05:01','批量审核通过',31,'2026-03-09 02:05:01',0,NULL,'approved','2026-03-09 02:05:01',7,NULL,0,'CS26020100190524'),
(1913,31,31,88.50,89,'approved','QRV2_test_business_flow_mock','test_success_1769949997550_rvo5hh','consumption_31_1769949997567_c4q0a8',96854,'单元测试消费记录','2026-02-01 20:46:37','2026-03-09 02:05:01','批量审核通过',31,'2026-03-09 02:05:01',0,NULL,'approved','2026-03-09 02:05:01',7,NULL,0,'CS260201001913AE'),
(1914,31,31,50.00,50,'approved','QRV2_test_business_flow_mock','test_duplicate_1769949997591','consumption_31_1769949997646_20ioas',96860,NULL,'2026-02-01 20:46:37','2026-03-09 02:05:01','批量审核通过',31,'2026-03-09 02:05:01',0,NULL,'approved','2026-03-09 02:05:01',7,NULL,0,'CS260201001914FF'),
(1922,31,31,88.50,89,'approved','QRV2_test_business_flow_mock','test_success_1769950004681_r22l9p','consumption_31_1769950004746_jjy2el',96866,'单元测试消费记录','2026-02-01 20:46:44','2026-03-09 02:05:01','批量审核通过',31,'2026-03-09 02:05:01',0,NULL,'approved','2026-03-09 02:05:01',7,NULL,0,'CS2602010019220C'),
(1923,31,31,50.00,50,'approved','QRV2_test_business_flow_mock','test_duplicate_1769950004770','consumption_31_1769950004785_yu0zep',96872,NULL,'2026-02-01 20:46:44','2026-03-09 02:05:01','批量审核通过',31,'2026-03-09 02:05:01',0,NULL,'approved','2026-03-09 02:05:01',7,NULL,0,'CS2602010019239E'),
(1931,31,31,88.50,89,'approved','QRV2_test_business_flow_mock','test_success_1769950069166_31juzt','consumption_31_1769950069182_cznneq',96878,'单元测试消费记录','2026-02-01 20:47:49','2026-03-09 02:05:01','批量审核通过',31,'2026-03-09 02:05:01',0,NULL,'approved','2026-03-09 02:05:01',7,NULL,0,'CS2602010019319D'),
(1932,31,31,50.00,50,'approved','QRV2_test_business_flow_mock','test_duplicate_1769950069259','consumption_31_1769950069274_ddd8rz',96884,NULL,'2026-02-01 20:47:49','2026-03-09 02:05:01','批量审核通过',31,'2026-03-09 02:05:01',0,NULL,'approved','2026-03-09 02:05:01',7,NULL,0,'CS26020100193233'),
(1940,31,31,88.50,89,'approved','QRV2_test_business_flow_mock','test_success_1769950707349_hawql','consumption_31_1769950707366_mzlg2a',96890,'单元测试消费记录','2026-02-01 20:58:27','2026-03-09 02:05:01','批量审核通过',31,'2026-03-09 02:05:01',0,NULL,'approved','2026-03-09 02:05:01',7,NULL,0,'CS26020100194007'),
(1941,31,31,50.00,50,'approved','QRV2_test_business_flow_mock','test_duplicate_1769950707390','consumption_31_1769950707407_0hg5ei',96896,NULL,'2026-02-01 20:58:27','2026-03-09 02:05:01','批量审核通过',31,'2026-03-09 02:05:01',0,NULL,'approved','2026-03-09 02:05:01',7,NULL,0,'CS260201001941B2'),
(1949,31,31,88.50,89,'approved','QRV2_test_business_flow_mock','test_success_1769950889650_zq5g1','consumption_31_1769950889665_e5eb7m',96902,'单元测试消费记录','2026-02-01 21:01:29','2026-03-09 02:05:01','批量审核通过',31,'2026-03-09 02:05:01',0,NULL,'approved','2026-03-09 02:05:01',7,NULL,0,'CS26020100194969'),
(1950,31,31,50.00,50,'approved','QRV2_test_business_flow_mock','test_duplicate_1769950889690','consumption_31_1769950889707_eo1z89',96908,NULL,'2026-02-01 21:01:29','2026-03-09 02:05:01','批量审核通过',31,'2026-03-09 02:05:01',0,NULL,'approved','2026-03-09 02:05:01',7,NULL,0,'CS2602010019503B'),
(1958,31,31,88.50,89,'approved','QRV2_test_business_flow_mock','test_success_1769951567778_s4yfmb','consumption_31_1769951567794_u135fm',96914,'单元测试消费记录','2026-02-01 21:12:47','2026-03-09 02:05:01','批量审核通过',31,'2026-03-09 02:05:01',0,NULL,'approved','2026-03-09 02:05:01',7,NULL,0,'CS26020100195889'),
(1959,31,31,50.00,50,'approved','QRV2_test_business_flow_mock','test_duplicate_1769951567845','consumption_31_1769951567861_7fmeox',96920,NULL,'2026-02-01 21:12:47','2026-03-09 02:05:01','批量审核通过',31,'2026-03-09 02:05:01',0,NULL,'approved','2026-03-09 02:05:01',7,NULL,0,'CS260201001959A9'),
(1967,31,31,88.50,89,'approved','QRV2_test_business_flow_mock','test_success_1769951697550_7cporc','consumption_31_1769951697576_rl3rqi',96926,'单元测试消费记录','2026-02-01 21:14:57','2026-03-09 02:05:01','批量审核通过',31,'2026-03-09 02:05:01',0,NULL,'approved','2026-03-09 02:05:01',7,NULL,0,'CS260201001967C6'),
(1968,31,31,50.00,50,'approved','QRV2_test_business_flow_mock','test_duplicate_1769951697654','consumption_31_1769951697679_zx015u',96932,NULL,'2026-02-01 21:14:57','2026-03-09 02:05:01','批量审核通过',31,'2026-03-09 02:05:01',0,NULL,'approved','2026-03-09 02:05:01',7,NULL,0,'CS2602010019687C'),
(1976,31,31,88.50,89,'approved','QRV2_test_business_flow_mock','test_success_1769952032586_vm65o2','consumption_31_1769952032606_emuhbg',96938,'单元测试消费记录','2026-02-01 21:20:32','2026-03-09 02:05:01','批量审核通过',31,'2026-03-09 02:05:01',0,NULL,'approved','2026-03-09 02:05:01',7,NULL,0,'CS26020100197624'),
(1977,31,31,50.00,50,'approved','QRV2_test_business_flow_mock','test_duplicate_1769952032630','consumption_31_1769952032650_1xqje0',96944,NULL,'2026-02-01 21:20:32','2026-03-09 02:05:01','批量审核通过',31,'2026-03-09 02:05:01',0,NULL,'approved','2026-03-09 02:05:01',7,NULL,0,'CS26020100197741'),
(1985,31,31,88.50,89,'approved','QRV2_test_business_flow_mock','test_success_1769952988142_n25sgj','consumption_31_1769952988289_12lvfp',96804,'单元测试消费记录','2026-02-01 21:36:28','2026-03-09 01:56:30','批量审核通过',31,'2026-03-09 01:56:30',0,NULL,'approved','2026-03-09 01:56:30',7,NULL,0,'CS260201001985A5'),
(1986,31,31,50.00,50,'approved','QRV2_test_business_flow_mock','test_duplicate_1769952988481','consumption_31_1769952988653_100ewo',96810,NULL,'2026-02-01 21:36:28','2026-03-09 01:56:30','批量审核通过',31,'2026-03-09 01:56:30',0,NULL,'approved','2026-03-09 01:56:30',7,NULL,0,'CS2602010019861C'),
(1994,31,31,88.50,89,'approved','QRV2_test_business_flow_mock','test_success_1769953596643_ee1p0f','consumption_31_1769953596785_28r3in',40049,'单元测试消费记录','2026-02-01 21:46:36','2026-02-20 15:57:06',NULL,31,'2026-02-20 15:57:06',0,NULL,'approved','2026-02-20 15:57:06',7,NULL,0,'CS2602010019947A'),
(1995,31,31,50.00,50,'approved','QRV2_test_business_flow_mock','test_duplicate_1769953596968','consumption_31_1769953597110_9sn2cy',40045,NULL,'2026-02-01 21:46:37','2026-02-20 15:56:30',NULL,31,'2026-02-20 15:56:30',0,NULL,'approved','2026-02-20 15:56:30',7,NULL,0,'CS260201001995E1'),
(2003,31,31,88.50,89,'approved','QRV2_test_business_flow_mock','test_success_1769954091800_c3yv6a','consumption_31_1769954091942_gjopaz',38686,'单元测试消费记录','2026-02-01 21:54:51','2026-02-16 06:13:31','测试脚本审核通过',31,'2026-02-16 06:13:31',0,NULL,'approved','2026-02-16 06:13:31',7,NULL,0,'CS2602010020034C'),
(2004,31,31,50.00,50,'approved','QRV2_test_business_flow_mock','test_duplicate_1769954092124','consumption_31_1769954092270_xc3nvt',32356,NULL,'2026-02-01 21:54:52','2026-02-02 18:37:16',NULL,31,'2026-02-02 18:37:16',0,NULL,'approved','2026-02-02 18:37:16',7,NULL,0,'CS2602010020049A'),
(2012,31,31,88.50,89,'approved','QRV2_test_business_flow_mock','test_success_1769968083052_fjq8c','consumption_31_1769968083202_ps8po7',31798,'单元测试消费记录','2026-02-02 01:48:03','2026-02-02 07:33:15',NULL,31,'2026-02-02 07:33:15',0,NULL,'approved','2026-02-02 07:33:15',7,NULL,0,'CS26020200201258'),
(2013,31,31,50.00,50,'approved','QRV2_test_business_flow_mock','test_duplicate_1769968083397','consumption_31_1769968083549_fa3tz7',31796,NULL,'2026-02-02 01:48:03','2026-02-02 07:31:23',NULL,31,'2026-02-02 07:31:23',0,NULL,'approved','2026-02-02 07:31:23',7,NULL,0,'CS260202002013CF'),
(2021,31,31,88.50,89,'approved','QRV2_test_business_flow_mock','test_success_1769970377159_9jo73f','consumption_31_1769970377303_5hj32p',31794,'单元测试消费记录','2026-02-02 02:26:17','2026-02-02 07:26:32',NULL,31,'2026-02-02 07:26:32',0,NULL,'approved','2026-02-02 07:26:32',7,NULL,0,'CS26020200202161'),
(2030,31,31,88.50,89,'approved','QRV2_test_business_flow_mock','test_success_1769973421622_x0tg5d','consumption_31_1769973421638_ulcfu6',31792,'单元测试消费记录','2026-02-02 03:17:01','2026-02-02 07:05:13',NULL,31,'2026-02-02 07:05:13',0,NULL,'approved','2026-02-02 07:05:13',7,NULL,0,'CS2602020020301C'),
(2031,31,31,50.00,50,'approved','QRV2_test_business_flow_mock','test_duplicate_1769973421661','consumption_31_1769973421676_b582s9',31790,NULL,'2026-02-02 03:17:01','2026-02-02 06:36:40',NULL,31,'2026-02-02 06:36:40',0,NULL,'approved','2026-02-02 06:36:40',7,NULL,0,'CS2602020020316D'),
(2039,31,31,88.50,89,'approved','QRV2_test_business_flow_mock','test_success_1769973439083_zv3prk','consumption_31_1769973439098_kyor91',31788,'单元测试消费记录','2026-02-02 03:17:19','2026-02-02 06:36:36',NULL,31,'2026-02-02 06:36:36',0,NULL,'approved','2026-02-02 06:36:36',7,NULL,0,'CS26020200203972'),
(2040,31,31,50.00,50,'approved','QRV2_test_business_flow_mock','test_duplicate_1769973439123','consumption_31_1769973439138_qsg56q',31786,NULL,'2026-02-02 03:17:19','2026-02-02 06:28:28',NULL,31,'2026-02-02 06:28:28',0,NULL,'approved','2026-02-02 06:28:28',7,NULL,0,'CS26020200204023'),
(3053,31,32,2222.00,2222,'approved','QRV2_eyJ1c2VyX3V1aWQiOiJjYTFlMWEzNy03M2U3LTQ2YjktOTY5YS1hZWVhNjZmNWQ1MTAiLCJleHAiOjE3ODEyMTMyNTUyNjYsIm5vbmNlIjoiZTRiOGE2ZjI1ZTgxNzE3MmQxNWEyZTBjZDU1MWNlZDcifQ_24d108bccc27356c2b2865260b78c4fc39c79ff9b5badbab3dfa220d98cb1011','consumption_submit_1781212971736_112f2d0109f4cb82','consume_32_31_1781212971910',154290,NULL,'2026-06-12 05:22:51','2026-06-12 08:06:56','审核通过',31,'2026-06-12 08:06:56',0,NULL,'approved','2026-06-12 08:06:56',11,NULL,0,'CS26061200305399'),
(3054,32,31,3666.00,3666,'approved','QRV2_eyJ1c2VyX3V1aWQiOiJjZGZlNDNiMC1kNjdiLTQxODUtODg2ZS0xODU4NzZjZjMxNjQiLCJleHAiOjE3ODEyMTM3NDQxMzMsIm5vbmNlIjoiYTE4N2NmZjk1YzM1OGViMzk3YWY2ZjQ4MmVhMmJiMjMifQ_9f2feb0c688534c34a3442d1708453b11c7b3f37838d85652fc4180d985aa122','consumption_submit_1781213467123_85e0898ed248baa2','consume_31_32_1781213467283',154284,NULL,'2026-06-12 05:31:07','2026-06-12 08:06:48','审核通过',31,'2026-06-12 08:06:48',0,NULL,'approved','2026-06-12 08:06:48',11,NULL,0,'CS26061200305485'),
(3057,32,31,1369.00,1369,'approved','QRV2_eyJ1c2VyX3V1aWQiOiJjZGZlNDNiMC1kNjdiLTQxODUtODg2ZS0xODU4NzZjZjMxNjQiLCJleHAiOjE3ODEyODkzNDg5MTIsIm5vbmNlIjoiMWU4NzE4ZmJkYmI5MTQ3OGM3N2IzZmMwNGFhMTgyZGIifQ_f5a89284e8db3d8459ad0ae6e91f1c1a8d14d46148b33e361a7c00466dc20acd','consumption_submit_1781289064643_1a516254360b7276','consume_31_32_1781289064992',155063,NULL,'2026-06-13 02:31:04','2026-06-14 08:47:16','核实无误，审核通过',32,'2026-06-14 08:47:16',0,NULL,'approved','2026-06-14 08:47:16',11,NULL,0,'CS26061300305795'),
(3058,31,32,3669.00,3669,'pending','QRV2_eyJ1c2VyX3V1aWQiOiJjYTFlMWEzNy03M2U3LTQ2YjktOTY5YS1hZWVhNjZmNWQ1MTAiLCJleHAiOjE3ODEyODkzMDA0ODksIm5vbmNlIjoiMjU4ZWExZGFhNDUzNDJlMjY5ZjdjZTg3NzdjZDMwMzYifQ_b9dbd859789b299a9b79087d898c50ea19dca114d15b3a9276eb1c869fd3de28','consumption_submit_1781289146246_8d91c645a30444db','consume_32_31_1781289146852',NULL,NULL,'2026-06-13 02:32:26','2026-06-13 02:32:26',NULL,NULL,NULL,0,NULL,'pending_review',NULL,11,NULL,0,'CS260613003058C8'),
(3059,32,31,222.00,222,'approved','QRV2_eyJ1c2VyX3V1aWQiOiJjZGZlNDNiMC1kNjdiLTQxODUtODg2ZS0xODU4NzZjZjMxNjQiLCJleHAiOjE3ODEzMDU5MjUyNDcsIm5vbmNlIjoiOGQ5ZTkzMTlhY2U4YTcxMGFhODVmNGUyODI0YWQ5MDMifQ_fd205a861d0481a9c9e4945d7036cb88db70c5d8c72d608451442b754051006d','consumption_submit_1781305747658_e522e115587bc128','consume_31_32_1781305748327',154746,NULL,'2026-06-13 07:09:08','2026-06-13 07:29:15','审核通过',32,'2026-06-13 07:29:15',0,NULL,'approved','2026-06-13 07:29:15',11,NULL,0,'CS2606130030591A');
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

-- Dump completed on 2026-06-21 19:08:11
