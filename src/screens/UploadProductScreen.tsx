import { useState, useRef } from "react";
import { useAppContext } from "../store/AppProvider";
import { api } from "../api/client";

type Condition = "new" | "like_new" | "good" | "fair";

const CONDITION_LABELS: Record<Condition, string> = {
  new: "Nuevo",
  like_new: "Como nuevo",
  good: "Bueno",
  fair: "Aceptable",
};

const CATEGORIES = ["camisetas", "hoodies", "pantalones", "accesorios", "otros"];

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_DIMENSION = 2500;
const COMPRESS_QUALITY = 0.8;
const COMPRESS_MAX_DIM = 1920;

async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const supportedForCanvas = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"];
  if (!supportedForCanvas.includes(file.type)) return file;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > COMPRESS_MAX_DIM || height > COMPRESS_MAX_DIM) {
        const ratio = Math.min(COMPRESS_MAX_DIM / width, COMPRESS_MAX_DIM / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const outType = file.type === "image/png" ? "image/png" : "image/jpeg";
            const ext = outType === "image/png" ? "png" : "jpg";
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, "") + "." + ext, { type: outType }));
          } else {
            resolve(file);
          }
        },
        file.type === "image/png" ? "image/png" : "image/jpeg",
        file.type === "image/png" ? 1 : COMPRESS_QUALITY
      );
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return "Formato no soportado. Usa JPG, PNG, WebP, GIF o AVIF.";
  }
  if (file.size > MAX_FILE_SIZE) {
    return `La imagen es demasiado grande (máx ${MAX_FILE_SIZE / 1024 / 1024}MB).`;
  }
  return null;
}

export default function UploadProductScreen() {
  const { user, goTo } = useAppContext();
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [size, setSize] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("otros");
  const [condition, setCondition] = useState<Condition>("good");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");
  const [isError, setIsError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!user) return null;
  const userId = user.id;

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    const remaining = 4 - files.length;
    const toAdd = selected.slice(0, remaining);

    const errors: string[] = [];
    const valid: File[] = [];
    const validPreviews: string[] = [];

    for (const file of toAdd) {
      const err = validateFile(file);
      if (err) {
        errors.push(`${file.name}: ${err}`);
        continue;
      }

      let img: HTMLImageElement;
      try {
        img = await new Promise((resolve, reject) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = () => reject(new Error("No se pudo leer"));
          i.src = URL.createObjectURL(file);
        });
      } catch {
        errors.push(`${file.name}: No se pudo leer la imagen`);
        continue;
      }

      if (img.naturalWidth > MAX_DIMENSION || img.naturalHeight > MAX_DIMENSION) {
        errors.push(`${file.name}: Dimensiones muy grandes (máx ${MAX_DIMENSION}x${MAX_DIMENSION}px)`);
        continue;
      }

      valid.push(file);
      validPreviews.push(URL.createObjectURL(file));
    }

    setFiles(prev => [...prev, ...valid]);
    setPreviews(prev => [...prev, ...validPreviews]);
    setFileErrors(prev => [...prev, ...errors]);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function removeImage(i: number) {
    setFiles(prev => prev.filter((_, idx) => idx !== i));
    setPreviews(prev => {
      URL.revokeObjectURL(prev[i]);
      return prev.filter((_, idx) => idx !== i);
    });
    setFileErrors([]);
  }

  async function handleSubmit() {
    setStatus("");
    setIsError(false);
    setFileErrors([]);

    const trimmedTitle = title.trim();
    const priceNum = Number(price);
    const trimmedSize = size.trim();

    if (!trimmedTitle || trimmedTitle.length < 3) { setStatus("El nombre debe tener al menos 3 caracteres"); setIsError(true); return; }
    if (trimmedTitle.length > 100) { setStatus("El nombre es demasiado largo (máx 100)"); setIsError(true); return; }
    if (!price || isNaN(priceNum) || priceNum <= 0 || priceNum > 999999999) { setStatus("Ingresa un precio válido en CRC"); setIsError(true); return; }
    if (!trimmedSize) { setStatus("Ingresa la talla"); setIsError(true); return; }

    setUploading(true);
    setStatus("Comprimiendo imágenes...");

    try {
      const compressedFiles: File[] = [];
      for (const file of files) {
        const compressed = await compressImage(file);
        compressedFiles.push(compressed);
      }

      setStatus("Subiendo imágenes...");

      const imageUrls: string[] = [];
      const storagePaths: string[] = [];

      for (const file of compressedFiles) {
        const formData = new FormData();
        formData.append("image", file);

        const result = await api("/api/uploads", {
          method: "POST",
          body: formData,
        });

        if (result.image_url) {
          imageUrls.push(result.image_url);
          storagePaths.push(result.storage_path || "");
        }
      }

      setStatus("Publicando prenda...");

      const body: Record<string, unknown> = {
        name: trimmedTitle,
        title: trimmedTitle,
        price: priceNum,
        size: trimmedSize,
        brand: brand.trim() || undefined,
        category,
        condition,
        description: description.trim(),
        status: "disponible",
        images: imageUrls,
        storage_paths: storagePaths,
      };

      if (imageUrls.length > 0) body.image_url = imageUrls[0];
      if (imageUrls.length > 1) body.image_url_2 = imageUrls[1];
      if (imageUrls.length > 2) body.image_url_3 = imageUrls[2];
      if (imageUrls.length > 3) body.image_url_4 = imageUrls[3];

      await api("/api/products", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      });

      setStatus("Prenda publicada con éxito");
      setIsError(false);
      setTimeout(() => goTo("profile"), 1200);
    } catch (err: any) {
      setStatus(err.message || "Error al publicar");
      setIsError(true);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="view profile-view screen">
      <div className="profile-top">
        <div className={`profile-avatar ${user.avatar || "avatar-1"}`} />
        <div className="profile-heading">
          <div className="profile-id">Publicar prenda</div>
        </div>
      </div>

      <div className="profile-form" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="profile-section">
          <div className="section-title">Información básica</div>
          <input className="field" placeholder="Nombre de la prenda *" value={title} onChange={e => setTitle(e.target.value)} maxLength={100} />
          <input className="field" type="number" placeholder="Precio en CRC *" value={price} onChange={e => setPrice(e.target.value)} min={1} />
          <input className="field" placeholder="Talla (ej: S, M, L, XL, 28, 32) *" value={size} onChange={e => setSize(e.target.value)} maxLength={20} />
          <input className="field" placeholder="Marca (opcional)" value={brand} onChange={e => setBrand(e.target.value)} maxLength={50} />
        </div>

        <div className="profile-section">
          <div className="section-title">Categoría y estado</div>
          <select className="field" value={category} onChange={e => setCategory(e.target.value)}>
            <option value="otros">Categoría: Otros</option>
            {CATEGORIES.filter(c => c !== "otros").map(c => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
          <select className="field" value={condition} onChange={e => setCondition(e.target.value as Condition)}>
            {(Object.keys(CONDITION_LABELS) as Condition[]).map(c => (
              <option key={c} value={c}>{CONDITION_LABELS[c]}</option>
            ))}
          </select>
        </div>

        <div className="profile-section">
          <div className="section-title">Descripción</div>
          <textarea className="field" rows={3} placeholder="Describe la prenda (material, detalles, etc.)" value={description} onChange={e => setDescription(e.target.value)} maxLength={2000} />
        </div>

        <div className="profile-section">
          <div className="section-title">Imágenes ({files.length}/4, máx. 10MB c/u)</div>
          <input ref={fileInputRef} type="file" className="field file-input" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple onChange={handleFiles} disabled={uploading || files.length >= 4} />
          {fileErrors.length > 0 && fileErrors.map((err, i) => (
            <div key={i} className="status-text error" style={{ fontSize: "0.5rem" }}>{err}</div>
          ))}
          {previews.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
              {previews.map((src, i) => (
                <div key={i} style={{ position: "relative", width: 60, height: 60, border: "1px solid var(--border-light)", borderRadius: 4, overflow: "hidden" }}>
                  <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button type="button" onClick={() => removeImage(i)}
                    style={{ position: "absolute", top: 0, right: 0, background: "var(--accent-red)", color: "white", border: "none", width: 16, height: 16, fontSize: 10, cursor: "pointer", lineHeight: "16px", textAlign: "center", padding: 0 }}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="profile-actions" style={{ marginTop: 4 }}>
          <button className="small-btn" onClick={handleSubmit} disabled={uploading || files.length === 0}>
            {uploading ? "Publicando..." : "Publicar prenda"}
          </button>
          <button className="small-btn secondary" onClick={() => goTo("profile")}>Volver</button>
        </div>

        <div className={`status-text ${isError ? "error" : "success"}`}>{status}</div>
      </div>
    </div>
  );
}
