import type { ContentBlock, PromptResponse } from '@agentclientprotocol/sdk';
import type { WorkflowContext, WorkflowPass } from '../task-workflow.js';

export class ArtifactEnforcementPass implements WorkflowPass {
  readonly name = 'artifact-enforcement';

  shouldRun(_ctx: WorkflowContext, previousResult?: PromptResponse): boolean {
    return !!previousResult && previousResult.stopReason === 'end_turn';
  }

  buildPrompt(ctx: WorkflowContext): ContentBlock[] {
    return [{
      type: 'text',
      text: [
        'Your previous response did not produce any output files in the designated artifact directory.',
        `Output directory: ${ctx.outputDir}`,
        '',
        'You MUST write at least one result file to this directory. At minimum, create a result.md file containing:',
        '1. A summary of what was accomplished',
        '2. Key findings or outputs',
        '3. Any recommendations or next steps',
        '',
        'Write the file now using the Write tool.',
      ].join('\n'),
    }];
  }
}
