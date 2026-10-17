import assert from "node:assert/strict";
import test from "node:test";
import { ModelCallCounter } from "./metrics.js";
import {
  criticMessages,
  observationsOf,
  withReflection,
  type ReflectionDependencies,
} from "./reflection.js";
import type {
  ReasoningResult,
  ReasoningStrategy,
} from "./reasoning.js";

function result(answer: string, llmCalls = 1): ReasoningResult {
  return {
    answer,
    trace: [
      {
        sequence: 0,
        type: "observation",
        content: `Evidence for ${answer}`,
      },
      { sequence: 1, type: "answer", content: answer },
    ],
    metrics: { llmCalls, latencyMs: 1 },
  };
}

function sequenceStrategy(
  answers: string[],
  received: string[] = [],
): ReasoningStrategy {
  let run = 0;
  return {
    name: "test-strategy",
    async run(input) {
      received.push(input);
      const answer = answers[run] ?? answers.at(-1) ?? "";
      run += 1;
      return result(answer, 2);
    },
  };
}

function countingCritic(
  verdicts: Array<{ approved: boolean; feedback: string }>,
  onCall?: (input: string, result: ReasoningResult) => void,
): NonNullable<ReflectionDependencies["critique"]> {
  let call = 0;
  return async (input, candidate, counter) => {
    counter.recordInvocation(`critic-${call}`);
    onCall?.(input, candidate);
    const verdict = verdicts[call];
    call += 1;
    if (!verdict) throw new Error("No scripted verdict remains.");
    return verdict;
  };
}

test("returns the initial answer without regeneration when the critic approves", async () => {
  const critiqueInputs: Array<{ input: string; answer: string }> = [];
  const wrapped = withReflection(
    sequenceStrategy(["Answer supported by observations."]),
    {},
    {
      critique: countingCritic(
        [{ approved: true, feedback: "" }],
        (input, candidate) =>
          critiqueInputs.push({ input, answer: candidate.answer }),
      ),
    },
  );

  const response = await wrapped.run("Summarize the alert");

  assert.equal(response.answer, "Answer supported by observations.");
  assert.deepEqual(critiqueInputs, [
    {
      input: "Summarize the alert",
      answer: "Answer supported by observations.",
    },
  ]);
  assert.equal(response.trace.filter(({ type }) => type === "critique").length, 1);
});

test("reruns the complete strategy with the original request and rejection feedback", async () => {
  const received: string[] = [];
  const wrapped = withReflection(
    sequenceStrategy(["Unsupported answer.", "Corrected answer.", "Unused"], received),
    {},
    {
      critique: countingCritic([
        { approved: false, feedback: "Use the alert evidence." },
        { approved: true, feedback: "" },
      ]),
    },
  );

  const response = await wrapped.run("Summarize the alert");

  assert.equal(response.answer, "Corrected answer.");
  assert.equal(received.length, 2);
  assert.equal(received[0], "Summarize the alert");
  assert.match(received[1] ?? "", /^Summarize the alert/);
  assert.match(received[1] ?? "", /Use the alert evidence\./);
});

test("returns the most recent rejected candidate after two default regenerations", async () => {
  const wrapped = withReflection(
    sequenceStrategy(["Candidate one.", "Candidate two.", "Candidate three."]),
    {},
    {
      critique: countingCritic([
        { approved: false, feedback: "First revision." },
        { approved: false, feedback: "Second revision." },
        { approved: false, feedback: "Last feedback." },
      ]),
    },
  );

  const response = await wrapped.run("Investigate the alert");
  const critiques = response.trace.filter(({ type }) => type === "critique");

  assert.equal(response.answer, "Candidate three.");
  assert.equal(critiques.length, 3);
  const lastCritique = critiques.at(-1);
  assert.ok(lastCritique && "approved" in lastCritique);
  assert.equal(lastCritique.approved, false);
});

test("zero reflections skips critic construction and model calls", async () => {
  let constructed = false;
  const wrapped = withReflection(
    sequenceStrategy(["Unreviewed answer."]),
    { maxReflections: 0 },
    {
      critique: async () => {
        constructed = true;
        throw new Error("critic should not run");
      },
    },
  );

  const response = await wrapped.run("Summarize the alert");

  assert.equal(response.answer, "Unreviewed answer.");
  assert.equal(constructed, false);
  assert.equal(response.trace.some(({ type }) => type === "critique"), false);
});

test("rejects negative and non-integer reflection limits", () => {
  const strategy = sequenceStrategy(["Answer."]);

  assert.throws(
    () => withReflection(strategy, { maxReflections: -1 }),
    /maxReflections/i,
  );
  assert.throws(
    () => withReflection(strategy, { maxReflections: 1.5 }),
    /maxReflections/i,
  );
});

test("extracts only observations for the critic evidence context", () => {
  const trace: ReasoningResult["trace"] = [
    { sequence: 0, type: "thought", content: "Hidden reasoning is omitted." },
    {
      sequence: 1,
      type: "action",
      tool: "list_alerts",
      args: { status: "firing" },
    },
    {
      sequence: 2,
      type: "observation",
      tool: "list_alerts",
      content: "Alert A is firing.",
    },
    {
      sequence: 3,
      type: "observation",
      content: "Storage lookup failed.",
      error: true,
    },
    { sequence: 4, type: "answer", content: "The service is healthy." },
  ];

  assert.equal(
    observationsOf(trace),
    "list_alerts: Alert A is firing.\nStorage lookup failed. (erro observado)",
  );
});

test("builds the critic request from the task, observations, and candidate only", () => {
  const messages = criticMessages(
    "Summarize the alert.",
    {
      answer: "Alert A is firing.",
      trace: [
        { sequence: 0, type: "thought", content: "Ignore this hidden thought." },
        {
          sequence: 1,
          type: "observation",
          tool: "list_alerts",
          content: "Alert A is firing.",
        },
      ],
      metrics: { llmCalls: 1, latencyMs: 1 },
    },
  );

  assert.equal(messages[0][0], "system");
  assert.match(messages[0][1], /APENAS com base nas observações/);
  assert.equal(messages[1][0], "user");
  assert.match(messages[1][1], /Pedido: Summarize the alert\./);
  assert.match(messages[1][1], /Observações: list_alerts: Alert A is firing\./);
  assert.match(messages[1][1], /Resposta: Alert A is firing\./);
  assert.doesNotMatch(messages[1][1], /hidden thought/);
});

test("appends ordered structured critiques and aggregates each model call once", async () => {
  const wrapped = withReflection(
    sequenceStrategy(["First answer.", "Final answer."]),
    {},
    {
      critique: countingCritic([
        { approved: false, feedback: "Use the observed evidence." },
        { approved: true, feedback: "" },
      ]),
    },
  );

  const response = await wrapped.run("Summarize the alert");
  const critiques = response.trace.filter(({ type }) => type === "critique");

  assert.deepEqual(
    response.trace.map(({ type }) => type),
    ["observation", "answer", "critique", "observation", "answer", "critique"],
  );
  assert.deepEqual(
    response.trace.map(({ sequence }) => sequence),
    response.trace.map((_, index) => index),
  );
  assert.equal(response.metrics.llmCalls, 6);
  assert.ok(response.metrics.latencyMs >= 0);
  assert.deepEqual(
    critiques.map((event) =>
      event.type === "critique" && "approved" in event
        ? { approved: event.approved, feedback: event.feedback }
        : null,
    ),
    [
      { approved: false, feedback: "Use the observed evidence." },
      { approved: true, feedback: "" },
    ],
  );
});

test("reports invalid critic output and counts the failed model invocation", async () => {
  const wrapped = withReflection(
    sequenceStrategy(["Candidate answer."]),
    {},
    {
      critique: async (_input, _candidate, counter) => {
        counter.recordInvocation("invalid-critic-output");
        return { approved: "yes", feedback: "Not a boolean." };
      },
    },
  );

  const response = await wrapped.run("Inspect the alert");

  assert.match(response.answer, /^\[FAILED\] Reflection failed:/);
  assert.match(response.answer, /invalid structured output/i);
  assert.equal(response.metrics.llmCalls, 3);
  assert.equal(
    response.trace.some(
      (event) => event.type === "observation" && event.error === true,
    ),
    true,
  );
  assert.equal(response.trace.some((event) => event.type === "critique"), false);
});

test("reports critic request failures without treating the candidate as approved", async () => {
  const wrapped = withReflection(
    sequenceStrategy(["Candidate answer."]),
    {},
    {
      critique: async (_input, _candidate, counter) => {
        counter.recordInvocation("failed-critic-request");
        throw new Error("Provider error containing private details.");
      },
    },
  );

  const response = await wrapped.run("Inspect the alert");

  assert.match(response.answer, /^\[FAILED\] Reflection failed:/);
  assert.match(response.answer, /critic request failed/i);
  assert.doesNotMatch(response.answer, /private details/i);
  assert.equal(response.metrics.llmCalls, 3);
  assert.equal(response.trace.some((event) => event.type === "critique"), false);
});

test("returns failed regeneration explicitly and includes its metrics", async () => {
  const wrapped = withReflection(
    sequenceStrategy(["Candidate answer.", "[FAILED] Strategy failed."]),
    {},
    {
      critique: countingCritic([
        { approved: false, feedback: "Recheck the alert." },
      ]),
    },
  );

  const response = await wrapped.run("Inspect the alert");

  assert.equal(response.answer, "[FAILED] Strategy failed.");
  assert.equal(response.metrics.llmCalls, 5);
  assert.equal(response.trace.filter((event) => event.type === "critique").length, 1);
});
