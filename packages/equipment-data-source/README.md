# A2UI Equipment Data Source

Local equipment data API used by the A2UI agent demo.

Run from the repo root:

```bash
npm run equipment-source:dev
```

Endpoints:

```text
GET http://localhost:8100/health
GET http://localhost:8100/equipment-status?pageSize=44
GET http://localhost:8100/equipment-catalog?pageSize=44
```

The Next app reads these URLs through environment variables:

```bash
A2UI_EQUIPMENT_STATUS_API_URL=http://localhost:8100/equipment-status
A2UI_EQUIPMENT_CATALOG_API_URL=http://localhost:8100/equipment-catalog
```
