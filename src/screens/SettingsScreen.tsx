import { useAppContext } from "../store/AppProvider";

export default function SettingsScreen() {
  const { user, goTo } = useAppContext();
  if (!user) return null;

  return (
    <div className="view profile-view screen">
      <div className="profile-top">
        <div className={`profile-avatar ${user.avatar}`} />
        <div className="profile-heading">
          <div className="profile-id">@{user.dealer_id || user.username}</div>
          <div className="profile-phone">Configuración</div>
        </div>
      </div>

      <div className="settings-section">
        <div className="section-title">Cuenta</div>
        <div className="settings-row">
          <span className="settings-label">Dealer ID</span>
          <span className="settings-value">{user.dealer_id}</span>
        </div>
      </div>

      <button className="small-btn secondary" onClick={() => goTo("feed")}>Volver</button>
    </div>
  );
}
