const proxyAgentUrl = (process.env.A2UI_E2E_PROXY_AGENT_URL || "http://localhost:8200").replace(/\/+$/, "");

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
  console.log(`[info] direct Proxy flow E2E base=${proxyAgentUrl}`);
  const generalEvents = await readSse(await fetch(`${proxyAgentUrl}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "안녕, 오늘 기분 어때?",
      presentationMode: "text",
    }),
  }));
  const generalText = generalEvents
    .filter((item) => item.event === "text")
    .map((item) => item.data.text)
    .join("");
  expect(generalText.length > 0, "general conversation must return text");
  expect(
    !generalEvents.some((item) => item.event === "display_options"),
    "general conversation must not enter A2UI",
  );

  const textEvents = await readSse(await fetch(`${proxyAgentUrl}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "워크 아이템 목록을 요약해줘",
      presentationMode: "text",
      history: [
        { role: "user", content: "안녕, 오늘 기분 어때?" },
        { role: "assistant", content: generalText },
      ],
    }),
  }));
  const textEventNames = textEvents.map((item) => item.event);
  const summaryText = textEvents
    .filter((item) => item.event === "text")
    .map((item) => item.data.text)
    .join("");
  expect(summaryText.includes("워크 아이템"), "text mode must identify the work-items list");
  expect(
    summaryText !== "워크 아이템 목 데이터를 불러왔습니다. 총 8건입니다.",
    "text mode must return an LLM summary instead of the old fixed message",
  );
  expect(!textEventNames.includes("data_result"), "text mode must not expose data_result");
  expect(!textEventNames.includes("display_options"), "text mode must not include display_options");
  expect(!textEventNames.includes("surface"), "text mode must not include a Surface");
  expect(
    textEvents.some((item) => item.event === "done" && item.data.mode === "text"),
    "text mode must complete without A2UI",
  );

  const chatEvents = await readSse(await fetch(`${proxyAgentUrl}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "워크 아이템을 표로 보여줘",
      presentationMode: "a2ui",
      history: [
        { role: "user", content: "안녕, 오늘 기분 어때?" },
        { role: "assistant", content: generalText },
        { role: "user", content: "워크 아이템 목록을 요약해줘" },
        { role: "assistant", content: summaryText },
      ],
    }),
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

  const selectionEvents = await readSse(await fetch(`${proxyAgentUrl}/display-selection/stream`, {
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
  console.log(
    `[ok] general -> text summary -> A2UI rendered template=${selected.templateId}`,
  );
}

main().catch((error) => {
  console.error(`[fail] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
