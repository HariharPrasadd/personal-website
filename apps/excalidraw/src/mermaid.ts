import { convertToExcalidrawElements, exportToSvg } from "@excalidraw/excalidraw";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";

export type PreparedMermaid = {
  elements: ReturnType<typeof convertToExcalidrawElements>;
  files: BinaryFiles;
  /** Diagram types without a native converter arrive as one embedded image. */
  isImageFallback: boolean;
};

const DIAGRAM_KEYWORDS = [
  "flowchart", "graph", "sequenceDiagram", "classDiagram(?:-v2)?", "stateDiagram(?:-v2)?",
  "erDiagram", "gantt", "timeline", "quadrantChart", "mindmap", "gitGraph", "journey", "pie",
  "requirementDiagram", "C4[A-Za-z]+", "kanban", "packet(?:-beta)?", "radar-beta",
  "architecture-beta", "block-beta", "sankey-beta", "xychart-beta", "treemap(?:-beta)?",
];
const DIAGRAM_START = new RegExp(`^(?:${DIAGRAM_KEYWORDS.join("|")})(?:\\s|$)`);

/** Strips leading front matter, %% comments and %%{init}%% directives before checking the type. */
export function isMermaidDefinition(value: string) {
  const body = value
    .trim()
    .replace(/^---\n[\s\S]*?\n---\s*/, "")
    .replace(/^(?:\s*%%.*(?:\n|$))*/, "")
    .trim();
  return DIAGRAM_START.test(body);
}

// mermaid-to-excalidraw emits the newer `cardinality_*` arrowheads for ER diagrams, which
// Excalidraw 0.18 does not know. Map them onto the crow's-foot heads that it does support.
const ARROWHEAD_FALLBACKS: Record<string, string | null> = {
  cardinality_one: "crowfoot_one",
  cardinality_exactly_one: "crowfoot_one",
  cardinality_zero_or_one: "crowfoot_one",
  cardinality_many: "crowfoot_many",
  cardinality_zero_or_many: "crowfoot_many",
  cardinality_one_or_many: "crowfoot_one_or_many",
};
const SUPPORTED_ARROWHEADS = new Set([
  "arrow", "bar", "dot", "circle", "circle_outline", "triangle", "triangle_outline",
  "diamond", "diamond_outline", "crowfoot_one", "crowfoot_many", "crowfoot_one_or_many",
]);

function normalizeArrowhead(value: unknown) {
  if (value == null) return value;
  if (typeof value !== "string") return null;
  if (SUPPORTED_ARROWHEADS.has(value)) return value;
  return ARROWHEAD_FALLBACKS[value] ?? null;
}

export async function prepareMermaid(source: string): Promise<PreparedMermaid> {
  const result = await parseMermaidToExcalidraw(source, {
    themeVariables: { fontSize: "18px" },
    maxEdges: 500,
    maxTextSize: 50000,
  });
  const skeletons = result.elements.map((element) => {
    if (!("startArrowhead" in element) && !("endArrowhead" in element)) return element;
    const arrow = element as typeof element & { startArrowhead?: unknown; endArrowhead?: unknown };
    return {
      ...arrow,
      startArrowhead: normalizeArrowhead(arrow.startArrowhead),
      endArrowhead: normalizeArrowhead(arrow.endArrowhead),
    } as typeof element;
  });
  const elements = convertToExcalidrawElements(skeletons, { regenerateIds: true });
  const files = (result.files ?? {}) as BinaryFiles;
  return {
    elements,
    files,
    isImageFallback: elements.length === 1 && elements[0].type === "image",
  };
}

/** Renders the exact elements that will be inserted, so the preview can never drift from the result. */
export async function renderMermaidPreview(prepared: PreparedMermaid): Promise<string> {
  const svg = await exportToSvg({
    elements: prepared.elements,
    files: prepared.files,
    appState: { exportBackground: true, viewBackgroundColor: "#ffffff", exportWithDarkMode: false },
    exportPadding: 16,
  });
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  return new XMLSerializer().serializeToString(svg);
}
