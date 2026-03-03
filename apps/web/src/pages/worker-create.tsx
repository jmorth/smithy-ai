import { useState, useCallback, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useCreateWorker } from '@/api/hooks/use-workers';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface FormErrors {
  name?: string;
}

function validate(name: string): FormErrors {
  const errors: FormErrors = {};
  if (!name.trim()) {
    errors.name = 'Name is required.';
  } else if (name.length > 100) {
    errors.name = 'Name must be 100 characters or fewer.';
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function WorkerCreatePage() {
  const navigate = useNavigate();
  const createWorker = useCreateWorker();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();

      const validationErrors = validate(name);
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        return;
      }

      setErrors({});
      createWorker.mutate(
        {
          name: name.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
        },
        {
          onSuccess: (worker) => {
            toast.success(`Worker "${worker.name}" registered`);
            navigate(`/workers/${worker.slug}`);
          },
          onError: (err) => {
            if (err.status === 409) {
              setErrors({ name: 'A Worker with this name already exists.' });
            } else {
              toast.error(`Failed to register Worker: ${err.message}`);
            }
          },
        },
      );
    },
    [name, description, createWorker, navigate],
  );

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2"
        onClick={() => navigate('/workers')}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Workers
      </Button>

      <div>
        <h2 className="text-2xl font-bold tracking-tight">Register Worker</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a new Worker by providing a name and optional description. You
          can upload a YAML configuration after registration.
        </p>
      </div>

      <Card className="max-w-lg p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label htmlFor="worker-name" className="mb-1 block text-sm font-medium">
              Name <span className="text-destructive">*</span>
            </label>
            <Input
              id="worker-name"
              placeholder="e.g., Summarizer, Code Reviewer"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors({});
              }}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'name-error' : undefined}
            />
            {errors.name && (
              <p id="name-error" className="mt-1 text-sm text-destructive" role="alert">
                {errors.name}
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="worker-desc" className="mb-1 block text-sm font-medium">
              Description
            </label>
            <textarea
              id="worker-desc"
              className="h-24 w-full rounded-md border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="What does this Worker do?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* API error display */}
          {createWorker.error && !errors.name && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
              <p className="text-sm text-destructive">{createWorker.error.message}</p>
            </div>
          )}

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={createWorker.isPending}>
              {createWorker.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Register Worker
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/workers')}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
