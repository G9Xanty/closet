import { useState, useEffect, useRef } from "react";
import { useAppContext } from "../store/AppProvider";
import { api } from "../api/client";

interface AvatarInfo { id: string; unlocked: boolean; required_sales: number; }

const ALL_AVATARS: AvatarInfo[] = [
  { id: "avatar-1", unlocked: true, required_sales: 0 },
  { id: "avatar-2", unlocked: true, required_sales: 0 },
  { id: "avatar-3", unlocked: true, required_sales: 0 },
  { id: "avatar-4", unlocked: true, required_sales: 0 },
  { id: "avatar-5", unlocked: true, required_sales: 0 },
  { id: "avatar-6", unlocked: true, required_sales: 0 },
  { id: "avatar-7", unlocked: true, required_sales: 0 },
  { id: "avatar-8", unlocked: false, required_sales: 1 },
  { id: "avatar-9", unlocked: false, required_sales: 10 },
  { id: "avatar-10", unlocked: false, required_sales: 100 },
];

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



export default function ProfileScreen() {
  const { user, signOut, goTo } = useAppContext();
  const [tab, setTab] = useState("edit");
  const [status, setStatus] = useState("");
  const [isError, setIsError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phonePrivate, setPhonePrivate] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [reputation, setReputation] = useState({ score: 0, verified: 0, external: 0, reports: 0 });
  const [avatars, setAvatars] = useState<AvatarInfo[]>(ALL_AVATARS);
  const [selectedAvatar, setSelectedAvatar] = useState(user?.avatar || "avatar-1");
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (user && !loadedRef.current) {
      loadedRef.current = true;
      api("/api/profiles/me")
        .then(data => {
          const p = data.profile || {};
          setName(p.name || "");
          setUsername(p.username || "");
          setBio(p.bio || "");
          setLocation(p.location || "");
          setPhoneNumber(p.phone_number || "");
          setPhonePrivate(p.phone_private !== false);
          setReputation({
            score: p.reputation_score || 0,
            verified: p.sales_verified || 0,
            external: p.sales_external || 0,
            reports: p.reports_count || 0,
          });
          setLoaded(true);
        })
        .catch(() => setLoaded(true));
      api("/api/avatars")
        .then(data => {
          if (data.avatars) setAvatars(data.avatars);
        })
        .catch(() => {});
      api("/api/notifications/unread-count")
        .then(data => setUnreadCount(data.count || 0))
        .catch(() => {});
    }
  }, [user]);

  if (!user) return null;

  async function handleAvatarClick(av: AvatarInfo) {
    if (!av.unlocked || av.id === selectedAvatar) return;
    setSelectedAvatar(av.id);
    setShowAvatarPicker(false);
    await api("/api/profiles/me", {
      method: "PATCH",
      body: JSON.stringify({ avatar: av.id })
    }).catch(() => {});
  }

  async function handleSave() {
    setSaving(true);
    setStatus("");
    setIsError(false);
    try {
      const body: Record<string, any> = {
        username: username.trim(),
        name: name.trim(),
        bio: bio.trim(),
        location: location.trim(),
        phone_number: phoneNumber.trim(),
        phone_private: phonePrivate
      };
      if (selectedAvatar !== user!.avatar) {
        body.avatar = selectedAvatar;
      }
      await api("/api/profiles/me", {
        method: "PATCH",
        body: JSON.stringify(body)
      });
      setStatus("Perfil guardado");
    } catch (err: any) {
      setStatus(err.message || "Error al guardar");
      setIsError(true);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await signOut();
  }

  const unlockedCount = avatars.filter(a => a.unlocked).length;

  return (
    <div className="view profile-view">
      <div className="profile-header">
        <div className="profile-avatar-section">
          <div
            className={`profile-avatar ${selectedAvatar}`}
            onClick={() => setShowAvatarPicker(p => !p)}
          />
          <div className="profile-avatar-actions">
            <button className="avatar-change-btn" onClick={() => setShowAvatarPicker(p => !p)}>
              {showAvatarPicker ? "▲ Cerrar" : "▼ Cambiar avatar"}
            </button>
            <button className="profile-logout-btn" onClick={handleLogout} title="Cerrar sesión">⏻</button>
          </div>
        </div>
        <div className="profile-user-info">
          <div className="profile-id">{user.dealer_id || user.username}</div>
          <div className="profile-phone">@{user.dealer_id || user.username}</div>
        </div>
      </div>

      {showAvatarPicker && (
        <div className="avatar-picker">
          <div className="avatar-grid">
            {avatars.map(av => (
              <div key={av.id}
                className={`avatar-option ${av.id} ${selectedAvatar === av.id ? "selected" : ""} ${av.unlocked ? "unlocked" : "locked"}`}
                onClick={() => handleAvatarClick(av)}
                title={av.unlocked ? `Avatar ${av.id.slice(-1)}` : `${av.id.slice(-1)} (${av.required_sales} ventas)`}
              >
                {!av.unlocked && (
                  <div className="lock-overlay">
                    <span>🔒</span>
                    <span className="lock-count">{av.required_sales}</span>
                  </div>
                )}
                {av.unlocked && selectedAvatar === av.id && (
                  <div className="selected-check">✓</div>
                )}
              </div>
            ))}
          </div>
          <div className="avatar-picker-info">
            {unlockedCount}/{avatars.length} desbloqueados
          </div>
        </div>
      )}

      <div className="profile-reputation">
        <div className="profile-rank">
          <div className="profile-rank-badge" style={{ borderColor: getRank(reputation.verified).current.color, color: getRank(reputation.verified).current.color }}>
            {getRank(reputation.verified).current.name}
          </div>
          {getRank(reputation.verified).next && (
            <div className="profile-rank-progress">
              <div className="rank-progress-bar">
                <div className="rank-progress-fill" style={{ width: `${Math.round(getRank(reputation.verified).progress * 100)}%`, background: getRank(reputation.verified).current.color }} />
              </div>
              <span className="profile-rank-next">{reputation.verified}/{getRank(reputation.verified).next!.sales} ventas verificadas</span>
            </div>
          )}
          {!getRank(reputation.verified).next && (
            <span className="profile-rank-next">{reputation.verified} ventas verificadas</span>
          )}
        </div>
        <div className="rep-item"><strong>{reputation.score}</strong> reputación</div>
        <div className="rep-item"><strong>{reputation.external}</strong> ventas externas</div>
      </div>

      <div className="profile-tabs">
        {["edit", "settings"].map(t => (
          <button key={t} className={`profile-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t === "edit" ? "Editar perfil" : "Configuración"}
          </button>
        ))}
      </div>

      {tab === "edit" && (
        <div className="profile-form">
          <div className="profile-section">
            <div className="section-title">Información pública</div>
            <input className="field" type="text" placeholder="Username público" maxLength={30} value={username} onChange={e => setUsername(e.target.value)} />
            <input className="field" type="text" placeholder="Nombre completo" maxLength={60} value={name} onChange={e => setName(e.target.value)} />
            <textarea className="field profile-bio" placeholder="Biografía" maxLength={500} value={bio} onChange={e => setBio(e.target.value)} rows={3} />
            <input className="field" type="text" placeholder="Ubicación" maxLength={100} value={location} onChange={e => setLocation(e.target.value)} />
          </div>

          <div className="profile-section">
            <div className="section-title">Contacto (WhatsApp para ventas)</div>
            <input className="field" type="tel" placeholder="WhatsApp (8 dígitos)" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} />
            <label className="profile-toggle">
              <input type="checkbox" checked={phonePrivate} onChange={e => setPhonePrivate(e.target.checked)} />
              <span>Número privado (no visible en perfil público)</span>
            </label>
            <div className="profile-hint">Tu número se usará para que los compradores te contacten por WhatsApp.</div>
          </div>

          <button className="small-btn" disabled={saving} onClick={handleSave}>
            {saving ? "Guardando..." : "Guardar perfil"}
          </button>
        </div>
      )}

      {tab === "settings" && (
        <div className="profile-form">
          <div className="profile-section">
            <div className="section-title">Acciones</div>
            <button className="small-btn" onClick={() => goTo("feed")}>Ir al feed</button>
            <button className="small-btn" onClick={() => goTo("upload")}>Vender prenda</button>
            <button className="small-btn" onClick={() => goTo("requests")}>Mis transacciones</button>
            <button className="small-btn" onClick={() => goTo("notifications")}>
              Notificaciones
              {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
            </button>
          </div>
          <div className="profile-section">
            <div className="section-title">Cuenta</div>
            <button className="small-btn secondary" onClick={handleLogout}>Cambiar cuenta</button>
            <button className="small-btn secondary" onClick={handleLogout} style={{ borderColor: "rgba(255,68,68,0.3)", color: "#ff6666" }}>Cerrar sesión</button>
          </div>
        </div>
      )}

      <div className={`status-text ${isError ? "error" : "success"}`}>{status}</div>
    </div>
  );
}
