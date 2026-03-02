import { generateText } from 'ai';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { Package, WorkerContext, PackageOutput } from '@smithy/shared';
import { SmithyWorker } from '@smithy/worker-sdk';

const SYSTEM_PROMPT = `You are a document summarizer. Given the input text, produce a structured summary with three sections:

## Overview
2-3 sentences describing the main topic and purpose of the document(s).

## Key Points
A bullet list of the most important points from the text.

## Action Items
A bullet list of any action items, next steps, or recommendations found in the text. If none are found, state "No action items identified."`;

const TEXT_MIME_PREFIXES = ['text/', 'application/json', 'application/xml'];

function isTextFile(filename: string): boolean {
  const dotIndex = filename.lastIndexOf('.');
  // No extension (no dot, or dot is the first character like .gitignore) → treat as text
  if (dotIndex <= 0) {
    return true;
  }
  const ext = filename.slice(dotIndex + 1).toLowerCase();
  const textExtensions = new Set([
    'txt', 'md', 'markdown', 'json', 'xml', 'yaml', 'yml',
    'csv', 'tsv', 'html', 'htm', 'css', 'js', 'ts', 'jsx',
    'tsx', 'py', 'rb', 'java', 'c', 'cpp', 'h', 'go', 'rs',
    'sh', 'bash', 'zsh', 'toml', 'ini', 'cfg', 'conf', 'log',
    'sql', 'graphql', 'proto', 'env', 'gitignore', 'dockerfile',
  ]);
  return textExtensions.has(ext);
}

export class SummarizerWorker extends SmithyWorker {
  override async onReceive(pkg: Package): Promise<void> {
    this.logger?.info('Summarizer received package', { packageId: pkg.id });

    // We don't have access to the input files yet in onReceive —
    // the context (with inputPackage) is only available in onProcess.
    // Validate minimal package structure here.
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

    // Filter to text files only, warn about binary files
    const textFiles: string[] = [];
    for (const filename of allFiles) {
      if (isTextFile(filename)) {
        textFiles.push(filename);
      } else {
        logger.warn('Skipping binary file', { filename });
      }
    }

    if (textFiles.length === 0) {
      throw new Error(
        'Input package contains no text files. At least one text file is required.',
      );
    }

    logger.info('Processing text files', { count: textFiles.length });

    // Read all text file contents
    const contents: string[] = [];
    for (const filename of textFiles) {
      const text = inputPackage.getFileAsString(filename);
      contents.push(`--- ${filename} ---\n${text}`);
    }

    const combinedText = contents.join('\n\n');

    // Call AI to generate summary
    const model = context.ai as LanguageModelV3;
    const { text: summary } = await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt: combinedText,
    });

    logger.info('Summary generated', {
      sourceFiles: textFiles.length,
      summaryLength: summary.length,
    });

    // Build output package
    return outputBuilder
      .setType('SPECIFICATION')
      .addFile('summary.md', summary, 'text/markdown')
      .setMetadata('sourceFiles', textFiles.length)
      .setMetadata('model', 'claude-sonnet-4-20250514')
      .setMetadata('generatedAt', new Date().toISOString())
      .build();
  }
}
