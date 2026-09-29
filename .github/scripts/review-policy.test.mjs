// Run with: node --test .github/scripts/review-policy.test.mjs
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyPullRequest,
  evaluateGate,
  globToRegExp,
  matchGroups,
  POLICY_VERSION,
  parseEvidenceMarker,
  renderEvidenceMarker,
  SIZE_LIMITS,
} from "./review-policy.mjs";

const file = (filename, extra = {}) => ({
  filename,
  status: "modified",
  additions: 1,
  deletions: 1,
  ...extra,
});
const classify = (...files) => classifyPullRequest({ files });

describe("globToRegExp", () => {
  it("matches ** at any depth, including zero", () => {
    const re = globToRegExp("**/package.json");
    assert.ok(re.test("package.json"));
    assert.ok(re.test("packages/lib/package.json"));
    assert.ok(!re.test("package.json.bak"));
  });

  it("keeps * inside a single segment", () => {
    const re = globToRegExp("packages/app-store/*calendar*/**");
    assert.ok(re.test("packages/app-store/googlecalendar/lib/CalendarService.ts"));
    assert.ok(!re.test("packages/app-store/zoom/calendar/x.ts"));
  });

  it("expands braces and escapes regex characters", () => {
    const re = globToRegExp("apps/web/app/(booking-page-wrapper)/{a,b.c}.ts");
    assert.ok(re.test("apps/web/app/(booking-page-wrapper)/a.ts"));
    assert.ok(re.test("apps/web/app/(booking-page-wrapper)/b.c.ts"));
    assert.ok(!re.test("apps/web/app/(booking-page-wrapper)/bxc.ts"));
  });

  it("anchors the whole path", () => {
    assert.ok(!globToRegExp("packages/prisma/**").test("vendor/packages/prisma/schema.prisma"));
  });
});

describe("classifyPullRequest: low risk", () => {
  it("CSS-only change", () => {
    const result = classify(
      file("apps/web/styles/globals.css"),
      file("packages/ui/styles/shared-globals.css")
    );
    assert.equal(result.risk, "low");
    assert.deepEqual(result.reasons, []);
  });

  it("docs, i18n and assets", () => {
    const result = classify(
      file("README.md"),
      file("packages/i18n/locales/pt-BR/common.json"),
      file("apps/web/public/logo.svg")
    );
    assert.equal(result.risk, "low");
  });

  it("UI feature outside scheduling (settings, profile)", () => {
    const result = classify(
      file("apps/web/modules/settings/my-account/profile-view.tsx"),
      file("packages/features/settings/ProfileSection.tsx")
    );
    assert.equal(result.risk, "low");
  });

  it("does not confuse lib modules with similarly named critical ones", () => {
    assert.equal(classify(file("packages/lib/slugify.ts")).risk, "low");
    assert.deepEqual(matchGroups("packages/lib/timezone.ts"), ["date-time"]);
    assert.deepEqual(matchGroups("packages/lib/isOutOfBounds.timezone.test.ts"), ["date-time"]);
  });
});

describe("classifyPullRequest: high risk", () => {
  const cases = [
    ["packages/features/slots/lib/getSlots.ts", "scheduling-core"],
    ["packages/features/bookings/Booker/Booker.tsx", "scheduling-core"],
    ["packages/trpc/server/routers/viewer/slots/util.ts", "scheduling-core"],
    ["apps/web/modules/bookings/views/bookings-single-view.tsx", "scheduling-core"],
    ["packages/platform/atoms/booker/BookerPlatformWrapper.tsx", "scheduling-core"],
    ["packages/dayjs/index.ts", "date-time"],
    ["packages/lib/availability.ts", "date-time"],
    ["packages/app-store/googlecalendar/lib/CalendarService.ts", "integrations-notifications"],
    ["packages/emails/templates/organizer-scheduled-email.ts", "integrations-notifications"],
    ["apps/web/app/api/cron/bookingReminder/route.ts", "integrations-notifications"],
    ["packages/prisma/schema.prisma", "data-api-security"],
    ["apps/api/v2/src/main.ts", "data-api-security"],
    [".github/workflows/review-policy.yml", "supply-chain-ci"],
    ["package.json", "supply-chain-ci"],
    ["packages/ui/package.json", "supply-chain-ci"],
    ["yarn.lock", "supply-chain-ci"],
    [".env.example", "supply-chain-ci"],
    ["CLAUDE.md", "supply-chain-ci"],
    [".claude/skills/revisar-pr/SKILL.md", "supply-chain-ci"],
  ];

  for (const [path, group] of cases) {
    it(`${path} → ${group}`, () => {
      const result = classify(file(path));
      assert.equal(result.risk, "high");
      assert.ok(result.files[0].groups.includes(group), `groups: ${result.files[0].groups}`);
      assert.ok(result.reasons.some((r) => r.startsWith(`${group}:`)));
    });
  }

  it("a single critical file makes the whole PR high risk", () => {
    const result = classify(file("apps/web/styles/globals.css"), file("packages/dayjs/index.ts"));
    assert.equal(result.risk, "high");
  });

  it("renaming a file out of a critical path is high risk", () => {
    const result = classify(
      file("packages/ui/components/getSlots.ts", {
        status: "renamed",
        previous_filename: "packages/features/slots/lib/getSlots.ts",
      })
    );
    assert.equal(result.risk, "high");
    assert.equal(result.files[0].previousFilename, "packages/features/slots/lib/getSlots.ts");
  });

  it("deleting a file in a critical path is high risk", () => {
    const result = classify(
      file("packages/features/bookings/lib/handleNewBooking.ts", { status: "removed" })
    );
    assert.equal(result.risk, "high");
  });
});

describe("classifyPullRequest: size and completeness", () => {
  it("too many files", () => {
    const files = Array.from({ length: SIZE_LIMITS.maxFiles + 1 }, (_, i) =>
      file(`docs/page-${i}.md`, { additions: 0, deletions: 0 })
    );
    const result = classify(...files);
    assert.equal(result.risk, "high");
    assert.ok(result.reasons.some((r) => r.startsWith("size:")));
  });

  it("the file limit itself is still low risk", () => {
    const files = Array.from({ length: SIZE_LIMITS.maxFiles }, (_, i) =>
      file(`docs/page-${i}.md`, { additions: 0, deletions: 0 })
    );
    assert.equal(classify(...files).risk, "low");
  });

  it("too many changed lines", () => {
    const result = classify(
      file("apps/web/styles/globals.css", { additions: 300, deletions: SIZE_LIMITS.maxChangedLines - 299 })
    );
    assert.equal(result.risk, "high");
    assert.equal(result.changedLines, SIZE_LIMITS.maxChangedLines + 1);
  });

  it("truncated file list", () => {
    const result = classifyPullRequest({ files: [file("README.md")], totalFiles: 2 });
    assert.equal(result.risk, "high");
    assert.ok(result.reasons.some((r) => r.startsWith("truncated:")));
  });

  it("empty PR", () => {
    assert.equal(classify().risk, "high");
  });
});

describe("evidence marker", () => {
  const data = {
    policyVersion: POLICY_VERSION,
    sha: "abc123",
    risk: "low",
    decision: "auto-approved",
    validation: "pass",
    ci: "pass",
  };

  it("round-trips inside a comment body", () => {
    const body = `## Review policy evidence\n\nsome table\n\n${renderEvidenceMarker(data)}\n`;
    assert.deepEqual(parseEvidenceMarker(body), data);
  });

  it("returns null for missing or malformed markers", () => {
    assert.equal(parseEvidenceMarker("no marker here"), null);
    assert.equal(parseEvidenceMarker("<!-- review-policy-evidence {not json} -->"), null);
    assert.equal(parseEvidenceMarker(null), null);
  });

  it("refuses to render data that could close the HTML comment", () => {
    assert.throws(() => renderEvidenceMarker({ note: "-->" }));
  });
});

describe("evaluateGate", () => {
  const headSha = "abc123";
  const evidence = (overrides = {}) => ({
    policyVersion: POLICY_VERSION,
    sha: headSha,
    risk: "low",
    decision: "auto-approved",
    validation: "pass",
    ci: "pass",
    ...overrides,
  });
  const approved = { present: true, trusted: true, afterEvidence: true };

  it("low risk with matching evidence passes", () => {
    assert.equal(evaluateGate({ risk: "low", headSha, evidence: evidence() }).state, "success");
  });

  it("fails without evidence", () => {
    assert.equal(evaluateGate({ risk: "low", headSha, evidence: null }).state, "failure");
  });

  it("fails when evidence is for another commit", () => {
    const result = evaluateGate({ risk: "low", headSha, evidence: evidence({ sha: "old" }) });
    assert.equal(result.state, "failure");
    assert.match(result.description, /older commit/);
  });

  it("fails when evidence uses another policy version", () => {
    assert.equal(
      evaluateGate({ risk: "low", headSha, evidence: evidence({ policyVersion: 0 }) }).state,
      "failure"
    );
  });

  it("fails when the gate disagrees with the recorded risk", () => {
    const result = evaluateGate({ risk: "high", headSha, evidence: evidence(), ownerApproval: approved });
    assert.equal(result.state, "failure");
    assert.match(result.description, /gate classified high/);
  });

  it("fails when low-risk evidence has failing validation or CI", () => {
    assert.equal(
      evaluateGate({ risk: "low", headSha, evidence: evidence({ validation: "fail" }) }).state,
      "failure"
    );
    assert.equal(
      evaluateGate({ risk: "low", headSha, evidence: evidence({ ci: "pending" }) }).state,
      "failure"
    );
  });

  it("fails when the decision is blocked or unknown", () => {
    assert.equal(
      evaluateGate({ risk: "low", headSha, evidence: evidence({ decision: "blocked" }) }).state,
      "failure"
    );
    assert.equal(
      evaluateGate({ risk: "low", headSha, evidence: evidence({ decision: "yolo" }) }).state,
      "failure"
    );
  });

  describe("high risk", () => {
    const high = evidence({ risk: "high", decision: "needs-owner-review" });

    it("waits for owner-approved", () => {
      const result = evaluateGate({
        risk: "high",
        headSha,
        evidence: high,
        ownerApproval: { present: false },
      });
      assert.equal(result.state, "failure");
      assert.match(result.description, /waiting/);
    });

    it("rejects a label added by a non-maintainer", () => {
      const ownerApproval = { ...approved, trusted: false };
      assert.equal(evaluateGate({ risk: "high", headSha, evidence: high, ownerApproval }).state, "failure");
    });

    it("rejects a label older than the latest evidence", () => {
      const ownerApproval = { ...approved, afterEvidence: false };
      assert.equal(evaluateGate({ risk: "high", headSha, evidence: high, ownerApproval }).state, "failure");
    });

    it("rejects auto-approved decisions on high-risk PRs", () => {
      const result = evaluateGate({
        risk: "high",
        headSha,
        evidence: evidence({ risk: "high" }),
        ownerApproval: approved,
      });
      assert.equal(result.state, "failure");
    });

    it("passes with a trusted, fresh owner-approved label", () => {
      assert.equal(
        evaluateGate({ risk: "high", headSha, evidence: high, ownerApproval: approved }).state,
        "success"
      );
    });
  });
});
