-- =========================================================================
-- DWN Lead Engine — Razorpay billing columns (Phase E swap)
--
-- Adds Razorpay customer + subscription ID columns alongside the existing
-- Stripe columns. Stripe columns are left intact (all-NULL in prod — zero
-- data at risk). They will be removed in a future cleanup migration.
-- =========================================================================

PRAGMA foreign_keys = ON;

ALTER TABLE workspaces ADD COLUMN razorpay_customer_id TEXT;
ALTER TABLE workspaces ADD COLUMN razorpay_subscription_id TEXT;
