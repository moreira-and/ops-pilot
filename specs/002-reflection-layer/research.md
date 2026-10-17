# Research: Camada Reflection

## Strategy and model integration

- **Decision**: Implement Reflection as a decorator over the existing `ReasoningStrategy.run(input, options)` boundary. Use the shared model factory for the critic by default and allow dependency injection for tests or custom strategy compositions.
- **Rationale**: Both shipped strategies expose the same contract and use `createModel` in production, while model/strategy injection is already an established deterministic-testing pattern. A wrapper can support any conforming strategy without coupling Reflection to either graph implementation.
- **Alternatives considered**: Add reflection nodes separately to the ReAct and Plan-and-Execute graphs; rejected because it duplicates orchestration and does not satisfy the generic decorator requirement. Require each strategy to expose its private model instance; rejected because it changes the contract for all custom strategies.

## Structured critique and trace compatibility

- **Decision**: Parse critic responses with a Zod structured-output schema containing `approved` and `feedback`; extend `critique` trace events to represent those fields while retaining the existing `content` summary form.
- **Rationale**: The existing Plan-and-Execute strategy already emits `critique` events for replanner summaries. Maintaining both forms avoids changing its current behavior while making Reflection outcomes inspectable and typed.
- **Alternatives considered**: Replace all existing critique summaries with approval/feedback fields; rejected because replanner critique has a different meaning and would be a behavior change outside the feature. Encode structured results as an unvalidated JSON string in `content`; rejected because consumers would lose typed fields and validation.

## Regeneration behavior and side effects

- **Decision**: On rejection, rerun the complete decorated strategy with the original request and critique feedback in its input context. Stop on approval or after `maxReflections` regenerations.
- **Rationale**: This follows the requested strategy-level regeneration behavior and the user's explicit choice to rerun the full strategy.
- **Alternatives considered**: Regenerate only answer text from the model without rerunning tools; rejected by the user's selection. Prevent or deduplicate repeated tool actions; not part of this feature and cannot be guaranteed for arbitrary `ReasoningStrategy` implementations.
- **Operational consequence**: A rejected attempt may have performed tool calls before it produced an answer, so a subsequent full rerun may repeat actions or state changes. Callers should select a reflection limit with that behavior in mind.

## Arena selection and metric accounting

- **Decision**: Add reflected variants as separate Arena selectors and aggregate `llmCalls` from all strategy runs plus each actual critic model invocation; measure full wrapper latency once.
- **Rationale**: Separate names preserve existing unreflected choices and make comparisons explicit. Existing metrics count actual model starts; the decorator must add its critic and rerun counts without counting tool calls or graph steps as model calls.
- **Alternatives considered**: Replace the existing strategy names with reflected behavior; rejected because it would silently change current Arena runs. Sum latency from each strategy run; rejected because it double-counts orchestration gaps and does not represent end-to-end wall time.
