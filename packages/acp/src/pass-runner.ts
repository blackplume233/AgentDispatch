import type { ClientSideConnection, PromptResponse, ContentBlock, StopReason } from '@agentclientprotocol/sdk';

export interface AcpSessionContext {
  connection: ClientSideConnection;
  sessionId: string;
  log: (msg: string) => void;
}

export type PassDecision = 'continue' | 'done';

export interface AcpPass<TCtx extends AcpSessionContext = AcpSessionContext> {
  readonly name: string;
  shouldRun(ctx: TCtx, previousResult?: PromptResponse): boolean;
  buildPrompt(ctx: TCtx): ContentBlock[];
  afterPrompt?(ctx: TCtx, result: PromptResponse): Promise<PassDecision>;
}

export interface AcpRunResult {
  finalStopReason: StopReason;
  passesExecuted: string[];
}

export class AcpPassRunner<TCtx extends AcpSessionContext = AcpSessionContext> {
  private passes: AcpPass<TCtx>[];

  constructor(passes: AcpPass<TCtx>[]) {
    this.passes = passes;
  }

  async run(ctx: TCtx): Promise<AcpRunResult> {
    const passesExecuted: string[] = [];
    let lastResult: PromptResponse | undefined;

    for (const pass of this.passes) {
      if (!pass.shouldRun(ctx, lastResult)) continue;

      ctx.log(`[${pass.name}] Preparing prompt...`);
      const prompt = pass.buildPrompt(ctx);

      lastResult = await ctx.connection.prompt({
        sessionId: ctx.sessionId,
        prompt,
      });
      passesExecuted.push(pass.name);

      if (lastResult.stopReason !== 'end_turn') break;

      if (pass.afterPrompt) {
        const decision = await pass.afterPrompt(ctx, lastResult);
        if (decision === 'done') break;
      }
    }

    return {
      finalStopReason: lastResult?.stopReason ?? 'cancelled',
      passesExecuted,
    };
  }
}
