import { useState, useEffect, useCallback } from "react";
import { useAppContext } from "../store/AppProvider";
import { api } from "../api/client";
import type { Sale, Report } from "../store/appState";

interface AdminUser {
  id: string; email: string; username: string; dealer_id: string; banned: boolean; is_admin: boolean;
}
interface AdminProduct { id: number; name: string; price: number; seller_name: string; }
interface DashboardData {
  stats: { users: number; products: number };
  users: AdminUser[];
  products: AdminProduct[];
}

type AdminTab = "dashboard" | "sales" | "reports";

export default function AdminScreen() {
  const { user, goTo } = useAppContext();
  const [tab, setTab] = useState<AdminTab>("dashboard");
  const [data, setData] = useState<DashboardData | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api("/api/admin/dashboard");
      setData(res);
    } catch (err: any) {
      setStatus(err.message);
    } finally { setLoading(false); }
  }, []);

  const loadSales = useCallback(async () => {
    try {
      const res = await api("/api/admin/sales");
      setSales(res.sales || []);
    } catch (err: any) {
      setStatus(err.message);
    }
  }, []);

  const loadReports = useCallback(async () => {
    try {
      const res = await api("/api/admin/reports");
      setReports(res.reports || []);
    } catch (err: any) {
      setStatus(err.message);
    }
  }, []);

  useEffect(() => { if (tab === "dashboard") loadDashboard(); }, [tab, loadDashboard]);
  useEffect(() => { if (tab === "sales") loadSales(); }, [tab, loadSales]);
  useEffect(() => { if (tab === "reports") loadReports(); }, [tab, loadReports]);

  async function banUser(id: string) {
    if (!confirm("Bannear usuario?")) return;
    try { await api(`/api/admin/users/${id}/ban`, { method: "POST" }); await loadDashboard(); }
    catch (err: any) { setStatus(err.message); }
  }

  async function deleteUser(id: string) {
    if (!confirm("Eliminar usuario y sus prendas?")) return;
    try { await api(`/api/admin/users/${id}`, { method: "DELETE" }); await loadDashboard(); }
    catch (err: any) { setStatus(err.message); }
  }

  async function deleteProduct(id: number) {
    if (!confirm("Eliminar prenda?")) return;
    try { await api(`/api/products/${id}`, { method: "DELETE" }); await loadDashboard(); }
    catch (err: any) { setStatus(err.message); }
  }

  async function verifySale(id: string) {
    try { await api(`/api/admin/sales/${id}/verify`, { method: "POST" }); await loadSales(); }
    catch (err: any) { setStatus(err.message); }
  }

  async function rejectSale(id: string) {
    try { await api(`/api/admin/sales/${id}/reject`, { method: "POST" }); await loadSales(); }
    catch (err: any) { setStatus(err.message); }
  }

  async function handleReportAction(id: string, action: string) {
    try {
      await api(`/api/admin/reports/${id}/action`, {
        method: "POST", body: JSON.stringify({ action }),
      });
      await loadReports();
    } catch (err: any) { setStatus(err.message); }
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
        loading ? <div style={{ padding: 20 }}>Cargando...</div> : data ? (
          <>
            <div style={{ display: "flex", gap: 16, padding: "12px 0" }}>
              <div className="panel" style={{ flex: 1, border: "1px solid #702020", background: "#111", padding: 16 }}>
                <strong>Usuarios:</strong> {data.stats.users}
              </div>
              <div className="panel" style={{ flex: 1, border: "1px solid #702020", background: "#111", padding: 16 }}>
                <strong>Prendas:</strong> {data.stats.products}
              </div>
            </div>

            <h3>Usuarios ({data.users.length})</h3>
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
                  {data.users.map(u => (
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

            <h3>Prendas ({data.products.length})</h3>
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
                  {data.products.map(p => (
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
          </>
        ) : <div style={{ padding: 20 }}>Error al cargar datos.</div>
      )}

      {tab === "sales" && (
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
      )}

      {tab === "reports" && (
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
      )}
    </div>
  );
}
