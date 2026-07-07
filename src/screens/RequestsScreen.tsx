import { useState, useEffect } from "react";
import { useAppContext } from "../store/AppProvider";
import { api } from "../api/client";
import type { SaleRequest } from "../store/appState";

const REQ_LABELS: Record<string, string> = {
  requested: "Pendiente",
  accepted: "Aceptada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
  completed: "Completada",
};

export default function RequestsScreen() {
  const { user, goTo, setActiveProduct } = useAppContext();
  const [asBuyer, setAsBuyer] = useState<SaleRequest[]>([]);
  const [asSeller, setAsSeller] = useState<SaleRequest[]>([]);
  const [tab, setTab] = useState<"buyer" | "seller">("seller");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    api("/api/sale-requests/mine")
      .then(data => {
        setAsBuyer(data.asBuyer || []);
        setAsSeller(data.asSeller || []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [user]);

  async function handleAction(id: string, status: string) {
    await api(`/api/sale-requests/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }).catch(() => {});
    api("/api/sale-requests/mine").then(data => {
      setAsBuyer(data.asBuyer || []);
      setAsSeller(data.asSeller || []);
    });
  }

  if (!user) return null;

  const list = tab === "buyer" ? asBuyer : asSeller;

  return (
    <div className="view">
      <h2 className="section-title">Solicitudes</h2>

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
        <p className="status-text">No hay solicitudes.</p>
      )}

      {list.map(sr => (
        <div key={sr.id} className="feed-card" style={{ padding: 10, marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            {sr.product?.image_url && (
              <img src={sr.product.image_url} alt="" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: "bold", fontSize: 14 }}>{sr.product?.title || "Producto"}</div>
              <div style={{ fontSize: 12, color: "var(--text-mid)", marginTop: 2 }}>
                {REQ_LABELS[sr.status] || sr.status}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>
                {new Date(sr.created_at).toLocaleDateString("es-CR")}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {tab === "seller" && sr.status === "requested" && (
              <>
                <button className="small-btn" style={{ fontSize: 12 }} onClick={() => handleAction(sr.id, "accepted")}>Aceptar</button>
                <button className="small-btn secondary" style={{ fontSize: 12 }} onClick={() => handleAction(sr.id, "rejected")}>Rechazar</button>
              </>
            )}
            {tab === "buyer" && sr.status === "requested" && (
              <button className="small-btn secondary" style={{ fontSize: 12 }} onClick={() => handleAction(sr.id, "cancelled")}>Cancelar</button>
            )}
            {(sr.status === "accepted" || sr.status === "requested") && (
              <button className="small-btn" style={{ fontSize: 12 }} onClick={() => {
                if (sr.product) {
                  setActiveProduct({ ...sr.product, _saleRequestId: sr.id } as any);
                  goTo("chat");
                }
              }}>Chat</button>
            )}
            <button className="small-btn secondary" style={{ fontSize: 12 }} onClick={() => {
              if (sr.product) {
                setActiveProduct(sr.product as any);
                goTo("detail");
              }
            }}>Ver producto</button>
          </div>
        </div>
      ))}
    </div>
  );
}
