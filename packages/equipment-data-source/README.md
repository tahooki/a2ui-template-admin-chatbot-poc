# A2UI Equipment Data Source

Optional standalone equipment data API used when the A2UI demo needs to proxy to an external-looking source.

The main POC does not require this server. The Next routes under `http://localhost:3001/api/equipment-*` serve local fixture data by default.

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

To force the Next status/catalog routes to proxy to this server, set:

```bash
A2UI_EQUIPMENT_STATUS_API_URL=http://localhost:8100/equipment-status
A2UI_EQUIPMENT_CATALOG_API_URL=http://localhost:8100/equipment-catalog
```

If these env values point at `localhost:8100` and this source is not running, the Next routes fall back to their local fixtures.
