import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { useAppContext } from "../store/AppProvider";
import { api } from "../api/client";
import type { Product } from "../store/appState";

const STATUS_LABELS: Record<string, string> = {
  disponible: "Disponible",
  available: "Disponible",
  reserved: "Reservado",
  reservado: "Reservado",
  sold: "Vendido",
  vendido: "Vendido",
};

function getProductImage(p: Product) { return p.image_url || p.image || ""; }
function getStatusClass(s: string) {
  const v = String(s || "").toLowerCase();
  if (v === "sold" || v === "vendido") return "vendido";
  if (v === "reserved" || v === "reservado") return "reservado";
  return "disponible";
}
function getStatusLabel(s: string) {
  return STATUS_LABELS[String(s || "").toLowerCase()] || "Disponible";
}
function formatPrice(v: number) { return "₡" + Number(v || 0).toLocaleString("es-CR"); }


const CATEGORIES = ["all", "camisetas", "hoodies", "pantalones", "accesorios", "otros"];

const ProductCard = memo(function ProductCard({ product, onOpen }: { product: Product; onOpen: (p: Product) => void }) {
  const img = getProductImage(product);
  const rep = product.seller_reputation || 0;
  const repClass = rep > 0 ? "positive" : rep < 0 ? "negative" : "";
  return (
    <div className="product-card" onClick={() => onOpen(product)}>
      <div className="product-image">
        {img ? <img src={img} alt="" loading="lazy" /> : <span className="no-image">SIN IMAGEN</span>}
      </div>
      <div className="product-name">{product.name}</div>
      <div className="product-meta-line">
        {product.brand ? product.brand + " · " : ""}Talla {product.size || "N/D"}
        <span className={`reputation-badge ${repClass}`} style={{ marginLeft: 4 }}>{rep > 0 ? `★${rep}` : rep < 0 ? `☆${rep}` : ""}</span>
      </div>
      <div className={`product-status ${getStatusClass(product.status)}`}>{getStatusLabel(product.status)}</div>
      <div className="product-footer">
        <div className="product-price">{formatPrice(product.price)}</div>
      </div>
    </div>
  );
});

function LoadingSkeleton() {
  return (
    <div className="products-grid" style={{ flex: 1 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="product-card skeleton">
          <div className="product-image skeleton-box" />
          <div className="skeleton-line skeleton-line-sm" />
          <div className="skeleton-line skeleton-line-xs" />
          <div className="skeleton-line skeleton-line-xs" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ category, search }: { category: string; search: string }) {
  const msg = search
    ? `Sin resultados para "${search}"`
    : category !== "all"
      ? `No hay prendas en ${category}`
      : "No hay prendas disponibles";
  return <div className="helper-text empty-text">{msg}</div>;
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="empty-state">
      <div className="helper-text">{message}</div>
      <button className="small-btn" onClick={onRetry} style={{ marginTop: 8, flex: "none", alignSelf: "center" }}>Reintentar</button>
    </div>
  );
}

export default function FeedScreen() {
  const { user, setActiveProduct, goTo } = useAppContext();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const searchRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);

  console.log('[FEED]', { productsLength: products.length, loading, error: !!error });

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => setDebouncedSearch(search), 250);
  }, [search]);

  const loadProducts = useCallback(async (opts: { cursor?: string; category?: string; search?: string } = {}) => {
    console.log("[FETCH START]", { search: opts.search, category: opts.category, cursor: opts.cursor });
    try {
      const params = new URLSearchParams();
      if (opts.search) params.set("search", opts.search);
      if (opts.category && opts.category !== "all") params.set("category", opts.category);
      if (opts.cursor) params.set("cursor", opts.cursor);
      params.set("limit", "20");
      const qs = params.toString();
      const data = await api(`/api/products${qs ? `?${qs}` : ""}`);
      console.log("[FETCH RESULT]", { count: data.products?.length, cursor: opts.cursor, nextCursor: data.nextCursor, hasMore: data.hasMore });
      return data;
    } catch (e: any) {
      console.log("[FETCH ERROR]", e.message || e);
      throw new Error(e.message || "Error al cargar productos");
    }
  }, []);

  const fetchInitial = useCallback(async () => {
    setLoading(true);
    setError("");
    setProducts([]);
    setNextCursor(null);
    setHasMore(true);
    try {
      const data = await loadProducts({ search: debouncedSearch, category: activeCategory });
      if (!mountedRef.current) return;
      setProducts(data.products || []);
      setNextCursor(data.nextCursor || null);
      setHasMore(data.hasMore || false);
    } catch (e: any) {
      if (!mountedRef.current) return;
      setError(e.message);
      setProducts([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [loadProducts, debouncedSearch, activeCategory]);

  const fetchMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const data = await loadProducts({ cursor: nextCursor || undefined, search: debouncedSearch, category: activeCategory });
      if (!mountedRef.current) return;
      setProducts(prev => [...prev, ...(data.products || [])]);
      setNextCursor(data.nextCursor || null);
      setHasMore(data.hasMore || false);
    } catch {
      if (!mountedRef.current) return;
    } finally {
      if (mountedRef.current) setLoadingMore(false);
    }
  }, [loadProducts, nextCursor, hasMore, loadingMore, debouncedSearch, activeCategory]);

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const obs = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          fetchMore();
        }
      },
      { rootMargin: "200px" }
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, loading, fetchMore]);

  const filtered = useMemo(() => {
    return activeCategory === "all"
      ? products
      : products.filter(p => p.category === activeCategory);
  }, [products, activeCategory]);

  const openDetail = useCallback((product: Product) => {
    setActiveProduct(product);
    goTo("detail");
  }, [setActiveProduct, goTo]);

  const handleRetry = useCallback(() => {
    setProducts([]);
    setNextCursor(null);
    setHasMore(true);
    fetchInitial();
  }, [fetchInitial]);

  const handleCategory = useCallback((cat: string) => {
    setActiveCategory(cat);
    setProducts([]);
    setNextCursor(null);
    setHasMore(true);
  }, []);

  return (
    <div className="view feed-view screen feed-screen">
      <div className="feed-header">
        <div className="dealer-card" style={{ cursor: "pointer" }} onClick={() => goTo("profile")}>
          <div className={`dealer-avatar ${user?.avatar || "avatar-1"}`} />
          <div className="dealer-copy">
            <div className="feed-title">{user?.username || user?.dealer_id || "Mi tienda"}</div>
            <div className="dealer-subtitle">Bienvenido a Closet Elander</div>
          </div>
        </div>
        <div className="feed-actions">
          <button className="small-btn" onClick={() => goTo("upload")} title="Vender prenda">+</button>
          {user?.is_admin && (
            <button className="small-btn secondary" onClick={() => goTo("admin")} title="Admin">⚙</button>
          )}
        </div>
      </div>

      <input
        className="field search-input"
        type="search"
        placeholder="Buscar..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        autoComplete="off"
      />

      <div className="category-row">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            className={`category-chip ${activeCategory === cat ? "active" : ""}`}
            onClick={() => handleCategory(cat)}
          >
            {cat === "all" ? "Todas" : cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {loading && <LoadingSkeleton />}

      {!loading && error && <ErrorState message={error} onRetry={handleRetry} />}

      {!loading && !error && (
        <div className="products-grid">
          {filtered.length === 0 && <EmptyState category={activeCategory} search={debouncedSearch} />}
          {filtered.map(product => (
            <ProductCard key={product.id} product={product} onOpen={openDetail} />
          ))}
        </div>
      )}

      {!loading && !error && hasMore && <div ref={sentinelRef} className="scroll-sentinel" />}
      {loadingMore && <div className="loading-more">Cargando más...</div>}
    </div>
  );
}
