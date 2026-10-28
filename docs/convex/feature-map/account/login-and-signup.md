# Sign in and sign up

Signed-out visitors land on the welcome page. They sign in with Google, with Apple (iOS only), or with a one-time code sent to their email. A new email creates the account on first success. Desktop sign-up starts with onboarding slides before any account exists. Mobile web visitors cannot finish sign-up on a phone, so they get an email link to open on desktop. Once signed in, the session survives reloads and shows the app; when it ends, the signed-out screens return without a loading flash.

## Sub-features

- `login-email-code` sends a code to an email address and signs in with it.
- `login-google` signs in or signs up with Google and returns to the app.
- `login-apple` signs in with Apple. Shown on iOS only.
- `login-password` signs in with a password for one allowlisted address. See Gotchas.
- `signup-desktop` starts desktop sign-up at the onboarding slides.
- `signup-mobile-web-email` emails a phone visitor a link to continue on desktop.
- `signup-invite-landing` shows a personal invite welcome page, then signup.
- `login-session-gate` shows signed-in or signed-out screens and clears local data on logout.
- `login-native` is the iOS and Android welcome screen with `Create new account` and `Log into existing account`.

## How to get to it (user POV)

- Open `/app` while signed out. It redirects to `/app/welcome`.
- Open `/app/login` for sign-in only, with no onboarding slides.
- Open `/app/signup` on desktop for sign-up. Its first step is the workspace color picker.
- Open `/app/mobile-email-signup` on a phone browser. The marketing site redirects phones here.
- Open `/app/invite?token=<token>` from a personal invite link. It shows a welcome page, then signup.
- Settings → Account → `Log out` ends the session (see the settings feature).
- Native apps: the welcome screen buttons `Create new account` and `Log into existing account`. The custom link `macro://app/login` opens the login form, cold or warm.
- No keyboard shortcut or command menu entry applies while signed out.

## Driving it with chrome-devtools MCP

Preconditions:

- The local stack is running (`just run_local`). The frontend is at `http://localhost:<fe>/app`.
- The browser has no Macro session. Use a fresh profile or log out first.
- Use an email address the local signup policy accepts. (Unverified: check the local allowlist configuration.)
- Mailpit is reachable at `http://localhost:<mp>/` if you need the code.

- **Open welcome.** Navigate to `/app`. Observable: URL becomes `/app/welcome`, and buttons `Continue with Google` and `Continue with email` are visible. `Continue with Apple` is absent in a desktop browser.
- **Start email sign-in.** Click button `Continue with email`. If no form appears in the next snapshot, click it again; one click sometimes only focuses it. Observable: textbox `Email address` appears.
- **Submit email.** Fill textbox `Email address` with the test address, then click button `Continue`. Observable on the local stack: the code is verified automatically and the app opens without a code step. Observable on a real deployment: a code-entry step with six single-character boxes appears.
- **Enter code (real deployment only).** Read the code from Mailpit (subject `Your Macro login code`). Type the six digits; the sixth digit submits. Observable on a wrong code: all boxes clear and focus returns to the first box. (Unverified on local: the local stack does not show this step.)
- **Rate limit.** After five wrong code checks in a minute for one address, the code step shows `Too many attempts. Wait a minute, then try again.`. Requesting a new code does not lift it.
- **Google sign-in.** Click button `Continue with Google`. Observable: the browser navigates to the Google consent page. Stop there. Never type provider passwords into agent-driven steps; complete consent by hand, then expect the return to `/app` as a signed-in user.
- **Desktop sign-up entry.** Navigate to `/app/signup`. Observable: the workspace color picker is shown first, and the link `Already have an account? Sign in instead` is visible below it. Clicking that link goes to `/app/login`.
- **Mobile web entry.** Emulate a phone viewport, navigate to `/app/mobile-email-signup`, and fill the email field. Observable: a confirmation screen says the link was sent. (Unverified: exact copy.)
- **Sign out.** Open Settings → Account and click button `Log out`. Observable: URL returns to `/app/welcome`, and reloading keeps the signed-out screens.

## Gotchas

- The local stack returns the login code in the response and verifies it automatically. No code-entry step appears locally, though a code email still arrives in Mailpit. Do not mark the code step as unreachable locally; it is a deployment difference.
- First-login landing is documented two ways. The login guide says Home; the onboarding guide says new desktop users go into onboarding. Confirm which one the code does before writing expectations.
- The known first-landing crash on local stacks reads `Something went terribly wrong — Cannot read properties of undefined (reading 'id')`. Click the dialog's `Home` button, then wait for the sidebar text `Go to Email`.
- A browser restart with a fresh profile drops the session. Log in again.
- Password sign-in exists but applies to one hard-coded address. For every other address the app asks for a code. Do not use this path to verify normal login.
- Sign-up from a non-allowlisted email is refused with the message `signup is not allowed`. Develop bypasses the allowlist; production does not.
- Google and SSO returns may land on either `macro.com` or `www.macro.com`. Verify from both hosts when testing production-like flows.
- The signed-out page must not flash between the loading screen and the signed-out screens after a 401. A signed-in user who changes accounts must see the new account's data without a reload.
- Android: a sign-in callback for another attempt must leave the current attempt pending. A callback after process death must not restore the attempt.
