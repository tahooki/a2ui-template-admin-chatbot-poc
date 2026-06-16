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

export async function proxyEquipmentData(source: EquipmentSource, request: Request) {
  const { envNames, value } = readSourceUrl(source);
  if (!value) {
    return Response.json(
      {
        error: "equipment_api_not_configured",
        message: "Equipment data source is not configured.",
        requiredEnv: envNames,
      },
      { status: 503 },
    );
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
