import { Macro, type MacroOpts } from '@macro-inc/sdk';

type ServiceHosts = Required<NonNullable<MacroOpts['hosts']>>;

/**
 * Every SDK service host behind one self-hosted origin. The self-hosted Caddy
 * proxy (`tooling/xtask/crates/xtask_local/src/local/proxy.rs`) mounts each
 * service under the same path prefix as the hosted gateway (`/dss`, `/auth`,
 * `/agent-harness`, ...), and the static file service under `/static-file`.
 */
export function selfHostedHosts(origin: string): ServiceHosts {
  return {
    'agent-harness': `${origin}/agent-harness`,
    storage: `${origin}/dss`,
    auth: `${origin}/auth`,
    email: `${origin}/email`,
    calendar: `${origin}/calendar`,
    cognition: `${origin}/cognition`,
    notification: `${origin}/notification`,
    properties: `${origin}/dss`,
    search: `${origin}/dss`,
    'scheduled-action': `${origin}/scheduled-action`,
    'static-files': `${origin}/static-file`,
    connection: `${origin}/connection-gateway`,
    contacts: `${origin}/contacts`,
    unfurl: `${origin}/unfurl`,
  };
}

/**
 * The SDK client. Credentials come from the SDK's own environment lookup
 * (`MACRO_API_KEY` or `MACRO_BOT_TOKEN`); `baseUrl` (`MACRO_BASE_URL`) points
 * every service at a self-hosted instance instead of macro.com.
 */
export function createMacro(baseUrl: string | undefined): Macro {
  if (!baseUrl) return new Macro({});
  const origin = new URL(baseUrl).origin;
  return new Macro({ hosts: selfHostedHosts(origin), webAppUrl: origin });
}
