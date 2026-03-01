import type { WorkflowContext, WorkflowPass, WorkflowResult } from './task-workflow.js';

export class TaskWorkflowRunner {
  private passes: WorkflowPass[];

  constructor(passes: WorkflowPass[]) {
    this.passes = passes;
  }

  async run(ctx: WorkflowContext): Promise<WorkflowResult> {
    const passesExecuted: string[] = [];
    let lastResult: Awaited<ReturnType<typeof ctx.connection.prompt>> | undefined;

    for (const pass of this.passes) {
      if (!pass.shouldRun(ctx, lastResult)) continue;

      ctx.reportProgress(`[${pass.name}] Preparing prompt...`);
      const prompt = pass.buildPrompt(ctx);

      ctx.acpClient.flushLogs();
      lastResult = await ctx.connection.prompt({
        sessionId: ctx.sessionId,
        prompt,
      });
      ctx.acpClient.flushLogs();
      passesExecuted.push(pass.name);

      if (lastResult.stopReason !== 'end_turn') break;

      if (pass.afterPrompt) {
        const decision = await pass.afterPrompt(ctx, lastResult);
        if (decision === 'done') break;
      }
    }

    const files = await ctx.scanOutputDir();
    return {
      finalStopReason: lastResult?.stopReason ?? 'cancelled',
      passesExecuted,
      hasArtifacts: files.length > 0,
    };
  }
}
