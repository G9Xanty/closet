import { useState, useEffect, useCallback, useRef } from "react";
import { useAppContext } from "../store/AppProvider";
import { api } from "../api/client";
import type { Sale, Report } from "../store/appState";

interface AdminUser {
  id: string; email: string; username: string; dealer_id: string; banned: boolean; is_admin: boolean;
}
interface AdminProduct {
  id: number; name: string; price: number; seller_name: string; user_id: string;
}

type AdminTab = "dashboard" | "sales" | "reports";

interface Metrics {
  users: number; products: number; sales: number;
}

interface UsersPage {
  users: AdminUser[]; page: number; per_page: number; total: number; total_pages: number; next_page: number | null;
}

interface ProductsPage {
  products: AdminProduct[]; next_cursor: string | null; total: number | null; has_more: boolean;
}

interface SalesPage {
  sales: Sale[]; next_cursor: string | null; total: number; has_more: boolean;
}

interface ReportsPage {
  reports: Report[]; next_cursor: string | null; has_more: boolean;
}

const PAGE_SIZE = 20;

export default function AdminScreen() {
  const { user, goTo } = useAppContext();
  const [tab, setTab] = useState<AdminTab>("dashboard");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userPage, setUserPage] = useState(0);
  const [userTotal, setUserTotal] = useState(0);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [productCursor, setProductCursor] = useState<string | null>(null);
  const [productHasMore, setProductHasMore] = useState(false);
  const [sales, setSales] = useState<Sale[]>([]);
  const [saleCursor, setSaleCursor] = useState<string | null>(null);
  const [saleHasMore, setSaleHasMore] = useState(false);
  const [saleTotal, setSaleTotal] = useState(0);
  const [reports, setReports] = useState<Report[]>([]);
  const [reportCursor, setReportCursor] = useState<string | null>(null);
  const [reportHasMore, setReportHasMore] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loaded = useRef({ metrics: false, users: false, products: false, sales: false, reports: false });

  const loadMetrics = useCallback(async () => {
    try {
      const res: Metrics = await api("/api/admin/metrics");
      setMetrics(res);
      loaded.current.metrics = true;
    } catch (err: any) {
      setStatus(err.message);
    }
  }, []);

  const loadUsers = useCallback(async (page: number) => {
    try {
      const res: UsersPage = await api(`/api/admin/users?page=${page}&per_page=${PAGE_SIZE}`);
      if (page === 1) setUsers(res.users);
      else setUsers(prev => [...prev, ...res.users]);
      setUserPage(page);
      setUserTotal(res.total);
      loaded.current.users = true;
    } catch (err: any) {
      setStatus(err.message);
    }
  }, []);

  const loadProducts = useCallback(async (cursor: string | null) => {
    try {
      const params = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=${PAGE_SIZE}` : `?limit=${PAGE_SIZE}`;
      const res: ProductsPage = await api(`/api/admin/products${params}`);
      if (!cursor) setProducts(res.products);
      else setProducts(prev => [...prev, ...res.products]);
      setProductCursor(res.next_cursor);
      setProductHasMore(res.has_more);
      loaded.current.products = true;
    } catch (err: any) {
      setStatus(err.message);
    }
  }, []);

  const loadSales = useCallback(async (cursor: string | null) => {
    try {
      const params = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=${PAGE_SIZE}` : `?limit=${PAGE_SIZE}`;
      const res: SalesPage = await api(`/api/admin/sales${params}`);
      if (!cursor) setSales(res.sales);
      else setSales(prev => [...prev, ...res.sales]);
      setSaleCursor(res.next_cursor);
      setSaleHasMore(res.has_more);
      setSaleTotal(res.total);
      loaded.current.sales = true;
    } catch (err: any) {
      setStatus(err.message);
    }
  }, []);

  const loadReports = useCallback(async (cursor: string | null) => {
    try {
      const params = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=${PAGE_SIZE}` : `?limit=${PAGE_SIZE}`;
      const res: ReportsPage = await api(`/api/admin/reports${params}`);
      if (!cursor) setReports(res.reports);
      else setReports(prev => [...prev, ...res.reports]);
      setReportCursor(res.next_cursor);
      setReportHasMore(res.has_more);
      loaded.current.reports = true;
    } catch (err: any) {
      setStatus(err.message);
    }
  }, []);

  useEffect(() => {
    if (tab === "dashboard") {
      setLoading(true);
      Promise.all([
        !loaded.current.metrics ? loadMetrics() : Promise.resolve(),
        !loaded.current.users ? loadUsers(1) : Promise.resolve(),
        !loaded.current.products ? loadProducts(null) : Promise.resolve(),
      ]).finally(() => setLoading(false));
    }
  }, [tab, loadMetrics, loadUsers, loadProducts]);

  useEffect(() => {
    if (tab === "sales" && !loaded.current.sales) {
      loadSales(null);
    }
  }, [tab, loadSales]);

  useEffect(() => {
    if (tab === "reports" && !loaded.current.reports) {
      loadReports(null);
    }
  }, [tab, loadReports]);

  async function loadMoreUsers() {
    setLoadingMore(true);
    await loadUsers(userPage + 1);
    setLoadingMore(false);
  }

  async function loadMoreProducts() {
    setLoadingMore(true);
    await loadProducts(productCursor);
    setLoadingMore(false);
  }

  async function loadMoreSales() {
    setLoadingMore(true);
    await loadSales(saleCursor);
    setLoadingMore(false);
  }

  async function loadMoreReports() {
    setLoadingMore(true);
    await loadReports(reportCursor);
    setLoadingMore(false);
  }

  async function banUser(id: string) {
    if (!confirm("Bannear usuario?")) return;
    try { await api(`/api/admin/users/${id}/ban`, { method: "POST" }); setUsers(prev => prev.map(u => u.id === id ? { ...u, banned: true } : u)); }
    catch (err: any) { setStatus(err.message); }
  }

  async function deleteUser(id: string) {
    if (!confirm("Eliminar usuario y sus prendas?")) return;
    try { await api(`/api/admin/users/${id}`, { method: "DELETE" }); setUsers(prev => prev.filter(u => u.id !== id)); }
    catch (err: any) { setStatus(err.message); }
  }

  async function deleteProduct(id: number) {
    if (!confirm("Eliminar prenda?")) return;
    try { await api(`/api/products/${id}`, { method: "DELETE" }); setProducts(prev => prev.filter(p => p.id !== id)); }
    catch (err: any) { setStatus(err.message); }
  }

  async function verifySale(id: string) {
    try { await api(`/api/admin/sales/${id}/verify`, { method: "POST" }); setSales(prev => prev.map(s => s.id === id ? { ...s, verified: true, status: "completed" as const } : s)); }
    catch (err: any) { setStatus(err.message); }
  }

  async function rejectSale(id: string) {
    try { await api(`/api/admin/sales/${id}/reject`, { method: "POST" }); setSales(prev => prev.map(s => s.id === id ? { ...s, status: "rejected" as const } : s)); }
    catch (err: any) { setStatus(err.message); }
  }

  async function handleReportAction(id: string, action: string) {
    try { await api(`/api/admin/reports/${id}/action`, { method: "POST", body: JSON.stringify({ action }) }); setReports(prev => prev.filter(r => r.id !== id)); }
    catch (err: any) { setStatus(err.message); }
  }

  if (!user?.is_admin) {
    return <div className="view" style={{ padding: 20, color: "var(--text-secondary)" }}>Acceso denegado.</div>;
  }

  return (
    <div className="view admin-view">
      <div className="admin-head">
        <div className="admin-title">Panel admin</div>
        <button className="small-btn secondary" onClick={() => goTo("feed")}>Volver</button>
      </div>
      <div className="admin-muted">Admin: {user.email}</div>

      <div className="admin-tabs" style={{ display: "flex", gap: 4, margin: "4px 0" }}>
        {(["dashboard", "sales", "reports"] as AdminTab[]).map(t => (
          <button key={t} className={`small-btn ${tab === t ? "" : "secondary"}`} onClick={() => setTab(t)}>
            {t === "dashboard" ? "Dashboard" : t === "sales" ? "Ventas" : "Reportes"}
          </button>
        ))}
      </div>

      {status && <div className="status-text error">{status}</div>}

      {tab === "dashboard" && (
        loading ? <div style={{ padding: 20 }}>Cargando...</div> : (
          <>
            <div style={{ display: "flex", gap: 16, padding: "12px 0" }}>
              <div className="panel" style={{ flex: 1, border: "1px solid #702020", background: "#111", padding: 16 }}>
                <strong>Usuarios:</strong> {metrics?.users ?? "..."}
              </div>
              <div className="panel" style={{ flex: 1, border: "1px solid #702020", background: "#111", padding: 16 }}>
                <strong>Prendas:</strong> {metrics?.products ?? "..."}
              </div>
              <div className="panel" style={{ flex: 1, border: "1px solid #702020", background: "#111", padding: 16 }}>
                <strong>Ventas:</strong> {metrics?.sales ?? "..."}
              </div>
            </div>

            <h3>Usuarios ({userTotal})</h3>
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #333" }}>
                    <th style={{ padding: 8, textAlign: "left" }}>Email</th>
                    <th style={{ padding: 8, textAlign: "left" }}>Username</th>
                    <th style={{ padding: 8, textAlign: "left" }}>Estado</th>
                    <th style={{ padding: 8, textAlign: "left" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} style={{ borderBottom: "1px solid #222" }}>
                      <td style={{ padding: 8 }}>{u.email}</td>
                      <td style={{ padding: 8 }}>{u.username}</td>
                      <td style={{ padding: 8 }}>{u.banned ? "Banneado" : "Activo"}</td>
                      <td style={{ padding: 8 }}>
                        {u.id !== user.id && (
                          <>
                            <button className="small-btn" style={{ marginRight: 4 }} onClick={() => banUser(u.id)}>
                              {u.banned ? "Desbanear" : "Bannear"}
                            </button>
                            <button className="small-btn" style={{ background: "#600" }} onClick={() => deleteUser(u.id)}>
                              Eliminar
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {userPage < Math.ceil(userTotal / PAGE_SIZE) && (
              <button className="small-btn secondary" style={{ marginTop: 8 }} onClick={loadMoreUsers} disabled={loadingMore}>
                {loadingMore ? "Cargando..." : `Cargar más usuarios (${userPage * PAGE_SIZE}/${userTotal})`}
              </button>
            )}

            <h3>Prendas ({products.length})</h3>
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #333" }}>
                    <th style={{ padding: 8, textAlign: "left" }}>Nombre</th>
                    <th style={{ padding: 8, textAlign: "left" }}>Precio</th>
                    <th style={{ padding: 8, textAlign: "left" }}>Vendedor</th>
                    <th style={{ padding: 8, textAlign: "left" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => (
                    <tr key={p.id} style={{ borderBottom: "1px solid #222" }}>
                      <td style={{ padding: 8 }}>{p.name}</td>
                      <td style={{ padding: 8 }}>₡{Number(p.price).toLocaleString("es-CR")}</td>
                      <td style={{ padding: 8 }}>{p.seller_name}</td>
                      <td style={{ padding: 8 }}>
                        <button className="small-btn" style={{ background: "#600" }} onClick={() => deleteProduct(p.id)}>
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {productHasMore && (
              <button className="small-btn secondary" style={{ marginTop: 8 }} onClick={loadMoreProducts} disabled={loadingMore}>
                {loadingMore ? "Cargando..." : `Cargar más prendas (${products.length}+)`}
              </button>
            )}
          </>
        )
      )}

      {tab === "sales" && (
        <div>
          <div style={{ padding: "8px 0" }}>Total: {saleTotal}</div>
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #333" }}>
                  <th style={{ padding: 8, textAlign: "left" }}>Producto</th>
                  <th style={{ padding: 8, textAlign: "left" }}>Vendedor</th>
                  <th style={{ padding: 8, textAlign: "left" }}>Comprador</th>
                  <th style={{ padding: 8, textAlign: "left" }}>Tipo</th>
                  <th style={{ padding: 8, textAlign: "left" }}>Estado</th>
                  <th style={{ padding: 8, textAlign: "left" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sales.length === 0 && <tr><td colSpan={6} style={{ padding: 8 }}>Sin ventas</td></tr>}
                {sales.map(s => (
                  <tr key={s.id} style={{ borderBottom: "1px solid #222" }}>
                    <td style={{ padding: 8 }}>{s.product?.name || s.product_id}</td>
                    <td style={{ padding: 8 }}>{s.seller?.username || s.seller_id}</td>
                    <td style={{ padding: 8 }}>{s.buyer?.username || s.buyer_id || "Externo"}</td>
                    <td style={{ padding: 8 }}>{s.type}</td>
                    <td style={{ padding: 8 }}>{s.status}{s.verified ? " ✓" : ""}</td>
                    <td style={{ padding: 8 }}>
                      {s.status === "requested" && (
                        <>
                          <button className="small-btn" style={{ marginRight: 4 }} onClick={() => verifySale(s.id)}>Verificar</button>
                          <button className="small-btn" style={{ background: "#600" }} onClick={() => rejectSale(s.id)}>Rechazar</button>
                        </>
                      )}
                      {s.status === "external" && !s.verified && (
                        <button className="small-btn" onClick={() => verifySale(s.id)}>Verificar</button>
                      )}
                      {s.status === "completed" && <span style={{ color: "#0f0" }}>Completada</span>}
                      {s.status === "rejected" && <span style={{ color: "#f00" }}>Rechazada</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {saleHasMore && (
            <button className="small-btn secondary" style={{ marginTop: 8 }} onClick={loadMoreSales} disabled={loadingMore}>
              {loadingMore ? "Cargando..." : `Cargar más ventas (${sales.length}/${saleTotal})`}
            </button>
          )}
        </div>
      )}

      {tab === "reports" && (
        <div>
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #333" }}>
                  <th style={{ padding: 8, textAlign: "left" }}>Reportante</th>
                  <th style={{ padding: 8, textAlign: "left" }}>Reportado</th>
                  <th style={{ padding: 8, textAlign: "left" }}>Motivo</th>
                  <th style={{ padding: 8, textAlign: "left" }}>Estado</th>
                  <th style={{ padding: 8, textAlign: "left" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {reports.length === 0 && <tr><td colSpan={5} style={{ padding: 8 }}>Sin reportes</td></tr>}
                {reports.map(r => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #222" }}>
                    <td style={{ padding: 8 }}>{r.reporter?.username || r.reporter_id}</td>
                    <td style={{ padding: 8 }}>{r.reported?.username || r.reported_user_id}</td>
                    <td style={{ padding: 8 }}>{r.reason}{r.description ? `: ${r.description}` : ""}</td>
                    <td style={{ padding: 8 }}>{r.status}</td>
                    <td style={{ padding: 8 }}>
                      {r.status === "pending" && (
                        <>
                          <button className="small-btn" style={{ marginRight: 4 }} onClick={() => handleReportAction(r.id, "dismissed")}>Descartar</button>
                          <button className="small-btn" style={{ background: "#600" }} onClick={() => handleReportAction(r.id, "action_taken")}>Tomar acción</button>
                        </>
                      )}
                      {r.status !== "pending" && <span style={{ color: "#888" }}>Resuelto</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {reportHasMore && (
            <button className="small-btn secondary" style={{ marginTop: 8 }} onClick={loadMoreReports} disabled={loadingMore}>
              {loadingMore ? "Cargando..." : "Cargar más reportes"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
