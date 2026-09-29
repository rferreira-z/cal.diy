// PR review policy: classifies a pull request as low or high risk and evaluates the CI gate.
// Source of truth for .github/PR_REVIEW_POLICY.md, the /revisar-pr skill and the review-policy workflow.
// Dependency-free on purpose: the workflow runs it from the base branch without `yarn install`.

import { execFileSync } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const POLICY_VERSION = 1;

export const SIZE_LIMITS = { maxFiles: 20, maxChangedLines: 400 };

export const EVIDENCE_MARKER = "review-policy-evidence";

export const LABELS = {
  autoApproved: "auto-approved",
  needsOwnerReview: "needs-owner-review",
  ownerApproved: "owner-approved",
};

export const DECISIONS = ["auto-approved", "needs-owner-review", "blocked"];

// A PR is high risk if any changed path (old or new) matches one of these groups.
export const HIGH_RISK_GROUPS = [
  {
    id: "scheduling-core",
    reason: "Slots, availability, bookings, event types or the booking UI",
    patterns: [
      "packages/features/{slots,availability,schedules,bookings,busyTimes,calendars,eventtypes,selectedSlots,selectedCalendar,ooo,travelSchedule,holidays,timezone,cityTimezones,host,booking-audit,bookingReference,bookingReport,calendar-subscription,conferencing,noShow,assignment-reason,hashedLink,troubleshooter,di,embed,video-call-guest,calVideoSettings}/**",
      "packages/features/{CalendarEventBuilder,handleMarkNoShow,get-cal-video-reference}.*",
      "packages/trpc/server/routers/viewer/{slots,availability,bookings,eventTypes,calendars,ooo,travelSchedules,holidays,calVideo}/**",
      "packages/trpc/server/routers/{publicViewer,loggedInViewer}/**",
      "apps/web/pages/api/book/**",
      "apps/web/modules/{availability,bookings,schedules,event-types,calendars,calendar-view,d,timezone,troubleshooter}/**",
      "apps/web/app/(booking-page-wrapper)/**",
      "apps/web/app/reschedule/**",
      "apps/web/app/api/{availability,cancel,verify-booking-token,video,recorded-daily-video}/**",
      "packages/platform/**",
      "packages/embeds/**",
    ],
  },
  {
    id: "date-time",
    reason: "Date, time zone or recurrence handling",
    patterns: [
      "packages/dayjs/**",
      "packages/lib/{dayjs,bookings,schedules,intervalLimits,holidays}/**",
      "packages/lib/{availability,timeZones,timezone,timezoneConstants,timeShift,timeFormat,parse-dates,parse-zone,dateTimeFormatter,isOutOfBounds,isProblematicTimezone,isRecurringEvent,recurringStrings,weekday,weekstart,intervalTree,buildCalEventFromBooking,getBooking,CalEventParser,formatCalendarEvent}.*",
    ],
  },
  {
    id: "integrations-notifications",
    reason: "Calendar and video integrations, emails, SMS, webhooks, background tasks or crons",
    patterns: [
      "packages/app-store/*calendar*/**",
      "packages/app-store/{_utils,_lib}/**",
      "packages/app-store/{dailyvideo,googlevideo,huddle01video,jelly,jitsivideo,lyra,nextcloudtalk,office365video,shimmervideo,sylapsvideo,tandemvideo,webex,zoomvideo}/**",
      "packages/app-store/*/lib/{CalendarService,VideoApiAdapter,PaymentService}.*",
      "packages/app-store/{_appRegistry,*.generated}.ts",
      "packages/lib/{CalendarService,CalendarAppError,connectedCalendar,sanitizeCalendarObject,delegationCredential}.*",
      "packages/lib/tasker/**",
      "packages/emails/**",
      "packages/sms/**",
      "packages/features/{webhooks,tasker,notifications}/**",
      "packages/features/trigger.config.ts",
      "apps/web/app/api/{cron,webhook,webhooks,tasks,sync}/**",
    ],
  },
  {
    id: "data-api-security",
    reason: "Database, public API, auth, credentials or payments",
    patterns: [
      "packages/prisma/**",
      "packages/kysely/**",
      "apps/api/**",
      "packages/features/{auth,credentials,oauth,platform-oauth-client,api-keys-legacy,users,membership,credits,watchlist,blocklist,bot-detection}/**",
      "packages/app-store/{alby,btcpayserver,hitpay,mock-payment-app,paypal,stripepayment}/**",
      "apps/web/pages/api/**",
      "packages/trpc/server/{middlewares,procedures}/**",
      "packages/trpc/server/{trpc,createContext}.ts",
      "packages/trpc/server/routers/viewer/{auth,admin,apiKeys,credentials,oAuth,payments}/**",
      "packages/lib/{server,auth,crypto,payment}/**",
      "packages/lib/{crypto,pkce,totp,ssrfProtection,rateLimit,checkRateLimitAndThrowError,getSafeRedirectUrl,env,serverConfig,constants}.*",
      "apps/web/app/api/auth/**",
      "apps/web/{proxy,instrumentation,instrumentation-client}.ts",
    ],
  },
  {
    id: "supply-chain-ci",
    reason: "CI, dependencies, build/runtime config or agent instructions",
    patterns: [
      ".github/**",
      "**/package.json",
      "yarn.lock",
      ".yarnrc.yml",
      ".yarn/**",
      ".npmrc",
      "turbo.json",
      "**/next.config.*",
      "**/.env*",
      "**/Dockerfile*",
      "docker-compose*",
      "**/vercel.json",
      "**/tsconfig*.json",
      "{vitest,playwright}.*",
      "biome*.json",
      "**/CLAUDE.md",
      ".claude/**",
    ],
  },
];

/**
 * Minimal glob → RegExp: `**` (any depth), `*` (within a segment), `?`, `{a,b}`.
 * Patterns are anchored to the full path.
 */
export function globToRegExp(glob) {
  let source = "";
  let braceDepth = 0;
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          source += "(?:.*/)?";
          i += 2;
        } else {
          source += ".*";
          i += 1;
        }
      } else {
        source += "[^/]*";
      }
    } else if (char === "?") {
      source += "[^/]";
    } else if (char === "{") {
      braceDepth++;
      source += "(?:";
    } else if (char === "}" && braceDepth > 0) {
      braceDepth--;
      source += ")";
    } else if (char === "," && braceDepth > 0) {
      source += "|";
    } else {
      source += char.replace(/[.+^$()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

const COMPILED_GROUPS = HIGH_RISK_GROUPS.map((group) => ({
  ...group,
  regexps: group.patterns.map(globToRegExp),
}));

export function matchGroups(path) {
  return COMPILED_GROUPS.filter((group) => group.regexps.some((re) => re.test(path))).map((g) => g.id);
}

/**
 * @param {{ files: Array<{ filename: string, previous_filename?: string, status?: string, additions?: number, deletions?: number }>, totalFiles?: number }} input
 *   `files` uses the shape returned by `GET /repos/{owner}/{repo}/pulls/{n}/files`.
 * @returns {{ risk: "low" | "high", reasons: string[], changedLines: number, files: Array<{ filename: string, previousFilename?: string, status?: string, groups: string[] }> }}
 */
export function classifyPullRequest({ files, totalFiles = files.length }) {
  const reasons = [];
  const classified = files.map((file) => {
    const paths = [file.filename, file.previous_filename].filter(Boolean);
    const groups = [...new Set(paths.flatMap(matchGroups))];
    return {
      filename: file.filename,
      ...(file.previous_filename ? { previousFilename: file.previous_filename } : {}),
      status: file.status,
      groups,
    };
  });

  for (const group of HIGH_RISK_GROUPS) {
    const hits = classified.filter((f) => f.groups.includes(group.id));
    if (hits.length) reasons.push(`${group.id}: ${group.reason} (${hits.length} file(s))`);
  }

  if (files.length === 0) reasons.push("empty: the PR has no changed files to classify");
  if (totalFiles > files.length) {
    reasons.push(`truncated: only ${files.length} of ${totalFiles} changed files could be listed`);
  }
  if (totalFiles > SIZE_LIMITS.maxFiles) {
    reasons.push(`size: ${totalFiles} files changed (limit ${SIZE_LIMITS.maxFiles})`);
  }
  const changedLines = files.reduce((sum, f) => sum + (f.additions ?? 0) + (f.deletions ?? 0), 0);
  if (changedLines > SIZE_LIMITS.maxChangedLines) {
    reasons.push(`size: ${changedLines} lines changed (limit ${SIZE_LIMITS.maxChangedLines})`);
  }

  return { risk: reasons.length ? "high" : "low", reasons, changedLines, files: classified };
}

export function renderEvidenceMarker(data) {
  const json = JSON.stringify(data);
  if (json.includes("--")) throw new Error("evidence marker must not contain '--'");
  return `<!-- ${EVIDENCE_MARKER} ${json} -->`;
}

/**
 * Returns the parsed marker, or null when the body has no well-formed marker.
 * The marker must be the last line and appear exactly once: evidence comments embed PR-controlled
 * text (e.g. filenames), which could otherwise carry a forged marker above the real one.
 */
export function parseEvidenceMarker(body) {
  const text = (body ?? "").trimEnd();
  if (text.split(EVIDENCE_MARKER).length !== 2) return null;
  const match = new RegExp(`(?:^|\\n)<!-- ${EVIDENCE_MARKER} (\\{[^\\n]*\\}) -->$`).exec(text);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]);
    return data && typeof data === "object" && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

/**
 * Pure decision of the CI gate. The workflow gathers the facts; this decides the commit status.
 *
 * @param {{
 *   risk: "low" | "high",
 *   headSha: string,
 *   evidence: null | { sha?: string, risk?: string, decision?: string, policyVersion?: number, validation?: string, ci?: string },
 *   ownerApproval?: { present: boolean, trusted: boolean, afterEvidence: boolean },
 * }} input
 * @returns {{ state: "success" | "failure", description: string }}
 */
export function evaluateGate({ risk, headSha, evidence, ownerApproval }) {
  const fail = (description) => ({ state: "failure", description });

  if (!evidence) return fail("No /revisar-pr evidence from a maintainer for this PR");
  if (evidence.sha !== headSha) return fail("Evidence is for an older commit; run /revisar-pr again");
  if (evidence.policyVersion !== POLICY_VERSION) {
    return fail(`Evidence uses policy v${evidence.policyVersion}; run /revisar-pr again`);
  }
  if (evidence.risk !== risk) {
    return fail(`Evidence says ${evidence.risk} risk but the gate classified ${risk}`);
  }
  if (!DECISIONS.includes(evidence.decision)) return fail(`Unknown decision "${evidence.decision}"`);
  if (evidence.decision === "blocked") return fail("Blocked by /revisar-pr: validation or CI failed");

  if (evidence.validation !== "pass" || evidence.ci !== "pass") {
    return fail("Approval requires passing validation and CI evidence");
  }

  if (risk === "low") {
    if (evidence.decision !== "auto-approved") return fail(`Low risk but decision is ${evidence.decision}`);
    return { state: "success", description: "Low risk: auto-approved by review policy" };
  }

  if (evidence.decision !== "needs-owner-review")
    return fail(`High risk but decision is ${evidence.decision}`);
  if (!ownerApproval?.present) return fail(`High risk: waiting for "${LABELS.ownerApproved}" label`);
  if (!ownerApproval.trusted) return fail(`"${LABELS.ownerApproved}" was not added by a maintainer`);
  if (!ownerApproval.afterEvidence) {
    return fail(`"${LABELS.ownerApproved}" predates the latest evidence; add it again`);
  }
  return { state: "success", description: "High risk: approved by owner" };
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

// CLI used by the /revisar-pr skill: node .github/scripts/review-policy.mjs --pr <n> [--repo owner/name]
function main(argv) {
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i === -1 ? undefined : argv[i + 1];
  };
  const prNumber = arg("--pr");
  const repo = arg("--repo") ?? "rferreira-z/cal.diy";
  if (!prNumber || !/^\d+$/.test(prNumber)) {
    console.error("usage: node .github/scripts/review-policy.mjs --pr <number> [--repo owner/name]");
    process.exit(2);
  }

  const pr = JSON.parse(gh(["api", `repos/${repo}/pulls/${prNumber}`]));
  const pages = JSON.parse(
    gh(["api", "--paginate", "--slurp", `repos/${repo}/pulls/${prNumber}/files?per_page=100`])
  );
  const files = pages.flat();
  const result = classifyPullRequest({ files, totalFiles: pr.changed_files });

  console.log(
    JSON.stringify(
      {
        policyVersion: POLICY_VERSION,
        repo,
        pr: pr.number,
        headSha: pr.head.sha,
        baseRef: pr.base.ref,
        ...result,
      },
      null,
      2
    )
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2));
}
