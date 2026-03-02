import { AcpPassRunner } from '@agentdispatch/acp';
import type { WorkflowContext, WorkflowPass, WorkflowResult } from './task-workflow.js';

export class TaskWorkflowRunner {
  private runner: AcpPassRunner<WorkflowContext>;

  constructor(passes: WorkflowPass[]) {
    this.runner = new AcpPassRunner(passes);
  }

  async run(ctx: WorkflowContext): Promise<WorkflowResult> {
    const base = await this.runner.run(ctx);
    ctx.acpClient.flushLogs();
    const files = await ctx.scanOutputDir();
    return { ...base, hasArtifacts: files.length > 0 };
  }
}
