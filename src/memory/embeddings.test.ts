import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmbeddingProvider,
  EMBEDDING_MODEL_ID,
  EMBEDDING_MODEL_REVISION,
  type EmbeddingPipeline,
} from "./embeddings.js";
import { EMBEDDING_DIMENSIONS } from "./memory-types.js";

function vectorOutput(values: Float32Array = new Float32Array(EMBEDDING_DIMENSIONS).fill(1 / Math.sqrt(EMBEDDING_DIMENSIONS))) {
  return {
    data: values,
    dims: [1, EMBEDDING_DIMENSIONS],
  };
}

test("embedding provider loads the pinned model lazily once for concurrent calls", async () => {
  let loadCount = 0;
  let invocationCount = 0;
  let capturedModel = "";
  let capturedOptions: Record<string, unknown> = {};
  const pipeline: EmbeddingPipeline = async (_text, options) => {
    invocationCount += 1;
    assert.deepEqual(options, { pooling: "mean", normalize: true });
    return vectorOutput();
  };
  const embed = createEmbeddingProvider(async (modelId, options) => {
    loadCount += 1;
    capturedModel = modelId;
    capturedOptions = options;
    await Promise.resolve();
    return pipeline;
  });

  assert.equal(loadCount, 0);
  const [first, second] = await Promise.all([embed("first"), embed("second")]);

  assert.equal(loadCount, 1);
  assert.equal(invocationCount, 2);
  assert.equal(capturedModel, EMBEDDING_MODEL_ID);
  assert.equal(capturedOptions.revision, EMBEDDING_MODEL_REVISION);
  assert.equal(capturedOptions.dtype, "fp32");
  assert.equal(first.length, EMBEDDING_DIMENSIONS);
  assert.ok(first.every(Number.isFinite));
  assert.ok(Math.abs(Math.hypot(...first) - 1) < 0.01);
  assert.deepEqual(first, second);
});

test("embedding provider retries initialization after a load failure", async () => {
  let loadCount = 0;
  const embed = createEmbeddingProvider(async () => {
    loadCount += 1;
    if (loadCount === 1) throw new Error("temporary model load failure");
    return async () => vectorOutput();
  });

  await assert.rejects(embed("first"), /temporary model load failure/);
  const vector = await embed("second");

  assert.equal(loadCount, 2);
  assert.equal(vector.length, EMBEDDING_DIMENSIONS);
});

test("embedding provider rejects malformed vectors", async () => {
  const malformed: EmbeddingPipeline = async () =>
    vectorOutput(new Float32Array([Number.NaN]));
  const embed = createEmbeddingProvider(async () => malformed);

  await assert.rejects(embed("bad output"), /embedding/i);
});
