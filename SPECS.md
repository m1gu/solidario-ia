# SPECS.md — Banco Solidario AI Voice Agent

## 1. System Overview

An automated AI-driven voice agent for debt collection and preventive management. The system calls contacts, runs AI-powered conversations via VAPI, logs results to Supabase, and provides a real-time analytics dashboard.

### Technology Stack

| Layer | Technology |
|---|---|
| Orchestration | n8n workflows |
| Voice AI | VAPI |
| Database | Supabase (PostgreSQL / PostgREST) |
| Dashboard | Vanilla JS + Chart.js + Flatpickr |
| Upload Tool | Vanilla JS + SheetJS (XLSX) |

---

## 2. Data Model

### 2.1 `solidario_registros` — Contacts / Operation Queue

Primary table. One row per operation (`num_operacion`).

| Column | Type | Description |
|---|---|---|
| `num_operacion` | text (PK) | Unique operation ID |
| `estado_flujo` | text | One of: `PENDIENTE`, `EN_PROCESO`, `REINTENTAR`, `FINALIZADO` |
| `agente_tipo` | text | `PREVENTIVA` or `COBROS` |
| `producto` | text | `UNICREDITO` or other (displayed as "CASAS COMERCIALES") |
| `cedula` | text | National ID |
| `nombre` | text | First name |
| `apellido` | text | Last name |
| `telefono1`–`telefono6` | text | Up to 6 phone numbers |
| `telefono_index` | int | Index pointer for next phone number to dial |
| `monto` | numeric | Outstanding amount |
| `fecha_vencimiento` | date | Payment due date |
| `dias_retraso` | int | Days past due (negative = overdue) |
| `intentos_llamada` | int | Total call attempts |
| `win_tries` | int | Successful contact attempts |
| `fecha_reagenda` | date | Scheduled date for next call attempt |

**Product Display Rule**: If `producto === 'UNICREDITO'` → display "UNICREDITO". Everything else → display "CASAS COMERCIALES".

### 2.2 `solidario_llamadas` — Call Logs

One row per call. Linked to `solidario_registros` via `num_operacion`.

| Column | Type | Description |
|---|---|---|
| `id_llamada` | text | Unique call ID from VAPI |
| `num_operacion` | text | FK to `solidario_registros` |
| `created_at` | timestamptz | Auto-generated server timestamp |
| `nombre` | text | Client first name (denormalized) |
| `apellido` | text | Client last name (denormalized) |
| `cedula` | text | National ID (denormalized) |
| `monto_promesa` | numeric | Amount promised by client |
| `fecha_promesa` | date | Date promised for payment |
| `aceptacion` | text | `Si` / `No` — did client accept? |
| `contactoefectivo` | text | `Si` / `No` — was effective contact made? |
| `contactoalo` | text | Name of person who answered |
| `es_familiar` | text | Did a family member answer? |
| `nomenclatura` | text | Call classification/outcome |
| `codigo_respuesta` | text | Response/disposition code |
| `sentimiento` | text | Sentiment analysis (e.g., "Positivo", "Negativo", "Neutral") |
| `duracion_llamada` | numeric | Call duration in seconds |
| `link_audio_vapi` | text | URL to call recording |
| `resumen_llamada` | text | AI-generated call summary |
| `transcripcion_llamada` | text | Full transcript (format: `AI:` / `User:` prefixed lines) |
| `hora_inicio_llamada` | timestamptz | Call start time |
| `hora_fin_llamada` | timestamptz | Call end time |
| `fecha_gestion` | timestamptz | Timestamp used for daily report filtering |

**Duration extraction** (in `getDurationSeconds()`): tries `duracion_llamada` → `duracion` → `duracion_segundos` → `duration_seconds` → falls back to `hora_fin_llamada - hora_inicio_llamada`.

### 2.3 `solidario_reporte_gestion` — Operational Reports

Transactional table. One row per call completion. Linked via `num_operacion`.

| Column | Type | Description |
|---|---|---|
| `num_operacion` | text | Reference to the operation |
| `user_name_gestion` | text | `COBROS` or `PREVENTIVA` |

### 2.4 `solidario_reporte_productividad` — Productivity Reports

Aggregated performance data. Populated by a scheduled n8n task (Mon–Sat at 9 PM). Not directly queried by the dashboard.

---

## 3. Business Rules

### 3.1 State Transitions (`solidario_registros.estado_flujo`)

| Current State | Trigger | Next State |
|---|---|---|
| `EN_PROCESO` | Periodic upload (`mergeWithExisting`) | `REINTENTAR` if `intentos_llamada > 0`, else `PENDIENTE` |
| `FINALIZADO` | `fecha_vencimiento === today` | `REINTENTAR` |
| `FINALIZADO` | `monto` changed from existing value | `REINTENTAR` |
| (new record) | First upload | `PENDIENTE` |

These transitions are enforced in `upload_database/app.js` (`mergeWithExisting` + `evaluateTransitionRules`).

### 3.2 Agent Assignment

- **PREVENTIVA**: Assigned when `fecha_vencimiento` is today or in the future.
- **COBROS**: Assigned when `fecha_vencimiento` has passed (`dias_retraso < 0`).

### 3.3 Product Grouping

- `producto === 'UNICREDITO'` → displayed as "UNICREDITO".
- All other products → displayed as "CASAS COMERCIALES".
- In uploads, `producto === 'EMPAQUETADO'` is remapped to `'UNICREDITO'`.
- Filter "AMBOS" → no filter; "UNICREDITO" → exact match; "CASAS COMERCIALES" → NOT UNICREDITO.

---

## 4. Dashboard Specification

### 4.1 General

- **File**: `dashboard/index.html`
- **Deployment**: Embedded in n8n node via public URL
- **Refresh**: Manual only (user clicks button). No auto-refresh.
- **Loading**: Full-screen overlay with spinner during data fetch.
- **Date default**: Last 7 days in pickers (clamped to 4 days server-side).

### 4.2 Filters (shared by both tabs, independent controls per tab)

| Filter | DOM ID (Dashboard) | DOM ID (Auditoría) | Applied | Source |
|---|---|---|---|---|
| Fecha Desde | `dash-date-from` | `table-date-from` | Server-side (`.gte('created_at')`) | `solidario_llamadas.created_at` |
| Fecha Hasta | `dash-date-to` | `table-date-to` | Server-side (`.lte('created_at')`) | `solidario_llamadas.created_at` |
| Producto | `dash-producto` | `table-producto` | JS-side | `solidario_registros.producto` |
| Estrategia | `dash-estrategia` | `table-estrategia` | JS-side | `solidario_reporte_gestion.user_name_gestion` |
| Búsqueda texto | (only Auditoría) `search-input` | JS-side | `cedula`, `nombre`, `apellido`, `num_operacion`, `id_llamada` |

**Why JS-side for Producto/Estrategia**: These columns live in different tables (`solidario_registros`, `solidario_reporte_gestion`). The dashboard fetches those tables fully (small tables) and merges in JS rather than doing Supabase JOINs.

### 4.3 Tab 1 — Métricas

**5 KPI Cards:**

| KPI | Formula | Source Field |
|---|---|---|
| Total Llamadas | Count of filtered calls | — |
| % Aceptación Efectiva | `(aceptacion === 'Si') / total * 100` | `aceptacion` |
| Monto Promesa | Sum of `monto_promesa` | `monto_promesa` |
| Duración Promedio | Average of `getDurationSeconds()` | `duracion_llamada` (etc.) |
| % Contacto Efectivo | `(contactoefectivo === 'Si') / total * 100` | `contactoefectivo` |

**2 Charts:**

| Chart | Type | Data | Config |
|---|---|---|---|
| Llamadas por Día | Bar | `created_at` grouped by date | Primary color bars, no legend |
| Distribución por Nomenclatura | Doughnut | `nomenclatura` counts | 6-color palette, right legend |

### 4.4 Tab 2 — Auditoría de Llamadas

**Table columns**: ID Vapi, Operación, Cliente (nombre + cédula), Duración, Motivo (`codigo_respuesta`), Sentimiento (color badge), Monto Promesa, Fecha.

**Pagination**: 10 rows per page, client-side over `filteredCalls`.

**Sentiment badges:**
- Contains "positi"/"feliz" → green (`badge success`)
- Contains "negati"/"enojad"/"frust" → red (`badge danger`)
- Contains "neutr" → grey (`badge neutral`)
- Default → yellow (`badge warning`)

**Modal** (on row click): Shows audio player, contact info (`contactoalo`, `es_familiar`, `aceptacion`), management results (`nomenclatura`, `codigo_respuesta`, `monto_promesa`, `fecha_promesa`), and chat-bubble transcript.

**Transcript parsing**: Lines starting with `AI:` → agent bubble (teal, left). Lines starting with `User:` → client bubble (grey, right). Unprefixed lines default to agent.

### 4.5 Data Flow

```
Page Load / Button Click
  → clampTo4Days(from, to)                 (JS)
  → fetchData(fromISO, toISO)
      → while hasMore:
          → supabase .gte().lte().range()   (paginates 1000 rows per request)
      → supabase solidario_registros        (full table, join in JS)
      → supabase solidario_reporte_gestion  (full table, join in JS)
      → merge producto + user_name_gestion  (JS)
  → applyDashboardFilters()                 (JS: producto, estrategia)
  → applyCallsFilters()                     (JS: search, producto, estrategia)
  → updateDashboard() / renderTable()
```

---

## 5. Upload Tool Specification

### 5.1 Overview

- **File**: `upload_database/app.js`
- **Target table**: `solidario_registros`
- **Formats**: XLSX, CSV, TXT (tab-delimited)
- **Modes**: Normal upsert or dry run

### 5.2 Processing Pipeline

1. **Parse** file (XLSX via SheetJS, CSV custom parser, TXT tab-split)
2. **Map columns** via `COLUMN_MAP` (case-insensitive, accent-insensitive normalization)
3. **Validate** required fields (`num_operacion`, `cedula`, `nombre`, `apellido`, `monto`, `fecha_vencimiento`)
4. **Deduplicate** by `num_operacion` (keep last occurrence)
5. **Fetch existing** records for the same `num_operacion` values
6. **Merge** with `mergeWithExisting()` — preserves state, recovers stuck `EN_PROCESO`
7. **Transition check** with `evaluateTransitionRules()` — revives `FINALIZADO` if amount/due date changed
8. **Upsert** in batches of 500 via Supabase `.upsert()` with `onConflict: 'num_operacion'`

### 5.3 Column Mapping (`COLUMN_MAP`)

Supports multiple input header names (e.g., `numerooperacion`, `num_operacion`, `numero_operacion` all map to `num_operacion`).

### 5.4 EN_PROCESO Recovery

During `mergeWithExisting()`:
- If existing `estado_flujo === 'EN_PROCESO'`:
  - `intentos_llamada > 0` → set to `REINTENTAR`
  - `intentos_llamada === 0` → set to `PENDIENTE`

This ensures periodic uploads automatically unstick records left in processing state.

---

## 6. Productivity Report Workflow (`Solidario_ReporteProductividad.json`)

### 6.1 Overview

Scheduled workflow (Mon–Sat at 9 PM, timezone `America/Guayaquil`) that:
1. Aggregates daily call metrics into `solidario_reporte_productividad`
2. Exports productivity and management data as XLSX files
3. Uploads XLSX files to SFTP
4. Optionally downloads call audio recordings from VAPI

### 6.2 Node Flow

```
Cron 21h → CONFIG INICIAL → UPSERT PRODUCTIVIDAD → CONSULTA PROD → XLSX → SFTP
                                            ↘
                              CONSULTA GESTION → XLSX GEST → SFTP GEST
                                            ↙
                                    RESUMEN EJECUCION
                                            ↓
                                    IF: EJECUTAR DESCARGA?
                                   ↙ true           ↘ false
                          LISTAR IDS VAPI           FIN (NoOp)
                                  ↓
                          SPLIT DESCARGAS
                                  ↓
                          OBTENER DETALLE LLAMADA (VAPI API)
                                  ↓
                          EXTRAER URL AUDIO
                                  ↓
                          TIENE AUDIO?
                         ↙ true        ↘ false
                DESCARGAR MP3           → SPLIT (next)
                        ↓
                SUBIR AUDIO SFTP
                        ↓
                ESPERAR 10s
                        ↓
                SPLIT DESCARGAS (loop)
```

### 6.3 CONFIG INICIAL Variables

Edit these constants in the Code node before executing:

| Variable | Values | Description |
|---|---|---|
| `MODO_FECHA` | `'HOY'` / `'FECHA_ESPECIFICA'` | Use today's date or a manual date |
| `FECHA_ESPECIFICA` | `'YYYY-MM-DD'` | Date string, only used when `MODO_FECHA = 'FECHA_ESPECIFICA'` |
| `EJECUTAR_DESCARGA` | `true` / `false` | Enable/disable the audio download branch |
| `VAPI_API_KEY` | UUID string | VAPI API key |
| `VAPI_ASSISTANT_PREVENTIVA` | UUID string | Assistant ID for preventiva |
| `VAPI_ASSISTANT_COBROS` | UUID string | Assistant ID for cobros |

The config object is structured as:
```
cfg
├── report   { tz, forDate, yyyymmdd, ..., ejecutarDescargaLlamadas }
├── vapi     { baseUrl, apiKey, assistants: { PREVENTIVA, COBROS } }
└── agents   { COBROS, PREVENTIVA }
```

### 6.4 UPSERT PRODUCTIVIDAD SQL

**Source**: Joins `solidario_llamadas` with `solidario_registros` on `num_operacion`, filtered by `fecha_gestion` of the target date.

**Estrategia classification** (`flujo/mora` vs `preventiva`):
1. If `dias_retraso` starts with `-` → `preventiva`
2. If `dias_retraso` starts with `+` → `flujo/mora`
3. If `fecha_vencimiento >= fecha_gestion` → `preventiva`
4. Else → `flujo/mora`

**Producto grouping**: `UPPER(producto) = 'UNICREDITO'` → `UNICREDITO`, else → `CASAS COMERCIALES`.

**Metrics table** (one row per `fecha × producto × estrategia`):

| Column | SQL Formula | Source Field |
|---|---|---|
| `marcaciones_realizadas` | `COUNT(*)` | — |
| `gestiones_realizadas` | `COUNT(*) FILTER (WHERE contactoalo IS NOT NULL AND btrim(contactoalo) != '')` | `contactoalo` |
| `contactos_directos` | `COUNT(*) FILTER (WHERE contactoefectivo = 'Si')` | `contactoefectivo` |
| `compromisos_de_pago_generados` | `COUNT(*) FILTER (WHERE aceptacion = 'Si')` | `aceptacion` |
| `compromisos_de_pago_cumplidos` | Hardcoded `0` | — |
| `numero_clientes_marcados` | `COUNT(DISTINCT cedula)` | `cedula` |
| `clientes_gestionados` | `COUNT(DISTINCT cedula) FILTER (WHERE contactoalo IS NOT NULL AND btrim(contactoalo) != '')` | `cedula`, `contactoalo` |
| `numero_clientes_recuperados` | `COUNT(DISTINCT cedula) FILTER (WHERE aceptacion = 'Si')` | `cedula`, `aceptacion` |
| `horas_laborables` | `EXTRACT(epoch FROM (max(hora_fin) - min(hora_inicio))) / 3600` | `hora_inicio_llamada`, `hora_fin_llamada` |
| `tiempo_entre_llamadas` | `AVG(gap)` via `LAG()` window function, formatted as `MM:SS` | `hora_inicio_llamada`, `hora_fin_llamada` |

**Upsert**: `ON CONFLICT (fecha, estrategia_o_equipo, producto) DO UPDATE` — reprocessing the same date overwrites existing rows.

### 6.5 Metric Chain (Data Flow Through Filters)

Example from 2026-05-05, CASAS COMERCIALES / preventiva:

```
350 marcaciones (COUNT(*))
  ↓   contactoalo IS NOT NULL AND != ''
121 gestiones (someone answered)
  ↓   contactoefectivo = 'Si'
 23 contactos_directos (spoke with the debtor)
  ↓   aceptacion = 'Si'
 14 compromisos (debtor accepted payment)
  ↓   DISTINCT cedula
 14 clientes_recuperados (unique clients who accepted)
```

Each field is a progressively filtered subset — `gestiones ⊆ marcaciones`, `contactos_directos ⊆ gestiones`, `compromisos ⊆ contactos_directos`.

---

## 7. Known Constraints

| Constraint | Reason |
|---|---|
| Supabase `max-rows = 1000` per request | PostgREST config. Workaround: paginate with `.range()` |
| Date range max 4 days | `clampTo4Days()` enforces. Keeps paginated fetches manageable |
| No auto-refresh | User must click button. Avoids wasting Supabase quota |
| No external JS dependencies on dashboard | Vanilla JS only |
| Producto and Estrategia filters are JS-side | Require JOINs across tables not available in PostgREST |
| Dashboard and Auditoría tabs have independent filter controls | Each tab reads its own DOM elements |

---

## 8. Deployment

### Dashboard
1. Edit `dashboard/index.html`
2. Copy entire contents into the corresponding n8n "Respond to Webhook" node HTML field
3. Test in `testMode` before production

### Upload Tool
- Served as a standalone HTML page with Supabase CDN dependencies
- Uses the same Supabase project and anon key

### n8n Workflows
- Changes should be tested in `testMode` before activating
- Key workflows: `Solidario_Cobros_Llamadas` (outbound calling), `Solidario_Cobros_CierreLlamadas` (webhook/close), scheduled tasks for productivity report and audio backup

---

## 9. Architecture Decisions Log

| Decision | Rationale |
|---|---|
| Date filter server-side, Producto/Estrategia JS-side | Date is a direct column on `solidario_llamadas` and reduces volume. Other filters need JOINs. |
| Paginate with `.range()` not `.limit()` | Supabase `max-rows=1000` ignores `.limit(50000)`. Range pagination is the standard workaround. |
| 4-day date clamp | Balances data volume with Supabase pagination limits. Prevents excessive sequential requests. |
| Fetch `solidario_registros` and `solidario_reporte_gestion` fully | Both tables are small (< a few thousand rows). Avoids complex JS-side joining overhead. |
| No auto-refresh | Respects Supabase quota. User controls when to reload. |
| EN_PROCESO recovery on upload | Periodic uploads are the natural heartbeat to clean up stuck records. Avoids needing a separate cleanup job. |
| Productivity report uses `fecha_gestion` for daily filter | `fecha_gestion` is set by the call-closing workflow and reflects the actual management date, not the `created_at` server timestamp. |
| `numero_clientes_recuperados` uses `COUNT(DISTINCT cedula)` | Prevents double-counting the same client who made multiple promises on the same day. |
| Conditional audio download via IF node | Audio download is expensive (many HTTP requests). Config flag lets user skip it for quick report reprocessing. |
