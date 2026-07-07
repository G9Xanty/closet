import { useState, memo } from "react";
import type { Product } from "../store/appState";

function formatPrice(v: number) {
  return "₡" + Number(v || 0).toLocaleString("es-CR");
}

function getProductImage(p: Product): string {
  return p.images?.[0] || p.image_url || p.image || "";
}

interface ProductCardProps {
  product: Product;
  onOpen: (p: Product) => void;
  onInterest?: (p: Product) => void;
  showAction?: boolean;
}

const ProductCard = memo(function ProductCard({ product, onOpen, onInterest, showAction }: ProductCardProps) {
  const [imgError, setImgError] = useState(false);
  const img = getProductImage(product);
  const rep = product.seller_reputation || 0;

  return (
    <div className="product-card" onClick={() => onOpen(product)}>
      <div className="product-image-container">
        {img && !imgError ? (
          <img src={img} alt={product.name} loading="lazy" onError={() => setImgError(true)} />
        ) : (
          <div className="product-image-placeholder">👕</div>
        )}
        <div className={`product-status-badge ${product.status === "sold" || product.status === "vendido" ? "sold" : product.status === "reserved" || product.status === "reservado" ? "reserved" : "available"}`}>
          {product.status === "disponible" || product.status === "available" ? "Disponible" : product.status === "reserved" || product.status === "reservado" ? "Reservado" : "Vendido"}
        </div>
      </div>

      <div className="product-info">
        <h3 className="product-name">{product.name}</h3>

        <div className="product-meta">
          <span className="product-price">{formatPrice(product.price)}</span>
          <span className="product-size">Talla {product.size || "N/D"}</span>
        </div>

        <div className="product-footer">
          <span className="product-location">{product.seller_location || "San José"}</span>
          <span className="product-reputation">{rep > 0 ? `★ ${rep}` : rep < 0 ? `☆ ${rep}` : ""}</span>
        </div>

        {showAction && (
          <button className="product-action-btn" onClick={e => { e.stopPropagation(); onInterest?.(product); }}>
            Me interesa
          </button>
        )}
      </div>
    </div>
  );
});

export default ProductCard;
