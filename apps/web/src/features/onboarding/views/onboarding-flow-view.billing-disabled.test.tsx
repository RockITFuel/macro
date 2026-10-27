import { cleanup, fireEvent, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { saveStep } from '../primitives/flow-storage';
import { FAKE_VIEWER_ID } from '../tests/fake-onboarding-context';
import { renderInviteOfferStub } from '../tests/invite-offer-stub';
import {
  renderWithFakeOnboarding,
  stubOnboardingBrowser,
} from '../tests/render';
import { OnboardingFlowView } from './onboarding-flow-view';

// A local or self-hosted build (`VITE_DISABLE_BILLING=true`).
vi.mock('@core/constant/billing', () => ({ BILLING_ENABLED: false }));

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  stubOnboardingBrowser();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('finishes after the team step without offering a plan', async () => {
  saveStep(FAKE_VIEWER_ID, 'team');
  const navigate = vi.fn();
  const redirect = vi.fn();
  const { fake } = renderWithFakeOnboarding(
    () => (
      <OnboardingFlowView
        next={undefined}
        checkoutReturn={undefined}
        onNavigate={navigate}
        onRedirect={redirect}
        onSignedOut={vi.fn()}
        renderInviteOffer={renderInviteOfferStub}
      />
    ),
    {
      teams: [{ name: 'Acme' }],
      // The license may not have reached the app yet; billing being off
      // is enough.
      viewer: {
        id: FAKE_VIEWER_ID,
        email: 'ada@acme.com',
        tutorialComplete: false,
        licensed: false,
      },
    }
  );
  const complete = vi.spyOn(fake.context, 'completeOnboarding');
  await screen.findByRole('heading', { name: 'Built for teams.', level: 1 });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

  await waitFor(() =>
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/home')
  );
  expect(complete).toHaveBeenCalledExactlyOnceWith({ skipped: false });
  expect(redirect).not.toHaveBeenCalled();
  expect(
    screen.queryByRole('button', { name: 'Continue with Free' })
  ).toBeNull();
});
