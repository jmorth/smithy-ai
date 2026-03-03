import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCreateAssemblyLine } from '@/api/hooks/use-assembly-lines';
import { useWorkers } from '@/api/hooks/use-workers';
import StepEditor, {
  type StepItem,
  _generateStepId as generateStepId,
} from '@/pages/assembly-lines/components/step-editor';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface FormErrors {
  name?: string;
  steps?: string;
}

function validate(name: string, steps: StepItem[]): FormErrors {
  const errors: FormErrors = {};
  if (!name.trim()) {
    errors.name = 'Name is required.';
  }
  if (steps.length === 0) {
    errors.steps = 'At least one step is required.';
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export { generateStepId };

export default function AssemblyLineCreatePage() {
  const navigate = useNavigate();
  const createMutation = useCreateAssemblyLine();
  const { data: workerList = [], isLoading: isLoadingWorkers } = useWorkers();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<StepItem[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitError(null);

      const validationErrors = validate(name, steps);
      setErrors(validationErrors);
      if (Object.keys(validationErrors).length > 0) return;

      createMutation.mutate(
        {
          name: name.trim(),
          description: description.trim() || undefined,
          steps: steps.map((s) => ({
            workerVersionId: s.versionId,
          })),
        },
        {
          onSuccess: (assemblyLine) => {
            navigate(`/assembly-lines/${assemblyLine.slug}`);
          },
          onError: (error) => {
            setSubmitError(error.message);
          },
        },
      );
    },
    [name, description, steps, createMutation, navigate],
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/assembly-lines')}
          aria-label="Back to Assembly Lines"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-2xl font-bold tracking-tight">
          Create Assembly Line
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {/* Name */}
        <div className="space-y-1">
          <label htmlFor="al-name" className="text-sm font-medium">
            Name <span className="text-destructive">*</span>
          </label>
          <Input
            id="al-name"
            placeholder="My Assembly Line"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
            }}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? 'al-name-error' : undefined}
          />
          {errors.name && (
            <p id="al-name-error" className="text-sm text-destructive" role="alert">
              {errors.name}
            </p>
          )}
        </div>

        {/* Description */}
        <div className="space-y-1">
          <label htmlFor="al-description" className="text-sm font-medium">
            Description
          </label>
          <textarea
            id="al-description"
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Describe what this assembly line does..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Step Editor */}
        <StepEditor
          steps={steps}
          onStepsChange={(newSteps) => {
            setSteps(newSteps);
            if (errors.steps && newSteps.length > 0) {
              setErrors((prev) => ({ ...prev, steps: undefined }));
            }
          }}
          workers={workerList}
          isLoadingWorkers={isLoadingWorkers}
          error={errors.steps}
        />

        {/* Submit Error */}
        {submitError && (
          <p className="text-sm text-destructive" role="alert">
            {submitError}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Assembly Line'
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/assembly-lines')}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
