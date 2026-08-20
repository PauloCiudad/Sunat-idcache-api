# Arquitectura del Sistema
```txt
                     ┌──────────────────────┐
                     │        SUNAT         │
                     │                      │
                     │ Login     API Det.   │
                     └───▲──────────▲───────┘
                         │          │
                  Playwright      Axios
                         │          │
                         └────┬─────┘
                              │
                   ┌──────────▼──────────┐
                   │                     │
                   │    BACKEND NODE     │
                   │                     │
                   │ AuthService         │
                   │ SunatClient         │
                   │ SyncService         │
                   │ Repository          │
                   │ Logging             │
                   │ Retry               │
                   │                     │
                   └──────────┬──────────┘
                              │
                        node-oracledb
                              │
                   ┌──────────▼──────────┐
                   │       ORACLE        │
                   │                     │
                   │ DETRACCIONES        │
                   │ SUNAT_SYNC_LOG      │
                   │                     │
                   └─────────────────────┘
```