# Agente IA de Voz para Cobranzas

Sistema automatizado de voz impulsado por inteligencia artificial para la gestión de cobranzas y comunicación preventiva con clientes.

## ¿Qué hace?

El agente realiza llamadas telefónicas automáticas utilizando IA conversacional para contactar clientes, negociar compromisos de pago y dar seguimiento a cuentas. Todo el proceso es orquestado de forma autónoma — desde la selección del siguiente cliente a llamar hasta el registro de resultados y la generación de reportes.

```
┌─────────────┐     ┌──────────┐     ┌───────────────┐
│  n8n        │────▶│  VAPI    │────▶│  Supabase     │
│  orquestador│     │  voz IA  │     │  datos/logs   │
└─────────────┘     └──────────┘     └───────────────┘
       │                                    │
       │                                    ▼
       │                           ┌───────────────┐
       └──────────────────────────▶│  Dashboard BI │
                                   │  + Reportes   │
                                   └───────────────┘
```

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Orquestación | [n8n](https://n8n.io/) — automatización de flujos |
| Voz IA | [VAPI](https://vapi.ai/) — llamadas con inteligencia artificial |
| Base de datos | [Supabase](https://supabase.com/) — PostgreSQL + API |
| Dashboard | HTML5 + Chart.js + Flatpickr (vanilla JS) |
| Reportes | XLSX + SFTP |

## Características principales

- **Llamadas automáticas con IA**: conversaciones naturales con clientes, detección de sentimiento, resúmenes y transcripciones
- **Dashboard en tiempo real**: KPIs de gestión, gráficos de cobertura y efectividad por día, producto y estrategia
- **Reportes diarios**: generación automática de archivos Excel con métricas operativas, exportados vía SFTP
- **Descarga de audios**: respaldo automático de grabaciones de llamadas
- **Priorización inteligente**: modos configurables para enfocar la marcación en segmentos específicos
- **Monitoreo de cobertura**: indicadores de barrido de base, contacto efectivo y distribución de intentos

## Estructura del proyecto

```
bancosolidario/
├── dashboard/              # Panel de control BI
│   └── index.html
├── upload_database/        # Cargador de datos CSV/XLSX/TXT
│   └── app.js
├── flujo_n8n/              # Workflows de automatización
│   ├── Solidario_Cobros_Llamadas.json
│   ├── Solidario_Cobros_CierreLlamadas.json
│   └── Solidario_ReporteProductividad.json
├── AGENTS.md               # Guía para agentes de IA
├── SPECS.md                # Especificación técnica completa
└── README.md
```
