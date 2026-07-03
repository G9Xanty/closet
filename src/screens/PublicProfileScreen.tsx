import { useState, useEffect } from "react";
import { useAppContext } from "../store/AppProvider";
import { api } from "../api/client";

export default function PublicProfileScreen() {
  const { goTo, user } = useAppContext();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    api(`/api/profiles/${user.id}`)
      .then(data => setProfile(data.profile))
      .catch(err => setError(err.message || "Error al cargar perfil"))
      .finally(() => setLoading(false));
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
