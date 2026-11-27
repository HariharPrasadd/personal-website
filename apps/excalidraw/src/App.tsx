import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CaptureUpdateAction,
  Excalidraw,
  getCommonBounds,
  useHandleLibrary,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import type { LibraryPersistenceAdapter } from "@excalidraw/excalidraw/data/library";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import {
  ArrowClockwise,
  BracketsCurly,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  Check,
  FilePlus,
  FloppyDisk,
  PencilSimple,
  Trash,
  X,
} from "@phosphor-icons/react";
import { api, ApiError } from "./api";
import { isMermaidDefinition, prepareMermaid, renderMermaidPreview, type PreparedMermaid } from "./mermaid";
import type { BoardScene, BoardSummary } from "./types";

type SaveState = "idle" | "saving" | "saved" | "error";
type MermaidSelection = { id: string; source: string };

// The library is shared by every drawing, so it is persisted separately from scenes.
// Excalidraw diffs each change against a fresh `load` before calling `save`, which
// keeps imports from several tabs from overwriting each other.
const libraryAdapter: LibraryPersistenceAdapter = {
  load: async () => ({ libraryItems: await api.getLibrary() }),
  save: async ({ libraryItems }) => api.saveLibrary(libraryItems),
};

const MERMAID_EXAMPLE = `flowchart LR
  Browser --> API
  API --> Database`;

function MermaidDialog({
  initialSource,
  isEditing,
  onClose,
  onDetach,
  onInsert,
}: {
  initialSource: string;
  isEditing: boolean;
  onClose: () => void;
  onDetach?: () => void;
  onInsert: (source: string, prepared: PreparedMermaid) => void;
}) {
  const [source, setSource] = useState(initialSource);
  const [previewSvg, setPreviewSvg] = useState("");
  const [prepared, setPrepared] = useState<PreparedMermaid | null>(null);
  const [error, setError] = useState("");
  const [isParsing, setIsParsing] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setPrepared(null);
    setError("");

    if (!source.trim()) {
      setPreviewSvg("");
      setIsParsing(false);
      return undefined;
    }

    setIsParsing(true);
    // Debounce parsing so normal typing does not repeatedly lay out the whole diagram.
    const timer = window.setTimeout(async () => {
      try {
        const nextPrepared = await prepareMermaid(source);
        if (cancelled) return;
        // Preview the converted Excalidraw elements themselves, not Mermaid's SVG,
        // so what is shown is exactly what Insert will place on the canvas.
        const svg = await renderMermaidPreview(nextPrepared);
        if (cancelled) return;
        setPrepared(nextPrepared);
        setPreviewSvg(svg);
        setError("");
      } catch (parseError) {
        if (!cancelled) {
          setPreviewSvg("");
          setError(parseError instanceof Error ? parseError.message : "Could not parse this diagram.");
        }
      } finally {
        if (!cancelled) setIsParsing(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [source]);

  return (
    <div className="mermaid-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="mermaid-dialog" role="dialog" aria-modal="true" aria-labelledby="mermaid-title">
        <header className="mermaid-dialog-header">
          <div>
            <h2 id="mermaid-title">{isEditing ? "Edit Mermaid" : "Insert Mermaid"}</h2>
            <p>{isEditing ? "Updating replaces manual changes inside this generated group." : "The result is inserted as editable Excalidraw elements."}</p>
          </div>
          <button className="collapse-button" onClick={onClose} aria-label="Close Mermaid editor"><X /></button>
        </header>

        <div className="mermaid-dialog-body">
          <label className="mermaid-source">
            <span>Mermaid</span>
            <textarea
              value={source}
              onChange={(event) => setSource(event.target.value)}
              autoFocus
              spellCheck={false}
            />
          </label>
          <div className="mermaid-preview" aria-live="polite">
            <span>
              {prepared
                ? prepared.isImageFallback
                  ? "Preview · inserted as an image (this diagram type has no editable shapes)"
                  : `Preview · ${prepared.elements.length} elements`
                : "Preview"}
            </span>
            <div className={`mermaid-preview-stage ${isParsing && previewSvg ? "is-updating" : ""}`}>
              {error && !isParsing ? (
                <p className="mermaid-error">{error}</p>
              ) : previewSvg ? (
                <div
                  className="mermaid-preview-svg"
                  role="img"
                  aria-label="Mermaid diagram preview"
                  dangerouslySetInnerHTML={{ __html: previewSvg }}
                />
              ) : isParsing ? (
                <div className="mermaid-preview-loading" />
              ) : (
                <p>Enter a Mermaid diagram.</p>
              )}
            </div>
          </div>
        </div>

        <footer className="mermaid-dialog-footer">
          {isEditing && onDetach && <button className="text-button" onClick={onDetach}>Detach</button>}
          <div>
            <button className="text-button" onClick={onClose}>Cancel</button>
            <button
              className="solid-button"
              onClick={() => prepared && onInsert(source, prepared)}
              disabled={!prepared || prepared.elements.length === 0 || isParsing}
            >
              {isEditing ? "Update" : "Insert"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    try {
      await api.login(password);
      onSuccess();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Could not sign in.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="login-shell">
      <form className="login-form" onSubmit={submit}>
        <label htmlFor="password">Enter password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          autoFocus
          required
        />
        {error && <p className="form-error">{error}</p>}
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Opening…" : "Enter"}
        </button>
      </form>
    </main>
  );
}

function SaveStatus({ state }: { state: SaveState }) {
  const details = {
    idle: [<FloppyDisk key="icon" />, "Ready"],
    saving: [<ArrowClockwise key="icon" className="spin" />, "Saving"],
    saved: [<Check key="icon" />, "Saved"],
    error: [<FloppyDisk key="icon" />, "Save failed"],
  } satisfies Record<SaveState, [React.ReactNode, string]>;

  return <span className={`save-status ${state}`}>{details[state]}</span>;
}

function Workspace() {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [scene, setScene] = useState<BoardScene | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  // Let the editor occupy the full viewport without hiding access to either navigation area.
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isHeaderOpen, setIsHeaderOpen] = useState(true);
  const [isMermaidOpen, setIsMermaidOpen] = useState(false);
  const [selectedMermaid, setSelectedMermaid] = useState<MermaidSelection | null>(null);
  const saveTimer = useRef<number | null>(null);
  const didLoadScene = useRef(false);
  const lastSceneSignature = useRef("");
  const excalidrawApi = useRef<ExcalidrawImperativeAPI | null>(null);
  // The library hook needs the editor API as state so it reloads when a drawing remounts the editor.
  const [editorApi, setEditorApi] = useState<ExcalidrawImperativeAPI | null>(null);

  useHandleLibrary({ excalidrawAPI: editorApi, adapter: libraryAdapter });

  const activeBoard = useMemo(
    () => boards.find((board) => board.id === activeId) ?? null,
    [activeId, boards],
  );

  const loadBoards = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const nextBoards = await api.listBoards();
      setBoards(nextBoards);
      setActiveId((current) => current ?? nextBoards[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load drawings.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBoards();
  }, [loadBoards]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "m") {
        event.preventDefault();
        setIsMermaidOpen(true);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (!activeId) {
      setScene(null);
      return;
    }

    let cancelled = false;
    didLoadScene.current = false;
    setScene(null);
    setError("");
    api.getScene(activeId)
      .then((nextScene) => {
        if (!cancelled) {
          setScene(nextScene);
          lastSceneSignature.current = JSON.stringify(nextScene);
          didLoadScene.current = true;
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load the drawing.");
        }
      });

    return () => {
      cancelled = true;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [activeId]);

  const createBoard = async () => {
    const name = window.prompt("Name this drawing", "Untitled drawing")?.trim();
    if (!name) return;
    const board = await api.createBoard(name);
    setBoards((current) => [board, ...current]);
    setActiveId(board.id);
  };

  const renameBoard = async (board: BoardSummary) => {
    const name = window.prompt("Rename drawing", board.name)?.trim();
    if (!name || name === board.name) return;
    const updated = await api.renameBoard(board.id, name);
    setBoards((current) => current.map((item) => (item.id === board.id ? updated : item)));
  };

  const deleteBoard = async (board: BoardSummary) => {
    if (!window.confirm(`Move “${board.name}” to the trash?`)) return;
    await api.deleteBoard(board.id);
    const remaining = boards.filter((item) => item.id !== board.id);
    setBoards(remaining);
    if (activeId === board.id) setActiveId(remaining[0]?.id ?? null);
  };

  const onChange = (
    elements: readonly ExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    if (!activeId || !didLoadScene.current) return;

    // Surface Mermaid editing only when the current selection belongs to one generated diagram.
    const selectedIds = new Set(Object.keys(appState.selectedElementIds));
    const diagramIds = new Set(elements
      .filter((element) => selectedIds.has(element.id))
      .map((element) => element.customData?.mermaidDiagramId)
      .filter((id): id is string => typeof id === "string"));
    const diagramId = diagramIds.size === 1 ? [...diagramIds][0] : null;
    const sourceElement = diagramId
      ? elements.find((element) => element.customData?.mermaidDiagramId === diagramId && typeof element.customData?.mermaidSource === "string")
      : null;
    const nextSelection = diagramId && sourceElement
      ? { id: diagramId, source: sourceElement.customData!.mermaidSource as string }
      : null;
    setSelectedMermaid((current) => (
      current?.id === nextSelection?.id && current?.source === nextSelection?.source
        ? current
        : nextSelection
    ));

    const nextScene: BoardScene = {
      elements,
      appState: {
        viewBackgroundColor: appState.viewBackgroundColor,
        currentItemFontFamily: appState.currentItemFontFamily,
        currentItemFontSize: appState.currentItemFontSize,
        currentItemRoughness: appState.currentItemRoughness,
        currentItemStrokeColor: appState.currentItemStrokeColor,
        currentItemBackgroundColor: appState.currentItemBackgroundColor,
      },
      files,
    };
    const signature = JSON.stringify(nextScene);
    if (signature === lastSceneSignature.current) return;

    // Record this version immediately so state-driven rerenders do not queue duplicate writes.
    lastSceneSignature.current = signature;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setSaveState("saving");

    // Debounce the high-frequency editor updates into compact persistence writes.
    saveTimer.current = window.setTimeout(async () => {
      try {
        await api.saveScene(activeId, nextScene);
        setSaveState("saved");
        setBoards((current) => current.map((board) => (
          board.id === activeId ? { ...board, updatedAt: new Date().toISOString() } : board
        )));
      } catch {
        setSaveState("error");
      }
    }, 900);
  };

  const openMermaidFromPaste = (text?: string) => {
    if (!text || !isMermaidDefinition(text)) return true;
    setSelectedMermaid({ id: "", source: text.trim() });
    setIsMermaidOpen(true);
    return false;
  };

  const applyMermaid = (source: string, prepared: PreparedMermaid) => {
    const editor = excalidrawApi.current;
    if (!editor) return;

    const existing = editor.getSceneElementsIncludingDeleted();
    const editingId = selectedMermaid?.id || null;
    const diagramId = editingId ?? crypto.randomUUID();
    const priorElements = editingId
      ? existing.filter((element) => !element.isDeleted && element.customData?.mermaidDiagramId === editingId)
      : [];
    const [sourceMinX, sourceMinY, sourceMaxX, sourceMaxY] = getCommonBounds(prepared.elements);

    let targetCenter: { x: number; y: number };
    if (priorElements.length) {
      const [minX, minY, maxX, maxY] = getCommonBounds(priorElements);
      targetCenter = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    } else {
      const appState = editor.getAppState();
      targetCenter = viewportCoordsToSceneCoords({
        clientX: appState.offsetLeft + appState.width / 2,
        clientY: appState.offsetTop + appState.height / 2,
      }, appState);
    }

    const offsetX = targetCenter.x - (sourceMinX + sourceMaxX) / 2;
    const offsetY = targetCenter.y - (sourceMinY + sourceMaxY) / 2;
    const generatedElements = prepared.elements.map((element, index) => ({
      ...element,
      x: element.x + offsetX,
      y: element.y + offsetY,
      groupIds: [...element.groupIds, diagramId],
      customData: {
        ...element.customData,
        mermaidDiagramId: diagramId,
        ...(index === 0 ? { mermaidSource: source } : {}),
      },
    }));
    const generatedIds = Object.fromEntries(
      generatedElements.map((element) => [element.id, true as const]),
    );
    const remainingElements = editingId
      ? existing.filter((element) => element.customData?.mermaidDiagramId !== editingId)
      : existing;

    if (Object.keys(prepared.files).length) editor.addFiles(Object.values(prepared.files));
    editor.updateScene({
      elements: [...remainingElements, ...generatedElements],
      appState: { selectedElementIds: generatedIds },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    editor.setActiveTool({ type: "selection" });
    setSelectedMermaid({ id: diagramId, source });
    setIsMermaidOpen(false);
  };

  const detachMermaid = () => {
    const editor = excalidrawApi.current;
    if (!editor || !selectedMermaid?.id) return;
    const nextElements = editor.getSceneElementsIncludingDeleted().map((element) => {
      if (element.customData?.mermaidDiagramId !== selectedMermaid.id) return element;
      const { mermaidDiagramId: _diagramId, mermaidSource: _source, ...remainingData } = element.customData;
      return {
        ...element,
        customData: Object.keys(remainingData).length ? remainingData : undefined,
      };
    });
    editor.updateScene({ elements: nextElements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    setSelectedMermaid(null);
    setIsMermaidOpen(false);
  };

  if (isLoading) {
    return <div className="loading-screen"><div className="skeleton-line" /><div className="skeleton-canvas" /></div>;
  }

  return (
    <main className={`workspace ${isSidebarOpen ? "" : "sidebar-collapsed"}`}>
      <aside className="sidebar">
        <button
          className="collapse-button sidebar-toggle"
          onClick={() => setIsSidebarOpen((current) => !current)}
          aria-expanded={isSidebarOpen}
          aria-label={isSidebarOpen ? "Collapse drawings sidebar" : "Expand drawings sidebar"}
          title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {isSidebarOpen ? <CaretLeft /> : <CaretRight />}
        </button>
        <div className="brand-row">
          <h1>Drawings</h1>
          <button className="icon-button primary" onClick={() => void createBoard()} aria-label="New drawing">
            <FilePlus />
          </button>
        </div>

        <div className="board-list" aria-label="Saved drawings">
          {boards.length === 0 ? (
            <button className="empty-state" onClick={() => void createBoard()}>
              <FilePlus />
              <strong>Create your first drawing</strong>
              <span>It will save automatically.</span>
            </button>
          ) : boards.map((board) => (
            <div className={`board-row ${board.id === activeId ? "active" : ""}`} key={board.id}>
              <button className="board-select" onClick={() => setActiveId(board.id)}>
                <strong>{board.name}</strong>
                <span>{new Date(board.updatedAt).toLocaleDateString()}</span>
              </button>
              <div className="board-actions">
                <button onClick={() => void renameBoard(board)} aria-label={`Rename ${board.name}`}><PencilSimple /></button>
                <button onClick={() => void deleteBoard(board)} aria-label={`Delete ${board.name}`}><Trash /></button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <section className={`editor-shell ${isHeaderOpen ? "" : "header-collapsed"}`}>
        <header className="editor-header" aria-hidden={!isHeaderOpen}>
          <strong>{activeBoard?.name ?? "No drawing selected"}</strong>
          <div className="header-actions">
            {activeBoard && (
              <button className="mermaid-trigger" onClick={() => setIsMermaidOpen(true)} title="Insert Mermaid (Cmd/Ctrl+Shift+M)">
                <BracketsCurly />
                <span>{selectedMermaid?.id ? "Edit Mermaid" : "Mermaid"}</span>
              </button>
            )}
            {activeBoard && <SaveStatus state={saveState} />}
            <button
              className="collapse-button"
              onClick={() => setIsHeaderOpen(false)}
              aria-label="Collapse top bar"
              title="Collapse top bar"
            >
              <CaretUp />
            </button>
          </div>
        </header>
        <div className="canvas-wrap">
          {!isHeaderOpen && (
            <button
              className="collapse-button header-toggle"
              onClick={() => setIsHeaderOpen(true)}
              aria-label="Expand top bar"
              title="Expand top bar"
            >
              <CaretDown />
            </button>
          )}
          {error ? (
            <div className="inline-error">
              <p>{error}</p>
              <button onClick={() => void loadBoards()}>Try again</button>
            </div>
          ) : activeId && scene ? (
            <Excalidraw
              key={activeId}
              initialData={scene}
              onChange={onChange}
              onPaste={(data) => openMermaidFromPaste(data.text)}
              excalidrawAPI={(editor) => {
                excalidrawApi.current = editor;
                setEditorApi(editor);
              }}
            />
          ) : activeId ? (
            <div className="canvas-loading"><div className="skeleton-canvas" /></div>
          ) : (
            <div className="canvas-empty"><FilePlus /><p>Create a drawing to begin.</p></div>
          )}
        </div>
      </section>
      {isMermaidOpen && (
        <MermaidDialog
          initialSource={selectedMermaid?.source || MERMAID_EXAMPLE}
          isEditing={Boolean(selectedMermaid?.id)}
          onClose={() => {
            setIsMermaidOpen(false);
            if (!selectedMermaid?.id) setSelectedMermaid(null);
          }}
          onDetach={selectedMermaid?.id ? detachMermaid : undefined}
          onInsert={applyMermaid}
        />
      )}
    </main>
  );
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    api.listBoards()
      .then(() => setAuthenticated(true))
      .catch((error) => setAuthenticated(!(error instanceof ApiError && error.status === 401)))
      .finally(() => setAuthChecked(true));
  }, []);

  if (!authChecked) return <div className="loading-screen"><div className="skeleton-canvas" /></div>;
  if (!authenticated) return <Login onSuccess={() => setAuthenticated(true)} />;
  return <Workspace />;
}
