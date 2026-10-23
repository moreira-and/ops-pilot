import { pipeline } from "@huggingface/transformers";
import {
  EMBEDDING_DIMENSIONS,
  embeddingSchema,
  type Embedding,
} from "./memory-types.js";

export const EMBEDDING_MODEL_ID = "onnx-community/all-MiniLM-L6-v2-ONNX";
export const EMBEDDING_MODEL_REVISION = "aff7a1dc4e8a1ea593e6ea21e95c22ef0a25966f";

export interface EmbeddingTensor {
  data: Float32Array;
  dims: number[];
}

export interface EmbeddingPipeline {
  (
    text: string,
    options: { pooling: "mean"; normalize: true },
  ): Promise<EmbeddingTensor>;
}

export type EmbeddingPipelineLoader = (
  modelId: string,
  options: { revision: string; dtype: "fp32" },
) => Promise<EmbeddingPipeline>;

const embeddingOptions = { pooling: "mean", normalize: true } as const;

async function loadDefaultPipeline(
  modelId: string,
  options: { revision: string; dtype: "fp32" },
): Promise<EmbeddingPipeline> {
  const extractor = await pipeline("feature-extraction", modelId, options);
  return async (text, options) => {
    const output = await extractor(text, options);
    if (!(output.data instanceof Float32Array)) {
      throw new Error("Embedding model returned data in an unsupported format.");
    }
    return { data: output.data, dims: output.dims };
  };
}

function toEmbedding(output: EmbeddingTensor): Embedding {
  if (
    output.dims.length !== 2 ||
    output.dims[0] !== 1 ||
    output.dims[1] !== EMBEDDING_DIMENSIONS ||
    output.data.length !== EMBEDDING_DIMENSIONS
  ) {
    throw new Error(
      `Embedding model returned an invalid shape; expected [1, ${EMBEDDING_DIMENSIONS}].`,
    );
  }

  const vector = embeddingSchema.parse(Array.from(output.data));
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (Math.abs(norm - 1) > 0.01) {
    throw new Error("Embedding model returned a vector that is not normalized.");
  }
  return vector;
}

export function createEmbeddingProvider(
  loadPipeline: EmbeddingPipelineLoader = loadDefaultPipeline,
): (text: string) => Promise<Embedding> {
  let pipelinePromise: Promise<EmbeddingPipeline> | undefined;

  return async (text) => {
    if (!pipelinePromise) {
      pipelinePromise = loadPipeline(EMBEDDING_MODEL_ID, {
        revision: EMBEDDING_MODEL_REVISION,
        dtype: "fp32",
      }).catch((error: unknown) => {
        pipelinePromise = undefined;
        throw error;
      });
    }

    const extractor = await pipelinePromise;
    return toEmbedding(await extractor(text, embeddingOptions));
  };
}

export const embed = createEmbeddingProvider();
