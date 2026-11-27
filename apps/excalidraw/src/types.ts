import type {
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState,
  LibraryItems,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

export interface BoardSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface BoardScene extends ExcalidrawInitialDataState {
  elements: readonly ExcalidrawElement[];
  appState?: Partial<AppState>;
  files?: BinaryFiles;
}

export interface ApiResponse<T> {
  data: T;
}

export type WorkspaceLibrary = LibraryItems;
