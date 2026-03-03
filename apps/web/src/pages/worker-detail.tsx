import { useState, useCallback, type KeyboardEvent, type ChangeEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  AlertCircle,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { load as yamlLoad } from 'js-yaml';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import {
  useWorker,
  useCreateWorkerVersion,
  useDeprecateWorkerVersion,
} from '@/api/hooks/use-workers';
import YamlViewer from '@/pages/workers/components/yaml-viewer';
import VersionHistory from '@/pages/workers/components/version-history';
import type { WorkerVersion } from '@smithy/shared';

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const VERSION_STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  ACTIVE: {
    label: 'Active',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  DEPRECATED: {
    label: 'Deprecated',
    className: 'bg-gray-100 text-gray-800 border-gray-200',
  },
};

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-4 w-96 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-10 w-80 animate-pulse rounded bg-muted" />
      <div className="h-64 w-full animate-pulse rounded bg-muted" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <AlertCircle className="mb-4 h-12 w-12 text-destructive" />
      <h3 className="text-lg font-semibold">Failed to load Worker</h3>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" className="mt-4" onClick={onRetry}>
        <RefreshCw className="mr-2 h-4 w-4" />
        Retry
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload form
// ---------------------------------------------------------------------------

interface UploadFormProps {
  slug: string;
  onSuccess: () => void;
}

function UploadForm({ slug, onSuccess }: UploadFormProps) {
  const [yamlText, setYamlText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const createVersion = useCreateWorkerVersion(slug);

  const handleYamlChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      setYamlText(e.target.value);
      setParseError(null);
    },
    [],
  );

  const handleTabKey = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const value = target.value;
      const newValue = value.substring(0, start) + '  ' + value.substring(end);
      setYamlText(newValue);
      // Defer cursor repositioning
      requestAnimationFrame(() => {
        target.selectionStart = start + 2;
        target.selectionEnd = start + 2;
      });
    }
  }, []);

  const handleFileUpload = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result;
        if (typeof content === 'string') {
          setYamlText(content);
          setParseError(null);
        }
      };
      reader.readAsText(file);
    },
    [],
  );

  const handleSubmit = useCallback(() => {
    if (!yamlText.trim()) {
      setParseError('YAML configuration is required');
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      const result = yamlLoad(yamlText);
      if (typeof result !== 'object' || result === null || Array.isArray(result)) {
        setParseError('YAML must be an object (key-value pairs)');
        return;
      }
      parsed = result as Record<string, unknown>;
    } catch (err) {
      setParseError(
        `Invalid YAML syntax: ${err instanceof Error ? err.message : 'parse error'}`,
      );
      return;
    }

    createVersion.mutate(
      { yamlConfig: parsed },
      {
        onSuccess: () => {
          toast.success('New version created successfully');
          setYamlText('');
          setParseError(null);
          onSuccess();
        },
        onError: (err) => {
          toast.error(`Failed to create version: ${err.message}`);
        },
      },
    );
  }, [yamlText, createVersion, onSuccess]);

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="yaml-editor"
          className="mb-1 block text-sm font-medium"
        >
          YAML Configuration
        </label>
        <textarea
          id="yaml-editor"
          className="h-64 w-full rounded-md border bg-background p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="name: my-worker&#10;inputTypes:&#10;  - text&#10;outputType: text&#10;provider:&#10;  name: openai&#10;  model: gpt-4&#10;  apiKeyEnv: OPENAI_API_KEY"
          value={yamlText}
          onChange={handleYamlChange}
          onKeyDown={handleTabKey}
        />
        {parseError && (
          <p className="mt-1 text-sm text-destructive" role="alert">
            {parseError}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <label
          htmlFor="yaml-file-upload"
          className="cursor-pointer text-sm text-primary underline-offset-4 hover:underline"
        >
          <Upload className="mr-1 inline h-4 w-4" />
          Upload .yaml file
        </label>
        <input
          id="yaml-file-upload"
          type="file"
          accept=".yaml,.yml"
          className="hidden"
          onChange={handleFileUpload}
        />
      </div>

      <Button
        onClick={handleSubmit}
        disabled={createVersion.isPending || !yamlText.trim()}
      >
        {createVersion.isPending ? 'Creating…' : 'Create New Version'}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function WorkerDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data: worker, isLoading, error, refetch } = useWorker(slug);
  const deprecateVersion = useDeprecateWorkerVersion(slug ?? '');
  const [activeTab, setActiveTab] = useState('configuration');

  const versions: WorkerVersion[] = worker?.versions ?? [];
  const latestVersion = [...versions].sort(
    (a, b) => Number(b.version) - Number(a.version),
  )[0];

  const latestConfig = latestVersion?.yamlConfig as
    | Record<string, unknown>
    | undefined;
  const latestStatus = latestVersion?.status ?? '';
  const statusConfig = VERSION_STATUS_CONFIG[latestStatus.toUpperCase()] ?? {
    label: latestStatus,
    className: 'bg-gray-100 text-gray-800 border-gray-200',
  };

  const inputTypes =
    (latestConfig?.inputTypes as string[] | undefined) ?? [];
  const outputType = latestConfig?.outputType as string | undefined;

  const handleDeprecate = useCallback(
    (version: number) => {
      deprecateVersion.mutate(version, {
        onSuccess: () => {
          toast.success(`Version v${version} deprecated`);
        },
        onError: (err) => {
          toast.error(`Failed to deprecate: ${err.message}`);
        },
      });
    },
    [deprecateVersion],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() => navigate('/workers')}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Workers
        </Button>
        <DetailSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() => navigate('/workers')}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Workers
        </Button>
        <ErrorState message={error.message} onRetry={() => refetch()} />
      </div>
    );
  }

  if (!worker) {
    return null;
  }

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

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold tracking-tight">{worker.name}</h2>
          {latestVersion && (
            <Badge variant="outline" className="shrink-0">
              v{latestVersion.version}
            </Badge>
          )}
          {latestVersion && (
            <Badge variant="outline" className={statusConfig.className}>
              {statusConfig.label}
            </Badge>
          )}
        </div>

        {worker.description && (
          <p className="text-muted-foreground">{worker.description}</p>
        )}

        {/* Type tags */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {inputTypes.length > 0 && (
            <>
              <span className="text-xs text-muted-foreground">Input:</span>
              {inputTypes.map((type) => (
                <Badge
                  key={type}
                  variant="outline"
                  className="bg-blue-50 text-blue-700 border-blue-200 text-xs"
                >
                  {type}
                </Badge>
              ))}
            </>
          )}
          {outputType && (
            <>
              <span className="text-xs text-muted-foreground ml-2">
                Output:
              </span>
              <Badge
                variant="outline"
                className="bg-purple-50 text-purple-700 border-purple-200 text-xs"
              >
                {outputType}
              </Badge>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="versions">Version History</TabsTrigger>
          <TabsTrigger value="upload">Upload New Version</TabsTrigger>
        </TabsList>

        <TabsContent value="configuration" className="mt-4">
          {latestConfig ? (
            <YamlViewer config={latestConfig} />
          ) : (
            <Card className="p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No configuration available. Upload a version to see the
                configuration.
              </p>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="versions" className="mt-4">
          <VersionHistory
            versions={versions}
            onDeprecate={handleDeprecate}
            isDeprecating={deprecateVersion.isPending}
          />
        </TabsContent>

        <TabsContent value="upload" className="mt-4">
          <UploadForm
            slug={slug!}
            onSuccess={() => setActiveTab('versions')}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
