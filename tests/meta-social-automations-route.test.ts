import { describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { serverModuleHarness } from "./helpers/server-module-harness";
import * as automations from "../src/lib/meta/comment-automations";
import * as channels from "../src/lib/agents/multichannel";

function fixture(
  options: {
    anonymous?: boolean;
    foreignCompany?: boolean;
    foreignAgent?: boolean;
    ready?: boolean;
    conflict?: boolean;
  } = {},
) {
  const filters: Array<[string, unknown]> = [];
  const update = vi.fn();
  const from = vi.fn(() => {
    let writing = false;
    const q = {
      select: () => q,
      neq: () => q,
      eq: (key: string, value: unknown) => {
        filters.push([key, value]);
        return q;
      },
      update: (value: unknown) => {
        writing = true;
        update(value);
        return q;
      },
      maybeSingle: async () => ({
        error: null,
        data: writing
          ? options.conflict
            ? null
            : { id: "agent" }
          : options.foreignAgent
            ? null
            : {
                id: "agent",
                updated_at: "version",
                metadata: {
                  preserved: true,
                  multichannel_config: {
                    channels: { instagram_comments: { enabled: true } },
                  },
                },
              },
      }),
    };
    return q;
  });
  const route = serverModuleHarness<
    typeof import("../src/app/api/dashboard/social-automations/route")
  >("src/app/api/dashboard/social-automations/route.ts", {
    "next/server": { NextResponse },
    "@/lib/meta/company-access": {
      getMetaWorkspace: async () =>
        options.anonymous
          ? null
          : { user: { id: "user" }, organization: { id: "org" } },
      requireMetaCompanyAccess: async () => {
        if (options.foreignCompany) throw new Error("Forbidden");
        return { id: "org" };
      },
    },
    "@/lib/supabase/service": { createServiceClient: () => ({ from }) },
    "@/lib/agents/channel-availability-server": {
      loadAgentChannelAvailability: async () =>
        Object.fromEntries(
          channels.metaAgentChannelIds.map((id) => [
            id,
            { available: !!options.ready, reason: "Permissão ausente" },
          ]),
        ),
    },
    "@/lib/agents/multichannel": channels,
    "@/lib/meta/comment-automations": automations,
  });
  const save = (enabled = false) =>
    route.PUT(
      new Request("https://app.test/api?companyId=org&agentId=agent", {
        method: "PUT",
        body: JSON.stringify({
          config: {
            rules: [
              {
                id: "rule",
                name: "Comentário",
                enabled,
                trigger: "any_comment",
                action: "public_ai",
                text: "Agradeça",
              },
            ],
          },
        }),
      }),
    );
  return { route, save, filters, update, from };
}
describe("social automation authorization and persistence", () => {
  it.each([{ anonymous: true }, { foreignCompany: true }])(
    "refuses unauthorized access before service queries",
    async (options) => {
      const f = fixture(options);
      expect((await f.save()).status).toBe(400);
      expect(f.from).not.toHaveBeenCalled();
    },
  );
  it("rejects an agent outside the authorized company", async () => {
    const f = fixture({ foreignAgent: true });
    expect((await f.save()).status).toBe(400);
    expect(f.update).not.toHaveBeenCalled();
    expect(f.filters).toContainEqual(["organization_id", "org"]);
  });
  it("saves a paused draft without grants, preserving metadata and optimistic scope", async () => {
    const f = fixture();
    expect((await f.save()).status).toBe(200);
    expect(f.update).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ preserved: true }),
      }),
    );
    expect(f.filters).toContainEqual(["updated_at", "version"]);
    expect(f.filters).toContainEqual(["scope", "organization"]);
  });
  it("refuses forged activation and accepts ready connected channels", async () => {
    const blocked = fixture();
    expect((await blocked.save(true)).status).toBe(400);
    expect(blocked.update).not.toHaveBeenCalled();
    expect((await fixture({ ready: true }).save(true)).status).toBe(200);
  });
  it("does not claim success on a concurrent agent edit", async () => {
    expect((await fixture({ conflict: true }).save()).status).toBe(400);
  });
});
