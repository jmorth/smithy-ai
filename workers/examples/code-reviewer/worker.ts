import { generateText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { Package, WorkerContext, PackageOutput } from '@smithy/shared';
import { SmithyWorker } from '@smithy/worker-sdk';

const SYSTEM_PROMPT = `You are an expert code reviewer. Review the provided source code for:

## Correctness
- Logic errors, off-by-one bugs, null/undefined handling, race conditions

## Style
- Naming conventions, code organization, consistency, readability

## Security
- Input validation, injection vulnerabilities, authentication/authorization issues, secrets exposure

## Performance
- Unnecessary allocations, N+1 queries, missing caching opportunities, algorithmic complexity

## Maintainability
- Code duplication, tight coupling, missing abstractions, testability

Use the available tools to read files and examine the codebase. You will be given a list of files in the package — use readFile to examine each file you want to review, and listFiles to discover what is available.

Produce your review as structured markdown with:
1. A top-level summary of the overall code quality
2. Per-file sections with specific line-referenced comments where applicable
3. A final section with suggested improvements

If you have concrete code change suggestions, also produce a unified diff patch.`;

export class CodeReviewerWorker extends SmithyWorker {
  override async onReceive(pkg: Package): Promise<void> {
    this.logger?.info('Code reviewer received package', { packageId: pkg.id });

    if (!pkg.id) {
      throw new Error('Package must have an ID');
    }
  }

  override async onProcess(context: WorkerContext): Promise<PackageOutput> {
    const { inputPackage, outputBuilder, logger } = context;

    const allFiles = inputPackage.listFiles();
    if (allFiles.length === 0) {
      throw new Error('Input package contains no files');
    }

    logger.info('Starting code review', { fileCount: allFiles.length });

    const readFileTool = tool({
      description: 'Read the contents of a source file from the input package',
      inputSchema: z.object({
        filename: z.string().describe('Path to the file to read'),
      }),
      execute: async ({ filename }) => {
        const files = inputPackage.listFiles();
        if (!files.includes(filename)) {
          return `Error: File "${filename}" not found in package. Available files: ${files.join(', ')}`;
        }
        return inputPackage.getFileAsString(filename);
      },
    });

    const listFilesTool = tool({
      description: 'List all files available in the input package',
      inputSchema: z.object({}),
      execute: async () => {
        return inputPackage.listFiles().join('\n');
      },
    });

    const model = context.ai as LanguageModelV3;
    const fileList = allFiles.join('\n');

    const { text: review, steps } = await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt: `The following files are available for review:\n\n${fileList}\n\nPlease review this codebase thoroughly.`,
      tools: {
        readFile: readFileTool,
        listFiles: listFilesTool,
      },
      stopWhen: stepCountIs(20),
    });

    const toolCallCount = steps
      ? steps.reduce(
          (count, step) => count + (step.toolCalls?.length ?? 0),
          0,
        )
      : 0;

    logger.info('Code review generated', {
      reviewLength: review.length,
      filesAvailable: allFiles.length,
      toolCalls: toolCallCount,
    });

    // Build output package
    outputBuilder
      .setType('CODE')
      .addFile('review.md', review, 'text/markdown')
      .setMetadata('filesReviewed', allFiles.length)
      .setMetadata('toolCalls', toolCallCount)
      .setMetadata('model', 'claude-sonnet-4-20250514')
      .setMetadata('generatedAt', new Date().toISOString());

    // Extract patch from review if present
    const patch = extractPatch(review);
    if (patch) {
      outputBuilder.addFile('suggestions.patch', patch, 'text/x-diff');
      logger.info('Patch file extracted from review');
    }

    return outputBuilder.build();
  }
}

/**
 * Extracts a unified diff patch from the review markdown, if one is present.
 * Looks for fenced code blocks marked as diff/patch.
 */
export function extractPatch(review: string): string | null {
  const patchRegex = /```(?:diff|patch)\n([\s\S]*?)```/g;
  const patches: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = patchRegex.exec(review)) !== null) {
    patches.push(match[1]!.trim());
  }

  if (patches.length === 0) {
    return null;
  }

  return patches.join('\n\n');
}
