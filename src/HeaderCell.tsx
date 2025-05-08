import { useRef, useState } from 'react';
import { css } from '@linaria/core';

import { useRovingTabIndex } from './hooks';
import {
  clampColumnWidth,
  getCellClassname,
  getCellStyle,
  getHeaderCellRowSpan,
  getHeaderCellStyle,
  getLeftRightKey,
  isCtrlKeyHeldDown,
  stopPropagation
} from './utils';
import type { CalculatedColumn, SortColumn } from './types';
import type { HeaderRowProps } from './HeaderRow';

const cellSortableClassname = css`
  @layer rdg.HeaderCell {
    cursor: pointer;
  }
`;

const cellResizable = css`
  @layer rdg.HeaderCell {
    touch-action: none;
  }
`;

const cellResizableClassname = `rdg-cell-resizable ${cellResizable}`;

export const resizeHandleClassname = css`
  @layer rdg.HeaderCell {
    cursor: col-resize;
    position: absolute;
    inset-block-start: 0;
    inset-inline-end: 0;
    inset-block-end: 0;
    inline-size: 10px;
  }
`;

const cellDraggableClassname = 'rdg-cell-draggable';

const cellDragging = css`
  opacity: 0.5;
`;

const cellDraggingClassname = `rdg-cell-dragging ${cellDragging}`;

const cellOver = css`
  background-color: var(--rdg-header-draggable-background-color);
`;

const cellOverClassname = `rdg-cell-drag-over ${cellOver}`;

type SharedHeaderRowProps<R, SR> = Pick<
  HeaderRowProps<R, SR, React.Key>,
  | 'sortColumns'
  | 'onSortColumnsChange'
  | 'selectCell'
  | 'onColumnResize'
  | 'onColumnResizeEnd'
  | 'direction'
  | 'onColumnsReorder'
>;

export interface HeaderCellProps<R, SR> extends SharedHeaderRowProps<R, SR> {
  column: CalculatedColumn<R, SR>;
  colSpan: number | undefined;
  rowIdx: number;
  isCellSelected: boolean;
  dragDropKey: string;
}

export default function HeaderCell<R, SR>({
  column,
  colSpan,
  rowIdx,
  isCellSelected,
  onColumnResize,
  onColumnResizeEnd,
  onColumnsReorder,
  sortColumns,
  onSortColumnsChange,
  selectCell,
  direction,
  dragDropKey
}: HeaderCellProps<R, SR>) {
  const [isDragging, setIsDragging] = useState(false);
  const [isOver, setIsOver] = useState(false);
  const rowSpan = getHeaderCellRowSpan(column, rowIdx);
  const { tabIndex, childTabIndex, onFocus } = useRovingTabIndex(isCellSelected);
  const sortIndex = sortColumns?.findIndex((sort) => sort.columnKey === column.key);
  const sortColumn =
    sortIndex !== undefined && sortIndex > -1 ? sortColumns![sortIndex] : undefined;
  const sortDirection = sortColumn?.direction;
  const priority = sortColumn !== undefined && sortColumns!.length > 1 ? sortIndex! + 1 : undefined;
  const ariaSort =
    sortDirection && !priority ? (sortDirection === 'ASC' ? 'ascending' : 'descending') : undefined;
  const { sortable, resizable, draggable } = column;

  const className = getCellClassname(column, column.headerCellClass, {
    [cellSortableClassname]: sortable,
    [cellResizableClassname]: resizable,
    [cellDraggableClassname]: draggable,
    [cellDraggingClassname]: isDragging,
    [cellOverClassname]: isOver
  });

  function onSort(ctrlClick: boolean) {
    if (onSortColumnsChange == null) return;
    const { sortDescendingFirst } = column;
    if (sortColumn === undefined) {
      // not currently sorted
      const nextSort: SortColumn = {
        columnKey: column.key,
        direction: sortDescendingFirst ? 'DESC' : 'ASC'
      };
      onSortColumnsChange(sortColumns && ctrlClick ? [...sortColumns, nextSort] : [nextSort]);
    } else {
      let nextSortColumn: SortColumn | undefined;
      if (
        (sortDescendingFirst === true && sortDirection === 'DESC') ||
        (sortDescendingFirst !== true && sortDirection === 'ASC')
      ) {
        nextSortColumn = {
          columnKey: column.key,
          direction: sortDirection === 'ASC' ? 'DESC' : 'ASC'
        };
      }
      if (ctrlClick) {
        const nextSortColumns = [...sortColumns!];
        if (nextSortColumn) {
          // swap direction
          nextSortColumns[sortIndex!] = nextSortColumn;
        } else {
          // remove sort
          nextSortColumns.splice(sortIndex!, 1);
        }
        onSortColumnsChange(nextSortColumns);
      } else {
        onSortColumnsChange(nextSortColumn ? [nextSortColumn] : []);
      }
    }
  }

  function onClick(event: React.MouseEvent<HTMLSpanElement>) {
    selectCell({ idx: column.idx, rowIdx });

    if (sortable) {
      onSort(event.ctrlKey || event.metaKey);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLSpanElement>) {
    const { key } = event;
    if (sortable && (key === ' ' || key === 'Enter')) {
      // prevent scrolling
      event.preventDefault();
      onSort(event.ctrlKey || event.metaKey);
    } else if (
      resizable &&
      isCtrlKeyHeldDown(event) &&
      (key === 'ArrowLeft' || key === 'ArrowRight')
    ) {
      // prevent navigation
      // TODO: check if we can use `preventDefault` instead
      event.stopPropagation();
      const { width } = event.currentTarget.getBoundingClientRect();
      const { leftKey } = getLeftRightKey(direction);
      const offset = key === leftKey ? -10 : 10;
      const newWidth = clampColumnWidth(width + offset, column);
      if (newWidth !== width) {
        onColumnResize(column, newWidth);
      }
    }
  }

  function onDragStart(event: React.DragEvent<HTMLDivElement>) {
    event.dataTransfer.setData(dragDropKey, column.key);
    event.dataTransfer.dropEffect = 'move';
    setIsDragging(true);
  }

  function onDragEnd() {
    setIsDragging(false);
  }

  function onDragOver(event: React.DragEvent<HTMLDivElement>) {
    // prevent default to allow drop
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    setIsOver(false);
    // The dragDropKey is derived from the useId() hook, which can sometimes generate keys with uppercase letters.
    // When setting data using event.dataTransfer.setData(), the key is automatically converted to lowercase in some browsers.
    // To ensure consistent comparison, we normalize the dragDropKey to lowercase before checking its presence in the event's dataTransfer types.
    // https://html.spec.whatwg.org/multipage/dnd.html#the-datatransfer-interface
    if (event.dataTransfer.types.includes(dragDropKey.toLowerCase())) {
      const sourceKey = event.dataTransfer.getData(dragDropKey.toLowerCase());
      if (sourceKey !== column.key) {
        // prevent the browser from redirecting in some cases
        event.preventDefault();
        onColumnsReorder?.(sourceKey, column.key);
      }
    }
  }

  function onDragEnter(event: React.DragEvent<HTMLDivElement>) {
    if (isEventPertinent(event)) {
      setIsOver(true);
    }
  }

  function onDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (isEventPertinent(event)) {
      setIsOver(false);
    }
  }

  let draggableProps: React.ComponentProps<'div'> | undefined;
  if (draggable) {
    draggableProps = {
      draggable: true,
      /* events fired on the draggable target */
      onDragStart,
      onDragEnd,
      /* events fired on the drop targets */
      onDragOver,
      onDragEnter,
      onDragLeave,
      onDrop
    };
  }

  return (
    <div
      role="columnheader"
      aria-colindex={column.idx + 1}
      aria-colspan={colSpan}
      aria-rowspan={rowSpan}
      aria-selected={isCellSelected}
      aria-sort={ariaSort}
      tabIndex={tabIndex}
      className={className}
      style={{
        ...getHeaderCellStyle(column, rowIdx, rowSpan),
        ...getCellStyle(column, colSpan)
      }}
      onFocus={onFocus}
      onClick={onClick}
      onKeyDown={onKeyDown}
      {...draggableProps}
    >
      {column.renderHeaderCell({
        column,
        sortDirection,
        priority,
        tabIndex: childTabIndex
      })}

      {resizable && (
        <ResizeHandle
          direction={direction}
          column={column}
          onColumnResize={onColumnResize}
          onColumnResizeEnd={onColumnResizeEnd}
        />
      )}
    </div>
  );
}

type ResizeHandleProps<R, SR> = Pick<
  HeaderCellProps<R, SR>,
  'direction' | 'column' | 'onColumnResize' | 'onColumnResizeEnd'
>;

function ResizeHandle<R, SR>({
  direction,
  column,
  onColumnResize,
  onColumnResizeEnd
}: ResizeHandleProps<R, SR>) {
  const resizingOffsetRef = useRef<number>(undefined);
  const isRtl = direction === 'rtl';

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.buttons !== 1) {
      return;
    }

    // Fix column resizing on a draggable column in FF
    event.preventDefault();

    const { currentTarget, pointerId } = event;
    currentTarget.setPointerCapture(pointerId);
    const headerCell = currentTarget.parentElement!;
    const { right, left } = headerCell.getBoundingClientRect();
    resizingOffsetRef.current = isRtl ? event.clientX - left : right - event.clientX;
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const offset = resizingOffsetRef.current;
    if (offset === undefined) return;
    const { width, right, left } = event.currentTarget.parentElement!.getBoundingClientRect();
    let newWidth = isRtl ? right + offset - event.clientX : event.clientX + offset - left;
    newWidth = clampColumnWidth(newWidth, column);
    if (width > 0 && newWidth !== width) {
      onColumnResize(column, newWidth);
    }
  }

  function onLostPointerCapture() {
    onColumnResizeEnd();
    resizingOffsetRef.current = undefined;
  }

  function onDoubleClick() {
    onColumnResize(column, 'max-content');
  }

  return (
    <div
      className={resizeHandleClassname}
      onClick={stopPropagation}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      // we are not using pointerup because it does not fire in some cases
      // pointer down -> alt+tab -> pointer up over another window -> pointerup event not fired
      onLostPointerCapture={onLostPointerCapture}
      onDoubleClick={onDoubleClick}
    />
  );
}

// only accept pertinent drag events:
// - ignore drag events going from the container to an element inside the container
// - ignore drag events going from an element inside the container to the container
function isEventPertinent(event: React.DragEvent) {
  const relatedTarget = event.relatedTarget as HTMLElement | null;

  return !event.currentTarget.contains(relatedTarget);
}
