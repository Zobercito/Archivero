# Despliegue opcional de la app completa

Esta guía describe la app real con API, PostgreSQL y almacenamiento S3. La demo
interactiva del README no necesita nada de esto: se ejecuta en el navegador con
`bun run demo`.

Si prefieres autoalojarla, el README explica el perfil `full` de Docker Compose,
que levanta base de datos, almacenamiento, API y web en `http://localhost:8080`.
Para publicarla en internet, colócala detrás de un proxy con HTTPS, ajusta
`APP_ORIGIN` y `S3_PUBLIC_ENDPOINT`, y elimina `SESSION_COOKIE_SECURE=false`.

Arquitectura desplegada:

- **Interfaz:** Vite estático en Vercel (`apps/web/dist`).
- **API:** Hono como función Node en Vercel (`api/[[...route]].ts`).
- **Base de datos:** PostgreSQL de Supabase, usando la cadena del **pooler**.
- **Archivos:** bucket de Cloudflare R2 (compatible con S3).

Las subidas van del navegador directamente a R2 con una URL firmada, así que la
función de Vercel solo intercambia metadatos y no recibe el cuerpo del archivo.

## 1. Supabase

1. Crea un proyecto y guarda la contraseña de la base.
2. En **Project Settings → Database → Connection string**, elige **Pooler**
   (modo _Transaction_, puerto `6543`) y copia la cadena. Añade
   `?sslmode=require` si no viene incluido.
3. Aplica las migraciones desde tu máquina:

   ```bash
   DATABASE_URL='postgresql://postgres.<ref>:<clave>@<host>:6543/postgres?sslmode=require' \
     bun run db:migrate
   ```

   La conexión ya usa `prepare: false`, requisito de PgBouncer en modo transacción.
4. Siembra los datos de demostración apuntando también a R2 (ver siguiente
   apartado). El seed genera los PDF, CSV e imágenes de ejemplo y los sube al
   bucket:

   ```bash
   DATABASE_URL='...' \
   S3_ENDPOINT='https://<cuenta>.r2.cloudflarestorage.com' \
   S3_REGION='auto' S3_BUCKET='archivero' \
   S3_ACCESS_KEY_ID='...' S3_SECRET_ACCESS_KEY='...' \
   S3_FORCE_PATH_STYLE='false' \
     bun run db:seed
   ```

## 2. Cloudflare R2

1. Crea un bucket (por ejemplo `archivero`).
2. Crea un token de API con permiso de lectura y escritura sobre ese bucket y
   anota `Access Key ID` y `Secret Access Key`.
3. Configura CORS para permitir las subidas firmadas desde el dominio de la
   demo. En **Settings → CORS policy**:

   ```json
   [
     {
       "AllowedOrigins": ["https://<tu-dominio>.vercel.app"],
       "AllowedMethods": ["GET", "PUT"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

4. El endpoint es `https://<cuenta>.r2.cloudflarestorage.com`, la región `auto`
   y `S3_FORCE_PATH_STYLE=false`.

## 3. Vercel

1. Importa el repositorio. Vercel usa el `bun.lock` del monorepo; la
   configuración de `vercel.json` ya fija:
   - instalación: `bun install --frozen-lockfile`
   - build: `bun run build`
   - salida: `apps/web/dist`
   - rewrite SPA que excluye `/api`
2. Define estas variables de entorno (Production y Preview):

   | Variable                                    | Valor                                                        |
   | ------------------------------------------- | ------------------------------------------------------------ |
   | `DATABASE_URL`                              | cadena del pooler de Supabase con `sslmode=require`          |
   | `JWT_SECRET`                                | secreto aleatorio de 32+ caracteres (`openssl rand -hex 32`) |
   | `APP_ORIGIN`                                | URL pública exacta, sin barra final                          |
   | `SESSION_TTL_HOURS`                         | `8`                                                          |
   | `S3_ENDPOINT`                               | endpoint de R2                                               |
   | `S3_REGION`                                 | `auto`                                                       |
   | `S3_BUCKET`                                 | nombre del bucket                                            |
   | `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | credenciales del token de R2                                 |
   | `S3_FORCE_PATH_STYLE`                       | `false`                                                      |
   | `MAX_FILE_SIZE_MB`                          | `25`                                                         |
   | `MAINTENANCE_SECRET`                        | secreto de 16+ caracteres para `POST /api/maintenance`       |

   `NODE_ENV` lo define Vercel como `production`; en ese modo la cookie de sesión
   se emite con `Secure`.

3. Despliega. Comprueba `https://<dominio>/api/health` y entra con la cuenta de
   lector.

## 4. Límites del despliegue público

- Publica **solo** la cuenta de lector; no difundas las de editor o
  administración.
- El lector no puede subir, mover, borrar ni compartir: la API lo impide por rol,
  no solo la interfaz.
- El inicio de sesión está limitado a 10 intentos cada 15 minutos por IP y el
  acceso público a enlaces a 120 peticiones por minuto por IP.
- Los enlaces públicos caducan por fecha o por número de descargas y se pueden
  revocar; el token se guarda únicamente como hash.
- La app no permite registro ni recuperación de contraseña.

## 5. Mantenimiento

- El plan gratuito de Supabase pausa el proyecto tras varios días sin actividad:
  entra de vez en cuando o programa una consulta periódica.
- Las subidas pendientes (archivos preparados que nunca se confirmaron) se
  pueden limpiar con `POST /api/maintenance` usando `x-maintenance-secret`.
- Si `@node-rs/argon2` fallara en el entorno de Vercel, cambia
  `apps/api/src/lib/password.ts` a `bcryptjs` (misma interfaz `hash`/`verify`).
- Bun se usa para instalar y construir; la función se ejecuta en el runtime Node
  de Vercel.
