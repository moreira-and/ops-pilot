import assert from "node:assert/strict";
import test from "node:test";
import {
  checkProviderStatusInputSchema,
  consultarRunbookInputSchema,
  createOperationalTools,
  forgetPreferenceInputSchema,
  listAlertsInputSchema,
  listIncidentsInputSchema,
  openIncidentInputSchema,
  runForgetPreferenceTool,
} from "./tools.js";
import { runbookLookupResultSchema } from "../services/runbook-service.js";
import type { DemoData, RunbookRecord } from "../services/operational-store.js";
import { SqliteOpsStore } from "../store/sqlite-ops-store.js";

const data: DemoData = {
  services: [{ id: "api", name: "API" }, { id: "billing", name: "Billing" }],
  alerts: [
    { id: "a1", serviceId: "api", title: "Down", status: "firing", severity: "critical" },
    { id: "a2", serviceId: "api", title: "Recovered", status: "resolved", severity: "low" },
  ],
};

const runbooks: RunbookRecord[] = [
  {
    id: "api-runbook",
    serviceId: "api",
    title: "API recovery",
    instructions: "Check API health.",
  },
];

async function withTools(
  operation: (tools: ReturnType<typeof createOperationalTools>) => Promise<void>,
  seed = data,
  seedRunbooks = runbooks,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const store = new SqliteOpsStore(":memory:");
  try {
    await store.upsertDemoData(seed, seedRunbooks);
    await operation(createOperationalTools(store, fetchImpl));
  } finally {
    store.close();
  }
}

test("list_alerts defaults to firing and supports every status", async () => {
  await withTools(async ({ listAlerts }) => {
    const defaultResult = JSON.parse(String(await listAlerts.invoke({}))) as { id: string }[];
    const resolved = JSON.parse(
      String(await listAlerts.invoke({ status: "resolved" })),
    ) as { id: string }[];
    const all = JSON.parse(
      String(await listAlerts.invoke({ status: "all" })),
    ) as { id: string }[];

    assert.deepEqual(defaultResult.map(({ id }) => id), ["a1"]);
    assert.deepEqual(resolved.map(({ id }) => id), ["a2"]);
    assert.equal(all.length, 2);
  });
});

test("open_incident and resolve_incident validate and return persisted results", async () => {
  await withTools(async ({ openIncident, resolveIncident }) => {
    const opened = JSON.parse(
      String(
        await openIncident.invoke({
          title: "Investigate",
          service: "api",
          severity: "high",
        }),
      ),
    ) as { id: string; status: string; summary: string | null };

    assert.equal(opened.status, "open");
    assert.equal(opened.summary, null);
    const resolved = JSON.parse(
      String(await resolveIncident.invoke({ id: opened.id })),
    ) as { status: string };
    assert.equal(resolved.status, "resolved");
  });
});

test("open_incident normalizes all SEV aliases to canonical severities", async () => {
  await withTools(async ({ openIncident }) => {
    const aliases = [
      ["sev1", "critical"],
      ["sev2", "high"],
      ["sev3", "medium"],
      ["sev4", "low"],
    ] as const;

    for (const [inputSeverity, expectedSeverity] of aliases) {
      const opened = JSON.parse(
        String(
          await openIncident.invoke({
            title: "Investigate",
            service: "api",
            severity: inputSeverity,
          }),
        ),
      ) as { severity: string };
      assert.equal(opened.severity, expectedSeverity);
    }
  });
});

test("list_incidents filters open, resolved, and all; defaults to open", async () => {
  await withTools(async ({ listIncidents, openIncident, resolveIncident }) => {
    const open = JSON.parse(
      String(
        await openIncident.invoke({
          title: "Open incident",
          service: "api",
          severity: "high",
        }),
      ),
    ) as { id: string };
    const resolved = JSON.parse(
      String(
        await openIncident.invoke({
          title: "Resolved incident",
          service: "api",
          severity: "low",
        }),
      ),
    ) as { id: string };
    await resolveIncident.invoke({ id: resolved.id });

    const defaultResult = JSON.parse(
      String(await listIncidents.invoke({})),
    ) as { id: string }[];
    const resolvedResult = JSON.parse(
      String(await listIncidents.invoke({ status: "resolved" })),
    ) as { id: string }[];
    const all = JSON.parse(
      String(await listIncidents.invoke({ status: "all" })),
    ) as { id: string }[];

    assert.deepEqual(defaultResult.map(({ id }) => id), [open.id]);
    assert.deepEqual(resolvedResult.map(({ id }) => id), [resolved.id]);
    assert.equal(all.length, 2);
  });
});

test("consultar_runbook returns only a matching runbook and explicit unavailable outcomes", async () => {
  await withTools(async ({ consultarRunbook }) => {
    const available = runbookLookupResultSchema.parse(
      JSON.parse(String(await consultarRunbook.invoke({ service: "api" }))),
    );
    const unknown = runbookLookupResultSchema.parse(
      JSON.parse(String(await consultarRunbook.invoke({ service: "missing" }))),
    );
    const missing = runbookLookupResultSchema.parse(
      JSON.parse(String(await consultarRunbook.invoke({ service: "billing" }))),
    );

    assert.equal(available.available, true);
    if (available.available) assert.equal(available.runbook.serviceId, "api");
    assert.deepEqual(unknown, {
      available: false,
      service: "missing",
      reason: "unknown_service",
    });
    assert.deepEqual(missing, {
      available: false,
      service: "billing",
      reason: "runbook_unavailable",
    });
  });
});

test("rejects invalid arguments and annotates each tool field", async () => {
  assert.equal(listAlertsInputSchema.safeParse({ status: "unknown" }).success, false);
  assert.equal(listIncidentsInputSchema.safeParse({ status: "unknown" }).success, false);
  assert.equal(
    openIncidentInputSchema.safeParse({
      title: " ",
      service: "api",
      severity: "urgent",
    }).success,
    false,
  );
  assert.equal(
    consultarRunbookInputSchema.safeParse({ service: " " }).success,
    false,
  );

  await withTools(async (tools) => {
    for (const operationalTool of Object.values(tools)) {
      const schema = operationalTool.schema;
      assert.ok("shape" in schema);
      if ("shape" in schema) {
        for (const field of Object.values(schema.shape)) {
          assert.ok(field.description);
        }
      }
      const description = operationalTool.description.toLowerCase();
      assert.match(description, /use/);
      assert.match(description, /não/);
      assert.match(description, /falh|indisponibilidade/);
      assert.match(description, /não invente|não afirme/);
    }
  });
});

test("forget_preference validates preference and uses trusted user context", async () => {
  const recalledUsers: string[] = [];
  const deletions: Array<{ userId: string; id: string }> = [];
  const store = {
    async recall(userId: string) {
      recalledUsers.push(userId);
      return [{
        id: "memory-1",
        userId,
        fact: "The operator prefers email.",
        embedding: new Array(384).fill(0),
        createdAt: new Date("2026-10-23T00:00:00.000Z"),
        score: 0.9,
      }];
    },
    forget(userId: string, id: string) {
      deletions.push({ userId, id });
      return true;
    },
  };

  assert.deepEqual(Object.keys(forgetPreferenceInputSchema.shape), ["preference"]);
  assert.equal(
    forgetPreferenceInputSchema.safeParse({
      preference: "email",
      userId: "other-user",
    }).success,
    false,
  );
  assert.equal(forgetPreferenceInputSchema.safeParse({ preference: " " }).success, false);
  assert.deepEqual(
    JSON.parse(await runForgetPreferenceTool(
      store,
      { preference: "email" },
      { userId: "operator-1" },
    )),
    { status: "deleted", preference: "The operator prefers email." },
  );
  assert.deepEqual(recalledUsers, ["operator-1"]);
  assert.deepEqual(deletions, [{ userId: "operator-1", id: "memory-1" }]);
  await assert.rejects(
    runForgetPreferenceTool(store, { preference: "email" }, {}),
  );
  await assert.rejects(
    runForgetPreferenceTool(store, {
      preference: "email",
      userId: "other-user",
    }, { userId: "operator-1" }),
  );
  assert.deepEqual(recalledUsers, ["operator-1"]);

  const noMatch = {
    async recall() { return []; },
    forget() { return false; },
  };
  assert.deepEqual(
    JSON.parse(await runForgetPreferenceTool(
      noMatch,
      { preference: "phone" },
      { userId: "operator-1" },
    )),
    { status: "not_found" },
  );
  const ambiguous = {
    async recall(userId: string) {
      return [
        {
          id: "memory-1",
          userId,
          fact: "Prefers email.",
          embedding: new Array(384).fill(0),
          createdAt: new Date("2026-10-23T00:00:00.000Z"),
          score: 0.88,
        },
        {
          id: "memory-2",
          userId,
          fact: "Prefers weekly email reports.",
          embedding: new Array(384).fill(0),
          createdAt: new Date("2026-10-23T00:00:00.000Z"),
          score: 0.82,
        },
      ];
    },
    forget() { assert.fail("Ambiguous preference must not be deleted."); },
  };
  assert.deepEqual(
    JSON.parse(await runForgetPreferenceTool(
      ambiguous,
      { preference: "email" },
      { userId: "operator-1" },
    )),
    {
      status: "ambiguous",
      candidates: ["Prefers email.", "Prefers weekly email reports."],
    },
  );
});

test("check_provider_status defaults to GitHub and supports Cloudflare", async () => {
  const requests: { url: string; signal: AbortSignal | null | undefined }[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), signal: init?.signal });
    return new Response(
      JSON.stringify({
        status: {
          indicator: "operational",
          description: "All systems operational",
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  await withTools(async ({ check_provider_status }) => {
    const github = String(await check_provider_status.invoke({}));
    const cloudflare = String(
      await check_provider_status.invoke({ provider: "cloudflare" }),
    );

    assert.equal(github, "github está operational - All systems operational");
    assert.equal(
      cloudflare,
      "cloudflare está operational - All systems operational",
    );
    assert.ok(!github.includes("\n"));
    assert.ok(!cloudflare.includes("\n"));
  }, data, runbooks, fakeFetch);

  assert.deepEqual(
    requests.map(({ url }) => url),
    [
      "https://www.githubstatus.com/api/v2/status.json",
      "https://www.cloudflarestatus.com/api/v2/status.json",
    ],
  );
  assert.ok(requests.every(({ signal }) => signal instanceof AbortSignal));
});

test("check_provider_status input is restricted, defaults, and explains when to use it", async () => {
  assert.deepEqual(checkProviderStatusInputSchema.parse({}), {
    provider: "github",
  });
  assert.equal(
    checkProviderStatusInputSchema.safeParse({ provider: "unknown" }).success,
    false,
  );
  assert.ok(checkProviderStatusInputSchema.shape.provider.description);

  await withTools(async ({ check_provider_status }) => {
    assert.match(check_provider_status.description, /suspeita/i);
    assert.match(check_provider_status.description, /depend.ncia/i);
  });
});

test("check_provider_status retries network failures and server errors once", async () => {
  let networkAttempts = 0;
  const networkFetch: typeof fetch = async () => {
    networkAttempts += 1;
    if (networkAttempts === 1) throw new Error("connection reset");
    return new Response(
      JSON.stringify({
        status: { indicator: "minor", description: "Minor service issue" },
      }),
      { status: 200 },
    );
  };

  let serverAttempts = 0;
  const serverFetch: typeof fetch = async () => {
    serverAttempts += 1;
    return serverAttempts === 1
      ? new Response("Unavailable", { status: 503 })
      : new Response(
          JSON.stringify({
            status: { indicator: "operational", description: "Recovered" },
          }),
          { status: 200 },
        );
  };

  await withTools(async ({ check_provider_status }) => {
    assert.match(
      String(await check_provider_status.invoke({})),
      /github está minor - Minor service issue/,
    );
    assert.match(
      String(await check_provider_status.invoke({ provider: "cloudflare" })),
      /cloudflare está operational - Recovered/,
    );
  }, data, runbooks, async (input, init) => {
    if (String(input).includes("githubstatus")) {
      return networkFetch(input, init);
    }
    return serverFetch(input, init);
  });

  assert.equal(networkAttempts, 2);
  assert.equal(serverAttempts, 2);
});

test("check_provider_status retries timeouts once and returns a readable final result", async () => {
  let attempts = 0;
  const timeoutFetch: typeof fetch = async (_input, init) => {
    attempts += 1;
    assert.ok(init?.signal instanceof AbortSignal);
    throw new DOMException("The operation timed out", "TimeoutError");
  };

  await withTools(async ({ check_provider_status }) => {
    const result = String(
      await check_provider_status.invoke({ provider: "cloudflare" }),
    );
    assert.match(result, /não consegui consultar|falha/i);
    assert.match(result, /cloudflare/i);
    assert.ok(!result.includes("\n"));
  }, data, runbooks, timeoutFetch);

  assert.equal(attempts, 2);
});

test("check_provider_status creates a five-second timeout for each attempt", async () => {
  const timeoutDescriptor = Object.getOwnPropertyDescriptor(
    AbortSignal,
    "timeout",
  );
  assert.ok(timeoutDescriptor);
  const durations: number[] = [];

  Object.defineProperty(AbortSignal, "timeout", {
    ...timeoutDescriptor,
    value: (milliseconds: number) => {
      durations.push(milliseconds);
      return new AbortController().signal;
    },
  });

  try {
    await withTools(async ({ check_provider_status }) => {
      await check_provider_status.invoke({});
    }, data, runbooks, async () => new Response(
      JSON.stringify({
        status: { indicator: "operational", description: "All systems operational" },
      }),
      { status: 200 },
    ));
  } finally {
    Object.defineProperty(AbortSignal, "timeout", timeoutDescriptor);
  }

  assert.deepEqual(durations, [5000]);
});

test("check_provider_status does not retry invalid payloads or non-server HTTP errors", async () => {
  let invalidPayloadAttempts = 0;
  const invalidPayloadFetch: typeof fetch = async () => {
    invalidPayloadAttempts += 1;
    return new Response(JSON.stringify({ status: { indicator: "major" } }), {
      status: 200,
    });
  };

  let invalidJsonAttempts = 0;
  const invalidJsonFetch: typeof fetch = async () => {
    invalidJsonAttempts += 1;
    return new Response("{invalid json", { status: 200 });
  };

  let httpAttempts = 0;
  const clientErrorFetch: typeof fetch = async () => {
    httpAttempts += 1;
    return new Response("Rate limited", { status: 429 });
  };

  await withTools(async ({ check_provider_status }) => {
    const invalidPayload = String(
      await check_provider_status.invoke({ provider: "github" }),
    );
    const invalidJson = String(
      await check_provider_status.invoke({ provider: "github" }),
    );
    const clientError = String(
      await check_provider_status.invoke({ provider: "github" }),
    );

    assert.match(invalidPayload, /inválid|invalid|status/i);
    assert.match(invalidJson, /inválid|invalid|status/i);
    assert.match(clientError, /HTTP 429/);
  }, data, runbooks, async (_input, init) => {
    assert.ok(init?.signal instanceof AbortSignal);
    if (invalidPayloadAttempts === 0) {
      return invalidPayloadFetch("", init);
    }
    if (invalidJsonAttempts === 0) {
      return invalidJsonFetch("", init);
    }
    return clientErrorFetch("", init);
  });

  assert.equal(invalidPayloadAttempts, 1);
  assert.equal(invalidJsonAttempts, 1);
  assert.equal(httpAttempts, 1);
});

test("check_provider_status returns a readable error after two server errors", async () => {
  let attempts = 0;
  const serverErrorFetch: typeof fetch = async () => {
    attempts += 1;
    return new Response("Unavailable", { status: 503 });
  };

  await withTools(async ({ check_provider_status }) => {
    const result = String(await check_provider_status.invoke({}));
    assert.match(result, /github.*HTTP 503.*2 tentativas/i);
    assert.ok(!result.includes("\n"));
  }, data, runbooks, serverErrorFetch);

  assert.equal(attempts, 2);
});
