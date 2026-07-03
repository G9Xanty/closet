import { useState, useEffect } from "react";
import { useAppContext } from "../store/AppProvider";
import { api } from "../api/client";

export default function SellerProfileScreen() {
  const { activeProduct, goTo } = useAppContext();
  const [profile, setProfile] = useState<any>(null);
  const [status, setStatus] = useState("");
  const sellerId = activeProduct?.user_id;

  useEffect(() => {
    if (sellerId) loadSellerProfile();
  }, [sellerId]);

  async function loadSellerProfile() {
    try {
      const data = await api(`/api/profiles/${sellerId}`);
      setProfile(data.profile);
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
