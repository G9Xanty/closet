import { useState, useEffect } from "react";
import { useAuthContext } from "../store/AuthProvider";

type AuthMode = "login" | "signup" | "forgot" | "verify" | "createProfile" | "recovery";

function getInitialMode(): AuthMode {
  try {
    const hash = window.location.hash;
    if (hash && hash.includes("type=recovery")) return "recovery";
  } catch {}
  return "login";
}

export default function AuthScreen() {
  const { user, session, signUp, signIn, resetPassword, updatePassword, updateProfile } = useAuthContext();
  const [mode, setMode] = useState<AuthMode>(getInitialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [username, setUsername] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [status, setStatus] = useState("");
  const [isError, setIsError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user || !session) return;
    if (mode === "recovery" || mode === "createProfile") return;
    if (user.banned) {
      setStatus("Tu cuenta ha sido suspendida");
      setIsError(true);
      return;
    }
    if (!user.dealer_id) {
      setMode("createProfile");
    }
  }, [user, session, mode]);

  async function handleSignUp() {
    setStatus(""); setIsError(false);
    if (!email || !password) { setStatus("Ingresa email y contraseña"); setIsError(true); return; }
    if (password.length < 6) { setStatus("La contraseña debe tener al menos 6 caracteres"); setIsError(true); return; }
    if (password !== confirmPassword) { setStatus("Las contraseñas no coinciden"); setIsError(true); return; }
    setSubmitting(true);
    try {
      await signUp(email, password);
      setStatus("Cuenta creada. Configura tu perfil.");
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("already") || msg.includes("already registered")) {
        setStatus("Ese email ya tiene cuenta. Usa Entrar.");
      } else {
        setStatus("Error al registrarse");
      }
      setIsError(true);
    } finally { setSubmitting(false); }
  }

  async function handleLogin() {
    setStatus(""); setIsError(false);
    if (!email || !password) { setStatus("Ingresa email y contraseña"); setIsError(true); return; }
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg === "EMAIL_NOT_CONFIRMED") {
        setStatus("Confirma tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.");
      } else {
        setStatus("Email o contraseña incorrectos");
      }
      setIsError(true);
    } finally { setSubmitting(false); }
  }

  async function handleForgot() {
    setStatus(""); setIsError(false);
    if (!email) { setStatus("Ingresa tu email"); setIsError(true); return; }
    setSubmitting(true);
    try {
      await resetPassword(email);
      setStatus("Revisa tu correo para restablecer tu contraseña");
    } catch { setStatus("Error al enviar correo"); setIsError(true); }
    finally { setSubmitting(false); }
  }

  async function handleRecovery() {
    setStatus(""); setIsError(false);
    if (!password) { setStatus("Ingresa una nueva contraseña"); setIsError(true); return; }
    if (password.length < 6) { setStatus("La contraseña debe tener al menos 6 caracteres"); setIsError(true); return; }
    if (password !== confirmPassword) { setStatus("Las contraseñas no coinciden"); setIsError(true); return; }
    setSubmitting(true);
    try {
      await updatePassword(password);
      window.location.hash = "";
      setStatus("Contraseña actualizada. Redirigiendo...");
      setIsError(false);
    } catch (err: any) {
      setStatus(err.message || "Error al actualizar contraseña"); setIsError(true);
    } finally { setSubmitting(false); }
  }

  async function handleCreateProfile() {
    setStatus(""); setIsError(false);
    if (!username || username.length < 3) { setStatus("El username debe tener al menos 3 caracteres"); setIsError(true); return; }
    setSubmitting(true);
    try {
      await updateProfile({ username, whatsapp_phone: whatsapp || undefined });
    } catch (err: any) {
      setStatus(err.message || "Error al guardar perfil"); setIsError(true);
    } finally { setSubmitting(false); }
  }

  if (mode === "recovery") {
    return (
      <div className="view" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <div className="auth-box">
          <div className="screen-title">NUEVA CONTRASEÑA</div>
          <div className="helper-text">Ingresa tu nueva contraseña</div>
          <input className="field" type="password" placeholder="Nueva contraseña" value={password} onChange={e => setPassword(e.target.value)} />
          <input className="field" type="password" placeholder="Confirmar contraseña" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
          <button className="small-btn" disabled={submitting} onClick={handleRecovery}>{submitting ? "Guardando..." : "Actualizar contraseña"}</button>
          <div className={`status-text ${isError ? "error" : "success"}`}>{status}</div>
        </div>
      </div>
    );
  }

  if (mode === "verify") {
    return (
      <div className="view" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <div className="auth-box">
          <div className="screen-title">VERIFICA TU CORREO</div>
          <div className="helper-text">Te enviamos un link de confirmación a <strong>{email}</strong></div>
          <div className={`status-text ${isError ? "error" : "success"}`}>{status}</div>
          <button className="small-btn" onClick={() => { setMode("login"); setStatus(""); setIsError(false); }}>Volver al login</button>
        </div>
      </div>
    );
  }

  if (mode === "createProfile") {
    return (
      <div className="view" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <div className="auth-box">
          <div className="screen-title">CREA TU PERFIL</div>
          <div className="helper-text">Elige un nombre de usuario para tu tienda</div>
          <input className="field" type="text" placeholder="Username (ej: TiendaX)" value={username} onChange={e => setUsername(e.target.value)} />
          <input className="field" type="tel" placeholder="WhatsApp (opcional, 8 dígitos)" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} />
          <button className="small-btn" disabled={submitting} onClick={handleCreateProfile}>{submitting ? "Guardando..." : "Guardar"}</button>
          <div className={`status-text ${isError ? "error" : ""}`}>{status}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="view screen" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%" }}>
      <div className="auth-box">
        <div className="screen-title">{mode === "login" ? "LOGIN" : mode === "signup" ? "REGISTRO" : "RECUPERAR"}</div>
        <div className={`status-text ${isError ? "error" : "success"}`}>{status}</div>

        {mode === "forgot" ? (
          <>
            <div className="helper-text">Ingresa tu email para recibir un link de recuperación</div>
            <input className="field" type="email" placeholder="tu@email.com" value={email} onChange={e => setEmail(e.target.value)} />
            <button className="small-btn" disabled={submitting} onClick={handleForgot}>{submitting ? "Enviando..." : "Enviar link"}</button>
            <button className="small-btn secondary" onClick={() => { setMode("login"); setStatus(""); setIsError(false); }}>Volver</button>
          </>
        ) : (
          <>
            <div className="helper-text">{mode === "login" ? "Ingresa tu email y contraseña" : "Crea tu cuenta con email y contraseña"}</div>
            <input className="field" type="email" placeholder="tu@email.com" value={email} onChange={e => setEmail(e.target.value)} />
            <input className="field" type="password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} />
            {mode === "signup" && (
              <input className="field" type="password" placeholder="Confirmar contraseña" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
            )}
            <button className="small-btn" disabled={submitting} onClick={mode === "login" ? handleLogin : handleSignUp}>
              {submitting ? "Procesando..." : (mode === "login" ? "Entrar" : "Crear cuenta")}
            </button>
            {mode === "login" && (
              <button className="small-btn secondary" onClick={() => { setMode("forgot"); setStatus(""); setIsError(false); }}>
                Olvidé mi contraseña
              </button>
            )}
          </>
        )}

        {mode !== "forgot" && (
          <div style={{ textAlign: "center", marginTop: 4 }}>
            <span className="helper-text" style={{ cursor: "pointer", color: "var(--text-secondary)" }}
              onClick={() => { setMode(mode === "login" ? "signup" : "login"); setStatus(""); setIsError(false); setPassword(""); setConfirmPassword(""); }}>
              {mode === "login" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Entrar"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
