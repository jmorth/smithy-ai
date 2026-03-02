import { generateText } from 'ai';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { Package, WorkerContext, PackageOutput } from '@smithy/shared';
import { SmithyWorker } from '@smithy/worker-sdk';

const QUESTION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

const SYSTEM_PROMPT = `You are an expert technical specification writer. Given the user's project idea and their answers to clarifying questions, produce a comprehensive specification document with the following sections:

## Overview
A clear, concise description of the project — what it is, who it's for, and what problem it solves.

## Requirements
### Functional Requirements
A numbered list of specific features and behaviors the system must support.

### Non-Functional Requirements
Performance, scalability, security, and reliability expectations.

## Constraints
Technical constraints, platform requirements, budget limitations, timeline restrictions, or any other boundaries.

## Timeline
A suggested phased delivery plan with milestones.

## Acceptance Criteria
A checklist of measurable criteria that define when the project is complete.

Write in clear, professional prose. Be specific and actionable — avoid vague language. The specification should be detailed enough to serve as a real project brief for a development team.`;

export class SpecWriterWorker extends SmithyWorker {
  override async onReceive(pkg: Package): Promise<void> {
    this.logger?.info('Spec writer received package', { packageId: pkg.id });

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

    // Read the initial user input
    const contents: string[] = [];
    for (const filename of allFiles) {
      contents.push(inputPackage.getFileAsString(filename));
    }
    const userInput = contents.join('\n\n');

    logger.info('Starting spec writer', { inputLength: userInput.length });

    // Ask clarifying questions sequentially — each answer may inform the next
    const questionTimeout = { timeout: QUESTION_TIMEOUT };

    const audienceAnswer = await context.askQuestion(
      'What is the target audience for this application?',
      questionTimeout,
    );
    logger.info('Received audience answer', { answer: audienceAnswer });

    // Branch based on audience — use choices for platform question
    const platformChoices = audienceAnswer.toLowerCase().includes('developer')
      ? ['Web', 'CLI', 'API', 'All']
      : ['Web', 'Mobile', 'Desktop', 'All'];

    const platformAnswer = await context.askQuestion(
      'Which platform(s) should this support?',
      { choices: platformChoices, timeout: QUESTION_TIMEOUT },
    );
    logger.info('Received platform answer', { answer: platformAnswer });

    const constraintsAnswer = await context.askQuestion(
      'Are there any specific technical requirements or constraints?',
      questionTimeout,
    );
    logger.info('Received constraints answer', { answer: constraintsAnswer });

    // Combine all gathered context into the AI prompt
    const combinedPrompt = [
      `# Project Idea`,
      userInput,
      '',
      `# Clarifying Questions & Answers`,
      '',
      `**Target audience:** ${audienceAnswer}`,
      `**Platform(s):** ${platformAnswer}`,
      `**Technical constraints:** ${constraintsAnswer}`,
    ].join('\n');

    logger.info('Generating specification', { promptLength: combinedPrompt.length });

    const model = context.ai as LanguageModelV3;
    const { text: specification } = await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt: combinedPrompt,
    });

    logger.info('Specification generated', {
      specLength: specification.length,
    });

    return outputBuilder
      .setType('SPECIFICATION')
      .addFile('specification.md', specification, 'text/markdown')
      .setMetadata('questionsAsked', 3)
      .setMetadata('model', 'claude-sonnet-4-20250514')
      .setMetadata('generatedAt', new Date().toISOString())
      .build();
  }
}
