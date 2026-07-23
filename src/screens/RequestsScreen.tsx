import { useState, useEffect } from "react";
import { useAppContext } from "../store/AppProvider";
import { api } from "../api/client";
import type { Transaction } from "../store/appState";

const STATUS_LABELS: Record<string, string> = {
  requested: "Pendiente",
  accepted: "Aceptada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
  completed: "Completada",
  waiting_payment: "Esperando pago",
  payment_sent: "Pago enviado",
  payment_received: "Pago recibido",
  payment_rejected: "Pago rechazado",
  waiting_shipping: "Esperando envío",
  shipped: "Enviado",
  delivered: "Entregado",
  dispute: "En reclamo",
  disponible: "Disponible",
  vendido: "Vendido",
};

const VERIFICATION_LABELS: Record<string, string> = {
  pending: "Pendiente",
  submitted: "Evidencia enviada",
  verified: "Verificada",
  rejected: "Rechazada",
};

function openWhatsApp(phone: string, productName: string) {
  const clean = phone.replace(/[^0-9]/g, "");
  const msg = encodeURIComponent(`Hola! Vi "${productName}" en Closet Elander y me interesa. ¿Sigue disponible?`);
  window.open(`https://wa.me/506${clean}?text=${msg}`, "_blank");
}

function formatPrice(v: number) {
  return "₡" + Number(v || 0).toLocaleString("es-CR");
}

export default function RequestsScreen() {
  const { user, goTo } = useAppContext();
  const [asBuyer, setAsBuyer] = useState<Transaction[]>([]);
  const [asSeller, setAsSeller] = useState<Transaction[]>([]);
  const [tab, setTab] = useState<"buyer" | "seller">("seller");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    api("/api/transactions/mine")
      .then(data => {
        setAsBuyer(data.asBuyer || []);
        setAsSeller(data.asSeller || []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [user]);

  async function handleAction(id: string, status: string) {
    await api(`/api/transactions/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }).catch(() => {});
    api("/api/transactions/mine").then(data => {
      setAsBuyer(data.asBuyer || []);
      setAsSeller(data.asSeller || []);
    });
  }

  if (!user) return null;

  const list = tab === "buyer" ? asBuyer : asSeller;

  return (
    <div className="view">
      <h2 className="section-title">Mis transacciones</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button className={`small-btn${tab === "seller" ? "" : " secondary"}`} onClick={() => setTab("seller")}>
          Recibidas ({asSeller.length})
        </button>
        <button className={`small-btn${tab === "buyer" ? "" : " secondary"}`} onClick={() => setTab("buyer")}>
          Enviadas ({asBuyer.length})
        </button>
      </div>

      {!loaded && <p className="status-text">Cargando...</p>}

      {loaded && list.length === 0 && (
        <p className="status-text">No hay transacciones.</p>
      )}

      {list.map(tx => {
        const metadata = (tx.product as any)?.metadata || {};
        const shippingIncluded = metadata.shipping_included !== false;
        const shippingCost = metadata.shipping_cost || 0;
        const isSold = tx.status === "completed" || (tx.product as any)?.status === "sold" || (tx.product as any)?.status === "vendido";

        return (
          <div key={tx.id} className="feed-card" style={{ padding: 10, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              {tx.product?.image_url && (
                <img src={tx.product.image_url} alt="" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: "bold", fontSize: 14 }}>{tx.product?.title || "Producto"}</div>
                <div style={{ fontSize: 12, color: "var(--text-mid)", marginTop: 2 }}>
                  {STATUS_LABELS[tx.status] || tx.status}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>
                  {new Date(tx.created_at).toLocaleDateString("es-CR")}
                </div>

                {/* Shipping info for sold products */}
                {isSold && (
                  <div style={{ fontSize: 10, color: "rgba(0, 255, 255, 0.6)", marginTop: 4 }}>
                    🚚 {shippingIncluded ? "Envío incluido" : `Envío: +${formatPrice(shippingCost)}`}
                  </div>
                )}

                {/* Verification badge */}
                {isSold && (
                  <div style={{ fontSize: 10, color: "#4caf50", marginTop: 2 }}>
                    ✓ Venta verificada
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {tab === "seller" && tx.status === "requested" && (
                <>
                  <button className="small-btn" style={{ fontSize: 12 }} onClick={() => handleAction(tx.id, "accepted")}>Aceptar</button>
                  <button className="small-btn secondary" style={{ fontSize: 12 }} onClick={() => handleAction(tx.id, "rejected")}>Rechazar</button>
                </>
              )}
              {tab === "buyer" && tx.status === "requested" && (
                <button className="small-btn secondary" style={{ fontSize: 12 }} onClick={() => handleAction(tx.id, "cancelled")}>Cancelar</button>
              )}
              {tx.product?.seller_phone && (
                <button className="small-btn" style={{ fontSize: 12, background: "rgba(37, 211, 102, 0.15)", borderColor: "rgba(37, 211, 102, 0.3)", color: "#25d366" }} onClick={() => openWhatsApp(tx.product!.seller_phone!, tx.product?.title || "")}>
                  WhatsApp
                </button>
              )}
              <button className="small-btn secondary" style={{ fontSize: 12 }} onClick={() => {
                if (tx.product) {
                  useAppContext().setActiveProduct(tx.product as any);
                  goTo("detail");
                }
              }}>Ver producto</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
