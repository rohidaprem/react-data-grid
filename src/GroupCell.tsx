import { memo } from 'react';

import { useRovingTabIndex } from './hooks';
import { getCellClassname, getCellStyle } from './utils';
import type { CalculatedColumn, GroupRow } from './types';

interface GroupCellProps<R, SR> {
  id: string;
  groupKey: unknown;
  childRows: readonly R[];
  toggleGroup: (expandedGroupId: unknown) => void;
  isExpanded: boolean;
  column: CalculatedColumn<R, SR>;
  row: GroupRow<R>;
  isCellSelected: boolean;
  groupColumnIndex: number;
  isGroupByColumn: boolean;
  isRowColumnGrouping: Boolean;
}

function GroupCell<R, SR>({
  id,
  groupKey,
  childRows,
  isExpanded,
  isCellSelected,
  column,
  row,
  groupColumnIndex,
  isGroupByColumn,
  isRowColumnGrouping,
  toggleGroup: toggleGroupWrapper
}: GroupCellProps<R, SR>) {
  const { tabIndex, childTabIndex, onFocus } = useRovingTabIndex(isCellSelected);

  function toggleGroup() {
    toggleGroupWrapper(id);
  }

  // Only make the cell clickable if the group level matches or the key is __group__ 
  const isLevelMatching = isRowColumnGrouping ? column.key === '__group__' : isGroupByColumn && groupColumnIndex === column.idx;
  const indentSize = 16; // pixels per level

  return (
    <div
      role="gridcell"
      aria-colindex={column.idx + 1}
      aria-selected={isCellSelected}
      tabIndex={tabIndex}
      key={column.key}
      className={getCellClassname(column)}
      style={{
        ...getCellStyle(column),
        cursor: isLevelMatching ? 'pointer' : 'default',
        paddingLeft: isLevelMatching && isRowColumnGrouping ? `${row.level * indentSize + 8}px` : undefined
      }}
      onMouseDown={(event) => {
        // prevents clicking on the cell from stealing focus from focusSink
        event.preventDefault();
      }}
      onClick={isLevelMatching ? toggleGroup : undefined}
      onFocus={onFocus}
    >
      {(!isGroupByColumn || isLevelMatching) &&
        column.renderGroupCell?.({
          groupKey,
          childRows,
          column,
          row,
          isExpanded,
          tabIndex: childTabIndex,
          toggleGroup
        })}
    </div>
  );
}

export default memo(GroupCell) as <R, SR>(props: GroupCellProps<R, SR>) => React.JSX.Element;
