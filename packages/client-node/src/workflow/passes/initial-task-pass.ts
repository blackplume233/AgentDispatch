import type { ContentBlock, PromptResponse } from '@agentclientprotocol/sdk';
import type { WorkflowContext, WorkflowPass, PassDecision } from '../task-workflow.js';

export class InitialTaskPass implements WorkflowPass {
  readonly name = 'initial-task';

  shouldRun(): boolean {
    return true;
  }

  buildPrompt(ctx: WorkflowContext): ContentBlock[] {
    return [{ type: 'text', text: buildTaskPromptText(ctx) }];
  }

  async afterPrompt(ctx: WorkflowContext, _result: PromptResponse): Promise<PassDecision> {
    const files = await ctx.scanOutputDir();
    if (files.length > 0) return 'done';
    ctx.log('No artifacts after initial pass, will request artifact enforcement');
    return 'continue';
  }
}

function buildTaskPromptText(ctx: WorkflowContext): string {
  const { task, outputDir, inputDir } = ctx;
  const parts = [`Task: ${task.title}`];

  if (task.description) {
    parts.push(`\nDescription:\n${task.description}`);
  }
  if (task.tags.length > 0) {
    parts.push(`\nTags: ${task.tags.join(', ')}`);
  }
  if (task.metadata) {
    parts.push(`\nMetadata: ${JSON.stringify(task.metadata)}`);
  }
  if (inputDir && task.attachments && task.attachments.length > 0) {
    const fileList = task.attachments
      .map((a) => `  - ${a.filename} (${(a.sizeBytes / 1024 / 1024).toFixed(1)} MB)`)
      .join('\n');
    parts.push(
      `\nInput files directory:\n  ${inputDir}\n` +
        `The following files have been provided as task attachments:\n${fileList}\n` +
        `Read these files as needed to complete the task.`,
    );
  }
  if (outputDir) {
    parts.push(
      `\nIMPORTANT — Artifact output directory:\n` +
        `Write ALL output files (results, reports, generated assets, etc.) to this directory:\n` +
        `  ${outputDir}\n` +
        `Do NOT write output files to the current working directory or other locations. ` +
        `Files outside the output directory will NOT be collected as task artifacts.`,
    );
  } else {
    parts.push(
      `\nIMPORTANT: Write all output files to the current working directory. ` +
        `The files you create will be automatically collected as task artifacts.`,
    );
  }

  const renderedPrompt = parts.join('\n');
  const workerConfig = ctx.agentConfig as typeof ctx.agentConfig & { presetPrompt?: string };
  const presetPrompt =
    ctx.agentConfig.type === 'worker' && typeof workerConfig.presetPrompt === 'string'
      ? workerConfig.presetPrompt.trim()
      : '';

  if (!presetPrompt) {
    return renderedPrompt;
  }

  return `${presetPrompt}\n\n${renderedPrompt}`;
}
