import assert from "node:assert/strict";
import test from "node:test";
import {
  createPreferenceForgetService,
  FORGET_MINIMUM_SCORE,
  FORGET_SCORE_MARGIN,
} from "./preference-forget-service.js";
import type { RecalledMemory } from "../memory/memory-store.js";

function recalled(id: string, score: number, fact = id): RecalledMemory {
  return {
    id,
    userId: "operator-1",
    fact,
    score,
    embedding: new Array(384).fill(0),
    createdAt: new Date("2026-10-23T00:00:00.000Z"),
  };
}

test("forgets only an unambiguous high-confidence same-user preference", async () => {
  const recalledUsers: string[] = [];
  const deleted: Array<{ userId: string; id: string }> = [];
  const service = createPreferenceForgetService({
    async recall(userId) {
      recalledUsers.push(userId);
      return [recalled("memory-1", 0.9, "Prefers email.")];
    },
    forget(userId, id) {
      deleted.push({ userId, id });
      return true;
    },
  });

  assert.deepEqual(
    await service.forget("operator-1", "email updates"),
    { status: "deleted", preference: "Prefers email." },
  );
  assert.deepEqual(recalledUsers, ["operator-1"]);
  assert.deepEqual(deleted, [{ userId: "operator-1", id: "memory-1" }]);
});

test("returns not_found for weak, missing, or raced-away memories", async () => {
  const deleted: string[] = [];
  const service = createPreferenceForgetService({
    async recall() { return [recalled("weak", 0.74)]; },
    forget(_userId, id) {
      deleted.push(id);
      return false;
    },
  });

  assert.deepEqual(
    await service.forget("operator-1", "weekly summaries"),
    { status: "not_found" },
  );
  assert.deepEqual(deleted, []);
  assert.equal(FORGET_MINIMUM_SCORE, 0.75);
  assert.equal(FORGET_SCORE_MARGIN, 0.1);
});

test("returns ambiguous without deleting when candidate scores are too close", async () => {
  let deleteCalls = 0;
  const service = createPreferenceForgetService({
    async recall() {
      return [
        recalled("first", 0.88, "Prefers email."),
        recalled("second", 0.82, "Prefers weekly email reports."),
      ];
    },
    forget() {
      deleteCalls += 1;
      return true;
    },
  });

  assert.deepEqual(
    await service.forget("operator-1", "email"),
    {
      status: "ambiguous",
      candidates: ["Prefers email.", "Prefers weekly email reports."],
    },
  );
  assert.equal(deleteCalls, 0);
});

test("does not treat candidates below recall floor as ambiguous", async () => {
  const service = createPreferenceForgetService({
    async recall() {
      return [
        recalled("first", 0.88, "Prefers email."),
        recalled("weak", 0.29, "Prefers phone."),
      ];
    },
    forget(_userId, id) {
      return id === "first";
    },
  });

  assert.deepEqual(
    await service.forget("operator-1", "email"),
    { status: "deleted", preference: "Prefers email." },
  );
});

test("propagates memory failures rather than returning an outcome", async () => {
  const service = createPreferenceForgetService({
    async recall() { throw new Error("store unavailable"); },
    forget() { return false; },
  });

  await assert.rejects(service.forget("operator-1", "email"), /store unavailable/);
});
