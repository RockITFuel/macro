# Teams and invitations

A team groups people who share content, billing, and connections. Owners and admins set the team's name and slug, GitHub autolink, default link sharing, and member controls. Anyone can be invited by email or through a reusable team invite link. Invitees accept or decline, and people on an auto-join email domain join without an invite. Free teams have no member cap. Paid teams keep per-seat billing, with each seat choosing Pro or Max.

## Sub-features

- `team-create` creates a team from Settings or during onboarding.
- `team-general` edits the name, slug, GitHub autolink, and default link sharing. Owners can delete the team.
- `team-invite-email` invites addresses by email, with reminders, resend, and cancel.
- `team-invite-link` creates, copies, resets, and turns off a team invite link.
- `team-invite-accept` shows `You've Been Invited` and offers `Accept` or `Decline`.
- `team-join-link` joins a team from a link with `Join <team>`.
- `team-auto-join-domain` toggles auto-join for a domain.
- `team-members-roles` lists members, roles (Member, Admin, Owner), removal, and the members-can-invite toggle.
- `team-seat-plan` moves a seat between Pro and Max on paid teams.
- `team-connections` covers Slack import and the GitHub App for admins. See the connections feature.

## How to get to it (user POV)

- Settings → Team → General, Members, or Connections. Routes: `/app/settings/team`, `/app/settings/team-members`, `/app/settings/team-connections`.
- Settings sidebar bottom action `Invite your team`. With no team, it reads `Create a team`.
- Home sidebar setup card `Invite team`, hidden when a team allows invites only by admins.
- Invite email: opens `/app/team-invite?id=<invite>`.
- Invite link: opens `/app/team-invite?link=<token>`.
- Onboarding's team step.
- Settings search: `invite`, `members`, `teammates`, `slack`.

## Driving it with chrome-devtools MCP

Preconditions:

- The local stack is running. Use two accounts: an owner and an invitee. The invitee's address must not be on a team yet.
- Invitation emails land in Mailpit (`http://localhost:<mp>/`).

- **Create a team.** Open `/app/settings/team`, click button `Create a team`. Observable: a dialog with a textbox named `Name` or placeholder `Enter team name` appears.
- **Invite by email.** Open `/app/settings/team-members`, click button `Invite your team` in the settings sidebar. Fill the multi-line textbox with placeholder `name@company.com`, one address per line, and submit. Observable: the address appears under `Pending invites` with a last-sent time.
- **Create invite link.** In the invite dialog, click button `Create link`. Observable: the link is copied, and `Copy link`, `Reset link`, and `Turn off` appear.
- **Accept an emailed invite.** As the invitee, navigate to `/app/team-invite?id=<invite id>`. Observable: heading `You've Been Invited`. Click button `Accept`. Observable: the team appears in the invitee's Settings → Team. If the invitee is already on another team, the page says `Already on Another Team`.
- **Decline.** On the same page, click button `Decline`. Observable: the invite leaves the list.
- **Join by link.** As an invitee, navigate to `/app/team-invite?link=<token>`. Click button `Join <team>`. Observable: the team is joined. An invalid token shows `Invite Link Not Valid`.
- **Resend and cancel.** In `Pending invites`, click button `Resend invite` (disabled for an hour after the last email) or `Cancel invite`. Cancel opens a dialog titled `Cancel Invitation`.
- **Auto-join.** In Team → Members, toggle the switch labeled `Auto-join on domain`. Observable: a same-domain sign-up appears in the member list. With the switch off, the same sign-up does not join.
- **Members can invite.** Toggle `Members can invite`. Observable: a member without admin rights loses the invite control.
- **Remove a member.** Click button `Remove member` on a row. Observable: dialog `Remove Member`.
- **Edit general.** In Team → General, edit textbox `Name` or `Slug`, then click button `Save`.
- **Delete team.** Click button `Delete Team` and confirm. This is destructive; use only a throwaway team.

## Gotchas

- Team membership has no size cap, including free teams. Joining a free team does not create a subscription or bill a seat.
- Teams with a paid subscription keep per-seat billing. A team created or invited from during an owner's Pro trial bills through that trial.
- Reminder emails go out 3 days, then 4 days after the last email. Invites older than 14 days, invites to existing members, and invites from a departed sender get none.
- `Resend` unlocks one hour after the last email. Re-inviting an address follows the same rule.
- Resetting an invite link makes the old link stop working immediately.
- A user already on another team must leave it before joining.
- The invite textbox keeps its typed addresses and focus while suggestions or background queries refresh.
- Only owners and admins see `Auto-join on domain` and `Members can invite`.
- A user joining from an auto-join domain while auto-join is on appears in the member list and in any configured auto-join channels, with no upgrade prompt.
