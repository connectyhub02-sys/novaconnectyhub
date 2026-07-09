import fs from "node:fs";
import path from "node:path";

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);
const SOURCE_SPEC = path.resolve(process.env.SOURCE_OPENAPI_SPEC || "uazapi-openapi-spec.yaml");
const PUBLIC_SPEC = path.resolve(process.env.CONNECTYHUB_OPENAPI_SPEC || "docs/connectyhub-openapi-spec.yaml");
const REPORT_PATH = path.resolve(process.env.CONNECTYHUB_COVERAGE_REPORT || "docs/connectyhub-uazapi-coverage.md");

const INTENTIONALLY_BLOCKED_PATHS = {
  "/instance/create": "Use POST /instances. Raw provider creation requires admintoken and bypasses ConnectyHub ownership, billing and webhook setup.",
  "/instance/all": "Use GET /instances or admin-only internal inventory. Raw provider listing exposes instances across tenants.",
  "/instance/updateAdminFields": "Provider admin metadata is platform-owned and must not be writable by customer API keys.",
  "/globalwebhook": "ConnectyHub exposes tenant-scoped /webhooks instead of provider-global webhooks.",
  "/globalwebhook/errors": "Use /webhooks/deliveries for tenant-scoped delivery diagnostics.",
  "/admin/restart": "Provider process control is platform-only.",
  "/admin/token/rotate": "Provider admin-token rotation is platform-only.",
};

const NATIVE_RESOURCE_GROUPS = {
  instances: ["/instances", "/instances/{instanceId}", "/instances/{instanceId}/connect", "/instances/{instanceId}/reset", "/instances/{instanceId}/status"],
  messages: ["/messages/text", "/messages/media", "/messages"],
  chats: ["/chats", "/chats/details"],
  contacts: ["/contacts"],
  webhooks: ["/webhooks", "/webhooks/{webhookId}", "/webhooks/{webhookId}/test", "/webhooks/deliveries", "/webhooks/deliveries/{deliveryId}/retry"],
  usage: ["/usage"],
};

const NATIVE_PROMOTION_ROADMAP = [
  {
    group: "message-actions",
    priority: "P1",
    sourcePaths: ["/message/history-sync", "/message/download", "/message/markread", "/message/react", "/message/delete", "/message/edit", "/message/pin"],
    reason: "High-value customer workflows currently require provider proxy payloads instead of stable ConnectyHub contracts.",
  },
  {
    group: "chat-operations",
    priority: "P1",
    sourcePaths: ["/chat/read", "/chat/archive", "/chat/mute", "/chat/pin", "/chat/block", "/chat/labels", "/chat/notes", "/chat/notes/edit"],
    reason: "These are common inbox and CRM operations that should be first-class in the platform.",
  },
  {
    group: "groups",
    priority: "P2",
    sourcePaths: ["/group/create", "/group/list", "/group/info", "/group/updateParticipants", "/group/updateDescription", "/group/updateImage"],
    reason: "Group support unlocks communities and team operations while preserving tenant permissions.",
  },
  {
    group: "sender-campaigns",
    priority: "P2",
    sourcePaths: ["/sender/simple", "/sender/advanced", "/sender/listfolders", "/sender/listmessages", "/sender/cleardone"],
    reason: "Campaign execution needs ConnectyHub billing, rate limits, audit logs and safer UX.",
  },
  {
    group: "newsletters",
    priority: "P3",
    sourcePaths: ["/newsletter/list", "/newsletter/messages", "/newsletter/updates", "/newsletter/search", "/newsletter/follow", "/newsletter/mute"],
    reason: "Channels are valuable but should land after core inbox and campaign operations.",
  },
  {
    group: "business-catalog",
    priority: "P3",
    sourcePaths: ["/business/get/profile", "/business/update/profile", "/business/catalog/list", "/business/catalog/info", "/business/catalog/show", "/business/catalog/hide"],
    reason: "Catalog APIs should be aligned with ConnectyHub product/catalog data before broad exposure.",
  },
];

const flags = new Set(process.argv.slice(2));
const coverage = buildCoverage();

if (flags.has("--json")) {
  process.stdout.write(`${JSON.stringify(coverage, null, 2)}\n`);
} else {
  const markdown = renderMarkdown(coverage);
  process.stdout.write(markdown);
  if (flags.has("--write-doc")) {
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, markdown);
    process.stdout.write(`\nWrote ${REPORT_PATH}\n`);
  }
}

if (coverage.missingUnexpected.length > 0 || coverage.providerMethodGaps.length > 0) {
  process.exitCode = 1;
}

function buildCoverage() {
  const sourcePaths = collectOpenApiPaths(SOURCE_SPEC);
  const publicPaths = collectOpenApiPaths(PUBLIC_SPEC);
  const providerPaths = stripProviderPrefix(publicPaths);
  const nativePaths = [...publicPaths.keys()].filter((item) => !item.startsWith("/provider/")).sort();
  const missingBlocked = [];
  const missingUnexpected = [];
  const providerMethodGaps = [];

  for (const [sourcePath, sourceMethods] of sourcePaths.entries()) {
    const exposedMethods = providerPaths.get(sourcePath);

    if (!exposedMethods) {
      const reason = INTENTIONALLY_BLOCKED_PATHS[sourcePath];
      const item = {
        path: sourcePath,
        methods: formatMethods(sourceMethods),
        reason: reason || "Missing from ConnectyHub provider proxy.",
      };

      if (reason) {
        missingBlocked.push(item);
      } else {
        missingUnexpected.push(item);
      }
      continue;
    }

    const missingMethods = [...sourceMethods].filter((method) => !exposedMethods.has(method));
    if (missingMethods.length > 0) {
      providerMethodGaps.push({
        path: sourcePath,
        missingMethods: formatMethods(missingMethods),
        sourceMethods: formatMethods(sourceMethods),
        connectyHubMethods: formatMethods(exposedMethods),
      });
    }
  }

  return {
    sourceSpec: path.relative(process.cwd(), SOURCE_SPEC).replaceAll("\\", "/"),
    publicSpec: path.relative(process.cwd(), PUBLIC_SPEC).replaceAll("\\", "/"),
    counts: {
      sourcePaths: sourcePaths.size,
      connectyHubPaths: publicPaths.size,
      nativePaths: nativePaths.length,
      providerProxyPaths: providerPaths.size,
      intentionallyBlockedPaths: missingBlocked.length,
      missingUnexpectedPaths: missingUnexpected.length,
      providerMethodGaps: providerMethodGaps.length,
    },
    nativePaths,
    nativeResourceGroups: NATIVE_RESOURCE_GROUPS,
    missingBlocked,
    missingUnexpected,
    providerMethodGaps,
    nativePromotionRoadmap: NATIVE_PROMOTION_ROADMAP,
  };
}

function collectOpenApiPaths(filePath) {
  const result = new Map();
  let currentPath = null;

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const pathMatch = line.match(/^  (\/[^:]+):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      result.set(currentPath, new Set());
      continue;
    }

    const methodMatch = currentPath ? line.match(/^    ([a-z]+):\s*$/) : null;
    if (methodMatch && HTTP_METHODS.has(methodMatch[1])) {
      result.get(currentPath).add(methodMatch[1].toUpperCase());
    }
  }

  return result;
}

function stripProviderPrefix(publicPaths) {
  const result = new Map();
  for (const [publicPath, methods] of publicPaths.entries()) {
    if (!publicPath.startsWith("/provider/")) continue;
    result.set(publicPath.slice("/provider".length), methods);
  }
  return result;
}

function renderMarkdown(input) {
  const lines = [
    "# ConnectyHub x Uazapi API coverage",
    "",
    "Generated by `npm run api:audit`.",
    "",
    "## Summary",
    "",
    `- Source Uazapi paths: ${input.counts.sourcePaths}`,
    `- ConnectyHub public paths: ${input.counts.connectyHubPaths}`,
    `- ConnectyHub native paths: ${input.counts.nativePaths}`,
    `- Provider proxy paths: ${input.counts.providerProxyPaths}`,
    `- Intentionally blocked provider paths: ${input.counts.intentionallyBlockedPaths}`,
    `- Unexpected missing provider paths: ${input.counts.missingUnexpectedPaths}`,
    `- Provider method gaps: ${input.counts.providerMethodGaps}`,
    "",
    "## Native ConnectyHub resources",
    "",
  ];

  for (const [group, paths] of Object.entries(input.nativeResourceGroups)) {
    lines.push(`### ${group}`, "");
    for (const item of paths) lines.push(`- \`${item}\``);
    lines.push("");
  }

  lines.push("## Intentionally blocked provider paths", "");
  for (const item of input.missingBlocked) {
    lines.push(`- \`${item.path}\` (${item.methods}): ${item.reason}`);
  }
  lines.push("");

  lines.push("## Unexpected gaps", "");
  if (input.missingUnexpected.length === 0 && input.providerMethodGaps.length === 0) {
    lines.push("No unexpected provider path or method gaps were found.");
  } else {
    for (const item of input.missingUnexpected) {
      lines.push(`- Missing path \`${item.path}\` (${item.methods}): ${item.reason}`);
    }
    for (const item of input.providerMethodGaps) {
      lines.push(`- Method gap \`${item.path}\`: missing ${item.missingMethods}; source ${item.sourceMethods}; ConnectyHub ${item.connectyHubMethods}`);
    }
  }
  lines.push("");

  lines.push("## Native endpoint promotion roadmap", "");
  for (const item of input.nativePromotionRoadmap) {
    lines.push(`### ${item.priority} ${item.group}`, "");
    lines.push(item.reason, "");
    for (const sourcePath of item.sourcePaths) {
      lines.push(`- \`${sourcePath}\``);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function formatMethods(methods) {
  return [...methods].sort().join(", ");
}
