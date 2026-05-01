import { ROUTES } from "./config";
import type { RouteState } from "../types/domain";

export function parseRoute(lastTab: string): { route: RouteState; nextLastTab: string } {
  const path = location.hash.replace(/^#/, "") || "/today";
  const parts = path.split("/").filter(Boolean);
  const name = parts[0] || "today";
  const id = parts[1] || null;
  const isDetail = name === "train" || name === "dictation";
  const knownTab = ROUTES.some((item) => item.id === name);
  const tab = isDetail ? lastTab : name;
  return {
    route: { name, id, path, tab, depth: isDetail ? 1 : 0 },
    nextLastTab: !isDetail && knownTab ? name : lastTab
  };
}

export function transitionDirection(previous: RouteState | null, next: RouteState, suppress: boolean): "none" | "forward" | "back" | "tab" {
  if (suppress) return "none";
  if (!previous) return "forward";
  if (next.depth > previous.depth) return "forward";
  if (next.depth < previous.depth) return "back";
  if (next.path !== previous.path) return "tab";
  return "none";
}
