import { useState } from "react";
import { useAppContext } from "../store/AppProvider";
import { api } from "../api/client";

function getProductImages(p: any): string[] {
  return p?.images?.filter(Boolean) || [p?.image_url, p?.image_url_2, p?.image_url_3, p?.image_url_4, p?.image].filter(Boolean) || [];
}
function formatPrice(v: number) { return "₡" + Number(v || 0).toLocaleString("es-CR"); }

const CONDITION_LABELS: Record<string, string> = {
  new: "Nuevo",
  like_new: "Como nuevo",
  good: "Bueno",
  fair: "Aceptable",
};

const STATUS_LABELS: Record<string, string> = {
  disponible: "Disponible",
  available: "Disponible",
  reserved: "Reservado",
  reservado: "Reservado",
  sold: "Vendido",
  vendido: "Vendido",
  hidden: "Oculto",
};

export default function DetailScreen() {
  const { activeProduct: product, user, goTo } = useAppContext();
  const [imgIndex, setImgIndex] = useState(0);
  const [requesting, setRequesting] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  if (!product) return null;
  const p = product;

  const images = getProductImages(p);
  const currentImg = images[imgIndex] || "";
  const conditionLabel = CONDITION_LABELS[p.condition || ""] || p.condition || "";
  const statusLabel = STATUS_LABELS[String(p.status || "").toLowerCase()] || "Disponible";
  const isAvailable = p.status === "disponible" || p.status === "available";
  const isOwn = p.user_id === user?.id;

  async function handleBuyRequest() {
    if (!user) { goTo("auth"); return; }
    setRequesting(true);
    setStatusMsg("");
    try {
      await api("/api/sales", {
        method: "POST",
        body: JSON.stringify({ product_id: p.id, type: "internal" }),
      });
      setStatusMsg("Solicitud enviada al vendedor");
    } catch (err: any) {
      setStatusMsg(err.message || "Error al solicitar");
    } finally {
      setRequesting(false);
    }
  }

  const rep = p.seller_reputation || 0;
  const repBadge = rep > 0 ? `★ ${rep}` : rep < 0 ? `☆ ${rep}` : "—";

  return (
    <div className="view detail-view">
      <div className="detail-image">
        {currentImg ? <img src={currentImg} alt="" /> : "SIN IMAGEN"}
      </div>

      {images.length > 1 && (
        <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 2 }}>
          {images.map((_, i) => (
            <button key={i} onClick={() => setImgIndex(i)}
              style={{
                width: 10, height: 10, borderRadius: "50%", border: "none", cursor: "pointer",
                background: i === imgIndex ? "var(--accent-red)" : "var(--border-mid)", padding: 0,
              }} />
          ))}
        </div>
      )}

      <div className="detail-name">{product.name}</div>
      <div className="detail-price">{formatPrice(product.price)}</div>

      <div className="detail-meta-grid">
        {product.brand && <div className="detail-pill">{product.brand}</div>}
        <div className="detail-pill">Talla: {product.size || "N/D"}</div>
        {conditionLabel && <div className="detail-pill">{conditionLabel}</div>}
        <div className="detail-pill">{statusLabel}</div>
      </div>

      {rep !== 0 && (
        <div className="detail-seller">
          <span className={`reputation-badge ${rep > 0 ? "positive" : "negative"}`}>{repBadge}</span>
        </div>
      )}

      <div className="detail-copy">{product.description || "Sin descripción."}</div>

      <div className="detail-actions">
        {!isOwn && isAvailable && (
          <button className="small-btn" disabled={requesting} onClick={handleBuyRequest}>
            {requesting ? "Enviando..." : "Quiero comprar"}
          </button>
        )}

        {isOwn && (
          <button className="small-btn secondary" disabled>Tu publicación</button>
        )}
        <button className="small-btn secondary" onClick={() => goTo("feed")}>Volver al feed</button>
      </div>

      {statusMsg && <div className="status-text">{statusMsg}</div>}
    </div>
  );
}
