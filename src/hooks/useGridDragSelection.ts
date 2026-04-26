import { useState, useCallback, useEffect, useRef } from "react";

export type CellState = "can-do" | "cant-do" | "maybe" | "blank";
export type SelectMode = "auto" | "can-do" | "cant-do" | "maybe";

interface CellCoord {
  dayIndex: number;
  timeIndex: number;
}

interface SelectionBox {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

const DEAD_ZONE_PX = 8; // Pixels of movement before drag is activated

/**
 * Hook for managing grid drag-selection interactions.
 *
 * Handles:
 * - Click to cycle/set cell state
 * - Click and drag to create selection box
 * - Dead zone before drag activates
 * - Right-click / Esc to cancel
 * - Auto mode cycling vs explicit mode setting
 */
export function useGridDragSelection(
  selectMode: SelectMode,
  getCellState: (dayIndex: number, timeIndex: number) => CellState,
  onCellsSelected: (
    cells: { dayIndex: number; timeIndex: number }[],
    state: CellState
  ) => void,
  onSingleCellToggle: (dayIndex: number, timeIndex: number) => void
) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const startCellRef = useRef<CellCoord | null>(null);
  const startMouseRef = useRef<{ x: number; y: number } | null>(null);
  const dragStateRef = useRef<CellState>("can-do");

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, dayIndex: number, timeIndex: number) => {
      if (e.button === 2) return; // right click - ignore
      if (e.button !== 0) return; // only left click

      e.preventDefault();
      startCellRef.current = { dayIndex, timeIndex };
      startMouseRef.current = { x: e.clientX, y: e.clientY };
      setIsDragging(true);
      setDragActive(false);

      // Determine what state to apply during drag
      const currentState = getCellState(dayIndex, timeIndex);

      if (selectMode === "auto") {
        // In auto mode, drag state is based on the starting cell
        if (currentState === "blank") {
          dragStateRef.current = "can-do";
        } else {
          dragStateRef.current = currentState;
        }
      } else {
        dragStateRef.current = selectMode;
      }

      setSelectionBox({
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
      });
    },
    [selectMode, getCellState]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !startMouseRef.current) return;

      const dx = e.clientX - startMouseRef.current.x;
      const dy = e.clientY - startMouseRef.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > DEAD_ZONE_PX) {
        setDragActive(true);
      }

      setSelectionBox((prev) =>
        prev
          ? { ...prev, currentX: e.clientX, currentY: e.clientY }
          : null
      );
    },
    [isDragging]
  );

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;

      if (e.button === 2) {
        // Right click cancels
        setIsDragging(false);
        setSelectionBox(null);
        setDragActive(false);
        return;
      }

      if (!dragActive && startCellRef.current) {
        // No significant drag - treat as click
        onSingleCellToggle(
          startCellRef.current.dayIndex,
          startCellRef.current.timeIndex
        );
      }
      // If drag was active, the cells will be committed via the drag end handler
      // The parent component should check selectedCells and apply

      setIsDragging(false);
      setSelectionBox(null);
      setDragActive(false);
      startCellRef.current = null;
      startMouseRef.current = null;
    },
    [isDragging, dragActive, onSingleCellToggle]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isDragging) {
        setIsDragging(false);
        setSelectionBox(null);
        setDragActive(false);
        startCellRef.current = null;
        startMouseRef.current = null;
      }
    },
    [isDragging]
  );

  const handleContextMenu = useCallback(
    (e: Event) => {
      if (isDragging) {
        e.preventDefault();
        setIsDragging(false);
        setSelectionBox(null);
        setDragActive(false);
        startCellRef.current = null;
        startMouseRef.current = null;
      }
    },
    [isDragging]
  );

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.addEventListener("keydown", handleKeyDown);
      document.addEventListener("contextmenu", handleContextMenu);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [isDragging, handleMouseMove, handleMouseUp, handleKeyDown, handleContextMenu]);

  // Compute the selection box rectangle
  const getSelectionRect = useCallback(() => {
    if (!selectionBox || !dragActive) return null;

    return {
      left: Math.min(selectionBox.startX, selectionBox.currentX),
      top: Math.min(selectionBox.startY, selectionBox.currentY),
      width: Math.abs(selectionBox.currentX - selectionBox.startX),
      height: Math.abs(selectionBox.currentY - selectionBox.startY),
    };
  }, [selectionBox, dragActive]);

  // Check if a cell element overlaps with the selection box
  const isCellInSelection = useCallback(
    (cellElement: HTMLElement): boolean => {
      const rect = getSelectionRect();
      if (!rect) return false;

      const cellRect = cellElement.getBoundingClientRect();

      // Check overlap with dead zone consideration
      const overlapX =
        Math.min(rect.left + rect.width, cellRect.right) -
        Math.max(rect.left, cellRect.left);
      const overlapY =
        Math.min(rect.top + rect.height, cellRect.bottom) -
        Math.max(rect.top, cellRect.top);

      // Cell must be overlapped by at least DEAD_ZONE_PX in both dimensions
      return overlapX > DEAD_ZONE_PX && overlapY > DEAD_ZONE_PX;
    },
    [getSelectionRect]
  );

  return {
    isDragging,
    dragActive,
    selectionBox: getSelectionRect(),
    dragState: dragStateRef.current,
    handleMouseDown,
    isCellInSelection,
  };
}
