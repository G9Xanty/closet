-- ============================================
-- SPRINT 2.5: sale_requests → transactions + transaction_events
-- Máquina de estados completa
-- Safe to re-run (IF NOT EXISTS / IF NOT)
-- ============================================

-- 1. Rename sale_requests → transactions
ALTER TABLE IF EXISTS sale_requests RENAME TO transactions;

-- 2. Rename indexes
ALTER INDEX IF EXISTS idx_sale_requests_buyer RENAME TO idx_transactions_buyer;
ALTER INDEX IF EXISTS idx_sale_requests_seller RENAME TO idx_transactions_seller;
ALTER INDEX IF EXISTS idx_sale_requests_product RENAME TO idx_transactions_product;
ALTER INDEX IF EXISTS idx_sale_requests_status RENAME TO idx_transactions_status;

-- 3. Update status CHECK constraint (add new states)
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS sale_requests_status_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_status_check
  CHECK (status IN (
    'requested','accepted','rejected','cancelled','completed',
    'waiting_payment','payment_sent','payment_received',
    'waiting_shipping','shipped','delivered','dispute'
  ));

-- 4. Create transaction_events table
CREATE TABLE IF NOT EXISTS transaction_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'request_created','request_accepted','request_rejected','request_cancelled',
      'payment_marked','payment_proof_uploaded','payment_confirmed','payment_rejected',
      'shipping_initiated','shipped','delivery_confirmed','transaction_completed',
      'dispute_opened','review_submitted'
    )),
  from_status TEXT,
  to_status TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tx_events_transaction ON transaction_events(transaction_id);
CREATE INDEX IF NOT EXISTS idx_tx_events_actor ON transaction_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_tx_events_type ON transaction_events(event_type);
ALTER TABLE transaction_events ENABLE ROW LEVEL SECURITY;

-- 5. Update messages table FK (rename column reference)
-- Note: We keep the column name as sale_request_id for backward compatibility
-- during the migration period. The backend will use transaction_id in queries.
-- If you want to rename the column, do it manually after verifying all code is updated.

-- 6. Create RLS policies for transactions (participants can read)
DROP POLICY IF EXISTS "transactions_select_participants" ON transactions;
CREATE POLICY "transactions_select_participants" ON transactions
  FOR SELECT USING (
    auth.uid() = buyer_id OR auth.uid() = seller_id
  );

-- 7. Create RLS policies for transaction_events (participants can read)
DROP POLICY IF EXISTS "transaction_events_select_participants" ON transaction_events;
CREATE POLICY "transaction_events_select_participants" ON transaction_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM transactions
      WHERE transactions.id = transaction_events.transaction_id
        AND (auth.uid() = transactions.buyer_id OR auth.uid() = transactions.seller_id)
    )
  );

-- 8. Migrate existing data: create historical events for each existing transaction
-- This is idempotent (only creates events if none exist for a transaction)
DO $$
DECLARE
  tx RECORD;
BEGIN
  FOR tx IN
    SELECT id, buyer_id, seller_id, status, created_at, updated_at
    FROM transactions
    WHERE NOT EXISTS (
      SELECT 1 FROM transaction_events WHERE transaction_id = transactions.id
    )
  LOOP
    -- Always create request_created event
    INSERT INTO transaction_events (transaction_id, actor_id, event_type, from_status, to_status, created_at)
    VALUES (tx.id, tx.buyer_id, 'request_created', NULL, 'requested', tx.created_at);

    -- Create events for subsequent states
    IF tx.status = 'accepted' THEN
      INSERT INTO transaction_events (transaction_id, actor_id, event_type, from_status, to_status, created_at)
      VALUES (tx.id, tx.seller_id, 'request_accepted', 'requested', 'accepted', tx.updated_at);
    ELSIF tx.status = 'rejected' THEN
      INSERT INTO transaction_events (transaction_id, actor_id, event_type, from_status, to_status, created_at)
      VALUES (tx.id, tx.seller_id, 'request_rejected', 'requested', 'rejected', tx.updated_at);
    ELSIF tx.status = 'cancelled' THEN
      INSERT INTO transaction_events (transaction_id, actor_id, event_type, from_status, to_status, created_at)
      VALUES (tx.id, tx.buyer_id, 'request_cancelled', 'requested', 'cancelled', tx.updated_at);
    ELSIF tx.status = 'completed' THEN
      INSERT INTO transaction_events (transaction_id, actor_id, event_type, from_status, to_status, created_at)
      VALUES (tx.id, tx.seller_id, 'request_accepted', 'requested', 'accepted', tx.created_at);
      INSERT INTO transaction_events (transaction_id, actor_id, event_type, from_status, to_status, created_at)
      VALUES (tx.id, tx.buyer_id, 'transaction_completed', 'accepted', 'completed', tx.updated_at);
    END IF;
  END LOOP;
END $$;
