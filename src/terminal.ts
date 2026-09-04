const MAX_DETAIL_LINES = 6;
const MAX_DETAIL_LENGTH = 800;

export function formatFindingDetail(detail?: string): string[] {
  if (!detail) return [];

  const normalized = detail.trim().slice(0, MAX_DETAIL_LENGTH);
  const lines = normalized.split("\n");
  const visible = lines.slice(0, MAX_DETAIL_LINES).map((line) => `    ${line}`);
  if (detail.length > MAX_DETAIL_LENGTH || lines.length > MAX_DETAIL_LINES) {
    visible.push("    … full detail is available in the HTML/JSON report");
  }
  return visible;
}
