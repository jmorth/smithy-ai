import { useState } from 'react';
import { AlertTriangle, Send, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InteractiveQuestion {
  jobId: string;
  questionId: string;
  prompt: string;
  options?: string[];
}

interface InteractiveResponseProps {
  question: InteractiveQuestion;
  onSubmit: (jobId: string, response: { questionId: string; answer: string }) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InteractiveResponse({
  question,
  onSubmit,
}: InteractiveResponseProps) {
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!answer.trim()) return;
    onSubmit(question.jobId, {
      questionId: question.questionId,
      answer: answer.trim(),
    });
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div
        className="rounded-lg border border-green-200 bg-green-50 p-4"
        data-testid="interactive-confirmation"
      >
        <div className="flex items-center gap-2 text-green-800">
          <CheckCircle2 className="h-5 w-5" />
          <p className="text-sm font-medium">
            Response submitted successfully. Waiting for the worker to resume…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4"
      role="alert"
      data-testid="interactive-response"
    >
      <div className="flex items-center gap-2 text-amber-800 mb-3">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <h4 className="text-sm font-semibold">Worker needs your input</h4>
      </div>

      <p className="text-sm text-amber-900 mb-3" data-testid="question-prompt">
        {question.prompt}
      </p>

      {question.options && question.options.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {question.options.map((option) => (
            <Button
              key={option}
              variant="outline"
              size="sm"
              className="border-amber-300 bg-white hover:bg-amber-100"
              onClick={() => setAnswer(option)}
              data-testid={`option-${option}`}
            >
              {option}
            </Button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <textarea
          className="flex-1 rounded-md border border-amber-300 bg-white px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 min-h-[80px] resize-y"
          placeholder="Type your answer…"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          data-testid="answer-input"
        />
      </div>

      <div className="mt-2 flex justify-end">
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!answer.trim()}
          className="bg-amber-600 hover:bg-amber-700 text-white"
          data-testid="submit-answer"
        >
          <Send className="mr-1 h-4 w-4" />
          Submit Answer
        </Button>
      </div>
    </div>
  );
}
