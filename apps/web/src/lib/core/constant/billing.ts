/**
 * Whether this deployment bills its users. Local and self-hosted stacks build
 * with `VITE_DISABLE_BILLING=true`: every account holds the top plan
 * (the backend grants it), so the app offers no plan picker, paywall or
 * billing settings.
 */
export const BILLING_ENABLED = import.meta.env.VITE_DISABLE_BILLING !== 'true';
