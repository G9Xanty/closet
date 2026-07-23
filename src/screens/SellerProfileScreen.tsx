import { useState, useEffect } from "react";
import { useAppContext } from "../store/AppProvider";
import { api } from "../api/client";

const VERIFICATION_LABELS: Record<string, string> = {
  none: "Sin verificar",
  bronze: "Bronce",
  silver: "Plata",
  gold: "Oro",
};

const VERIFICATION_COLORS: Record<string, string> = {
  none: "#666",
  bronze: "#cd7f32",
  silver: "#c0c0c0",
  gold: "#ffd700",
};

function timeAgo(date: string): string {
  if (!date) return "Nunca";
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Ahora mismo";
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days}d`;
}

export default function SellerProfileScreen() {
  const { activeProduct, goTo } = useAppContext();
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [status, setStatus] = useState("");
  const sellerId = activeProduct?.user_id;

  useEffect(() => {
    if (sellerId) loadSellerProfile();
  }, [sellerId]);

  async function loadSellerProfile() {
    try {
      const data = await api(`/api/profiles/${sellerId}`);
      setProfile(data.profile);
      const statsData = await api(`/api/users/${sellerId}/stats`).catch(() => null);
      if (statsData) setStats(statsData);
    } catch (err: any) {
      setStatus(err.message || "Error al cargar perfil");
    }
  }

  return (
    <div className="view profile-view screen">
      {profile ? (
        <>
          <div className="profile-top">
            <div className={`profile-avatar ${profile.avatar || "avatar-1"}`} />
            <div className="profile-heading">
              <div className="profile-id">{profile.username || profile.dealer_id}</div>
              {profile.location && <div className="profile-location">{profile.location}</div>}
            </div>
          </div>

          {stats && (
            <div className="stats-section">
              <div className="stats-header">Confianza del vendedor</div>
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{stats.productsPublished}</div>
                  <div className="stat-label">Publicadas</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{stats.productsSold}</div>
                  <div className="stat-label">Vendidas</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{stats.productsBought}</div>
                  <div className="stat-label">Compradas</div>
                </div>
              </div>
              <div className="stats-verification">
                <span
                  className="verification-badge"
                  style={{ borderColor: VERIFICATION_COLORS[stats.verificationLevel], color: VERIFICATION_COLORS[stats.verificationLevel] }}
                >
                  {VERIFICATION_LABELS[stats.verificationLevel]}
                </span>
                {stats.verificationRate > 0 && (
                  <span className="verification-rate">{stats.verificationRate}% verificadas</span>
                )}
              </div>
              <div className="stats-last-active">
                Última conexión: {timeAgo(stats.lastActive)}
              </div>
            </div>
          )}

          {profile.bio && (
            <div className="profile-section">
              <div className="section-title">Biografía</div>
              <div className="profile-bio-text">{profile.bio}</div>
            </div>
          )}
        </>
      ) : (
        <div className="helper-text">{status || "Cargando vendedor..."}</div>
      )}

      <div className="profile-actions">
        <button className="small-btn" onClick={() => goTo("detail")}>Ver prenda</button>
        <button className="small-btn secondary" onClick={() => goTo("feed")}>Volver al feed</button>
      </div>
    </div>
  );
}
