import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./store/AuthProvider";
import { isSupabaseReady } from "./lib/supabase";
import "./styles/global.css";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(r => r.unregister());
  });
}

if ("caches" in window) {
  caches.keys().then(keys => {
    keys.forEach(key => caches.delete(key));
  });
}

const rootEl = document.getElementById("root");

if (!rootEl) {
  document.body.innerHTML =
    '<div style="color:#e2412f;padding:40px;font-family:sans-serif;text-align:center">' +
    '<h1>Error</h1><p>No se encontró el elemento raíz.</p></div>';
} else if (!isSupabaseReady()) {
  rootEl.innerHTML =
    '<div style="color:#e2412f;padding:40px;font-family:sans-serif;text-align:center">' +
    "<h1>Configuración pendiente</h1>" +
    "<p>Define <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en el archivo <code>.env</code></p>" +
    '<p style="color:#888;font-size:14px">Consulta <code>.env.example</code> para más información.</p>' +
    "</div>";
} else {
  try {
    createRoot(rootEl).render(
      <StrictMode>
        <AuthProvider>
          <App />
        </AuthProvider>
      </StrictMode>
    );
  } catch (e) {
    rootEl.innerHTML =
      '<div style="color:#e2412f;padding:40px;font-family:sans-serif;text-align:center">' +
      "<h1>Error crítico</h1>" +
      "<p>La aplicación no pudo iniciarse.</p>" +
      `<p style="color:#888;font-size:12px">${e instanceof Error ? e.message : "Error desconocido"}</p>` +
      "</div>";
  }
}
