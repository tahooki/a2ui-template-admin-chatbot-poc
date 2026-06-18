import { buildEquipmentCatalog, buildEquipmentStatus } from "./equipment-test-data";

type EquipmentSource = "catalog" | "status";

const sourceEnvByType: Record<EquipmentSource, string[]> = {
  catalog: ["A2UI_EQUIPMENT_CATALOG_API_URL", "EQUIPMENT_CATALOG_API_URL"],
  status: ["A2UI_EQUIPMENT_STATUS_API_URL", "EQUIPMENT_STATUS_API_URL"],
};

function readSourceUrl(source: EquipmentSource) {
  const envNames = sourceEnvByType[source];
  const value = envNames.map((name) => process.env[name]).find(Boolean);
  return {
    envNames,
    value,
  };
}

function appendRequestSearchParams(target: URL, request: Request) {
  const requestUrl = new URL(request.url);
  for (const [key, value] of requestUrl.searchParams.entries()) {
    if (!target.searchParams.has(key)) {
      target.searchParams.set(key, value);
    }
  }
}

function pageOptionsFromRequest(request: Request) {
  const requestUrl = new URL(request.url);
  const page = Number(requestUrl.searchParams.get("page") ?? 1);
  const pageSize = Number(requestUrl.searchParams.get("pageSize") ?? 44);
  return {
    page: Number.isFinite(page) ? page : 1,
    pageSize: Number.isFinite(pageSize) ? pageSize : 44,
  };
}

function localEquipmentData(source: EquipmentSource, request: Request) {
  const options = pageOptionsFromRequest(request);
  return source === "catalog" ? buildEquipmentCatalog(options) : buildEquipmentStatus(options);
}

function shouldFallbackToFixture(target: URL) {
  return target.hostname === "localhost" || target.hostname === "127.0.0.1" || target.hostname === "::1";
}

export async function proxyEquipmentData(source: EquipmentSource, request: Request) {
  const { envNames, value } = readSourceUrl(source);
  if (!value) {
    return Response.json(localEquipmentData(source, request));
  }

  let target: URL;
  try {
    target = new URL(value);
  } catch {
    return Response.json(
      {
        error: "equipment_api_invalid_url",
        message: "Equipment data source URL must be an absolute URL.",
        requiredEnv: envNames,
      },
      { status: 500 },
    );
  }

  appendRequestSearchParams(target, request);

  try {
    const response = await fetch(target, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) {
      const details = await response.text().catch(() => "");
      if (shouldFallbackToFixture(target)) return Response.json(localEquipmentData(source, request));
      return Response.json(
        {
          error: "equipment_api_request_failed",
          message: "Equipment data source request failed.",
          status: response.status,
          details,
        },
        { status: 502 },
      );
    }

    const data = (await response.json()) as unknown;
    return Response.json(data);
  } catch (error) {
    if (shouldFallbackToFixture(target)) return Response.json(localEquipmentData(source, request));
    return Response.json(
      {
        error: "equipment_api_request_error",
        message: "Equipment data source request errored.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}
