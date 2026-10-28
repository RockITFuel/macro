#!/usr/bin/env python3
"""Compare a gate run with its merge-base baseline and print GO/NO-GO.

Macro's suites are judged against the baseline: a test counts as a regression
when it fails on the candidate and did not fail on the baseline (passed, or
did not exist). The smoke suite has no baseline: every failure counts, except
tests tagged @realtime, which are listed separately and only block with
GATE_STRICT_REALTIME=1 (task/board realtime is a known open issue). A smoke
failure whose message carries "ENVIRONMENT:" (e.g. bucket CORS) is listed as
not verified instead of blocking; known issues the suite ignores (see
tests/selfhost-smoke/lib/fixtures.ts) are listed for the record.
"""
import argparse
import json
import os
import re
from pathlib import Path

TEST_LINE = re.compile(r"^test (\S+) \.\.\. (ok|FAILED|ignored)")
RUNNING = re.compile(r"Running (?:unittests )?(\S+) \(.*?/deps/([A-Za-z0-9_]+)-[0-9a-f]+\)")


def cargo_log(path: Path, prefix: str) -> dict[str, bool]:
    """test id -> passed, from `cargo test` output."""
    out: dict[str, bool] = {}
    if not path.exists():
        return out
    text = path.read_text(errors="replace")
    if text.startswith("CRATE_ABSENT"):
        return out
    binary = ""
    for line in text.splitlines():
        if m := RUNNING.search(line):
            binary = m.group(2)
        elif m := TEST_LINE.match(line):
            if m.group(2) != "ignored":
                out[f"{prefix}::{binary}::{m.group(1)}"] = m.group(2) == "ok"
    if "could not compile" in text or re.search(r"^error(\[E\d+\])?:", text, re.M):
        out[f"{prefix}::BUILD"] = False
    m = re.search(r"^EXIT (\d+)$", text, re.M)
    if m and m.group(1) == "124":
        out[f"{prefix}::TIMEOUT"] = False
    return out


def playwright_json(path: Path, prefix: str) -> dict[str, bool]:
    out: dict[str, bool] = {}
    if not path.exists():
        return out
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError:
        return {f"{prefix}::REPORT": False}

    def walk(suite: dict, titles: list[str]) -> None:
        for spec in suite.get("specs", []):
            for t in spec.get("tests", []):
                if t.get("status") == "skipped":
                    continue
                key = " > ".join([*titles, spec["title"]])
                out[f"{prefix}::{spec.get('file', suite.get('file', ''))}::{key}"] = t.get("status") in ("expected", "flaky")
        for child in suite.get("suites", []):
            walk(child, [*titles, child["title"]] if child.get("title") and not child["title"].endswith((".ts", ".tsx")) else titles)

    for s in data.get("suites", []):
        walk(s, [])
    for err in data.get("errors", []):
        out[f"{prefix}::GLOBAL_ERROR::{(err.get('message') or '')[:80]}"] = False
    return out


def smoke_details(path: Path) -> tuple[dict[str, str], set[str]]:
    """Smoke test id -> first error message (failed tests), and known issues seen."""
    errors: dict[str, str] = {}
    known: set[str] = set()
    if not path.exists():
        return errors, known
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError:
        return errors, known

    def walk(suite: dict, titles: list[str]) -> None:
        for spec in suite.get("specs", []):
            for t in spec.get("tests", []):
                for a in t.get("annotations", []) + [a for r in t.get("results", []) for a in r.get("annotations", [])]:
                    if a.get("type") == "known-issue":
                        known.add(a.get("description", ""))
                results = t.get("results", [])
                if results and t.get("status") not in ("expected", "flaky", "skipped"):
                    errs = results[-1].get("errors") or [results[-1].get("error") or {}]
                    msg = (errs[0].get("message") or "").strip() if errs else ""
                    key = " > ".join([*titles, spec["title"]])
                    errors[f"smoke::{spec.get('file', suite.get('file', ''))}::{key}"] = re.sub(r"\x1b\[[0-9;]*m", "", msg)
        for child in suite.get("suites", []):
            walk(child, [*titles, child["title"]] if child.get("title") and not child["title"].endswith((".ts", ".tsx")) else titles)

    for s in data.get("suites", []):
        walk(s, [])
    return errors, known


def vitest_json(path: Path, prefix: str) -> dict[str, bool]:
    out: dict[str, bool] = {}
    if not path.exists():
        return out
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError:
        return {f"{prefix}::REPORT": False}
    for f in data.get("testResults", []):
        # Relative to the repo root, so both trees' files share a key.
        name = re.sub(r"^.*?/(?=(?:apps|packages|services|tooling|crates)/)", "", f.get("name", ""))
        assertions = f.get("assertionResults", [])
        for a in assertions:
            if a.get("status") in ("passed", "failed"):
                key, n = f"{prefix}::{name}::{a.get('fullName')}", 1
                while key in out:  # parametrised tests can share a name
                    n += 1
                    key = f"{prefix}::{name}::{a.get('fullName')} #{n}"
                out[key] = a["status"] == "passed"
        if f.get("status") == "failed" and not any(a.get("status") == "failed" for a in assertions):
            out[f"{prefix}::{name}::FILE"] = False
    return out


def suites(d: Path) -> dict[str, dict[str, bool]]:
    res = {
        "rust-e2e": cargo_log(d / "rust-e2e.log", "rust-e2e"),
        "web-e2e": playwright_json(d / "web-e2e.json", "web-e2e"),
        "vitest": vitest_json(d / "vitest.json", "vitest"),
        "cargo-test": {},
    }
    for log in sorted((d / "unit").glob("*.log")) if (d / "unit").exists() else []:
        res["cargo-test"].update(cargo_log(log, log.stem))
    if (d / "stack-up.failed").exists():
        res["stack"] = {"stack::up": False}
    seed = d / "seed.log"
    if seed.exists():
        res["seed"] = {"seed::local-e2e-smoke": "SEED_FAILED" not in seed.read_text(errors="replace")}
    return res


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cand", required=True)
    ap.add_argument("--base", required=True)
    ap.add_argument("--sha", required=True)
    ap.add_argument("--base-sha", required=True)
    ap.add_argument("--failed-steps", default="")
    a = ap.parse_args()
    cand_dir, base_dir = Path(a.cand), Path(a.base)
    blocking: list[str] = []
    lines = [f"Release gate {a.sha} (baseline: merge-base {a.base_sha})", ""]

    if (cand_dir / "suites").exists():
        cand, base = suites(cand_dir / "suites"), suites(base_dir)
        lines.append("Macro suites (candidate vs baseline):")
        for name, results in cand.items():
            b = base.get(name, {})
            fails = sorted(k for k, ok in results.items() if not ok)
            regressions = [k for k in fails if b.get(k) is not False]
            pre = [k for k in fails if b.get(k) is False]
            fixed = [k for k, ok in b.items() if not ok and results.get(k)]
            no_base = not b and bool(results)
            lines.append(
                f"  {name:11} {sum(results.values())}/{len(results)} pass; "
                f"regressions {len(regressions)}, pre-existing {len(pre)}, fixed {len(fixed)}"
                + (" (no baseline)" if no_base else "")
            )
            for k in regressions[:40]:
                lines.append(f"    REGRESSION {k}")
            if len(regressions) > 40:
                lines.append(f"    ... {len(regressions) - 40} more")
            blocking += regressions
            skipped = cand_dir / "suites" / f"{name}.skipped"
            if not results and skipped.exists():
                lines.append(f"    {skipped.read_text().strip()}")
            elif not results and name in ("rust-e2e", "web-e2e"):
                lines.append(f"    MISSING: no {name} results")
                blocking.append(f"{name}::NO_RESULTS")
            elif b and sum(b.values()) < len(b) / 2:
                lines.append(f"    note: the baseline passes only {sum(b.values())}/{len(b)}; failures both trees share are harness, not verdicts")
        lines.append("")

    smoke = cand_dir / "smoke" / "results.json"
    not_verified: list[str] = []
    ran_smoke = (cand_dir / "smoke").exists()
    if ran_smoke:
        res = playwright_json(smoke, "smoke")
        errors, known = smoke_details(smoke)
        realtime = {k: v for k, v in res.items() if "@realtime" in k}
        other = {k: v for k, v in res.items() if k not in realtime}
        env_blocked = {k for k, ok in other.items() if not ok and "ENVIRONMENT:" in errors.get(k, "")}
        lines.append(f"Smoke (staging, public mode): {sum(other.values())}/{len(other)} pass")
        for k, ok in sorted(other.items()):
            if not ok and k not in env_blocked:
                first = errors.get(k, "").splitlines()[0][:160] if errors.get(k) else ""
                lines.append(f"    FAIL {k.split('::')[-1]}  [{k.split('::')[1]}]")
                if first:
                    lines.append(f"         {first}")
                blocking.append(k)
        if not res:
            lines.append("    MISSING: no smoke results")
            blocking.append("smoke::NO_RESULTS")
        if env_blocked:
            lines.append("  Not verified (environment, not a code verdict):")
            for k in sorted(env_blocked):
                msg = errors[k][errors[k].index("ENVIRONMENT:") + 12:].splitlines()[0].strip()
                lines.append(f"    - {k.split('::')[-1]}: {msg}")
                not_verified.append(k)
        if known:
            lines.append("  Known issues seen (predate the fork's changes, not blocking):")
            for why in sorted(known):
                lines.append(f"    - {why}")
        strict = os.environ.get("GATE_STRICT_REALTIME") == "1"
        lines.append(f"Realtime (two users): {sum(realtime.values())}/{len(realtime)} pass" + (" (blocking)" if strict else " (non-blocking)"))
        for k, ok in sorted(realtime.items()):
            lines.append(f"    {'ok  ' if ok else 'FAIL'} {k.split('::')[-1]}")
            if strict and not ok:
                blocking.append(k)
        lines.append("")

    for step in a.failed_steps.split():
        if step != "smoke":
            blocking.append(f"step::{step}")
            lines.append(f"Step failed: {step} (see {cand_dir / 'logs'})")

    lines.append("Evidence:")
    lines.append(f"  summary      {cand_dir / 'summary.txt'}")
    lines.append(f"  gate log     {cand_dir / 'gate.log'}  (build/staging logs in {cand_dir / 'logs'})")
    if (cand_dir / "suites").exists():
        lines.append(f"  suites       {cand_dir / 'suites'}  (baseline {base_dir})")
    if ran_smoke:
        lines.append(f"  smoke        {cand_dir / 'smoke' / 'run.log'}, report {cand_dir / 'smoke' / 'html' / 'index.html'}")
        lines.append(f"               failure traces/screenshots {cand_dir / 'smoke' / 'artifacts'}")
    lines.append("")

    scope = []
    if not (cand_dir / "suites").exists():
        scope.append("Macro suites not run")
    if not ran_smoke:
        scope.append("smoke not run")
    if not_verified:
        scope.append(f"{len(not_verified)} check(s) not verified: environment")
    note = f" ({'; '.join(scope)})" if scope else ""
    if blocking:
        lines.append(f"RESULT: NO-GO ({len(blocking)} blocking){note}")
    else:
        lines.append(f"RESULT: GO{note}")
    print("\n".join(lines))


main()
