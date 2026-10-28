export type KanbanDrop = {
  id: string;
  fromLane: string;
  toLane: string;
} & (
  | { kind: 'lane'; edge: 'before' | 'after' }
  | { kind: 'card'; beforeId?: string }
);

/** A column change leaves card order to the caller (for example, a sorted view). */
export type KanbanCrossColumnDrop = {
  kind: 'card';
  id: string;
  fromLane: string;
  toLane: string;
  beforeId?: string;
};

/**
 * How a board is drawn. `panel` is the task board's look (adapted from
 * Project Alpha's Support board): bordered columns that fill the width, white
 * cards with a hairline border, and a lifted drag preview.
 */
export type KanbanAppearance = 'default' | 'panel';
