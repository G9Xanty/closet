import { usePWA } from "../hooks/usePWA";

export default function InstallPrompt() {
  const { deferredPrompt, isInstallable } = usePWA();

  if (!isInstallable) return null;

  return (
    <div className="install-banner">
      <span className="install-text">Instala Closet Elander en tu pantalla</span>
      <div className="install-actions">
        <button
          className="install-btn"
          onClick={() => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
          }}
        >
          Instalar
        </button>
      </div>
    </div>
  );
}
