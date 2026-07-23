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

export default function PublicProfileScreen() {
  const { goTo, user } = useAppContext();
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    api(`/api/profiles/${user.id}`)
      .then(data => setProfile(data.profile))
      .catch(err => setError(err.message || "Error al cargar perfil"))
      .finally(() => setLoading(false));

    api(`/api/users/${user.id}/stats`)
      .then(data => setStats(data))
      .catch(() => {});
  }, [user?.id]);

  return (
    <div className="view profile-view screen">
      {loading && <div className="helper-text">Cargando perfil...</div>}
      {error && <div className="status-text error">{error}</div>}
      {profile && (
        <>
          <div className="profile-top">
            <div className={`profile-avatar ${profile.avatar || "avatar-1"}`} />
            <div className="profile-heading">
              <div className="profile-id">{profile.username || profile.dealer_id}</div>
              {profile.name && <div className="profile-name">{profile.name}</div>}
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
      )}
      <button className="small-btn secondary" onClick={() => goTo("profile")}>Volver a mi perfil</button>
    </div>
  );
}
