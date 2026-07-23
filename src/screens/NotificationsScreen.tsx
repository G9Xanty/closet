import { useState, useEffect } from "react";
import { useAppContext } from "../store/AppProvider";
import { api } from "../api/client";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  product_id: number | null;
  transaction_id: string | null;
  read_at: string | null;
  created_at: string;
}

const TYPE_ICONS: Record<string, string> = {
  product_sold: "💰",
  receipt_confirmed: "✅",
  sale_made: "💰",
  new_request: "📩",
  request_accepted: "✓",
  request_rejected: "✕",
  new_message: "💬",
  payment_received: "💳",
  payment_rejected: "✕",
  shipped: "🚚",
  delivered: "📦",
  completed: "🎉",
};

export default function NotificationsScreen() {
  const { user, goTo } = useAppContext();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    api("/api/notifications?limit=50")
      .then(data => {
        setNotifications(data.notifications || []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [user]);

  async function handleMarkRead(id: string) {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n)
    );
    api(`/api/notifications/${id}/read`, { method: "PATCH" }).catch(() => {});
  }

  async function handleMarkAllRead() {
    const now = new Date().toISOString();
    setNotifications(prev => prev.map(n => n.read_at ? n : { ...n, read_at: now }));
    api("/api/notifications/read-all", { method: "PATCH" }).catch(() => {});
  }

  function handleClick(n: Notification) {
    if (!n.read_at) handleMarkRead(n.id);
    if (n.product_id) {
      api(`/api/products/${n.product_id}`).then(data => {
        if (data.product) {
          useAppContext().setActiveProduct(data.product);
          goTo("detail");
        }
      }).catch(() => {});
    }
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "ahora";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d`;
    return new Date(dateStr).toLocaleDateString("es-CR");
  }

  if (!user) return null;

  const unread = notifications.filter(n => !n.read_at).length;

  return (
    <div className="view">
      <div className="notif-header">
        <h2 className="section-title">Notificaciones</h2>
        {unread > 0 && (
          <button className="small-btn secondary" onClick={handleMarkAllRead}>
            Marcar todo leído ({unread})
          </button>
        )}
      </div>

      {!loaded && <p className="status-text">Cargando...</p>}

      {loaded && notifications.length === 0 && (
        <div className="notif-empty">
          <div className="notif-empty-icon">🔔</div>
          <p>Sin notificaciones nuevas</p>
        </div>
      )}

      {notifications.map(n => (
        <div
          key={n.id}
          className={`notif-card ${n.read_at ? "read" : "unread"}`}
          onClick={() => handleClick(n)}
        >
          <div className="notif-icon">{TYPE_ICONS[n.type] || "📌"}</div>
          <div className="notif-content">
            <div className="notif-title">{n.title}</div>
            {n.body && <div className="notif-body">{n.body}</div>}
            <div className="notif-time">{timeAgo(n.created_at)}</div>
          </div>
          {!n.read_at && <div className="notif-dot" />}
        </div>
      ))}
    </div>
  );
}
