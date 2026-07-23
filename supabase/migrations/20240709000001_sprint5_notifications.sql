-- Sprint 5: Notifications system
-- Execute manually in Supabase SQL Editor

-- ── Notifications table ──

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'sale_made',
    'receipt_confirmed',
    'product_sold',
    'new_request',
    'request_accepted',
    'request_rejected',
    'new_message',
    'payment_received',
    'payment_rejected',
    'shipped',
    'delivered',
    'completed'
  )),
  title TEXT NOT NULL,
  body TEXT,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  transaction_id UUID,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications
CREATE POLICY "Users read own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

-- System can insert notifications (via service role)
-- No INSERT policy needed — all inserts use supabaseAdmin

-- Users can mark their own as read
CREATE POLICY "Users update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
