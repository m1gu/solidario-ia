# Project: Banco Solidario AI Voice Agent

## Overview
An automated AI-driven voice agent system designed for debt collection and preventive management. The system uses **n8n** for orchestration, **VAPI** for AI voice interactions, and **Supabase** for data persistence and state management.

## System Architecture
The system follows a closed-loop automation pattern:
1.  **Orchestration (n8n)**: Manages business logic, schedules calls, processes webhooks, and serves the dashboard.
2.  **Voice Intelligence (VAPI)**: Executes real-time voice calls using AI models.
3.  **Data Layer (Supabase/PostgreSQL)**: Stores contact records, call logs, and management reports.
4.  **Reporting & Backup**: Automated processes for productivity reports and audio archiving (FTP).

## Data Model (Supabase)

### `solidario_registros` (Contacts/Leads)
Primary table for managing the calling queue and contact state. Linked to `solidario_llamadas` via `num_operacion`.

| Field | Type | Description |
|---|---|---|
| `num_operacion` (PK) | text | Unique operation identifier |
| `estado_flujo` | text | `PENDIENTE`, `EN_PROCESO`, `REINTENTAR`, `FINALIZADO` |
| `agente_tipo` | text | `PREVENTIVA` or `COBROS` |
| `producto` | text | `UNICREDITO` or other (grouped as CASAS COMERCIALES) |
| `cedula` | text | National ID |
| `nombre` | text | First name |
| `apellido` | text | Last name |
| `telefono1`–`telefono6` | text | Phone numbers |
| `telefono_index` | int | Index for next phone number |
| `monto` | numeric | Outstanding amount |
| `fecha_vencimiento` | date | Due date |
| `dias_retraso` | int | Days past due |
| `intentos_llamada` | int | Call attempt counter |
| `win_tries` | int | Successful contact counter |
| `fecha_reagenda` | date | Scheduled next attempt |

**State transition rules (enforced in `upload_database/app.js`):**
- `EN_PROCESO` records are recovered during each upload: if `intentos_llamada > 0` → `REINTENTAR`, else → `PENDIENTE`.
- `FINALIZADO` records: if `fecha_vencimiento === today` OR `monto` changed → `REINTENTAR`.
- New/unknown records default to `PENDIENTE`.

### `solidario_llamadas` (Call Logs)
Stores detailed logs of every interaction. Linked to `solidario_registros` via `num_operacion`.

| Field | Type | Description |
|---|---|---|
| `id_llamada` | text | Unique call identifier (from VAPI) |
| `num_operacion` | text | Reference to the contact |
| `created_at` | timestamptz | Auto-generated timestamp |
| `nombre` | text | Client first name |
| `apellido` | text | Client last name |
| `cedula` | text | National ID |
| `monto_promesa` | numeric | Promised payment amount |
| `fecha_promesa` | date | Promised payment date |
| `aceptacion` | text | `Si` / `No` |
| `contactoefectivo` | text | `Si` / `No` — whether contact was effective |
| `contactoalo` | text | Name of person who answered |
| `es_familiar` | text | Whether a family member answered |
| `nomenclatura` | text | Call outcome classification |
| `codigo_respuesta` | text | Response code |
| `sentimiento` | text | Sentiment analysis result |
| `duracion_llamada` | numeric | Duration in seconds |
| `link_audio_vapi` | text | URL to call recording |
| `resumen_llamada` | text | AI-generated summary |
| `transcripcion_llamada` | text | Full transcript |
| `hora_inicio_llamada` | timestamptz | Call start time |
| `hora_fin_llamada` | timestamptz | Call end time |
| `fecha_gestion` | timestamptz | Timestamp used for daily report filtering |

### `solidario_reporte_gestion` (Operational Reports)
Transactional table for real-time management tracking. Linked to `solidario_llamadas` via `num_operacion`.

| Field | Description |
|---|---|
| `num_operacion` | Reference to the operation |
| `user_name_gestion` | `COBROS` or `PREVENTIVA` — agent type that handled the record |

### `solidario_reporte_productividad` (Productivity Reports)
Aggregated data for performance analysis, updated via scheduled task (Mon-Sat at 9 PM).

## Dashboard (`dashboard/index.html`)

### Architecture
- Single-page application using vanilla JS, Chart.js, Flatpickr, and Supabase JS client.
- Deployed embedded in an n8n node via public URL.
- Dark glassmorphism theme with Outfit/Inter fonts.
- **No auto-refresh** — user clicks button to reload data.

### Two Tabs

#### Tab 1 — Métricas (Dashboard)
- **5 KPIs**: Total Llamadas, % Aceptación Efectiva (`aceptacion === 'Si'`), Monto Promesa (sum of `monto_promesa`), Duración Promedio, % Contacto Efectivo (`contactoefectivo === 'Si'`).
- **2 Charts**: Bar chart (calls per day), Doughnut (distribution by `nomenclatura`).
- **Filters**: Date range, Producto (`dash-producto`), Estrategia (`dash-estrategia`).

#### Tab 2 — Auditoría de Llamadas
- **Paginated table** (10 per page): ID Vapi, Operación, Cliente, Duración, Motivo, Sentimiento, Monto Promesa, Fecha.
- **Filters**: Search text (cedula/nombre/apellido/operacion/ID), date range, Producto, Estrategia.
- **Modal**: Audio player, contact info, management results, chat-bubble transcript (parses `AI:`/`User:` prefixes).

### Data Fetching Strategy
- `fetchData(fromISO, toISO)` runs on page load and on button clicks (both "Actualizar" and "Buscar").
- Date filter goes server-side: `.gte('created_at', fromISO)`, `.lte('created_at', toISO)`.
- Date range is clamped to maximum **4 days** via `clampTo4Days()` helper.
- Supabase has `max-rows = 1000` limit → client-side pagination with `.range()` loops until page returns < 1000 rows.
- Producto and Estrategia filters are applied **in JS** because they require JOINs across tables.
- Tables `solidario_registros` and `solidario_reporte_gestion` are fetched completely (they're small).

### Key Constraints
- Never add dependencies — use vanilla JS only.
- Supabase max-rows is 1000; always use pagination loop for calls table.
- Date range capped at 4 days to keep data volume manageable.
- Loading overlay shows spinner while fetching.

## Upload Tool (`upload_database/app.js`)

### Overview
Web-based CSV/XLSX/TXT uploader for `solidario_registros`. Validates, merges with existing records, and upserts via Supabase.

### Key Behaviors
- Column mapping via `COLUMN_MAP` (case-insensitive, accent-insensitive).
- Deduplication by `num_operacion` before upload.
- **Merge logic** (`mergeWithExisting`): Preserves existing `estado_flujo` and `fecha_reagenda`, but **recovers stuck `EN_PROCESO` records**.
- **Transition rules** (`evaluateTransitionRules`): `FINALIZADO` → `REINTENTAR` if due date is today or monto changed.
- Dry run mode supported.

## Workflows & Business Logic

### 1. Outbound Calling (`Solidario_Cobros_Llamadas`)
- **Trigger**: Scheduled interval (every 20-60 seconds).
- **Selection Logic**:
    - Selects records where `estado_flujo` is `PENDIENTE`, `REINTENTAR`, or `EN_PROCESO` (recovered automatically if `fecha_reagenda` is past).
    - Also handles `FINALIZADO` records if the `fecha_vencimiento` is today and `dias_retraso <= 0` (or in MODO1/AUTO, also if `dias_retraso` is in the priority range).
- **Priority Modes** (configured in `prioridad.modo`):
    - `NORMAL`: Default ordering (FINALIZADO → intentos ASC → reagenda ASC).
    - `MODO1`: Prioritizes `dias_retraso IN (configurable range)`, fallback to normal.
    - `MODO2`: Prioritizes `num_operacion IN (configurable array)`, fallback to normal.
    - `AUTO`: Chains MODO1 → MODO2 → NORMAL automatically (SQL-based, no external state).
- **Agent Assignment**:
    - `PREVENTIVA`: Assigned if the due date is today or in the future.
    - `COBROS`: Assigned if the due date has passed (negative `dias_retraso`).
- **Call Execution**: Sends a request to VAPI with the selected agent ID and contact details.
- **Concurrency & Safety**: Uses `FOR UPDATE SKIP LOCKED` in PostgreSQL to prevent multiple instances from picking the same record.

### 2. Call Closing (`Solidario_Cobros_CierreLlamadas`)
- **Trigger**: Webhook from VAPI upon call completion.
- **Data Normalization**: Processes the VAPI JSON payload, specifically extracting `structuredOutputs` to map variables like `resumen_llamada`, `sentimiento`, etc.
- **State Update**:
    - Updates `solidario_registros` based on the call outcome.
    - If a contact was `FINALIZADO` but `monto` or `fecha_vencimiento` changed, status moves to `REINTENTAR`.
- **Logging**: Records all metadata into `solidario_llamadas` and `solidario_reporte_gestion`.

### 3. Scheduled Tasks
- **Productivity Report** (`Solidario_ReporteProductividad.json`): Runs Mon-Sat at 9 PM to populate `solidario_reporte_productividad`, export XLSX files, upload to SFTP, and optionally download audio recordings.
- **Audio Backup**: Downloads daily call recordings from VAPI and transfers them to an FTP server.

### 4. Productivity Report Workflow (`Solidario_ReporteProductividad.json`)

**Structure:**
```
Cron 21h → CONFIG INICIAL → UPSERT PRODUCTIVIDAD → COLAPSAR → CONSULTA PROD → XLSX → SFTP
                                                                              ↓
                                                          CONSULTA GESTION ← XLSX GEST ← SFTP GEST
                                                                              ↓
                                                                       RESUMEN EJECUCION
                                                                              ↓
                                                                   IF: EJECUTAR DESCARGA?
                                                                     ↙ true         ↘ false
                                                          CREAR BINARIO .KEEP      FIN (NoOp)
                                                                     ↓
                                                          CREAR CARPETA SFTP
                                                                     ↓
                                                          LISTAR SFTP LLAMADAS
                                                                     ↓
                                                          EXTRAER IDS DESCARGADOS
                                                                     ↓
                                                          LISTAR IDS VAPI
                                                                 ↓
                                                          SPLIT → GET VAPI → EXTRAER URL → TIENE AUDIO?
                                                            ↑                                       ↓ true
                                                            └── ESPERAR 10s ←── SFTP AUDIO ←── DESCARGAR MP3
```

**CONFIG INICIAL variables** (edit in the node before execution):
- `MODO_FECHA`: `'HOY'` or `'FECHA_ESPECIFICA'`
- `FECHA_ESPECIFICA`: date string (only used if `MODO_FECHA = 'FECHA_ESPECIFICA'`)
- `EJECUTAR_DESCARGA`: `true` / `false` — enables/disables the audio download branch
- `VAPI_API_KEY`, `VAPI_ASSISTANT_PREVENTIVA`, `VAPI_ASSISTANT_COBROS`: VAPI credentials

**Key SQL formulas** (in UPSERT PRODUCTIVIDAD node):
| Metric | Formula |
|---|---|
| `gestiones_realizadas` | `COUNT(*) FILTER (WHERE contactoalo IS NOT NULL AND btrim(contactoalo) != '')` |
| `contactos_directos` | `COUNT(*) FILTER (WHERE contactoefectivo = 'Si')` |
| `compromisos_de_pago_generados` | `COUNT(*) FILTER (WHERE aceptacion = 'Si')` |
| `clientes_gestionados` | `COUNT(DISTINCT cedula) FILTER (WHERE contactoalo IS NOT NULL AND btrim(contactoalo) != '')` |
| `numero_clientes_recuperados` | `COUNT(DISTINCT cedula) FILTER (WHERE aceptacion = 'Si')` |

**Audio download resume**: Before downloading, the workflow creates a `.keep` file to ensure the SFTP folder exists, then lists already-downloaded call IDs to skip them on subsequent runs.

## Development Protocol for AI Agents
- **Code Style**: Follow existing patterns in `app.js` and n8n JavaScript nodes. No comments unless asked. No external dependencies.
- **Dashboard**: Vanilla JS only. Changes in `dashboard/index.html`, then copy to n8n node for deployment.
- **Database Changes**: Always check existing column names before adding new ones. See SPECS.md for full data model.
- **Supabase Limits**: Never assume `.limit(50000)` works — use pagination with `.range()` for queries that may exceed 1000 rows.
- **Date Ranges**: Always clamp to max 4 days via `clampTo4Days()`.
- **Deployment**: Changes to n8n workflows should be tested in `testMode` before production.
- **Vapi Mapping**: When updating the webhook logic, ensure the mapping handles the various possible locations of `structuredOutputs` in the VAPI payload.
