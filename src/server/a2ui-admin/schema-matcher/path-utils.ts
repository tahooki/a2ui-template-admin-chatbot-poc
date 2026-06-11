export function canonicalPath(path: string) {
  return path.replace(/\[\]/g, "");
}

export function rendererPath(path: string) {
  if (path.startsWith("items.") && !path.startsWith("items[].")) {
    return path.replace(/^items\./, "items[].");
  }
  return path;
}

export function pathKey(path: string) {
  return canonicalPath(path).split(".").pop() ?? canonicalPath(path);
}

export function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9가-힣]+/gi, "");
}

export function textMatches(value: string, terms: string[] = []) {
  const normalizedValue = normalizeText(value);
  return terms.filter((term) => normalizedValue.includes(normalizeText(term))).length;
}
