import { useState, useEffect, useRef } from "react";
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

const VERIFICATION_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente de evidencia",
  submitted: "Evidencia enviada",
  verified: "Venta verificada",
  rejected: "Evidencia rechazada",
  disputed: "En disputa",
};

const RANK_THRESHOLDS = [
  { sales: 0, name: "Nuevo", color: "#888" },
  { sales: 1, name: "Vendedor", color: "#4caf50" },
  { sales: 5, name: "Pro", color: "#2196f3" },
  { sales: 10, name: "Top", color: "#ff9800" },
  { sales: 25, name: "Élite", color: "#9c27b0" },
  { sales: 50, name: "Leyenda", color: "#ffd700" },
];

function getRank(verifiedSales: number) {
  let rank = RANK_THRESHOLDS[0];
  for (const r of RANK_THRESHOLDS) {
    if (verifiedSales >= r.sales) rank = r;
  }
  const nextIdx = RANK_THRESHOLDS.findIndex(r => r.sales > verifiedSales);
  const next = nextIdx >= 0 ? RANK_THRESHOLDS[nextIdx] : null;
  return { current: rank, next, progress: next ? (verifiedSales - rank.sales) / (next.sales - rank.sales) : 1 };
}

function openWhatsApp(phone: string, productName: string) {
  const clean = phone.replace(/[^0-9]/g, "");
  const msg = encodeURIComponent(`Hola! Vi "${productName}" en Closet Elander y me interesa. ¿Sigue disponible?`);
  window.open(`https://wa.me/506${clean}?text=${msg}`, "_blank");
}

interface SearchUser {
  id: string;
  username: string;
}

export default function DetailScreen() {
  const { activeProduct: product, user, goTo } = useAppContext();
  const [imgIndex, setImgIndex] = useState(0);
  const [verification, setVerification] = useState<any>(null);
  const [statusMsg, setStatusMsg] = useState("");

  // Owner menu
  const [showOwnerMenu, setShowOwnerMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Mark as sold modal state
  const [showSellModal, setShowSellModal] = useState(false);
  const [buyerSearch, setBuyerSearch] = useState("");
  const [buyerResults, setBuyerResults] = useState<SearchUser[]>([]);
  const [selectedBuyer, setSelectedBuyer] = useState<SearchUser | null>(null);
  const [includesShipping, setIncludesShipping] = useState(true);
  const [shippingCost, setShippingCost] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidencePreview, setEvidencePreview] = useState("");
  const [marking, setMarking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Seller rank
  const [sellerSales, setSellerSales] = useState(0);

  if (!product) return null;
  const p = product;

  const images = getProductImages(p);
  const currentImg = images[imgIndex] || "";
  const conditionLabel = CONDITION_LABELS[p.condition || ""] || p.condition || "";
  const statusLabel = STATUS_LABELS[String(p.status || "").toLowerCase()] || "Disponible";
  const isAvailable = p.status === "disponible" || p.status === "available";
  const isOwn = p.user_id === user?.id;
  const isSold = p.status === "sold" || p.status === "vendido";
  const sellerPhone = p.seller_phone || "";
  const hasWhatsApp = sellerPhone && sellerPhone.length >= 8;
  const metadata = (p as any).metadata || {};
  const shippingIncluded = metadata.shipping_included !== false;
  const shippingCostValue = metadata.shipping_cost || 0;

  const rep = p.seller_reputation || 0;
  const repBadge = rep > 0 ? `★ ${rep}` : rep < 0 ? `☆ ${rep}` : "—";

  const rank = getRank(sellerSales);

  // Load verification status for sold products
  useEffect(() => {
    if (isSold) {
      api(`/api/products/${p.id}/evidence`)
        .then(data => {
          if (data.status) setVerification(data);
        })
        .catch(() => {});
    }
  }, [p.id, isSold]);

  // Load seller rank
  useEffect(() => {
    if (p.user_id) {
      api(`/api/profiles/${p.user_id}`)
        .then((data: any) => setSellerSales(data.profile?.sales_verified || 0))
        .catch(() => {});
    }
  }, [p.user_id]);

  // Search buyers
  useEffect(() => {
    if (buyerSearch.length < 2) {
      setBuyerResults([]);
      return;
    }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      api(`/api/users/search?q=${encodeURIComponent(buyerSearch)}`)
        .then(data => setBuyerResults(data.users || []))
        .catch(() => setBuyerResults([]));
    }, 300);
  }, [buyerSearch]);

  function handleEvidenceChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setStatusMsg("La imagen es demasiado grande (máx 10MB)");
      return;
    }
    setEvidenceFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setEvidencePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleMarkSold() {
    if (!user || !selectedBuyer) return;
    setMarking(true);
    setStatusMsg("");
    try {
      let evidenceUrl = "";
      let evidenceType = "";

      if (evidenceFile) {
        const formData = new FormData();
        formData.append("image", evidenceFile);
        const uploadResult = await api("/api/uploads", {
          method: "POST",
          body: formData,
        });
        if (uploadResult.image_url) {
          evidenceUrl = uploadResult.image_url;
          evidenceType = evidenceFile.type.includes("video") ? "video" : "photo";
        }
      }

      await api(`/api/products/${p.id}/mark-sold`, {
        method: "POST",
        body: JSON.stringify({
          buyer_id: selectedBuyer.id,
          includes_shipping: includesShipping,
          shipping_cost: includesShipping ? 0 : Number(shippingCost) || 0,
          evidence_url: evidenceUrl,
          evidence_type: evidenceType,
        }),
      });

      setStatusMsg("¡Producto marcado como vendido!");
      setShowSellModal(false);
      setVerification({ status: evidenceUrl ? "submitted" : "pending" });
    } catch (err: any) {
      setStatusMsg(err.message || "Error al marcar como vendido");
    } finally {
      setMarking(false);
    }
  }

  async function handleConfirmReceipt() {
    if (!user) return;
    setConfirming(true);
    setStatusMsg("");
    try {
      await api(`/api/products/${p.id}/confirm-receipt`, {
        method: "POST",
      });
      setStatusMsg("¡Recepción confirmada! Venta verificada.");
      setVerification((prev: any) => ({ ...prev, status: "verified", buyerConfirmed: true }));
    } catch (err: any) {
      setStatusMsg(err.message || "Error al confirmar");
    } finally {
      setConfirming(false);
    }
  }

  async function handleDeleteProduct() {
    if (!user) return;
    setDeleting(true);
    try {
      await api(`/api/products/${p.id}`, { method: "DELETE" });
      setShowDeleteConfirm(false);
      goTo("feed");
    } catch (err: any) {
      setStatusMsg(err.message || "Error al eliminar");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="view detail-view">
      <div className="detail-layout">
        {images.length > 1 && (
          <div className="detail-thumbnails">
            {images.map((url, i) => (
              <img key={i}
                src={url}
                alt=""
                className={`detail-thumbnail ${i === imgIndex ? "active" : ""}`}
                onClick={() => setImgIndex(i)}
              />
            ))}
          </div>
        )}

        <div className="detail-image">
          {currentImg ? <img src={currentImg} alt="" /> : <span>SIN IMAGEN</span>}
        </div>

        <div className="detail-info">
          <div className="detail-name">{product.name}</div>
          <div className="detail-price">{formatPrice(product.price)}</div>
          <div className={`detail-status-badge ${isAvailable ? "available" : isSold ? "sold" : "reserved"}`}>{statusLabel}</div>

          <div className="detail-meta-grid">
            {product.brand && <div className="detail-pill">{product.brand}</div>}
            <div className="detail-pill">Talla: {product.size || "N/D"}</div>
            {conditionLabel && <div className="detail-pill">{conditionLabel}</div>}
          </div>

          <div className="detail-seller">
            {(rep !== 0) && (
              <span className={`reputation-badge ${rep > 0 ? "positive" : "negative"}`}>{repBadge}</span>
            )}
            <div className="seller-rank" style={{ borderColor: rank.current.color }}>
              <span className="seller-rank-name" style={{ color: rank.current.color }}>{rank.current.name}</span>
              {rank.next && (
                <div className="rank-progress-bar">
                  <div className="rank-progress-fill" style={{ width: `${Math.round(rank.progress * 100)}%`, background: rank.current.color }} />
                </div>
              )}
              {rank.next && (
                <span className="seller-rank-next">{sellerSales}/{rank.next.sales} ventas</span>
              )}
              {!rank.next && (
                <span className="seller-rank-next">{sellerSales} ventas verificadas</span>
              )}
            </div>
          </div>

          <div className="detail-copy">{product.description || "Sin descripción."}</div>

          {isSold && (
            <div className="shipping-info">
              <div className="shipping-label">Envío:</div>
              <div className="shipping-value">
                {shippingIncluded ? "Incluido" : `+${formatPrice(shippingCostValue)}`}
              </div>
              {p.buyer && (
                <div className="buyer-info">
                  Comprador: {p.buyer.name || p.buyer.username}
                </div>
              )}
            </div>
          )}

          {isSold && verification && (
            <div className="verification-section">
              <div className="verification-title">Estado de verificación</div>
              <div className={`verification-status ${verification.status}`}>
                {VERIFICATION_STATUS_LABELS[verification.status] || verification.status}
              </div>
              {verification.buyerConfirmed && (
                <div className="verification-confirmed">Comprador confirmó recepción</div>
              )}
            </div>
          )}

          <div className="detail-actions">
            {!isOwn && isAvailable && hasWhatsApp && (
              <button className="detail-btn primary" onClick={() => openWhatsApp(sellerPhone, product.name || product.title || "prenda")}>
                Contactar por WhatsApp
              </button>
            )}
            {!isOwn && isAvailable && !hasWhatsApp && (
              <button className="detail-btn secondary" disabled>
                Vendedor sin WhatsApp
              </button>
            )}

            {isOwn && isAvailable && (
              <div className="owner-actions">
                <button className="detail-btn primary" onClick={() => setShowSellModal(true)}>
                  Marcar como vendido
                </button>
                <button className="detail-btn danger" onClick={() => setShowDeleteConfirm(true)}>
                  Eliminar prenda
                </button>
              </div>
            )}

            {isOwn && isSold && verification?.status === "pending" && (
              <button className="detail-btn primary" disabled={confirming} onClick={handleConfirmReceipt}>
                {confirming ? "Confirmando..." : "Confirmar recepción"}
              </button>
            )}

            {isOwn && isSold && !isAvailable && (
              <button className="detail-btn danger" onClick={() => setShowDeleteConfirm(true)}>
                Eliminar prenda
              </button>
            )}

            <button className="detail-btn secondary" onClick={() => goTo("feed")}>Volver al feed</button>
          </div>

          {statusMsg && <div className="status-text">{statusMsg}</div>}
        </div>
      </div>

      {/* Mark as Sold Modal */}
      {showSellModal && (
        <div className="modal-overlay" onClick={() => setShowSellModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">Marcar como vendido</div>

            <div className="modal-field">
              <label className="modal-label">Buscar comprador</label>
              <input
                className="field"
                placeholder="Nombre de usuario..."
                value={buyerSearch}
                onChange={e => setBuyerSearch(e.target.value)}
              />
              {buyerResults.length > 0 && (
                <div className="buyer-results">
                  {buyerResults.map(u => (
                    <div
                      key={u.id}
                      className={`buyer-result ${selectedBuyer?.id === u.id ? "selected" : ""}`}
                      onClick={() => { setSelectedBuyer(u); setBuyerSearch(u.username); setBuyerResults([]); }}
                    >
                      @{u.username}
                    </div>
                  ))}
                </div>
              )}
              {selectedBuyer && (
                <div className="buyer-selected">
                  Seleccionado: @{selectedBuyer.username}
                  <button className="small-btn secondary" onClick={() => setSelectedBuyer(null)}>×</button>
                </div>
              )}
            </div>

            <div className="modal-field">
              <label className="modal-label">Envío</label>
              <label className="modal-toggle">
                <input type="checkbox" checked={includesShipping} onChange={e => setIncludesShipping(e.target.checked)} />
                <span>Envío incluido en el precio</span>
              </label>
              {!includesShipping && (
                <input
                  className="field"
                  type="number"
                  placeholder="Costo del envío (CRC)"
                  value={shippingCost}
                  onChange={e => setShippingCost(e.target.value)}
                  min={0}
                />
              )}
            </div>

            <div className="modal-field">
              <label className="modal-label">Evidencia de venta (opcional pero recomendada)</label>
              <div className="modal-hint">Sube una foto del producto empaquetado, recibo de envío o captura de conversación para verificar la venta y subir de rango.</div>
              <input type="file" accept="image/*" onChange={handleEvidenceChange} />
              {evidencePreview && (
                <img src={evidencePreview} alt="Evidencia" className="evidence-preview" />
              )}
            </div>

            <div className="modal-actions">
              <button className="small-btn secondary" onClick={() => setShowSellModal(false)}>Cancelar</button>
              <button
                className="small-btn"
                disabled={!selectedBuyer || marking}
                onClick={handleMarkSold}
              >
                {marking ? "Guardando..." : "Confirmar venta"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">Eliminar prenda</div>
            <div className="modal-hint">¿Estás seguro? Esta acción no se puede deshacer. Se eliminarán todas las imágenes asociadas.</div>
            <div className="modal-actions">
              <button className="small-btn secondary" onClick={() => setShowDeleteConfirm(false)}>Cancelar</button>
              <button className="small-btn danger" disabled={deleting} onClick={handleDeleteProduct}>
                {deleting ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
