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
-- Table structure for table `sequelizemeta`
--

DROP TABLE IF EXISTS `sequelizemeta`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sequelizemeta` (
  `name` varchar(255) COLLATE utf8mb3_unicode_ci NOT NULL,
  PRIMARY KEY (`name`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sequelizemeta`
--

LOCK TABLES `sequelizemeta` WRITE;
/*!40000 ALTER TABLE `sequelizemeta` DISABLE KEYS */;
INSERT INTO `sequelizemeta` VALUES
('20260322235500-baseline-v4.1.0-squashed.js'),
('20260323012417-add-avg-budget-per-draw-to-hourly-metrics.js'),
('20260323140000-fix-media-attachable-type-category-def.js'),
('20260324160000-create-c2c-auction-tables.js'),
('20260330193219-backfill-trade-orders-idempotency-key-unified.js'),
('20260331112300-create-diy-tables.js'),
('20260331180000-refactor-diy-tables-align-spec.js'),
('20260331200000-create-diy-materials.js'),
('20260401120000-rename-asset-codes-star-stone-core-gem.js'),
('20260401130000-rename-ad-diamond-columns-to-star-stone.js'),
('20260405193939-create-asset-conversion-rules.js'),
('20260405215638-add-display-category-to-asset-conversion-rules.js'),
('20260405224635-alter-description-to-text-in-asset-conversion-rules.js'),
('20260407192705-diy-engine-refactor-phase1.js'),
('20260407230000-diy-engine-refactor-phase2.js'),
('20260408060000-diy-phase3-data-governance.js'),
('20260408120000-diy-enforce-image-requirements.js'),
('20260422030901-add-balance-check-constraints.js'),
('20260422032823-add-balance-check-constraints.js'),
('20260422100100-fill-system-settings-descriptions.js'),
('20260423000000-add-wx-openid-to-users.js'),
('20260425040000-diy-material-code-unify.js'),
('20260425050000-diy-works-idempotency-key-backfill.js'),
('20260429010000-fix-notification-content-chinese.js'),
('20260505000000-drop-bak-conversion-tables.js'),
('20260526000000-create-prize-definitions-and-campaign-prizes.js'),
('20260526000100-add-lottery-campaign-prize-id-to-draws.js'),
('20260526000200-migrate-lottery-presets-fk.js'),
('20260526000300-drop-lottery-prizes-table.js'),
('20260527000000-add-order-polymorphic-to-issues.js'),
('20260601000000-add-device-id-to-auth-sessions.js'),
('20260602000000-create-trade-disputes-and-slim-issues.js'),
('20260602100000-seed-dispute-self-service-risk-config.js'),
('20260604152031-migrate-compliance-c2c-detrade.js'),
('20260605015009-drop-table-lottery-management-settings.js'),
('20260605015010-alter-table-lottery-prize-id-unify.js'),
('20260605020159-create-table-user-growth-levels.js'),
('20260605090000-drop-table-c2c-marketplace.js'),
('20260605100000-alter-table-cs-issue-order-type.js'),
('20260606030000-seed-data-remove-c2c-settings.js'),
('20260606030500-drop-column-user-max-active-listings.js'),
('20260608005113-add-column-item-value-tier.js'),
('20260608005114-create-table-exchange-redeem-requirement.js'),
('20260608005115-add-column-users-mobile-encrypted.js'),
('20260608005116-drop-column-users-mobile.js'),
('20260608005117-add-column-user-addresses-encrypted.js'),
('20260608005118-add-column-users-privacy-consent-at.js'),
('20260608005119-create-table-decoration-system.js'),
('20260608020733-add-column-users-mobile-prefix-suffix-hash.js'),
('20260608032704-seed-data-business-narrative-dict.js'),
('20260608070540-migrate-data-campaign-tier-names.js'),
('20260609000000-change-bid-products-price-asset-code-default.js'),
('20260611043000-add-prop-tab-to-exchange-page-config.js'),
('20260611083214-add-column-exchange-items-min-cost-asset-code.js'),
('20260611083314-add-column-ad-campaigns-announcement-type.js'),
('20260612075717-cleanup-orphan-consumption-approval-chains.js'),
('20260612154711-alter-column-lottery-draws-prize-type-enum.js'),
('20260612160452-add-column-exchange-items-max-quantity-per-order.js'),
('20260613040038-add-column-approval-chain-nodes-exclude-parties.js'),
('20260613040039-seed-data-auditable-type-dictionary.js'),
('20260613040040-seed-data-approval-chain-grading.js'),
('20260613042733-migrate-data-remove-orphan-approval-instance-414.js'),
('20260613071406-seed-data-super-admin-role.js'),
('20260613073700-migrate-data-fix-approval-instance-current-step.js'),
('20260613081244-migrate-data-backfill-history-total-points.js'),
('20260614000000-add-column-exchange-items-fulfillment-type.js'),
('20260614000001-create-table-shipping-tracks.js'),
('20260614065152-alter-column-chat-messages-message-type-add-file.js'),
('20260614201130-alter-column-lottery-campaigns-display-mode-comment.js'),
('20260615083428-add-column-items-is-viewed-first-viewed-at.js'),
('20260620061500-cleanup-data-remove-zombie-trade-dispute-template.js'),
('20260620090000-alter-table-approval-chain-countersign-isolation.js'),
('20260621035513-alter-table-ad-slots-carousel-and-drop-campaign-slide-interval.js'),
('20260621035830-seed-data-ad-slots-top-banner.js'),
('20260621041500-alter-table-redemption-store-voucher-scope.js'),
('20260621081430-alter-ad-bid-logs-target-user-id-nullable.js'),
('20260621212742-drop-table-deadlock-test-garbage.js'),
('20260621230237-seed-data-exchange-gallery-autoplay-interval.js'),
('20260622060000-data-fix-user32-nickname-remove-test.js'),
('20260624080000-alter-table-media-foreign-keys-restrict.js'),
('20260624090000-add-constraint-diy-materials-image-media-restrict.js'),
('20260624093000-cleanup-data-remove-redemption-min-role-level.js'),
('20260625011500-seed-data-premium-unlock-rules.js'),
('20260625043500-reconfig-consumption-approval-chain-manager-review.js'),
('20260625120000-alter-chat-messages-rich-message-modeling.js'),
('20260706010001-migrate-data-red-core-gem-budget-value.js'),
('20260706010002-create-table-reward-multiplier-tables.js'),
('20260706010003-seed-data-event-points-asset.js'),
('20260706040000-alter-table-product-code-core.js'),
('20260706040100-create-table-supplier-and-series.js'),
('20260706040200-create-table-future-scenarios-s1-s5.js'),
('20260706060000-create-table-event-budget-collection-rules.js'),
('20260706060100-seed-data-wechat-mp-maintenance-settings.js'),
('20260706070000-alter-table-lottery-campaign-entry-asset.js'),
('20260710061000-migrate-data-items-backfill-item-template.js'),
('20260710061100-add-column-user-growth-levels-earn-multiplier.js'),
('20260710061200-add-column-consumption-records-level-lock.js'),
('20260710061300-add-column-exchange-redeem-requirement-max-growth-level-key.js'),
('20260710061400-seed-data-risk-anomaly-thresholds.js'),
('20260710070000-add-column-diy-materials-display-fields.js'),
('20260710070100-migrate-data-diy-templates-strip-preview-material.js'),
('20260710070200-seed-data-categories-diy-new-product-lines.js'),
('20260710070300-seed-data-diy-materials-display-copy.js'),
('20260711005000-alter-column-reminder-rules-rule-type-add-issuance-alert.js'),
('20260711011000-add-column-external-channel-mappings-channel-price-and-seed-channel-dict.js'),
('20260711013000-seed-data-item-templates-reference-prices.js'),
('20260711013100-seed-data-barter-pilot-recipe.js'),
('20260711013200-add-column-consumption-records-activity-bonus-rate-locked.js');
/*!40000 ALTER TABLE `sequelizemeta` ENABLE KEYS */;
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
