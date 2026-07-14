import type { A2UISseEvent } from "./contracts";

export function parseA2UISseEvent(rawEvent: string): A2UISseEvent | null {
  const lines = rawEvent.split(/\r?\n/);
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }

  if (!dataLines.length) return null;
  try {
    const parsed = JSON.parse(dataLines.join("\n")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return { event, data: parsed as Record<string, unknown> };
  } catch {
    return null;
  }
}

function nextBoundary(buffer: string) {
  const match = /\r?\n\r?\n/.exec(buffer);
  if (!match || match.index === undefined) return null;
  return { index: match.index, length: match[0].length };
}

export async function consumeA2UISse(
  response: Response,
  onEvent: (event: A2UISseEvent) => void,
) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("A2UI stream is empty");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = nextBoundary(buffer);
    while (boundary) {
      const rawEvent = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary.length);
      const parsed = parseA2UISseEvent(rawEvent);
      if (parsed) onEvent(parsed);
      boundary = nextBoundary(buffer);
    }
  }

  buffer += decoder.decode();
  const parsed = parseA2UISseEvent(buffer.trim());
  if (parsed) onEvent(parsed);
}
