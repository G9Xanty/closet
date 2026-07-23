export type Screen =
  | "play"
  | "loading"
  | "auth"
  | "feed"
  | "detail"
  | "profile"
  | "upload"
  | "publicProfile"
  | "sellerProfile"
  | "settings"
  | "admin"
  | "requests"
  | "notifications";

export interface Product {
  id: number;
  name: string;
  title?: string;
  price: number;
  size: string;
  brand?: string;
  category: string;
  condition?: string;
  status: string;
  description: string;
  uber_flash_included: boolean;
  user_id: string;
  seller_phone?: string;
  seller_reputation?: number;
  seller_location?: string;
  avatar?: string;
  image_url: string;
  image_url_2?: string;
  image_url_3?: string;
  image_url_4?: string;
  image?: string;
  images?: string[];
  metadata?: Record<string, any>;
  buyer?: { id: string; username: string; name?: string; avatar?: string };
}

export interface Message {
  id: string;
  sale_request_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
}

export interface Sale {
  id: string;
  product_id: number;
  buyer_id: string | null;
  seller_id: string;
  status: "pending" | "requested" | "confirmed" | "rejected" | "completed" | "external";
  type: "internal" | "external";
  verified: boolean;
  verified_by?: string;
  verified_at?: string;
  notes?: string;
  created_at: string;
  confirmed_at?: string;
  completed_at?: string;
  product?: Product;
  buyer?: { id: string; username: string; avatar?: string };
  seller?: { id: string; username: string; avatar?: string };
}

export interface Transaction {
  id: string;
  product_id: number;
  buyer_id: string;
  seller_id: string;
  status: "requested" | "accepted" | "rejected" | "cancelled" | "completed"
    | "waiting_payment" | "payment_sent" | "payment_received" | "payment_rejected"
    | "waiting_shipping" | "shipped" | "delivered" | "dispute";
  created_at: string;
  updated_at: string;
  product?: Product;
  buyer?: { id: string; username: string; avatar?: string };
}

export interface TransactionEvent {
  id: string;
  transaction_id: string;
  actor_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string;
  metadata: Record<string, any>;
  created_at: string;
}

// Backward compatibility alias
export type SaleRequest = Transaction;

export interface Report {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  product_id?: number;
  reason: string;
  description?: string;
  status: "pending" | "reviewed" | "dismissed" | "action_taken";
  admin_id?: string;
  admin_note?: string;
  created_at: string;
  resolved_at?: string;
  reporter?: { id: string; username: string };
  reported?: { id: string; username: string };
}
