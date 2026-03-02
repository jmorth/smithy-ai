/**
 * Thrown when an interactive question times out waiting for an answer.
 */
export class QuestionTimeoutError extends Error {
  constructor(
    public readonly questionId: string,
    public readonly timeoutMs: number,
  ) {
    super(
      `Question "${questionId}" timed out after ${timeoutMs}ms waiting for an answer`,
    );
    this.name = 'QuestionTimeoutError';
  }
}
