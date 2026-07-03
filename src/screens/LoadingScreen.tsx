import { useEffect } from "react";
import { useAppContext } from "../store/AppProvider";

export default function LoadingScreen() {
  const { goTo } = useAppContext();

  useEffect(() => {
    const t = setTimeout(() => {
      goTo("feed");
    }, 1500);
    return () => clearTimeout(t);
  }, [goTo]);

  return (
    <div className="view screen" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%" }}>
      <div style={{ color: "var(--text-primary)" }}>CARGANDO...</div>
      <div className="loading-bar">
        <div className="loading-progress" style={{ width: "100%" }} />
      </div>
    </div>
  );
}
