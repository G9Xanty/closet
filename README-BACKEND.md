# Closet Elander backend propio

Backend Node.js + Express preparado para Koyeb con Postgres y Cloudinary.

## Correr localmente

1. Instala dependencias:

```powershell
npm install
```

2. Copia `.env.example` a `.env` y completa tus valores reales:

```powershell
copy .env.example .env
```

3. Arranca:

```powershell
npm start
```

4. Abre:

- App: http://localhost:3000/closet.html
- Admin: http://localhost:3000/admin/admin.html

## Produccion

- La base de datos usa `DATABASE_URL`.
- Las imagenes se suben a Cloudinary desde el backend.
- `.env` no debe subirse a GitHub.
- `CLOUDINARY_API_SECRET`, `DATABASE_URL`, `JWT_SECRET` y `ADMIN_PASSWORD` nunca deben estar en frontend.

