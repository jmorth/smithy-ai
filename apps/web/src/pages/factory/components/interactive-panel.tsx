import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Send, CheckCircle2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFactoryStore } from '@/stores/factory.store';
import { socketManager } from '@/api/socket';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InteractivePanel() {
  const workerMachines = useFactoryStore((s) => s.workerMachines);

  // Find the first STUCK worker
  const stuckEntry = useMemo(() => {
    for (const [id, machine] of workerMachines) {
      if (machine.state === 'STUCK') return { id, machine };
    }
    return null;
  }, [workerMachines]);

  const [dismissed, setDismissed] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Reset state when stuck worker changes
  useEffect(() => {
    if (stuckEntry && stuckEntry.id !== dismissed) {
      setAnswer('');
      setSubmitted(false);
    }
  }, [stuckEntry, dismissed]);

  const handleClose = useCallback(() => {
    if (stuckEntry) setDismissed(stuckEntry.id);
  }, [stuckEntry]);

  const handleSubmit = useCallback(() => {
    if (!answer.trim() || !stuckEntry) return;
    socketManager.sendInteractiveResponse(stuckEntry.id, {
      questionId: stuckEntry.id,
      answer: answer.trim(),
    });
    setSubmitted(true);
  }, [answer, stuckEntry]);

  useEffect(() => {
    if (!stuckEntry || dismissed === stuckEntry.id) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [stuckEntry, dismissed, handleClose]);

  // Don't show if no stuck workers or dismissed
  if (!stuckEntry || dismissed === stuckEntry.id) return null;

  if (submitted) {
    return (
      <div
        className="pointer-events-auto absolute inset-0 flex items-center justify-center z-20"
        data-testid="interactive-panel"
        role="alertdialog"
        aria-label="Response submitted"
      >
        <Card className="w-full max-w-md bg-background/95 backdrop-blur-sm shadow-xl">
          <CardContent className="pt-6">
            <div
              className="flex items-center gap-2 text-green-800"
              data-testid="interactive-confirmation"
            >
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <p className="text-sm font-medium">
                Response submitted. Waiting for the worker to resume…
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-auto absolute inset-0 flex items-center justify-center z-20"
      data-testid="interactive-panel"
      role="alertdialog"
      aria-label={`Worker ${stuckEntry.machine.name} needs input`}
    >
      <Card className="w-full max-w-md bg-background/95 backdrop-blur-sm shadow-xl border-amber-300 border-2">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            <CardTitle className="text-base font-semibold">
              Worker Needs Input
            </CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            onClick={handleClose}
            data-testid="close-interactive-panel"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-amber-400 bg-amber-100 text-amber-800">
              STUCK
            </Badge>
            <span className="text-sm font-medium">{stuckEntry.machine.name}</span>
          </div>

          <p className="text-sm text-muted-foreground">
            <strong>{stuckEntry.machine.name}</strong> needs your input to continue
            processing.
          </p>

          <div>
            <textarea
              className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 min-h-[80px] resize-y"
              placeholder="Type your answer…"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              data-testid="interactive-input"
            />
          </div>

          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!answer.trim()}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              data-testid="interactive-submit"
            >
              <Send className="mr-1 h-4 w-4" />
              Submit Answer
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
