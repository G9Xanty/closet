-- Add messages table for chat (Sprint 2)

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_request_id UUID NOT NULL REFERENCES sale_requests(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_messages_sale_request ON messages (sale_request_id, created_at);
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
