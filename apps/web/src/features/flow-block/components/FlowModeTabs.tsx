import CodeIcon from '@icon/system/regular/code.svg';
import TreeStructureIcon from '@icon/system/regular/tree-structure.svg';
import { Tabs } from '@ui';

export type FlowMode = 'diagram' | 'source';

const OPTIONS = [
  { value: 'diagram', label: 'Diagram', icon: TreeStructureIcon },
  { value: 'source', label: 'Source', icon: CodeIcon },
] as const;

/** Switches a flow block between the chart and its source text. */
export function FlowModeTabs(props: {
  mode: FlowMode;
  onChange: (mode: FlowMode) => void;
}) {
  return (
    <Tabs
      aria-label="Flowchart view"
      size="sm"
      touch="segmented"
      value={props.mode}
      options={OPTIONS}
      onChange={props.onChange}
    />
  );
}
