/**
 * Two-browser check that Tasks views follow remote changes without a reload
 * (docs/agent-guide/tasks.md, "Live updates"). Against a local stack instance:
 *
 *   INSTANCE=rt bun tooling/self-host/realtime-tasks-check.ts            # live
 *   INSTANCE=rt bun tooling/self-host/realtime-tasks-check.ts --baseline # drop soup_patch frames
 *
 * Signs up A and B (one team) and C (outside it) through Mailpit, keeps their
 * views open, changes tasks through the SDK with A's API key, A's bot token
 * and A's browser, and prints how long each view took to show each change.
 * `--baseline` drops `soup_patch` gateway frames in the browsers, which is how
 * the app behaved before they existed. Exits non-zero when a view misses a
 * change or C receives a patch for a task it cannot see.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Browser, chromium, type Page } from "playwright";
import { Macro } from "../../packages/sdk/src/macro";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const INSTANCE = process.env.INSTANCE ?? "rt";
const ROOT = join(import.meta.dir, "../..");
const portmap = JSON.parse(
	readFileSync(
		join(ROOT, `infra/local/generated/${INSTANCE}/portmap.json`),
		"utf8",
	),
);
const proxyPort = Number(new URL(portmap.webAppUrl).port) - 1;
const BASE = process.env.BASE ?? `https://localhost:${proxyPort}`;
const BASELINE = process.argv.includes("--baseline");
const TIMEOUT_MS = Number(process.env.WAIT_MS ?? (BASELINE ? 6000 : 10000));

const STATUS_DEF = "00000001-0000-0000-0000-000000000002";
const PRIORITY_DEF = "00000001-0000-0000-0000-000000000003";
const ASSIGNEES_DEF = "00000001-0000-0000-0000-000000000001";
const PROJECT_DEF = "00000001-0000-0000-0000-000000000014";
const IN_PROGRESS = "00000001-0000-0000-0002-000000000002";
const HIGH = "00000001-0000-0000-0003-000000000003";
const STATUSES = [
	"Not Started",
	"In Progress",
	"In Review",
	"Completed",
	"Canceled",
];

// Records soup_patch frames on the connection gateway socket; drops them for the baseline.
const recordPatches = (baseline: boolean) => {
	const Native = window.WebSocket;
	(window as unknown as { soupPatches: string[] }).soupPatches = [];
	window.WebSocket = class extends Native {
		constructor(url: string | URL, protocols?: string | string[]) {
			super(url, protocols);
			if (!String(url).includes("connection-gateway")) return;
			this.addEventListener("message", (event) => {
				if (
					typeof event.data !== "string" ||
					!event.data.includes('"soup_patch"')
				)
					return;
				(window as unknown as { soupPatches: string[] }).soupPatches.push(
					event.data,
				);
				if (baseline) event.stopImmediatePropagation();
			});
		}
	};
};

async function mailpitCode(email: string, after: number): Promise<string> {
	for (let attempt = 0; attempt < 60; attempt++) {
		const search = await fetch(
			`${BASE}/mailpit/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
		).then((r) => r.json());
		const message = search.messages?.find(
			(m: { Created: string }) => Date.parse(m.Created) > after,
		);
		if (message) {
			const body = await fetch(
				`${BASE}/mailpit/api/v1/message/${message.ID}`,
			).then((r) => r.json());
			const code = (body.Text || body.HTML).match(/\b(\d{6})\b/)?.[1];
			if (code) return code;
		}
		await Bun.sleep(1000);
	}
	throw new Error(`no login code for ${email}`);
}

type Session = {
	storageState: Awaited<
		ReturnType<import("playwright").BrowserContext["storageState"]>
	>;
};

async function signIn(browser: Browser, email: string): Promise<Session> {
	const context = await browser.newContext({ ignoreHTTPSErrors: true });
	const page = await context.newPage();
	const requestedAt = Date.now() - 5000;
	await page.goto(`${BASE}/app/`);
	await page
		.getByRole("button", { name: "Continue with email" })
		.click({ timeout: 90_000 });
	await page.getByRole("textbox").first().fill(email);
	await page.getByRole("button", { name: /^Continue$/ }).click();
	await page.waitForTimeout(500);
	await page.keyboard.type(await mailpitCode(email, requestedAt), {
		delay: 50,
	});
	await page.waitForURL(/\/app\/(?!login)/, { timeout: 30_000 });
	for (
		let step = 0;
		step < 15 && /welcome|onboarding/.test(page.url());
		step++
	) {
		for (const name of [
			/^Get started$/,
			/^Continue$/,
			/^Skip$/,
			/^Skip for now$/,
			/^Not now$/,
			/^Next$/,
			/^Done$/,
		]) {
			const button = page.getByRole("button", { name }).first();
			if ((await button.isVisible()) && (await button.isEnabled())) {
				await button.click();
				break;
			}
		}
		await page.waitForTimeout(2500);
	}
	const storageState = await context.storageState();
	await context.close();
	return { storageState };
}

/** Calls an app endpoint with the session's cookies. */
async function call(page: Page, method: string, path: string, body?: unknown) {
	return page.evaluate(
		async ([method, path, body]) => {
			const response = await fetch(path as string, {
				method: method as string,
				credentials: "include",
				headers: { "content-type": "application/json" },
				body: body === undefined ? undefined : JSON.stringify(body),
			});
			if (!response.ok)
				throw new Error(
					`${method} ${path}: ${response.status} ${await response.text()}`,
				);
			return response.json();
		},
		[method, path, body] as const,
	);
}

const browser = await chromium.launch();
const views: Record<string, Page> = {};
async function open(
	name: string,
	session: Session,
	path: string,
): Promise<Page> {
	const context = await browser.newContext({
		ignoreHTTPSErrors: true,
		viewport: { width: 1600, height: 1000 },
		storageState: session.storageState,
	});
	await context.addInitScript(recordPatches, BASELINE);
	const page = await context.newPage();
	await page.goto(BASE + path);
	views[name] = page;
	return page;
}

type Fixture = {
	run: string;
	a: Session;
	b: Session;
	c: Session;
	teamId: string;
	apiKey: string;
	botToken: string;
};
/** A owns a team that B joins; C has no team. A mints an API key and a bot token. */
async function createFixture(): Promise<Fixture> {
	const run = Date.now().toString(36);
	const a = await signIn(browser, `rt-a@${run}.example.com`);
	const b = await signIn(browser, `rt-b@${run}.example.com`);
	const c = await signIn(browser, `rt-c@outsider-${run}.example.com`);
	const owner = await open("setup", a, "/app/settings/account");
	await owner.waitForTimeout(3000);
	const team = await call(owner, "POST", "/auth/team", { name: `RT ${run}` });
	const { token: inviteToken } = await call(
		owner,
		"POST",
		"/auth/team/invite-link",
	);
	const { key: apiKey } = await call(owner, "POST", "/dss/user-api-keys", {
		name: `rt ${run}`,
	});
	const bot = await call(owner, "POST", "/dss/bots", {
		name: "RT Sync",
		handle: `rtsync${run}`,
	});
	const { bearer_token: botToken } = await call(
		owner,
		"POST",
		`/dss/bots/${bot.id}/tokens`,
		{ label: run },
	);
	const joiner = await open("joiner", b, "/app/settings/account");
	await joiner.waitForTimeout(3000);
	await call(joiner, "POST", "/auth/team/invite-link/join", {
		token: inviteToken,
	});
	return { run, a, b, c, teamId: team.id, apiKey, botToken };
}
// FIXTURE=<file> reuses the users of an earlier run (and writes them on the first).
const fixturePath = process.env.FIXTURE;
const fixture: Fixture =
	fixturePath && existsSync(fixturePath)
		? JSON.parse(readFileSync(fixturePath, "utf8"))
		: await createFixture();
if (fixturePath)
	writeFileSync(fixturePath, JSON.stringify(fixture), { mode: 0o600 });
const { a, b, c, apiKey, botToken } = fixture;
const run = Date.now().toString(36);
const userB = `macro|rt-b@${fixture.run}.example.com`;

const sdk = {
	env: "local" as const,
	hosts: portmap.hosts,
	webAppUrl: `${BASE}/app`,
};
const asA = new Macro({ ...sdk, auth: { type: "user", apiKey } });
const asBot = new Macro({
	...sdk,
	auth: { type: "bot", token: botToken },
}).requestedAs(await asA.users.me());
const [rtTeam] = (await asA.teams.list()).filter(
	(t) => t.id === fixture.teamId,
);
const definitions = await asA.properties.list();
const definition = (id: string) => {
	const found = definitions.find((d) => d.id === id);
	if (!found) throw new Error(`missing property definition ${id}`);
	return found;
};

const tasksPath = (tab: string, layout: string) =>
	`/app/tasks?${new URLSearchParams({
		"s0.tasks.tab": tab,
		"s0.tasks.layout": layout,
		"s0.tasks.groupBy": "status",
		"s0.tasks.sort": "updated_at",
	})}`;
await Promise.all([
	open("B list", b, tasksPath("team-tasks", "list")),
	open("B board", b, tasksPath("team-tasks", "board")),
	open("B my tasks", b, tasksPath("my-tasks", "list")),
	open("A created", a, tasksPath("created-by-me", "list")),
	open("C all", c, tasksPath("team-tasks", "list")),
]);
await Bun.sleep(8000);

/** Text of the closest ancestor of the task's title that names a status: its list row or board column. */
const near = (page: Page, title: string) =>
	page.evaluate(
		([title, statuses]) => {
			const leaf = [...document.querySelectorAll("body *")].find(
				(e) =>
					(e as HTMLElement).offsetParent &&
					e.children.length === 0 &&
					e.textContent?.trim() === title,
			);
			if (!leaf) return null;
			for (let n: Element | null = leaf; n; n = n.parentElement) {
				const text = (n as HTMLElement).innerText ?? "";
				if ((statuses as string[]).some((s) => text.includes(s))) return text;
			}
			return "";
		},
		[title, STATUSES] as const,
	);
const statusOf = (text: string | null) =>
	text === null
		? undefined
		: STATUSES.map((s) => [s, text.indexOf(s)] as const)
				.filter(([, i]) => i >= 0)
				.sort((x, y) => x[1] - y[1])[0]?.[0];
const shows = (title: string) => async (p: Page) =>
	(await near(p, title)) !== null;
const gone = (title: string) => async (p: Page) =>
	(await near(p, title)) === null;
const inStatus = (title: string, status: string) => async (p: Page) =>
	statusOf(await near(p, title)) === status;
const rowHas = (title: string, text: string) => async (p: Page) =>
	(await near(p, title))?.includes(text) ?? false;
const pageHas = (text: string) => (p: Page) =>
	p.evaluate((t) => document.body.innerText.includes(t), text);

type Row = { change: string; source: string; view: string; ms: number | null };
const rows: Row[] = [];
async function step(
	change: string,
	source: string,
	act: () => Promise<unknown>,
	checks: [string, (p: Page) => Promise<boolean>][],
) {
	const started = performance.now();
	await act();
	await Promise.all(
		checks.map(async ([view, ok]) => {
			let ms: number | null = null;
			while (performance.now() - started < TIMEOUT_MS) {
				if (await ok(views[view]).catch(() => false)) {
					ms = Math.round(performance.now() - started);
					break;
				}
				await Bun.sleep(50);
			}
			rows.push({ change, source, view, ms });
			console.log(
				`${change.padEnd(16)} ${source.padEnd(8)} ${view.padEnd(11)} ${ms === null ? "NOT LIVE" : `${ms} ms`}`,
			);
		}),
	);
}

let title = `RT task ${run}`;
let taskId = "";
const task = () => asA.tasks.byId(taskId);
await step(
	"create",
	"api key",
	async () => {
		taskId = (
			await asA.tasks.create({ name: title, team: rtTeam, shareWithTeam: true })
		).id;
	},
	[
		["B list", shows(title)],
		["B board", shows(title)],
		["A created", shows(title)],
	],
);

await open("B detail", b, `/app/tasks/${taskId}`);
await Bun.sleep(6000);

const renamed = `RT renamed ${run}`;
await step("rename", "api key", () => task().rename(renamed), [
	["B list", shows(renamed)],
	["B board", shows(renamed)],
	["B detail", pageHas(renamed)],
	["A created", shows(renamed)],
]);
title = renamed;

await step(
	"status",
	"api key",
	() =>
		task().setProperty(definition(STATUS_DEF), {
			type: "select_option",
			option_id: IN_PROGRESS,
		}),
	[
		["B list", inStatus(title, "In Progress")],
		["B board", inStatus(title, "In Progress")],
		["B detail", pageHas("In Progress")],
		["A created", inStatus(title, "In Progress")],
	],
);

await step(
	"priority",
	"api key",
	() =>
		task().setProperty(definition(PRIORITY_DEF), {
			type: "select_option",
			option_id: HIGH,
		}),
	[
		["B list", rowHas(title, "High")],
		["B detail", pageHas("High")],
	],
);

await step(
	"assignee",
	"api key",
	() =>
		task().setProperty(definition(ASSIGNEES_DEF), {
			type: "multi_entity_reference",
			references: [{ entity_type: "USER", entity_id: userB }],
		}),
	[
		["B my tasks", shows(title)],
		["B list", rowHas(title, "rt-b")],
		["B detail", pageHas("rt-b")],
	],
);

const projectName = `RT project ${run}`;
let projectId = "";
await step(
	"project create",
	"api key",
	async () => {
		projectId = (
			await asA.initiatives.create({ name: projectName, shareWithTeam: true })
		).id;
	},
	[["B list", pageHas(projectName)]],
);

await step(
	"project assign",
	"api key",
	() =>
		task().setProperty(definition(PROJECT_DEF), {
			type: "entity_reference",
			reference: { entity_type: "INITIATIVE", entity_id: projectId },
		}),
	[
		["B list", rowHas(title, projectName)],
		["B detail", pageHas(projectName)],
	],
);

const comment = `RT comment ${run}`;
await step("comment", "api key", () => task().comment(comment), [
	["B detail", pageHas(comment)],
]);

// A changes the status in A's own list through the UI; B's board follows.
await step(
	"status",
	"browser",
	async () => {
		const page = views["A created"];
		const row = page.locator(
			`xpath=//*[normalize-space(text())="${title}"]/ancestor::*[.//button[normalize-space(.)="In Progress"]][1]`,
		);
		await row.getByRole("button", { name: "In Progress" }).first().click();
		await page.getByText("In Review", { exact: true }).last().click();
	},
	[
		["B board", inStatus(title, "In Review")],
		["B list", inStatus(title, "In Review")],
		["B detail", pageHas("In Review")],
	],
);

const botTitle = `RT bot task ${run}`;
await step(
	"create",
	"bot",
	() =>
		asBot.tasks.create({ name: botTitle, team: rtTeam, shareWithTeam: true }),
	[
		["B list", shows(botTitle)],
		["B board", shows(botTitle)],
	],
);

await step("delete", "api key", () => task().delete(), [
	["B list", gone(title)],
	["B board", gone(title)],
	["B my tasks", gone(title)],
	["A created", gone(title)],
]);

// Access: a private task reaches nobody else, and C never hears of team tasks.
const privateTitle = `RT private ${run}`;
let privateId = "";
await step(
	"private create",
	"api key",
	async () => {
		privateId = (
			await asA.tasks.create({ name: privateTitle, shareWithTeam: false })
		).id;
	},
	[["A created", shows(privateTitle)]],
);
await Bun.sleep(2000);
const patchesFor = async (view: string, id: string) =>
	(
		await views[view].evaluate(
			() => (window as unknown as { soupPatches: string[] }).soupPatches,
		)
	).filter((p) => p.includes(id)).length;
const leaks = {
	"B saw private task": (await near(views["B list"], privateTitle)) !== null,
	"B patches for private task": await patchesFor("B list", privateId),
	"C patches for team task": await patchesFor("C all", taskId),
	"C patches for private task": await patchesFor("C all", privateId),
	"C saw team task": (await near(views["C all"], botTitle)) !== null,
};
console.log("access", JSON.stringify(leaks));
console.log(
	`B received ${await patchesFor("B list", taskId)} soup_patch frames for the shared task`,
);
await browser.close();

const missed = rows.filter((row) => row.ms === null);
const leaked = Object.values(leaks).some(
	(value) => value !== false && value !== 0,
);
console.log(JSON.stringify({ baseline: BASELINE, rows, leaks }));
if (!BASELINE && (missed.length > 0 || leaked)) process.exit(1);
