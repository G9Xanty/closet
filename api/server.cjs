require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;

function getLocalIP() {
  const os = require("os");
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "localhost";
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function createSafeClient(url, key) {
  if (!url || !key) {
    if (!url) url = "https://supabase.notconfigured.local";
    if (!key) key = "missing-key";
  }
  return createClient(url, key);
}

const supabase = createSafeClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseAdmin = createSafeClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const ADMIN_EMAIL = normalizeEmail(process.env.ADMIN_EMAIL || "admin@closet.local");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

console.log("[BACKEND] SUPABASE_URL:", SUPABASE_URL);
console.log("[BACKEND] ANON_KEY set:", !!SUPABASE_ANON_KEY);
console.log("[BACKEND] SERVICE_KEY set:", !!SUPABASE_SERVICE_KEY);

/* ── Rate Limiters ────────────────────────────────── */

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Demasiados intentos. Intenta de nuevo en 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: true },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: "Demasiadas solicitudes. Intenta de nuevo en 1 minuto." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: true },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Demasiadas subidas. Intenta de nuevo en 1 minuto." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: true },
});

const productLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: "Demasiadas publicaciones. Maximo 20 por hora." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: true },
});

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: "Demasiadas solicitudes admin." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: true },
});

/* ── Phone visibility helper ─────────────────────── */

async function getPhoneVisibility(sellerId) {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("phone_number, whatsapp_enabled, phone_private")
      .eq("id", sellerId)
      .single();
    if (!profile) return { phone: "", visible: false };
    if (profile.phone_private === false && profile.whatsapp_enabled) {
      return { phone: normalizeWhatsappPhone(profile.phone_number || ""), visible: true };
    }
    return { phone: "", visible: false };
  } catch {
    return { phone: "", visible: false };
  }
}

/* ── Anti-spam: product posting tracker ──────────── */

const productSpamTracker = new Map();

function checkProductSpam(userId) {
  const key = String(userId);
  const now = Date.now();
  const windowMs = 24 * 60 * 60 * 1000;
  const maxProducts = 15;
  if (!productSpamTracker.has(key)) {
    productSpamTracker.set(key, []);
  }
  const timestamps = productSpamTracker.get(key).filter(t => now - t < windowMs);
  if (timestamps.length >= maxProducts) {
    return false;
  }
  timestamps.push(now);
  productSpamTracker.set(key, timestamps);
  return true;
}

/* ── Bot protection ──────────────────────────────── */

const BOT_USER_AGENTS = /(bot|crawler|spider|scraper|curl|wget|httpie|python-requests|go-http-client|java\/|libwww|perl|lwp|winhttp|node-fetch|php|ruby|scrapy|nutch|ahrefs|semrush|majestic|baidu|yandex|sogou|exabot|mj12|dotbot|rogerbot|tinyurl|uptimerobot|monitor|backlink|copyrightcheck|serpstat|seznam|pinterest|slurp|duckduckgo|facebookexternalhit|twitterbot|whatsapp|telegrambot)/i;

function isBot(req) {
  const ua = (req.headers["user-agent"] || "").toLowerCase();
  if (!ua || ua.length < 10) return true;
  if (BOT_USER_AGENTS.test(ua)) return true;
  if (req.headers["x-forwarded-for"] && req.headers["x-forwarded-for"].split(",").length > 5) return true;
  return false;
}

function botProtection(req, res, next) {
  if (req.path.startsWith("/api/")) {
    if (isBot(req)) {
      return res.status(403).json({ error: "Acceso denegado." });
    }
  }
  next();
}

/* ── Storage path extraction ──────────────────────── */

function extractStoragePaths(row) {
  const paths = [];
  if (row.storage_paths && Array.isArray(row.storage_paths)) {
    return row.storage_paths.filter(Boolean);
  }
  if (row.storage_path) paths.push(row.storage_path);
  const allUrls = [row.image_url, row.image_url_2, row.image_url_3, row.image_url_4].filter(Boolean);
  for (const url of allUrls) {
    const parts = url.split("/");
    const candidate = parts[parts.length - 1];
    if (candidate && candidate.length > 10 && !candidate.includes("?")) {
      paths.push(candidate);
    }
  }
  return [...new Set(paths)];
}

async function deleteStorageFiles(paths) {
  if (!paths || paths.length === 0) return;
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return;
  for (const p of unique) {
    await supabaseAdmin.storage.from("product-images").remove([p]).catch(() => {});
  }
}

/* ── Image validation ────────────────────────────── */

const MAGIC_BYTES = {
  jpeg: [0xFF, 0xD8, 0xFF],
  png: [0x89, 0x50, 0x4E, 0x47],
  webp: [0x52, 0x49, 0x46, 0x46],
  gif: [0x47, 0x49, 0x46],
};

function validateImageBuffer(buffer) {
  if (!buffer || buffer.length < 4) return false;
  if (buffer.length > 10 * 1024 * 1024) return false;
  const firstBytes = Array.from(buffer.slice(0, 4));
  return Object.values(MAGIC_BYTES).some(sig =>
    sig.every((byte, i) => firstBytes[i] === byte)
  );
}

/* ── Origin validation ───────────────────────────── */

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:3000",
  process.env.PUBLIC_URL || "",
  /^https:\/\/[a-zA-Z0-9-]+\.vercel\.app$/,
];

function isValidOrigin(origin) {
  if (!origin) return false;
  if (origin === "null") return false;
  return ALLOWED_ORIGINS.some(allowed => {
    if (typeof allowed === "string" && allowed) return origin === allowed;
    if (allowed instanceof RegExp) return allowed.test(origin);
    return false;
  });
}

function checkOrigin(req, res, next) {
  if (req.method === "GET") return next();
  const origin = req.headers.origin || req.headers["referer"] || "";
  if (origin && !isValidOrigin(origin)) {
    return res.status(403).json({ error: "Origen no autorizado." });
  }
  next();
}

/* ── Middleware ──────────────────────────────────── */

app.set("trust proxy", 1);

app.use(cors({ origin: true, credentials: true }));
app.use(checkOrigin);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.use(botProtection);

app.use("/api/auth", authLimiter);

function csrfProtection(req, res, next) {
  const safe = ["GET", "HEAD", "OPTIONS"];
  if (safe.includes(req.method)) return next();
  const xrw = req.headers["x-requested-with"];
  if (xrw !== "XMLHttpRequest") {
    return res.status(403).json({ error: "CSRF validation failed." });
  }
  next();
}
app.use("/api", csrfProtection);

app.use((req, res, next) => {
  if (req.path.endsWith(".html") || req.path.endsWith(".js")) {
    res.setHeader("Cache-Control", "no-store");
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https: wss: ws:;");
  next();
});
app.use(express.static(path.join(ROOT, "dist")));
app.use(express.static(path.join(ROOT, "public")));
app.use("/admin", express.static(path.join(ROOT, "admin")));

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function normalizeWhatsappPhone(phone) {
  const raw = String(phone || "").trim();
  if (!raw) return "";
  const digits = raw.replace(/[-.\s()]/g, "");
  if (/^\+506\d{8}$/.test(digits)) return digits;
  if (/^506\d{8}$/.test(digits)) return `+${digits}`;
  if (/^\d{8}$/.test(digits)) return `+506${digits}`;
  return digits;
}

function isCostaRicaWhatsapp(phone) {
  const normalized = normalizeWhatsappPhone(phone);
  return !normalized || /^\+506\d{8}$/.test(normalized);
}

function publicUser(user) {
  if (!user) return null;
  const meta = user.user_metadata || {};
  return {
    id: user.id,
    email: user.email || "",
    dealer_id: meta.dealer_id || "",
    username: meta.username || meta.dealer_id || "",
    avatar: meta.avatar || "avatar-1",
    banned: Boolean(meta.banned),
    is_admin: Boolean(meta.is_admin),
    email_verified: Boolean(user.email_confirmed_at),
    created_at: user.created_at
  };
}

/* ── Profiles ──────────────────────────────────────── */

const VALID_AVATARS = ["avatar-1", "avatar-2", "avatar-3", "avatar-4", "avatar-5", "avatar-6", "avatar-7", "avatar-8", "avatar-9", "avatar-10"];
const LOCKED_AVATARS = { "avatar-8": 1, "avatar-9": 10, "avatar-10": 100 };

function privateProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username || "",
    name: row.name || "",
    profile_photo: row.profile_photo || "",
    bio: row.bio || "",
    location: row.location || "",
    phone_number: row.phone_number || "",
    whatsapp_enabled: Boolean(row.whatsapp_enabled),
    phone_private: row.phone_private !== false,
    dealer_id: row.dealer_id || "",
    avatar: row.avatar || "avatar-1",
    email: row.email || "",
    banned: Boolean(row.banned),
    is_admin: Boolean(row.is_admin),
    sales_verified: row.sales_verified || 0,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function publicProfileRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username || "",
    name: row.name || "",
    bio: row.bio || "",
    location: row.location || "",
    dealer_id: row.dealer_id || "",
    avatar: row.avatar || "avatar-1",
    reputation_score: row.reputation_score || 0,
    sales_verified: row.sales_verified || 0,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function mergeProfileWithAuth(profileRow, meta, authEmail) {
  if (!profileRow) return null;
  return {
    ...profileRow,
    dealer_id: meta.dealer_id || "",
    avatar: VALID_AVATARS.includes(meta.avatar) ? meta.avatar : "avatar-1",
    email: authEmail || meta.email || "",
    banned: Boolean(meta.banned),
    is_admin: Boolean(meta.is_admin)
  };
}

async function getProfile(userId) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  return data || null;
}

async function ensureProfile(userId) {
  const existing = await getProfile(userId);
  if (existing) return existing;
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .insert({ id: userId })
    .select()
    .single();
  if (error) {
    const retry = await getProfile(userId);
    if (retry) return retry;
    throw error;
  }
  return data;
}

function buildWhatsappLink(phone, message) {
  const normalized = normalizeWhatsappPhone(phone);
  if (!normalized || !/^\+506\d{8}$/.test(normalized)) return "";
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${normalized.replace("+", "")}?text=${encoded}`;
}

function publicProduct(row) {
  if (!row) return null;
  let images = row.images;
  if (!images || !Array.isArray(images)) {
    images = [row.image_url, row.image_url_2, row.image_url_3, row.image_url_4].filter(Boolean);
  }
  const productName = row.title || "";
  const price = Number(row.price);
  const msg = `Hola! Me interesa "${productName}" por ₡${price}. ¿Está disponible?`;
  return {
    id: row.id,
    name: row.title,
    title: row.title,
    price,
    image_url: row.image_url || (images[0] || ""),
    image_url_2: row.image_url_2 || (images[1] || ""),
    image_url_3: row.image_url_3 || (images[2] || ""),
    image_url_4: row.image_url_4 || (images[3] || ""),
    images,
    description: row.description || "",
    whatsapp_link: "",
    user_id: row.user_id,
    seller_id: row.user_id,
    size: row.size || "N/D",
    brand: row.brand || "",
    category: row.category || "otros",
    condition: row.condition || "good",
    status: row.status || "disponible",
    uber_flash_included: Boolean(row.uber_flash_included),
    seller_username: "",
    seller_dealer_id: "",
    seller_avatar: "",
    seller_reputation: row.seller_reputation || 0,
    seller_location: row.seller_location || "",
    created_at: row.created_at
  };
}

function setAuthCookie(res, token) {
  res.cookie("closet_token", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/"
  });
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  return req.cookies.closet_token || "";
}

async function requireUser(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token || token.length < 20) {
      console.warn("[AUTH] Token ausente o muy corto");
      return res.status(401).json({ error: "No autenticado." });
    }

    // Log token expiry for debugging
    try {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
      const expDate = new Date(payload.exp * 1000);
      const now = Date.now();
      const diffMs = expDate.getTime() - now;
      console.log(`[AUTH] Token exp: ${expDate.toISOString()}, now: ${new Date(now).toISOString()}, diff: ${Math.round(diffMs/1000)}s`);
    } catch (e) {
      console.warn("[AUTH] Could not decode token:", e.message);
    }

    let user = null;
    let err = null;
    try {
      const result = await supabase.auth.getUser(token);
      user = result.data?.user;
      err = result.error;
    } catch (e) {
      err = e;
    }
    if (!user && err) {
      console.warn("[AUTH] getUser con anon key fallo, intentando con service role:", err?.message || err);
      try {
        const result = await supabaseAdmin.auth.getUser(token);
        user = result.data?.user;
        err = result.error;
      } catch (e2) {
        err = e2;
      }
    }
    if (err) console.warn("[AUTH] getUser error (final):", err?.message || err);
    if (!user) {
      res.clearCookie("closet_token");
      return res.status(401).json({ error: "Sesion invalida." });
    }
    const meta = user.user_metadata || {};
    if (meta.banned) return res.status(403).json({ error: "Tu cuenta esta baneada." });
    req.user = user;

    // Update last_active_at (fire and forget, don't block request)
    supabaseAdmin.from("profiles").update({ last_active_at: new Date().toISOString() }).eq("id", user.id).then(() => {}).catch(() => {});

    next();
  } catch (e) {
    console.error("[AUTH] requireUser catch:", e);
    res.clearCookie("closet_token");
    res.status(401).json({ error: "Sesion invalida." });
  }
}

async function logAdminAction(adminId, action, targetId, req) {
  try {
    await supabaseAdmin.from("admin_audit_log").insert({
      admin_id: adminId,
      action,
      target_id: targetId,
      ip: req.ip || req.headers["x-forwarded-for"] || "",
      user_agent: (req.headers["user-agent"] || "").slice(0, 200),
      created_at: new Date().toISOString()
    }).catch(() => {});
    console.log(`[AUDIT] admin=${adminId} action=${action} target=${targetId}`);
  } catch {}
}

async function requireAdmin(req, res, next) {
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(req.user.id);
    if (error || !user) return res.status(403).json({ error: "Acceso admin denegado." });
    const meta = user.user_metadata || {};
    if (!meta.is_admin) return res.status(403).json({ error: "Acceso admin denegado." });
    req.user = user;
    next();
  } catch {
    res.status(403).json({ error: "Acceso admin denegado." });
  }
}

app.get("/", (_req, res) => {
  const fs = require("fs");
  const distIndex = path.join(ROOT, "dist", "index.html");
  if (fs.existsSync(distIndex)) {
    res.sendFile(distIndex);
  } else {
    res.redirect("/closet.html");
  }
});

app.post("/api/auth/check-email", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!isValidEmail(email)) return res.status(400).json({ error: "Ingresa un email valido." });
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const user = users.users.find(u => u.email === email);
    res.json({ exists: Boolean(user), hasSession: false });
  } catch (error) {
    console.error(`[check-email]`, error);
    res.status(500).json({ error: "Error al verificar email." });
  }
});

app.post("/api/auth/register/start", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    const confirmPassword = String(req.body.confirmPassword || req.body.confirm_password || "");

    if (!isValidEmail(email)) return res.status(400).json({ error: "Ingresa un email valido." });
    if (password.length < 6) return res.status(400).json({ error: "La contrasena debe tener al menos 6 caracteres." });
    if (password !== confirmPassword) return res.status(400).json({ error: "Las contrasenas no coinciden." });

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { dealer_id: "", username: "", avatar: "avatar-1", is_admin: false, banned: false, whatsapp_phone: "" } }
    });

    if (error) {
      if (error.message.includes("already")) return res.status(409).json({ error: "Ese email ya tiene cuenta. Usa Entrar." });
      return res.status(400).json({ error: error.message });
    }

    res.json({ success: true, message: "Cuenta creada. Revisa tu correo para confirmar." });
  } catch (error) {
    console.error(error); res.status(500).json({ error: "Error interno del servidor." });
  }
});

app.post("/api/auth/register/verify", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    if (!isValidEmail(email)) return res.status(400).json({ error: "Ingresa un email valido." });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.message.includes("Email not confirmed")) {
        return res.status(401).json({ error: "Confirma tu correo antes de iniciar sesion." });
      }
      return res.status(401).json({ error: "No se pudo iniciar sesion. Revisa tu correo o contrasena." });
    }

    if (!data.user.email_confirmed_at) {
      await supabaseAdmin.auth.admin.signOut(data.user.id).catch(() => {});
      return res.status(401).json({ error: "Confirma tu correo antes de iniciar sesion." });
    }

    const meta = data.user.user_metadata || {};
    const isAdmin = email === ADMIN_EMAIL;
    if (!meta.dealer_id) {
      const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers();
      const dealerNumber = (allUsers.users.length || 0);
      const dealerId = `Dealer#${String(dealerNumber).padStart(3, "0")}`;
      const { data: updated } = await supabaseAdmin.auth.admin.updateUserById(data.user.id, {
        user_metadata: { ...meta, dealer_id: dealerId, username: dealerId, is_admin: isAdmin, banned: false }
      });
      data.user = updated.user;
      await supabaseAdmin.from("profiles").upsert({
        id: data.user.id,
        username: dealerId,
        avatar: meta.avatar || "avatar-1",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).then(undefined, () => {});
    } else if (meta.is_admin !== isAdmin) {
      const { data: updated } = await supabaseAdmin.auth.admin.updateUserById(data.user.id, {
        user_metadata: { ...meta, is_admin: isAdmin }
      });
      data.user = updated.user;
    }

    setAuthCookie(res, data.session.access_token);
    res.json({ token: data.session.access_token, user: publicUser(data.user) });
  } catch (error) {
    console.error(error); res.status(500).json({ error: "Error interno del servidor." });
  }
});

app.post("/api/auth/sync", requireUser, async (req, res) => {
  try {
    const user = req.user;
    const meta = user.user_metadata || {};
    const isAdmin = user.email === ADMIN_EMAIL;
    if (!meta.dealer_id) {
      const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers();
      const dealerNumber = (allUsers.users.length || 0);
      const dealerId = `Dealer#${String(dealerNumber).padStart(3, "0")}`;
      const { data: updated } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        user_metadata: { ...meta, dealer_id: dealerId, username: dealerId, is_admin: isAdmin, banned: false }
      });
      await supabaseAdmin.from("profiles").upsert({
        id: user.id,
        username: dealerId,
        avatar: meta.avatar || "avatar-1",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).then(undefined, () => {});
      return res.json({ user: publicUser(updated.user) });
    } else if (meta.is_admin !== isAdmin) {
      const { data: updated } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        user_metadata: { ...meta, is_admin: isAdmin }
      });
      return res.json({ user: publicUser(updated.user) });
    }
    res.json({ user: publicUser(user) });
  } catch (error) {
    console.error(error); res.status(500).json({ error: "Error al sincronizar perfil." });
  }
});

app.post("/api/auth/register", async (req, res) => {
  res.status(410).json({ error: "Usa /api/auth/register/start y luego /api/auth/register/verify." });
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    if (!isValidEmail(email)) return res.status(400).json({ error: "Ingresa un email valido." });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.message.includes("Email not confirmed")) {
        return res.status(401).json({ error: "Confirma tu correo antes de iniciar sesion." });
      }
      return res.status(401).json({ error: "Email o contrasena incorrectos." });
    }

    if (!data.user.email_confirmed_at) {
      await supabaseAdmin.auth.admin.signOut(data.user.id).catch(() => {});
      return res.status(401).json({ error: "Confirma tu correo antes de iniciar sesion." });
    }

    const meta = data.user.user_metadata || {};
    if (meta.banned) return res.status(403).json({ error: "Tu cuenta esta baneada." });

    setAuthCookie(res, data.session.access_token);
    res.json({ token: data.session.access_token, user: publicUser(data.user) });
  } catch (error) {
    console.error(error); res.status(500).json({ error: "Error interno del servidor." });
  }
});

app.post("/api/auth/logout", async (_req, res) => {
  await supabase.auth.signOut().catch(() => {});
  res.clearCookie("closet_token");
  res.json({ ok: true });
});

app.get("/api/auth/me", requireUser, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.patch("/api/users/me", requireUser, async (req, res) => {
  try {
    const username = String(req.body.username || "").trim().replace(/\s+/g, " ");
    const avatar = String(req.body.avatar || "avatar-1");
    const whatsappPhone = normalizeWhatsappPhone(req.body.whatsapp_phone || "");
    if (username.length < 3) return res.status(400).json({ error: "El username debe tener al menos 3 caracteres." });
    if (!VALID_AVATARS.includes(avatar)) return res.status(400).json({ error: "Avatar no valido." });
    if (!isCostaRicaWhatsapp(whatsappPhone)) return res.status(400).json({ error: "WhatsApp debe ser un numero de Costa Rica de 8 digitos." });

    const meta = req.user.user_metadata || {};
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(req.user.id, {
      user_metadata: { ...meta, username, avatar, whatsapp_phone: whatsappPhone }
    });
    if (error) return res.status(500).json({ error: error.message });

    await supabaseAdmin.from("profiles").upsert({
      id: req.user.id,
      username,
      avatar,
      phone_number: whatsappPhone,
      updated_at: new Date().toISOString()
    }).catch(() => {});

    res.json({ user: publicUser(data.user) });
  } catch (error) {
    console.error(error); res.status(500).json({ error: "Error interno del servidor." });
  }
});

app.get("/api/users/search", requireUser, async (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  if (!q) return res.json({ users: [] });
  try {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username")
      .ilike("username", `%${q}%`)
      .limit(8);
    const results = (profiles || [])
      .filter(p => p.id !== req.user.id)
      .map(p => ({ id: p.id, username: p.username || "" }));
    res.json({ users: results });
  } catch (error) {
    console.error(error); res.status(500).json({ error: "Error interno del servidor." });
  }
});

app.get("/api/users/:id", requireUser, async (req, res) => {
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(req.params.id);
    if (error || !user) return res.status(404).json({ error: "Vendedor no encontrado." });
    const meta = user.user_metadata || {};
    if (meta.banned) return res.status(404).json({ error: "Vendedor no encontrado." });

    const profileRow = await getProfile(req.params.id);

    const { data: products } = await supabase
      .from("products")
      .select("*")
      .eq("user_id", req.params.id)
      .order("created_at", { ascending: false })
      .limit(40)
      .catch(() => ({ data: [] }));

    const isOwnProfile = String(req.user.id) === String(req.params.id);

    const profile = {
      id: user.id,
      email: isOwnProfile ? (user.email || "") : "",
      dealer_id: meta.dealer_id,
      username: meta.username || meta.dealer_id,
      avatar: meta.avatar || "avatar-1",
      banned: false, is_admin: Boolean(meta.is_admin), created_at: user.created_at
    };

    const publicData = profileRow
      ? publicProfileRow({ ...profileRow, dealer_id: meta.dealer_id, avatar: meta.avatar || "avatar-1", email: isOwnProfile ? (user.email || "") : "" })
      : profile;

    let showPhone = false;
    try {
      const { data: profileCheck } = await supabase
        .from("profiles")
        .select("phone_private, whatsapp_enabled")
        .eq("id", req.params.id)
        .single();
      if (profileCheck) {
        showPhone = profileCheck.phone_private === false && profileCheck.whatsapp_enabled === true;
      }
    } catch {}

    res.json({ user: publicData, products: (products || []).map(p => publicProduct({ ...p, seller_username: profile.username, seller_dealer_id: profile.dealer_id, seller_avatar: profile.avatar, seller_phone: p.seller_phone || "" })) });
  } catch (error) {
    console.error(error); res.status(500).json({ error: "Error interno del servidor." });
  }
});

/* ── Profile endpoints ────────────────────────────── */

app.get("/api/profiles/me", requireUser, async (req, res) => {
  try {
    const profile = await ensureProfile(req.user.id);
    const meta = req.user.user_metadata || {};
    const merged = mergeProfileWithAuth(profile, meta, req.user.email);
    res.json({ profile: privateProfile(merged) });
  } catch (error) {
    console.error(error); res.status(500).json({ error: "Error interno del servidor." });
  }
});

app.patch("/api/profiles/me", requireUser, async (req, res) => {
  try {
    const body = req.body || {};
    const updates = {};
    const allowed = ["username", "name", "profile_photo", "bio", "location", "phone_number", "whatsapp_enabled", "phone_private", "avatar"];
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }
    if (updates.username !== undefined) {
      updates.username = String(updates.username).trim().replace(/\s+/g, " ");
      if (updates.username.length < 3) return res.status(400).json({ error: "El username debe tener al menos 3 caracteres." });
      if (updates.username.length > 30) return res.status(400).json({ error: "El username es demasiado largo (max 30)." });
      if (!/^[a-zA-Z0-9_\s]+$/.test(updates.username)) return res.status(400).json({ error: "El username solo puede contener letras, numeros, espacios y guion bajo." });
      if (updates.username.toLowerCase() !== (req.user.user_metadata || {}).username?.toLowerCase()) {
        const { data: existing } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", updates.username)
          .single();
        if (existing) return res.status(409).json({ error: "Ese username ya esta en uso." });
      }
    }
    if (updates.name !== undefined) {
      updates.name = String(updates.name).trim();
      if (updates.name.length > 60) return res.status(400).json({ error: "El nombre es demasiado largo (max 60)." });
    }
    if (updates.bio !== undefined) {
      updates.bio = String(updates.bio).trim();
      if (updates.bio.length > 500) return res.status(400).json({ error: "La biografia es demasiado larga (max 500)." });
    }
    if (updates.location !== undefined) {
      updates.location = String(updates.location).trim();
      if (updates.location.length > 100) return res.status(400).json({ error: "La ubicacion es demasiado larga (max 100)." });
    }
    if (updates.avatar !== undefined) {
      if (!VALID_AVATARS.includes(updates.avatar)) {
        return res.status(400).json({ error: "Avatar no valido." });
      }
      if (LOCKED_AVATARS[updates.avatar]) {
        const isAdmin = Boolean(req.user.user_metadata?.is_admin);
        if (!isAdmin) {
          const profile = await ensureProfile(req.user.id);
          const sales = profile.sales_verified || 0;
          const needed = LOCKED_AVATARS[updates.avatar];
          if (sales < needed) {
            return res.status(403).json({ error: `Necesitas ${needed} venta(s) verificada(s) para desbloquear este avatar.` });
          }
        }
      }
    }
    if (updates.phone_number !== undefined) {
      updates.phone_number = normalizeWhatsappPhone(updates.phone_number);
      if (updates.phone_number && !isCostaRicaWhatsapp(updates.phone_number)) {
        return res.status(400).json({ error: "WhatsApp debe ser un numero de Costa Rica de 8 digitos." });
      }
    }
    if (updates.whatsapp_enabled !== undefined) updates.whatsapp_enabled = Boolean(updates.whatsapp_enabled);
    if (updates.phone_private !== undefined) updates.phone_private = Boolean(updates.phone_private);

    const profile = await ensureProfile(req.user.id);
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", req.user.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    if (updates.avatar) {
      const newMeta = { ...(req.user.user_metadata || {}), avatar: updates.avatar };
      await supabaseAdmin.auth.admin.updateUserById(req.user.id, { user_metadata: newMeta }).catch(() => {});
    }

    const meta = req.user.user_metadata || {};
    const merged = mergeProfileWithAuth(data, meta, req.user.email);

    res.json({ profile: privateProfile(merged) });
  } catch (error) {
    console.error(error); res.status(500).json({ error: "Error interno del servidor." });
  }
});

app.get("/api/avatars", requireUser, async (req, res) => {
  try {
    const profile = await ensureProfile(req.user.id);
    const isAdmin = Boolean(req.user.user_metadata?.is_admin);
    const sales = profile.sales_verified || 0;
    const all = VALID_AVATARS.map(id => ({
      id,
      unlocked: isAdmin || !LOCKED_AVATARS[id] || sales >= LOCKED_AVATARS[id],
      required_sales: LOCKED_AVATARS[id] || 0
    }));
    res.json({ avatars: all });
  } catch (error) {
    console.error(error); res.status(500).json({ error: "Error interno del servidor." });
  }
});

app.get("/api/profiles/:id", async (req, res) => {
  try {
    let authMeta = {};
    let authEmail = "";
    let banned = false;
    try {
      const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(req.params.id);
      if (user) {
        authMeta = user.user_metadata || {};
        authEmail = user.email || "";
        banned = Boolean(authMeta.banned);
      }
    } catch {}
    if (banned) return res.status(404).json({ error: "Perfil no encontrado." });

    const profile = await getProfile(req.params.id);
    if (!profile) {
      const username = authMeta.username || authMeta.dealer_id || "";
      const avatar = VALID_AVATARS.includes(authMeta.avatar) ? authMeta.avatar : "avatar-1";
      return res.json({
        profile: publicProfileRow({ id: req.params.id, username, avatar, dealer_id: authMeta.dealer_id || "", email: authEmail })
      });
    }

    const merged = mergeProfileWithAuth(profile, authMeta, authEmail);
    res.json({ profile: publicProfileRow(merged) });
  } catch (error) {
    console.error(error); res.status(500).json({ error: "Error interno del servidor." });
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) return cb(new Error("Solo se permiten imagenes."));
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/heic", "image/heif"];
    if (!allowed.includes(file.mimetype) && !file.mimetype.startsWith("image/")) {
      return cb(new Error("Formato de imagen no soportado. Usa JPG, PNG, WebP o GIF."));
    }
    cb(null, true);
  }
});

app.post("/api/uploads", requireUser, uploadLimiter, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Selecciona una imagen." });

    if (!validateImageBuffer(req.file.buffer)) {
      return res.status(400).json({ error: "La imagen no es valida o esta corrupta." });
    }

    const ext = path.extname(req.file.originalname) || ".jpg";
    const cleanName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileName = `user-${req.user.id}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;

    const { error } = await supabaseAdmin.storage
      .from("product-images")
      .upload(fileName, req.file.buffer, { contentType: req.file.mimetype, upsert: false });

    if (error) return res.status(500).json({ error: "No se pudo subir imagen: " + error.message });

    const { data: { publicUrl } } = supabaseAdmin.storage.from("product-images").getPublicUrl(fileName);

    res.json({ imageUrl: publicUrl, image_url: publicUrl, storage_path: fileName });
  } catch (error) {
    res.status(500).json({ error: "No se pudo subir imagen: " + error.message });
  }
});

app.post("/api/uploads/multiple", requireUser, uploadLimiter, upload.array("images", 6), async (req, res) => {
  try {
    const files = req.files;
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: "Selecciona al menos una imagen." });
    }

    const results = [];
    for (const file of files) {
      if (!validateImageBuffer(file.buffer)) {
        results.push({ error: "Imagen invalida o corrupta: " + file.originalname });
        continue;
      }

      const ext = path.extname(file.originalname) || ".jpg";
      const fileName = `user-${req.user.id}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;

      const { error } = await supabaseAdmin.storage
        .from("product-images")
        .upload(fileName, file.buffer, { contentType: file.mimetype, upsert: false });

      if (error) {
        results.push({ error: error.message });
        continue;
      }

      const { data: { publicUrl } } = supabaseAdmin.storage.from("product-images").getPublicUrl(fileName);
      results.push({ imageUrl: publicUrl, image_url: publicUrl, storage_path: fileName });
    }

    res.json({ images: results });
  } catch (error) {
    res.status(500).json({ error: "No se pudieron subir las imagenes: " + error.message });
  }
});

async function productsFallback(category, search, cursor, pageSize, res) {
  try {
    let q = supabase
      .from("products")
      .select("*")
      .neq("status", "hidden")
      .order("created_at", { ascending: false })
      .limit(pageSize + 1);
    if (category && category !== "all") q = q.eq("category", category);
    if (search) {
      const s = `%${search}%`;
      q = q.or(`title.ilike.${s},description.ilike.${s}`);
    }
    if (cursor) q = q.lt("created_at", cursor);
    const { data: rows, error } = await q;
    if (error) return res.status(200).json({ ok: true, products: [], nextCursor: null, hasMore: false });
    const hasMore = rows && rows.length > pageSize;
    if (hasMore) rows.pop();
    const nextCursor = rows && rows.length > 0 ? rows[rows.length - 1].created_at : null;
    const userIds = [...new Set((rows || []).map(r => r.user_id).filter(Boolean))];
    const userMap = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, avatar, phone_number, phone_private, whatsapp_enabled, reputation_score")
        .in("id", userIds);
      if (profiles) {
        for (const p of profiles) {
          const visible = p.phone_private === false && p.whatsapp_enabled === true;
          userMap[p.id] = { username: p.username || "", dealer_id: p.username || "", avatar: p.avatar || "avatar-1", whatsapp_phone: visible ? (p.phone_number || "") : "", show_phone: visible, reputation_score: p.reputation_score || 0 };
        }
      }
      for (const uid of userIds) {
        if (!userMap[uid]) userMap[uid] = { username: "", dealer_id: "", avatar: "avatar-1", whatsapp_phone: "", show_phone: false, reputation_score: 0 };
      }
    }
    const products = (rows || []).map(row => {
      const s = userMap[row.user_id] || {};
      return publicProduct({ ...row, seller_username: s.username, seller_dealer_id: s.dealer_id, seller_avatar: s.avatar, seller_reputation: s.reputation_score || 0, seller_phone: row.seller_phone || s.whatsapp_phone || "" });
    });
    res.json({ ok: true, products, nextCursor, hasMore });
  } catch { res.status(200).json({ ok: true, products: [], nextCursor: null, hasMore: false }); }
}

app.get("/api/products", apiLimiter, async (req, res) => {
  const search = String(req.query.search || "").trim();
  const category = String(req.query.category || "").trim();
  const cursor = String(req.query.cursor || "");
  const limit = Number(req.query.limit);
  const pageSize = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 40) : 20;
  try {
    let query = supabase
      .from("products")
      .select(`
        *,
        profiles!left (
          username,
          avatar,
          reputation_score,
          location,
          phone_number,
          phone_private,
          whatsapp_enabled
        )
      `)
      .neq("status", "hidden")
      .order("created_at", { ascending: false })
      .limit(pageSize + 1);

    if (category && category !== "all") query = query.eq("category", category);
    if (search) {
      const q = `%${search}%`;
      query = query.or(`title.ilike.${q},description.ilike.${q}`);
    }
    if (cursor) query = query.lt("created_at", cursor);

    const { data: rows, error } = await query;

    if (error) {
      if (error.message && error.message.toLowerCase().includes("relationship")) {
        console.warn("[PRODUCTS] JOIN no disponible, usando fallback 2 queries");
        return productsFallback(category, search, cursor, pageSize, res);
      }
      console.error("[SUPABASE ERROR]", error);
      return res.status(200).json({ ok: true, products: [], nextCursor: null, hasMore: false });
    }

    const hasMore = rows && rows.length > pageSize;
    if (hasMore) rows.pop();
    const nextCursor = rows && rows.length > 0 ? rows[rows.length - 1].created_at : null;

    const products = (rows || []).map(row => {
      const profile = row.profiles || {};
      const visible = profile.phone_private === false && profile.whatsapp_enabled === true;
      const { profiles: _unused, ...productData } = row;
      return publicProduct({
        ...productData,
        seller_username: profile.username || "",
        seller_dealer_id: profile.username || "",
        seller_avatar: profile.avatar || "avatar-1",
        seller_reputation: profile.reputation_score || 0,
        seller_location: profile.location || "",
        seller_phone: row.seller_phone || (visible ? (profile.phone_number || "") : "") || "",
      });
    });

    res.json({ ok: true, products, nextCursor, hasMore });
  } catch (error) {
    console.error("[PRODUCTS FATAL]", error);
    productsFallback(category, search, cursor, pageSize, res).catch(() => res.status(200).json({ ok: true, products: [], nextCursor: null, hasMore: false }));
  }
});

app.get("/api/products/:id", apiLimiter, async (req, res) => {
  const { data: row, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error || !row) return res.status(404).json({ error: "Prenda no encontrada." });

  let sellerPhone = row.seller_phone || "";
  let sellerReputation = 0;
  let buyerProfile = null;
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("phone_number, phone_private, whatsapp_enabled, reputation_score")
      .eq("id", row.user_id)
      .single();
    if (profile) {
      if (profile.whatsapp_enabled && profile.phone_private === false) {
        sellerPhone = profile.phone_number || sellerPhone;
      }
      sellerReputation = profile.reputation_score || 0;
    }
  } catch {}

  // Get buyer info if product is sold
  if (row.buyer_id) {
    try {
      const { data: buyer } = await supabase
        .from("profiles")
        .select("id, username, name, avatar")
        .eq("id", row.buyer_id)
        .single();
      if (buyer) buyerProfile = buyer;
    } catch {}
  }

  const product = publicProduct({ ...row, seller_phone: sellerPhone, seller_reputation: sellerReputation });
  if (buyerProfile) product.buyer = buyerProfile;

  res.json({ product });
});

app.post("/api/products", requireUser, productLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    const meta = req.user.user_metadata || {};
    const images = Array.isArray(body.images) ? body.images : [];

    if (!checkProductSpam(req.user.id)) {
      return res.status(429).json({ error: "Has alcanzado el limite de publicaciones por dia (15)." });
    }

    const title = String(body.name || body.title || "").trim();
    const price = Number(body.price || 0);
    const size = String(body.size || "").trim();

    if (!title || title.length < 3) return res.status(400).json({ error: "El titulo debe tener al menos 3 caracteres." });
    if (title.length > 100) return res.status(400).json({ error: "El titulo es demasiado largo (max 100)." });
    if (!price || isNaN(price) || price <= 0 || price > 999999999) return res.status(400).json({ error: "Precio invalido." });
    if (!size || size.length > 20) return res.status(400).json({ error: "Talla invalida." });

    const description = String(body.description || "").trim();
    if (description.length > 2000) return res.status(400).json({ error: "Descripcion demasiado larga (max 2000)." });

    const validatedImages = images.filter(url => typeof url === "string" && url.startsWith("https://"));
    const rawStoragePaths = Array.isArray(body.storage_paths) ? body.storage_paths.filter(Boolean) : [];
    const storagePaths = rawStoragePaths.filter(p => String(p).startsWith(`user-${req.user.id}-`));

    const profileRow = await ensureProfile(req.user.id);
    const phoneVisible = profileRow?.phone_private === false && profileRow?.whatsapp_enabled === true;
    const sellerPhone = phoneVisible
      ? normalizeWhatsappPhone(profileRow?.phone_number || meta.whatsapp_phone || "")
      : "";

    const { data, error } = await supabaseAdmin
      .from("products")
      .insert({
        title,
        price,
        size,
        brand: String(body.brand || "").trim().slice(0, 50),
        category: String(body.category || "otros"),
        condition: String(body.condition || "good"),
        description,
        status: "disponible",
        uber_flash_included: body.uber_flash_included ? true : false,
        image_url: validatedImages[0] || "",
        image_url_2: validatedImages[1] || "",
        image_url_3: validatedImages[2] || "",
        image_url_4: validatedImages[3] || "",
        images: validatedImages,
        storage_path: storagePaths[0] || "",
        storage_paths: storagePaths,
        seller_phone: sellerPhone,
        show_phone: phoneVisible,
        user_id: req.user.id
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ product: publicProduct({ ...data, seller_username: meta.username || meta.dealer_id, seller_dealer_id: meta.dealer_id, seller_avatar: meta.avatar || "avatar-1" }) });
  } catch (error) {
    console.error(error); res.status(500).json({ error: "Error interno del servidor." });
  }
});

const VALID_STATUSES = ["disponible", "available", "reserved", "reservado", "sold", "vendido", "hidden"];

app.patch("/api/products/:id", requireUser, productLimiter, async (req, res) => {
  try {
    const { data: existing } = await supabase.from("products").select("*").eq("id", req.params.id).single();
    if (!existing) return res.status(404).json({ error: "Prenda no encontrada." });
    if (existing.user_id !== req.user.id && !(req.user.user_metadata || {}).is_admin) return res.status(403).json({ error: "No puedes editar esta prenda." });

    const body = req.body || {};
    const meta = req.user.user_metadata || {};
    const images = Array.isArray(body.images) ? body.images : (existing.images || []);

    const title = String(body.name || body.title || existing.title).trim();
    const price = body.price !== undefined ? Number(body.price) : Number(existing.price);
    if (title && title.length > 100) return res.status(400).json({ error: "El titulo es demasiado largo (max 100)." });
    if (body.price !== undefined && (isNaN(price) || price <= 0 || price > 999999999)) {
      return res.status(400).json({ error: "Precio invalido." });
    }

    const validatedImages = images.filter(url => typeof url === "string" && url.startsWith("https://"));
    const rawStoragePaths = Array.isArray(body.storage_paths) ? body.storage_paths.filter(Boolean) : [];
    const newStoragePaths = rawStoragePaths.filter(p => String(p).startsWith(`user-${req.user.id}-`));

    let newStatus = body.status !== undefined ? String(body.status) : (existing.status || "disponible");
    if (!VALID_STATUSES.includes(newStatus)) {
      newStatus = existing.status || "disponible";
    }

    const profileRow = await getProfile(req.user.id).catch(() => null);
    const phoneVisible = profileRow?.phone_private === false && profileRow?.whatsapp_enabled === true;
    const profilePhone = phoneVisible ? normalizeWhatsappPhone(profileRow?.phone_number || "") : "";
    const sellerPhone = profilePhone || normalizeWhatsappPhone(meta.whatsapp_phone || "");

    const oldPaths = extractStoragePaths(existing);
    const removedPaths = oldPaths.filter(p => !newStoragePaths.includes(p));

    const { data, error } = await supabaseAdmin
      .from("products")
      .update({
        title,
        price,
        size: String(body.size || existing.size || "").trim().slice(0, 20),
        brand: body.brand !== undefined ? String(body.brand).trim().slice(0, 50) : (existing.brand || ""),
        category: String(body.category || existing.category || "otros"),
        condition: body.condition !== undefined ? String(body.condition) : (existing.condition || "good"),
        description: String(body.description || existing.description || "").trim().slice(0, 2000),
        status: newStatus,
        uber_flash_included: body.uber_flash_included !== undefined ? Boolean(body.uber_flash_included) : Boolean(existing.uber_flash_included),
        image_url: validatedImages[0] || existing.image_url || "",
        image_url_2: validatedImages[1] || existing.image_url_2 || "",
        image_url_3: validatedImages[2] || existing.image_url_3 || "",
        image_url_4: validatedImages[3] || existing.image_url_4 || "",
        images: validatedImages,
        storage_paths: newStoragePaths,
        seller_phone: sellerPhone,
        show_phone: phoneVisible
      })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    if (removedPaths.length > 0) {
      deleteStorageFiles(removedPaths).catch(() => {});
    }

    res.json({ product: publicProduct({ ...data, seller_username: meta.username || meta.dealer_id, seller_dealer_id: meta.dealer_id, seller_avatar: meta.avatar || "avatar-1" }) });
  } catch (error) {
    console.error(error); res.status(500).json({ error: "Error interno del servidor." });
  }
});

app.delete("/api/products/:id", requireUser, async (req, res) => {
  try {
    const { data: existing } = await supabase.from("products").select("*").eq("id", req.params.id).single();
    if (!existing) return res.status(404).json({ error: "Prenda no encontrada." });
    if (existing.user_id !== req.user.id && !(req.user.user_metadata || {}).is_admin) return res.status(403).json({ error: "No puedes eliminar esta prenda." });

    const paths = extractStoragePaths(existing);
    await deleteStorageFiles(paths);

    await supabaseAdmin.from("products").delete().eq("id", req.params.id);
    res.json({ ok: true });
  } catch (error) {
    console.error(error); res.status(500).json({ error: "Error interno del servidor." });
  }
});

/* ── Admin routes (paginated) ──────────────── */

const createAdminRouter = require("./admin.cjs");
const adminRouter = createAdminRouter({ supabase, supabaseAdmin, requireUser, requireAdmin, logAdminAction, publicProduct, adminLimiter });
app.use("/api", adminRouter);

/* ── Sales routes ─────────────────────────── */

app.post("/api/sales", requireUser, async (req, res) => {
  try {
    const { product_id, type } = req.body || {};
    if (!product_id) return res.status(400).json({ error: "Se requiere product_id." });
    if (!type || !["internal", "external"].includes(type)) return res.status(400).json({ error: "Tipo invalido (internal/external)." });

    const { data: product } = await supabase.from("products").select("*").eq("id", product_id).single();
    if (!product) return res.status(404).json({ error: "Prenda no encontrada." });
    if (product.user_id === req.user.id) return res.status(400).json({ error: "No puedes comprar tu propia prenda." });
    if (product.status !== "disponible" && product.status !== "available") return res.status(400).json({ error: "Prenda no disponible." });

    const buyerId = type === "internal" ? req.user.id : null;
    const saleStatus = type === "internal" ? "requested" : "external";

    const { data: sale, error } = await supabaseAdmin.from("sales").insert({
      product_id,
      buyer_id: buyerId,
      seller_id: product.user_id,
      status: saleStatus,
      type,
    }).select().single();

    if (error) return res.status(500).json({ error: "Error al crear solicitud." });

    if (type === "internal") {
      await supabaseAdmin.from("products").update({ status: "reserved" }).eq("id", product_id);
    }

    res.json({ ok: true, sale });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/sales/mine", requireUser, async (req, res) => {
  try {
    const { data: sales } = await supabase
      .from("sales")
      .select("*, product:products(*)")
      .eq("seller_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    res.json({ sales: sales || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/sales/bought", requireUser, async (req, res) => {
  try {
    const { data: sales } = await supabase
      .from("sales")
      .select("*, product:products(*)")
      .eq("buyer_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    res.json({ sales: sales || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Transaction routes (Sprint 2.5) ────────────────────── */

// Valid state transitions
const VALID_TRANSITIONS = {
  requested:       { buyer: ["cancelled"], seller: ["accepted", "rejected"] },
  accepted:        { buyer: ["cancelled"], seller: ["waiting_payment"] },
  waiting_payment: { buyer: ["payment_sent", "cancelled"] },
  payment_sent:    { buyer: [], seller: ["payment_received", "payment_rejected"] },
  payment_rejected:{ buyer: ["payment_sent", "cancelled"] },
  payment_received:{ buyer: [], seller: ["waiting_shipping"] },
  waiting_shipping:{ buyer: [], seller: ["shipped"] },
  shipped:         { buyer: ["delivered"], seller: [] },
  delivered:       { buyer: ["completed"], seller: ["completed"] },
};

// Event type mapping from status transitions
const STATUS_TO_EVENT = {
  "requested→accepted": "request_accepted",
  "requested→rejected": "request_rejected",
  "requested→cancelled": "request_cancelled",
  "accepted→cancelled": "request_cancelled",
  "accepted→waiting_payment": "payment_marked",
  "waiting_payment→payment_sent": "payment_proof_uploaded",
  "waiting_payment→cancelled": "request_cancelled",
  "payment_sent→payment_received": "payment_confirmed",
  "payment_sent→payment_rejected": "payment_rejected",
  "payment_rejected→payment_sent": "payment_proof_uploaded",
  "payment_rejected→cancelled": "request_cancelled",
  "payment_received→waiting_shipping": "shipping_initiated",
  "waiting_shipping→shipped": "shipped",
  "shipped→delivered": "delivery_confirmed",
  "delivered→completed": "transaction_completed",
};

async function logTransactionEvent(txId, actorId, fromStatus, toStatus, metadata = {}) {
  const key = `${fromStatus}→${toStatus}`;
  const eventType = STATUS_TO_EVENT[key];
  if (!eventType) return;
  await supabaseAdmin.from("transaction_events").insert({
    transaction_id: txId,
    actor_id: actorId,
    event_type: eventType,
    from_status: fromStatus,
    to_status: toStatus,
    metadata,
  });
}

app.post("/api/transactions", requireUser, async (req, res) => {
  try {
    const { product_id } = req.body || {};
    if (!product_id) return res.status(400).json({ error: "Se requiere product_id." });

    const { data: product } = await supabase.from("products").select("*").eq("id", product_id).single();
    if (!product) return res.status(404).json({ error: "Prenda no encontrada." });
    if (product.user_id === req.user.id) return res.status(400).json({ error: "No puedes solicitar tu propia prenda." });
    if (product.status !== "disponible" && product.status !== "available") return res.status(400).json({ error: "Prenda no disponible." });

    const { data: existing } = await supabaseAdmin
      .from("transactions")
      .select("id, status")
      .eq("product_id", product_id)
      .eq("buyer_id", req.user.id)
      .not("status", "in", "(cancelled,rejected)")
      .maybeSingle();
    if (existing) return res.status(400).json({ error: "Ya solicitaste esta prenda." });

    const { data: transaction, error } = await supabaseAdmin
      .from("transactions")
      .insert({ product_id, buyer_id: req.user.id, seller_id: product.user_id })
      .select()
      .single();

    if (error) return res.status(500).json({ error: "Error al crear transacción." });

    await supabaseAdmin.from("products").update({ status: "reserved" }).eq("id", product_id);

    // Log event: request_created
    await logTransactionEvent(transaction.id, req.user.id, null, "requested");

    res.json({ ok: true, transaction });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/transactions/mine", requireUser, async (req, res) => {
  try {
    const { data: asBuyer } = await supabaseAdmin
      .from("transactions")
      .select("*, product:products(*)")
      .eq("buyer_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    const { data: asSeller } = await supabaseAdmin
      .from("transactions")
      .select("*, product:products(*)")
      .eq("seller_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    res.json({ asBuyer: asBuyer || [], asSeller: asSeller || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/transactions/:id", requireUser, async (req, res) => {
  try {
    const { status } = req.body || {};
    const ALL_VALID = ["accepted","rejected","cancelled","completed",
      "waiting_payment","payment_sent","payment_received","payment_rejected",
      "waiting_shipping","shipped","delivered"];
    if (!status || !ALL_VALID.includes(status)) {
      return res.status(400).json({ error: "Estado invalido." });
    }

    const { data: tx } = await supabaseAdmin.from("transactions").select("*").eq("id", req.params.id).single();
    if (!tx) return res.status(404).json({ error: "Transacción no encontrada." });

    const isBuyer = tx.buyer_id === req.user.id;
    const isSeller = tx.seller_id === req.user.id;
    if (!isBuyer && !isSeller) return res.status(403).json({ error: "No tienes permiso." });

    const role = isBuyer ? "buyer" : "seller";
    const allowed = VALID_TRANSITIONS[tx.status]?.[role] || [];
    if (!allowed.includes(status)) {
      return res.status(403).json({ error: `No puedes cambiar de "${tx.status}" a "${status}".` });
    }

    const { data, error } = await supabaseAdmin
      .from("transactions")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: "Error al actualizar." });

    // Log state transition event
    await logTransactionEvent(tx.id, req.user.id, tx.status, status);

    // Product status transitions
    if (status === "rejected" || status === "cancelled") {
      await supabaseAdmin.from("products").update({ status: "disponible" }).eq("id", tx.product_id);
    }
    if (status === "completed") {
      await supabaseAdmin.from("products").update({ status: "sold" }).eq("id", tx.product_id);
    }

    res.json({ ok: true, transaction: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/transactions/:id/events", requireUser, async (req, res) => {
  try {
    const { data: tx } = await supabaseAdmin.from("transactions").select("buyer_id, seller_id").eq("id", req.params.id).single();
    if (!tx) return res.status(404).json({ error: "Transacción no encontrada." });
    if (tx.buyer_id !== req.user.id && tx.seller_id !== req.user.id) return res.status(403).json({ error: "No tienes permiso." });

    const { data: events } = await supabaseAdmin
      .from("transaction_events")
      .select("*")
      .eq("transaction_id", req.params.id)
      .order("created_at", { ascending: true });

    res.json({ events: events || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Report routes ─────────────────────────── */

app.post("/api/reports", requireUser, async (req, res) => {
  try {
    const { reported_user_id, product_id, reason, description } = req.body || {};
    if (!reported_user_id || !reason) return res.status(400).json({ error: "Se requiere reported_user_id y reason." });
    if (reported_user_id === req.user.id) return res.status(400).json({ error: "No puedes reportarte a ti mismo." });

    const { data, error } = await supabaseAdmin.from("reports").insert({
      reporter_id: req.user.id,
      reported_user_id,
      product_id: product_id || null,
      reason,
      description: description || "",
    }).select().single();

    if (error) return res.status(500).json({ error: "Error al crear reporte." });
    res.json({ ok: true, report: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Stats & Verification routes ─────────────── */

// GET /api/users/:id/stats - User statistics (public)
app.get("/api/users/:id/stats", async (req, res) => {
  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("total_products_published, total_products_sold, total_products_bought, verification_level, last_active_at, created_at")
      .eq("id", req.params.id)
      .single();

    if (!profile) return res.status(404).json({ error: "Usuario no encontrado." });

    // Count verified sales for verification rate
    const { count: verifiedCount } = await supabaseAdmin
      .from("product_verifications")
      .select("*", { count: "exact", head: true })
      .eq("seller_id", req.params.id)
      .eq("status", "verified");

    const totalSold = profile.total_products_sold || 0;
    const verificationRate = totalSold > 0 ? Math.round(((verifiedCount || 0) / totalSold) * 100) : 0;

    res.json({
      lastActive: profile.last_active_at,
      productsPublished: profile.total_products_published || 0,
      productsSold: totalSold,
      productsBought: profile.total_products_bought || 0,
      verificationLevel: profile.verification_level || "none",
      verificationRate,
      memberSince: profile.created_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products/:id/mark-sold - Mark product as sold with shipping info + evidence
app.post("/api/products/:id/mark-sold", requireUser, async (req, res) => {
  try {
    const { buyer_id, includes_shipping, shipping_cost, evidence_url, evidence_type, notes } = req.body || {};
    if (!buyer_id) return res.status(400).json({ error: "Se requiere buyer_id." });

    const { data: product } = await supabaseAdmin.from("products").select("*").eq("id", req.params.id).single();
    if (!product) return res.status(404).json({ error: "Producto no encontrado." });
    if (product.user_id !== req.user.id) return res.status(403).json({ error: "Solo el vendedor puede marcar como vendido." });
    if (product.status === "sold") return res.status(400).json({ error: "Producto ya fue vendido." });

    // Anti-fraud: minimum 24h since publication
    const publishedAt = new Date(product.created_at).getTime();
    const now = Date.now();
    const hoursSincePublished = (now - publishedAt) / (1000 * 60 * 60);
    if (hoursSincePublished < 24) {
      return res.status(400).json({ error: "Deben pasar al menos 24 horas desde la publicación." });
    }

    // Anti-fraud: max 5 verified sales per day
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count: todaySales } = await supabaseAdmin
      .from("product_verifications")
      .select("*", { count: "exact", head: true })
      .eq("seller_id", req.user.id)
      .gte("created_at", today.toISOString());

    if ((todaySales || 0) >= 5) {
      return res.status(400).json({ error: "Límite de 5 ventas verificadas por día alcanzado." });
    }

    // Build metadata with shipping info
    const metadata = {
      shipping_included: includes_shipping !== false,
      shipping_cost: includes_shipping !== false ? 0 : (Number(shipping_cost) || 0),
    };

    // Update product
    await supabaseAdmin.from("products").update({
      status: "sold",
      sold_at: new Date().toISOString(),
      buyer_id,
      metadata,
    }).eq("id", req.params.id);

    // Create verification record
    const { data: verification, error } = await supabaseAdmin
      .from("product_verifications")
      .insert({
        product_id: req.params.id,
        seller_id: req.user.id,
        buyer_id,
        evidence_url: evidence_url || null,
        evidence_type: evidence_type || null,
        seller_notes: notes || null,
        status: evidence_url ? "submitted" : "pending",
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: "Error al crear verificación." });

    // Auto-generate notification for buyer
    const { data: buyerProfile } = await supabaseAdmin.from("profiles").select("username").eq("id", buyer_id).maybeSingle();
    const { data: sellerProfile } = await supabaseAdmin.from("profiles").select("username").eq("id", req.user.id).maybeSingle();
    const productName = (product && product.name) || (product && product.title) || "prenda";
    const sellerName = sellerProfile?.username || "Vendedor";

    await createNotification(buyer_id, "product_sold", "Producto marcado como vendido", `${sellerName} marcó "${productName}" como vendido.`, {
      product_id: Number(req.params.id),
    });

    res.json({ ok: true, verification });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products/:id/confirm-receipt - Buyer confirms receipt
app.post("/api/products/:id/confirm-receipt", requireUser, async (req, res) => {
  try {
    const { data: verification } = await supabaseAdmin
      .from("product_verifications")
      .select("*")
      .eq("product_id", req.params.id)
      .single();

    if (!verification) return res.status(404).json({ error: "Verificación no encontrada." });
    if (verification.buyer_id !== req.user.id) return res.status(403).json({ error: "Solo el comprador puede confirmar." });
    if (verification.buyer_confirmed) return res.status(400).json({ error: "Ya confirmaste la recepción." });

    const { error } = await supabaseAdmin
      .from("product_verifications")
      .update({
        buyer_confirmed: true,
        buyer_confirmed_at: new Date().toISOString(),
        status: "verified",
        updated_at: new Date().toISOString(),
      })
      .eq("id", verification.id);

    if (error) return res.status(500).json({ error: "Error al confirmar." });

    // Auto-generate notification for seller
    const { data: product } = await supabaseAdmin.from("products").select("name, title, user_id").eq("id", req.params.id).maybeSingle();
    const { data: buyerProfile } = await supabaseAdmin.from("profiles").select("username").eq("id", req.user.id).maybeSingle();
    const productName = product?.name || product?.title || "prenda";
    const buyerName = buyerProfile?.username || "Comprador";

    await createNotification(product.user_id, "receipt_confirmed", "Recepción confirmada", `${buyerName} confirmó recepción de "${productName}". Venta verificada.`, {
      product_id: Number(req.params.id),
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/:id/evidence - Get verification evidence (public)
app.get("/api/products/:id/evidence", async (req, res) => {
  try {
    const { data: verification } = await supabaseAdmin
      .from("product_verifications")
      .select("status, evidence_url, evidence_type, buyer_confirmed, created_at")
      .eq("product_id", req.params.id)
      .single();

    if (!verification) return res.json({ verified: false });

    res.json({
      verified: verification.status === "verified",
      status: verification.status,
      evidenceUrl: verification.evidence_url,
      evidenceType: verification.evidence_type,
      buyerConfirmed: verification.buyer_confirmed,
      verifiedAt: verification.created_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Notifications ─────────────────────────────────── */

async function createNotification(userId, type, title, body, extra = {}) {
  try {
    await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      type,
      title,
      body: body || null,
      product_id: extra.product_id || null,
      transaction_id: extra.transaction_id || null,
    });
  } catch (e) {
    console.error("[NOTIFICATION] Failed to create:", e.message);
  }
}

// GET /api/notifications — list user's notifications
app.get("/api/notifications", requireUser, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const { data, error } = await supabaseAdmin
      .from("notifications")
      .select("*")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ notifications: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/notifications/unread-count — count unread
app.get("/api/notifications/unread-count", requireUser, async (req, res) => {
  try {
    const { count } = await supabaseAdmin
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", req.user.id)
      .is("read_at", null);

    res.json({ count: count || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notifications/:id/read — mark as read
app.patch("/api/notifications/:id/read", requireUser, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .eq("user_id", req.user.id)
      .is("read_at", null);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notifications/read-all — mark all as read
app.patch("/api/notifications/read-all", requireUser, async (req, res) => {
  try {
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("notifications")
      .update({ read_at: now })
      .eq("user_id", req.user.id)
      .is("read_at", null);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Admin routes moved to api/admin.cjs ──── */

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

async function initDb() {
  try {
    await supabaseAdmin.storage.createBucket("product-images", { public: true });
    console.log("Bucket product-images creado/verificado.");
  } catch {
    console.log("Bucket product-images ya existe o no se pudo crear.");
  }

  // Intentar auto-ejecutar la migración via RPC (si la funcion exec_sql existe)
  try {
    const fs = require("fs");
    const path = require("path");
    const sqlPath = path.join(__dirname, "..", "supabase", "migrations", "20240703000002_full_schema.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");
    const { error } = await supabaseAdmin.rpc("exec_sql", { sql });
    if (error) throw error;
    console.log("Migracion SQL ejecutada via RPC.");
  } catch {
    console.log("Auto-migracion no disponible. Ejecutar supabase/migrations/ manualmente en SQL Editor.");
  }

  if (ADMIN_PASSWORD && isValidEmail(ADMIN_EMAIL)) {
    try {
      const { data: all } = await supabaseAdmin.auth.admin.listUsers();
      const existing = all.users.find(u => u.email === ADMIN_EMAIL);
      if (existing) {
        const meta = existing.user_metadata || {};
        await supabaseAdmin.auth.admin.updateUserById(existing.id, {
          user_metadata: { ...meta, is_admin: true, banned: false }
        });
        await supabaseAdmin.auth.admin.updateUserById(existing.id, { password: ADMIN_PASSWORD }).catch(() => {});
        console.log(`Admin actualizado: ${ADMIN_EMAIL}`);
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
          options: { data: { is_admin: true, banned: false, avatar: "avatar-1", dealer_id: "Admin", username: "Admin" } }
        });
        if (!error && data.user) {
          console.log(`Admin creado: ${ADMIN_EMAIL}`);
        }
      }
    } catch (e) {
      console.log("Admin init skipped (Supabase no disponible):", e.message);
    }
  }
}

if (require.main === module) {
  /* Solo inicia cuando se ejecuta directamente, no cuando server.cjs lo requiere */
  initDb()
    .then(() => app.listen(PORT, HOST, () => {
      const ip = getLocalIP();
      console.log(`Closet Elander backend listo`);
      console.log(`  Local:   http://localhost:${PORT}`);
      console.log(`  Red:     http://${ip}:${PORT}`);
    }))
    .catch(error => {
      console.error("Error al iniciar:", error.message);
      process.exit(1);
    });
}

module.exports = { app, initDb };
