# Design System — Closet

> Tokens visuales que garantizan consistencia en todas las pantallas.
> No reemplaza el Product Bible. Lo complementa con reglas visuales precisas.

---

## 01 · Layout

### Grid del feed
```css
.products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
  padding: 12px 8px;
}
```

### Desktop breakpoint: > 1024px
- DetailScreen: layout horizontal de 3 columnas
- Feed: auto-fill columns

### Tablet breakpoint: 768px — 1024px
- DetailScreen: layout horizontal reducido
- Feed: minmax(180px, 1fr)

### Mobile breakpoint: < 768px
- DetailScreen: layout vertical (una columna)
- Feed: minmax(140px, 1fr)

---

## 02 · Cards (ProductCard)

### Dimensiones
| Propiedad | Valor |
|-----------|-------|
| Imagen altura | ~60% de la card |
| Info padding | `16px 14px 14px` |
| Gap entre elementos | `6px` |
| Border radius | `10px` |
| Border | `1px solid rgba(255,255,255,0.06)` |
| Hover | `translateY(-4px) + box-shadow` |

### Imagen
```css
.product-image-container {
  width: 100%;
  padding-top: 150%;  /* 2:3 aspect ratio = imagen domina */
  overflow: hidden;
}
.product-image-container img {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  object-fit: cover;
}
```

### Tipografía
| Elemento | Font | Size | Color |
|----------|------|------|-------|
| Nombre | Press Start 2P | `13px` | `#ffffff` |
| Precio | Press Start 2P | `15px` | `#ffd700` |
| Talla | Press Start 2P | `10px` | `rgba(255,255,255,0.4)` |
| Ubicación | Press Start 2P | `10px` | `rgba(255,255,255,0.3)` |
| Reputación | Press Start 2P | `10px` | `#ffd700` |
| Badge estado | Press Start 2P | `9px` | — |
| Botón acción | Press Start 2P | `10px` | `#00ffff` |

---

## 03 · DetailScreen

### Layout (desktop > 1024px)
```
┌──────┬──────────────────────┬────────────────┐
│  10% │        55%           │     35%        │
│ mini │     imagen           │    info        │
│       │     contain          │                │
│       │                      │                │
└──────┴──────────────────────┴────────────────┘
```

### Layout (mobile < 768px)
```
┌──────────────────────────┐
│       imagen             │
│       contain            │
├──────────────────────────┤
│ miniaturas horizontal    │
├──────────────────────────┤
│       info               │
└──────────────────────────┘
```

### Imagen principal
```css
.detail-image-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
}
.detail-image-container img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
```
Sin `max-height`, sin `min-height`, sin `aspect-ratio` fijo.

### Miniaturas
```css
.detail-thumbnails {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
}
.detail-thumbnail {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 4px;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.2s, border-color 0.2s;
  border: 2px solid transparent;
}
.detail-thumbnail.active {
  opacity: 1;
  border-color: var(--accent-red);
}
```
En mobile: `flex-direction: row` con overflow-x.

### Panel info
```css
.detail-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding: 0 8px;
}
```

### Tipografía
| Elemento | Font | Size | Color |
|----------|------|------|-------|
| Nombre | Press Start 2P | `16px` | `#ffffff` |
| Precio | Press Start 2P | `20px` | `#ffd700` |
| Estado badge | Press Start 2P | `11px` | — |
| Talla/Marca | Press Start 2P | `12px` | `rgba(255,255,255,0.5)` |
| Descripción | Press Start 2P | `11px` | `rgba(255,255,255,0.4)` |
| Botón principal | Press Start 2P | `12px` | `#00ffff` |

---

## 04 · Estados visuales

| Estado | Badge color | Badge background |
|--------|------------|-----------------|
| Disponible | `#00ff88` | `rgba(0, 255, 136, 0.15)` |
| Reservado | `rgba(255,255,255,0.5)` | `rgba(255,255,255,0.05)` |
| Vendido | `#ff4444` | `rgba(255, 68, 68, 0.15)` |

---

## 05 · Spacing

| Contexto | Padding / Gap |
|----------|--------------|
| Cards info | `padding: 16px 14px 14px; gap: 6px` |
| Detail info | `gap: 12px` |
| Detail view padding | `12px` |
| Botones | `padding: 10px 18px` |
| Entre cards en grid | `gap: 16px` |

---

## 06 · Responsive breakpoints

| Breakpoint | Target | DetailScreen | Feed grid |
|-----------|--------|-------------|-----------|
| > 1024px | Desktop | 3-column horizontal | `minmax(220px, 1fr)` |
| 768-1024px | Tablet | 3-column reduced | `minmax(180px, 1fr)` |
| < 768px | Mobile | vertical single column | `minmax(140px, 1fr)` |

---

## 07 · Archivos donde se aplican estos tokens

- `src/styles/screens.css` — estilos principales del marketplace
- `src/styles/global.css` — CSS custom properties (colores, scrollbar, reset)
- `src/components/ProductCard.tsx` — card del feed
- `src/screens/DetailScreen.tsx` — detalle de producto
