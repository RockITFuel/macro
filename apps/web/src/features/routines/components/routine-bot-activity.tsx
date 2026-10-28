import { Checkbox } from '@ui';
import {
  DEFAULT_BOT_ACTIVITY,
  type EventTriggerDraft,
} from '../core/routine-triggers';

/** Opt in to changes agents and bots make, which the server bounds. */
export function RoutineBotActivity(props: {
  trigger: EventTriggerDraft;
  onChange: (botActivity: EventTriggerDraft['botActivity']) => void;
}) {
  return (
    <Checkbox
      class="mt-3 flex items-start gap-2"
      checked={props.trigger.botActivity !== undefined}
      onChange={(checked) =>
        props.onChange(checked ? DEFAULT_BOT_ACTIVITY : undefined)
      }
    >
      <Checkbox.Control class="mt-0.5" />
      <div class="flex flex-col gap-0.5">
        <Checkbox.Label class="text-sm text-ink">
          Also when agents and bots do this
        </Checkbox.Label>
        <Checkbox.Description class="text-xs text-ink-muted">
          Lets agents hand work to this routine. Chains stop after{' '}
          {props.trigger.botActivity?.max_hops ?? DEFAULT_BOT_ACTIVITY.max_hops}{' '}
          hand-offs, and the routine never runs for its own changes.
        </Checkbox.Description>
      </div>
    </Checkbox>
  );
}
