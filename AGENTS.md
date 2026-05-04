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
The primary table for managing the calling queue and contact state.
- `num_operacion` (PK): Unique operation identifier.
- `estado_flujo`: Current status (`PENDIENTE`, `EN_PROCESO`, `REINTENTAR`, `FINALIZADO`).
- `agente_tipo`: `PREVENTIVA` or `COBROS`.
- `telefono_index`: Index for selecting the next available phone number.
- `intentos_llamada`: Counter for call attempts.
- `win_tries`: Counter for successful contact attempts.
- `fecha_vencimiento`: Due date for the payment.
- `monto`: Outstanding amount.
- `fecha_reagenda`: Scheduled date for the next attempt.

### `solidario_llamadas` (Call Logs)
Stores detailed logs of every interaction.
- `id_llamada`: Unique call identifier (from VAPI).
- `num_operacion`: Reference to the contact.
- `resumen_llamada`: AI-generated summary (extracted from VAPI `structuredOutputs`).
- `transcripcion_llamada`: Full transcript.
- `sentimiento`: Sentiment analysis result.
- `duracion_llamada`: Duration in seconds.
- `link_audio_vapi`: URL to the call recording.

### `solidario_reporte_gestion` (Operational Reports)
Transactional table for real-time management tracking.

### `solidario_reporte_productividad` (Productivity Reports)
Aggregated data for performance analysis, updated via scheduled task.

## Workflows & Business Logic

### 1. Outbound Calling (`Solidario_Cobros_Llamadas`)
- **Trigger**: Scheduled interval (e.g., every 20-60 seconds).
- **Selection Logic**:
    - Selects records where `estado_flujo` is `PENDIENTE` or `REINTENTAR`.
    - Also handles `FINALIZADO` records if the `fecha_vencimiento` is today.
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
- **Productivity Report**: Runs Mon-Sat at 9 PM to populate `solidario_reporte_productividad`.
- **Audio Backup**: Downloads daily call recordings and transfers them to an FTP server.

## Dashboard
- **Implementation**: A single-page application (`index.html`) using Chart.js and standard web technologies.
- **Deployment**: The code is embedded within an n8n node to be served via a public URL.
- **Update Protocol**:
    1. Modify `dashboard/index.html`.
    2. Verify changes.
    3. Copy updated HTML into the corresponding n8n node.

## Development Protocol for AI Agents
- **Code Style**: Follow existing patterns in `app.js` (upload tool) and n8n JavaScript nodes.
- **Database Changes**: Always check existing column names in `solidario_registros` before adding new ones.
- **Deployment**: Changes to n8n workflows should be tested in `testMode` before production.
- **Vapi Mapping**: When updating the webhook logic, ensure the mapping handles the various possible locations of `structuredOutputs` in the VAPI payload.
