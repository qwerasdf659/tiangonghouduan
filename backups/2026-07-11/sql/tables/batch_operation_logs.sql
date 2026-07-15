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
-- Table structure for table `batch_operation_logs`
--

DROP TABLE IF EXISTS `batch_operation_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `batch_operation_logs` (
  `batch_operation_log_id` int NOT NULL AUTO_INCREMENT,
  `idempotency_key` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '幂等键（格式：{operation_type}:{operator_id}:{timestamp}:{hash}）- 防止重复提交',
  `operation_type` enum('quota_grant_batch','preset_batch','redemption_verify_batch','campaign_status_batch','budget_adjust_batch') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '操作类型：quota_grant_batch=批量赠送抽奖次数 | preset_batch=批量设置干预规则 | redemption_verify_batch=批量核销确认 | campaign_status_batch=批量活动状态切换 | budget_adjust_batch=批量预算调整',
  `status` enum('processing','partial_success','completed','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'processing' COMMENT '操作状态：processing=处理中 | partial_success=部分成功 | completed=全部成功 | failed=全部失败',
  `total_count` int NOT NULL COMMENT '总操作数量',
  `success_count` int NOT NULL DEFAULT '0' COMMENT '成功数量',
  `fail_count` int NOT NULL DEFAULT '0' COMMENT '失败数量',
  `operation_params` json DEFAULT NULL COMMENT '操作参数JSON（存储原始请求参数，便于重试和审计）',
  `result_summary` json DEFAULT NULL COMMENT '结果摘要JSON（格式：{success_items: [{id, result}], failed_items: [{id, error}]}）',
  `operator_id` int NOT NULL COMMENT '操作人ID（外键，关联 users.user_id）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  `completed_at` datetime DEFAULT NULL COMMENT '完成时间（北京时间）- 操作完成（无论成功/失败）时记录',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  PRIMARY KEY (`batch_operation_log_id`),
  UNIQUE KEY `idempotency_key` (`idempotency_key`),
  UNIQUE KEY `idx_batch_ops_idempotency_key` (`idempotency_key`),
  KEY `idx_batch_ops_operator_created` (`operator_id`,`created_at`),
  KEY `idx_batch_ops_status` (`status`),
  KEY `idx_batch_ops_type_status` (`operation_type`,`status`),
  KEY `idx_batch_ops_created_at` (`created_at`),
  CONSTRAINT `batch_operation_logs_ibfk_1` FOREIGN KEY (`operator_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=190 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='批量操作日志表 - 幂等性控制与操作审计（阶段C核心基础设施）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `batch_operation_logs`
--

LOCK TABLES `batch_operation_logs` WRITE;
/*!40000 ALTER TABLE `batch_operation_logs` DISABLE KEYS */;
INSERT INTO `batch_operation_logs` VALUES
(188,'quota_grant_batch:32:29721336:18ead2ebd2d3c93b','quota_grant_batch','completed',1,1,0,'{\"reason\": \"集成测试-字段名验证-1783280180006\", \"user_ids\": [32], \"bonus_count\": 1, \"lottery_campaign_id\": 1}','{\"reason\": \"集成测试-字段名验证-1783280180006\", \"bonus_count\": 1, \"failed_items\": [], \"success_items\": [{\"message\": \"赠送成功\", \"user_id\": 32, \"new_bonus_count\": 1}], \"lottery_campaign_id\": 1}',32,'2026-07-06 03:36:20','2026-07-06 03:36:20','2026-07-06 03:36:20'),
(189,'budget_adjust_batch:32:29721336:f377f62a396e619b','budget_adjust_batch','failed',1,0,1,'{\"reason\": \"集成测试-预算增加-1783280180362\", \"adjustments\": [{\"amount\": 100, \"adjustment_type\": \"increase\", \"lottery_campaign_id\": 1}]}','{\"reason\": \"集成测试-预算增加-1783280180362\", \"failed_items\": [{\"index\": 0, \"amount\": 100, \"error_code\": \"BUDGET_MODE_NOT_SUPPORTED\", \"error_message\": \"活动 餐厅消费回馈 的预算模式为 user，仅 budget_mode=pool 的活动支持预算调整\", \"adjustment_type\": \"increase\", \"lottery_campaign_id\": 1}], \"success_items\": []}',32,'2026-07-06 03:36:20','2026-07-06 03:36:20','2026-07-06 03:36:20');
/*!40000 ALTER TABLE `batch_operation_logs` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-10 18:10:56
