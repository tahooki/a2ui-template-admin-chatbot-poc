const baseUrl = process.env.A2UI_E2E_BASE_URL || "http://localhost:3001";

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function readSse(response) {
  expect(response.ok, `request returned ${response.status}`);
  expect(response.body, "response must include a stream body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = block.match(/^event:\s*(.+)$/m)?.[1];
      const data = block.match(/^data:\s*(.+)$/m)?.[1];
      if (event && data) events.push({ event, data: JSON.parse(data) });
      boundary = buffer.indexOf("\n\n");
    }
  }
  return events;
}

async function main() {
  console.log(`[info] proxy flow E2E base=${baseUrl}`);
  const chatEvents = await readSse(await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "work-items API 데이터를 보여줘" }),
  }));

  const eventNames = chatEvents.map((item) => item.event);
  expect(eventNames.includes("text"), "chat stream must include text");
  expect(eventNames.includes("display_options"), "chat stream must include display_options");
  expect(!eventNames.includes("data_result"), "Proxy must not expose Main Agent data_result to the browser");
  expect(!eventNames.includes("surface"), "Proxy must wait for user selection before returning a Surface");

  const displayOptions = chatEvents.find((item) => item.event === "display_options")?.data;
  expect(typeof displayOptions?.selectionId === "string", "display_options must include selectionId");
  expect(Array.isArray(displayOptions?.options) && displayOptions.options.length > 0, "display_options must include options");
  const selected = displayOptions.options.find((option) => option.recommended) ?? displayOptions.options[0];

  const selectionEvents = await readSse(await fetch(`${baseUrl}/api/chat/display-selection`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      selectionId: displayOptions.selectionId,
      templateId: selected.templateId,
    }),
  }));
  const surface = selectionEvents.find((item) => item.event === "surface")?.data;
  expect(surface?.templateId === selected.templateId, "selected Surface must match the chosen template");
  expect(selectionEvents.some((item) => item.event === "done" && item.data.mode === "render_surface"), "selection stream must complete with render_surface");

  console.log(`[ok] Proxy kept data_result server-side and rendered selected template=${selected.templateId}`);
}

main().catch((error) => {
  console.error(`[fail] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
