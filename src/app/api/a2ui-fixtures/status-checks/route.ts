import { fixtureResponse } from "@/server/a2ui-fixtures/fixture-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return fixtureResponse("status-checks", request);
}
