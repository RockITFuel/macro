/**
 * `RenderHtml`: the agent's HTML page, inline in the reply.
 *
 * The page renders from the call's own arguments, so it shows wherever the
 * transcript does, for anyone who can read it. The saved HTML document the
 * tool returns sits under the page, to open in full or share like any item.
 */

import { ItemPreview } from '@core/component/ItemPreview';
import FileHtml from '@icon/system/regular/file-html.svg';
import LoadingSpinner from '@icon/system/regular/spinner.svg';
import { Show, Suspense } from 'solid-js';
import { HtmlRenderFrame } from './html-render/HtmlRenderFrame';
import { createToolRenderer, useToolError } from './ToolRenderer';

export const renderHtmlHandler = createToolRenderer({
  name: 'RenderHtml',
  render: (ctx) => {
    const ending = () => useToolError();
    const title = () => ctx.tool.data.title?.trim() || 'HTML page';
    return (
      <Show
        when={ctx.response?.data}
        fallback={
          <div
            class="flex min-w-0 items-center gap-2 py-2 text-xs text-ink-muted"
            role="status"
          >
            <Show
              when={ending()}
              fallback={
                <>
                  <LoadingSpinner class="size-3.5 shrink-0 animate-spin" />
                  <span class="truncate">Rendering {title()}</span>
                </>
              }
            >
              {(current) => (
                <>
                  <FileHtml class="size-3.5 shrink-0" />
                  <span class="truncate">
                    {current().kind === 'stopped'
                      ? `Stopped rendering ${title()}`
                      : `Could not render ${title()}`}
                  </span>
                </>
              )}
            </Show>
          </div>
        }
      >
        {(result) => (
          <figure class="my-2 flex min-w-0 flex-col gap-1.5">
            <HtmlRenderFrame
              html={ctx.tool.data.html}
              title={title()}
              height={result().height}
            />
            <figcaption class="flex min-w-0 items-center text-xs text-ink-extra-muted">
              <Suspense fallback={<span class="truncate">{title()}</span>}>
                <ItemPreview
                  class="inline-flex min-w-0 align-middle ring-0"
                  id={result().documentId}
                  type="document"
                />
              </Suspense>
            </figcaption>
          </figure>
        )}
      </Show>
    );
  },
});
