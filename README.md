# Public Transit App - Backend API

API REST de [Public Transit App](https://github.com/irveloper/transit-app-backend), el backend que alimenta la app colaborativa de transporte publico para ciudades de LATAM.

## API Endpoints

| Metodo | Ruta | Descripcion |
|---|---|---|
| `GET` | `/health` | Health check |
| `*` | `/api/routes` | CRUD de rutas de transporte |
| `*` | `/api/stops` | CRUD de paradas |
| `*` | `/api/check-ins` | Check-ins de usuarios en tiempo real |
| `*` | `/api/predict` | Prediccion de retrasos con IA |

## Tech Stack

| Tecnologia | Uso |
|---|---|
| [Hono](https://hono.dev/) | Framework HTTP ultra-ligero |
| [Prisma](https://www.prisma.io/) 7 | ORM con soporte PostGIS |
| [PostgreSQL](https://www.postgresql.org/) + [PostGIS](https://postgis.net/) | Base de datos con extension geoespacial |
| [LangChain](https://js.langchain.com/) + OpenAI | Prediccion inteligente de retrasos |
| [Zod](https://zod.dev/) | Validacion de schemas |
| [tsx](https://tsx.is/) | Runtime TypeScript |

## Modelo de datos

```
operators        — Operadores de transporte (ej. IMOVEQROO)
  routes         — Rutas del operador (ej. R15 "Hoteles 95-96")
    route_directions — Direcciones por ruta (ida/vuelta)
      route_stops    — Paradas ordenadas por direccion
stops            — Paradas fisicas con coordenadas (PostGIS POINT)
check_ins        — Reportes de usuarios en tiempo real
```

Las ubicaciones usan tipos `geography` de PostGIS para consultas geoespaciales eficientes.

## Estructura del proyecto

```
src/
  index.ts              # Entry point, Hono app + rutas
  config/
    db.ts               # Conexion Prisma + PostgreSQL
  controllers/          # Logica de request/response
    checkins.controller.ts
    predict.controller.ts
    routes.controller.ts
    stops.controller.ts
  routes/               # Definicion de rutas HTTP
  services/             # Logica de negocio
  types/                # Tipos TypeScript
prisma/
  schema.prisma         # Schema de base de datos
  migrations/           # Migraciones SQL
  seed.ts               # Datos iniciales
```

## Requisitos

- Node.js >= 22.12
- pnpm
- PostgreSQL con extension PostGIS

## Setup

```bash
# Instalar dependencias
pnpm install

# Variables de entorno
cp .env.example .env
# Configurar DATABASE_URL, AI_API_KEY

# Generar cliente Prisma
pnpm build

# Ejecutar migraciones
npx prisma migrate dev

# Seed de datos iniciales
npx prisma db seed

# Iniciar en desarrollo
pnpm dev
```

El servidor corre en [http://localhost:8787](http://localhost:8787).

## Scripts

| Comando | Descripcion |
|---|---|
| `pnpm dev` | Servidor con hot-reload (tsx watch) |
| `pnpm build` | Generar cliente Prisma |
| `pnpm start` | Servidor en produccion |

## Docker

```bash
docker build -t transit-backend .
docker run -p 8787:8787 --env-file .env transit-backend
```

## Deploy

Desplegado en **CubePath** como contenedor independiente.

- **API**: [transit-backend-app-o2m1yy-3ed1cd-107-148-105-28.traefik.me](http://transit-backend-app-o2m1yy-3ed1cd-107-148-105-28.traefik.me/)

---

Hackathon CubePath x Midudev 2026
