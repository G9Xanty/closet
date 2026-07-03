export default function AuthLoadingScreen() {
  return (
    <div className="view" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%" }}>
      <div style={{ color: "var(--text-primary)" }}>CARGANDO...</div>
      <div className="loading-bar">
        <div className="loading-progress" style={{ width: "100%" }} />
      </div>
    </div>
  );
}