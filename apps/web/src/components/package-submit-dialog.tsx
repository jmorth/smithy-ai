import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Upload,
  X,
  Plus,
  Loader2,
  FileIcon,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import {
  packages as packagesApi,
  assemblyLines as assemblyLinesApi,
  workerPools as workerPoolsApi,
} from '@/api/client';
import type { ApiError } from '@/api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PackageSubmitTarget {
  type: 'assembly-line' | 'worker-pool';
  slug: string;
}

export interface PackageSubmitDialogProps {
  target: PackageSubmitTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MetadataRow {
  id: number;
  key: string;
  value: string;
}

interface FileEntry {
  file: File;
  id: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;
  error?: string;
}

type SubmissionStep =
  | { phase: 'idle' }
  | { phase: 'creating' }
  | { phase: 'uploading'; current: number; total: number }
  | { phase: 'submitting' }
  | { phase: 'done'; packageId: string }
  | { phase: 'error'; message: string };

const DEFAULT_TYPES = ['document', 'image', 'data', 'code'];

let rowIdCounter = 0;
function nextRowId() {
  return ++rowIdCounter;
}

// ---------------------------------------------------------------------------
// Helper: upload a single file to S3 via presigned URL with progress
// ---------------------------------------------------------------------------

function uploadFileToPresignedUrl(
  url: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(file);
  });
}

// ---------------------------------------------------------------------------
// Helper: format file size
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PackageSubmitDialog({
  target,
  open,
  onOpenChange,
}: PackageSubmitDialogProps) {
  // Form state
  const [packageType, setPackageType] = useState('document');
  const [customType, setCustomType] = useState('');
  const [isCustomType, setIsCustomType] = useState(false);
  const [metadataRows, setMetadataRows] = useState<MetadataRow[]>(() => [
    { id: nextRowId(), key: '', value: '' },
  ]);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [step, setStep] = useState<SubmissionStep>({ phase: 'idle' });
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      // Delay reset to allow close animation
      const timer = setTimeout(() => {
        setPackageType('document');
        setCustomType('');
        setIsCustomType(false);
        setMetadataRows([{ id: nextRowId(), key: '', value: '' }]);
        setFiles([]);
        setStep({ phase: 'idle' });
        setDragOver(false);
        abortRef.current?.abort();
        abortRef.current = null;
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // -------------------------------------------------------------------------
  // Derived
  // -------------------------------------------------------------------------

  const effectiveType = isCustomType ? customType.trim() : packageType;
  const isSubmitting = step.phase !== 'idle' && step.phase !== 'error';
  const canSubmit = effectiveType.length > 0 && !isSubmitting;

  const stepLabel = (() => {
    switch (step.phase) {
      case 'creating':
        return 'Creating package\u2026';
      case 'uploading':
        return `Uploading file ${step.current}/${step.total}\u2026`;
      case 'submitting':
        return 'Submitting to target\u2026';
      case 'done':
        return 'Done!';
      default:
        return null;
    }
  })();

  // -------------------------------------------------------------------------
  // Metadata handlers
  // -------------------------------------------------------------------------

  const updateMetadataRow = useCallback(
    (id: number, field: 'key' | 'value', val: string) => {
      setMetadataRows((rows) =>
        rows.map((r) => (r.id === id ? { ...r, [field]: val } : r)),
      );
    },
    [],
  );

  const addMetadataRow = useCallback(() => {
    setMetadataRows((rows) => [...rows, { id: nextRowId(), key: '', value: '' }]);
  }, []);

  const removeMetadataRow = useCallback((id: number) => {
    setMetadataRows((rows) => {
      const filtered = rows.filter((r) => r.id !== id);
      return filtered.length === 0
        ? [{ id: nextRowId(), key: '', value: '' }]
        : filtered;
    });
  }, []);

  // -------------------------------------------------------------------------
  // File handlers
  // -------------------------------------------------------------------------

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const entries: FileEntry[] = Array.from(newFiles).map((file) => ({
      file,
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
      status: 'pending' as const,
      progress: 0,
    }));
    setFiles((prev) => [...prev, ...entries]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles],
  );

  const handleBrowse = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        addFiles(e.target.files);
        // Reset input so the same file can be re-selected
        e.target.value = '';
      }
    },
    [addFiles],
  );

  // -------------------------------------------------------------------------
  // Submit flow
  // -------------------------------------------------------------------------

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;

    const ac = new AbortController();
    abortRef.current = ac;

    // Build metadata, filtering empty rows
    const metadata: Record<string, unknown> = {};
    for (const row of metadataRows) {
      const k = row.key.trim();
      const v = row.value.trim();
      if (k) metadata[k] = v;
    }

    try {
      // Step 1: Create the package
      setStep({ phase: 'creating' });
      const pkg = await packagesApi.create(
        {
          type: effectiveType,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        },
        ac.signal,
      );

      // Step 2: Upload files (if any)
      if (files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          if (ac.signal.aborted) return;

          setStep({ phase: 'uploading', current: i + 1, total: files.length });

          const fileEntry = files[i]!;

          // Update file status to uploading
          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileEntry.id ? { ...f, status: 'uploading' as const } : f,
            ),
          );

          try {
            // Get presigned URL
            const { uploadUrl, fileId } = await packagesApi.getUploadUrl(
              pkg.id,
              {
                fileName: fileEntry.file.name,
                contentType: fileEntry.file.type || 'application/octet-stream',
              },
              ac.signal,
            );

            // Upload to S3
            await uploadFileToPresignedUrl(
              uploadUrl,
              fileEntry.file,
              (progress) => {
                setFiles((prev) =>
                  prev.map((f) =>
                    f.id === fileEntry.id ? { ...f, progress } : f,
                  ),
                );
              },
            );

            // Confirm upload
            await packagesApi.confirmUpload(
              pkg.id,
              {
                fileId,
                fileName: fileEntry.file.name,
                contentType: fileEntry.file.type || 'application/octet-stream',
                size: fileEntry.file.size,
              },
              ac.signal,
            );

            // Mark done
            setFiles((prev) =>
              prev.map((f) =>
                f.id === fileEntry.id
                  ? { ...f, status: 'done' as const, progress: 100 }
                  : f,
              ),
            );
          } catch (err) {
            const msg =
              err instanceof Error ? err.message : 'Upload failed';
            setFiles((prev) =>
              prev.map((f) =>
                f.id === fileEntry.id
                  ? { ...f, status: 'error' as const, error: msg }
                  : f,
              ),
            );
            // Continue with other files rather than aborting entirely
          }
        }
      }

      // Step 3: Submit to target
      if (ac.signal.aborted) return;
      setStep({ phase: 'submitting' });

      const submitData = {
        type: effectiveType,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      };

      if (target.type === 'assembly-line') {
        await assemblyLinesApi.submitPackage(target.slug, submitData, ac.signal);
      } else {
        await workerPoolsApi.submitPackage(target.slug, submitData, ac.signal);
      }

      // Success
      setStep({ phase: 'done', packageId: pkg.id });
      toast.success(`Package ${pkg.id} submitted successfully`);
      onOpenChange(false);
    } catch (err) {
      if (ac.signal.aborted) return;
      const message =
        (err as ApiError)?.message ?? 'An unexpected error occurred';
      setStep({ phase: 'error', message });
    }
  }, [canSubmit, effectiveType, files, metadataRows, target, onOpenChange]);

  // -------------------------------------------------------------------------
  // Type selector change
  // -------------------------------------------------------------------------

  const handleTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value;
      if (val === '__custom__') {
        setIsCustomType(true);
        setCustomType('');
      } else {
        setIsCustomType(false);
        setPackageType(val);
      }
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={isSubmitting ? undefined : onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submit Package</DialogTitle>
          <DialogDescription>
            Submit a new package to{' '}
            {target.type === 'assembly-line' ? 'assembly line' : 'worker pool'}{' '}
            <span className="font-medium">{target.slug}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Package type selector */}
          <div className="space-y-2">
            <label
              htmlFor="package-type"
              className="text-sm font-medium leading-none"
            >
              Package Type <span className="text-destructive">*</span>
            </label>
            <select
              id="package-type"
              value={isCustomType ? '__custom__' : packageType}
              onChange={handleTypeChange}
              disabled={isSubmitting}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {DEFAULT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
              <option value="__custom__">Custom</option>
            </select>
            {isCustomType && (
              <Input
                placeholder="Enter custom type..."
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                disabled={isSubmitting}
                autoFocus
              />
            )}
          </div>

          {/* Metadata editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium leading-none">
                Metadata
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addMetadataRow}
                disabled={isSubmitting}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add Row
              </Button>
            </div>
            <div className="space-y-2">
              {metadataRows.map((row) => (
                <div key={row.id} className="flex items-center gap-2">
                  <Input
                    placeholder="Key"
                    value={row.key}
                    onChange={(e) =>
                      updateMetadataRow(row.id, 'key', e.target.value)
                    }
                    disabled={isSubmitting}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Value"
                    value={row.value}
                    onChange={(e) =>
                      updateMetadataRow(row.id, 'value', e.target.value)
                    }
                    disabled={isSubmitting}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeMetadataRow(row.id)}
                    disabled={isSubmitting}
                    aria-label="Remove metadata row"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* File upload area */}
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none">Files</label>
            <div
              role="button"
              tabIndex={0}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={handleBrowse}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleBrowse();
                }
              }}
              className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors cursor-pointer ${
                dragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-muted-foreground/50'
              } ${isSubmitting ? 'pointer-events-none opacity-50' : ''}`}
              data-testid="drop-zone"
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Drag & drop files here, or click to browse
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileInputChange}
                data-testid="file-input"
              />
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div className="space-y-1">
                {files.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    {entry.status === 'done' ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                    ) : entry.status === 'error' ? (
                      <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                    ) : (
                      <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="flex-1 truncate">{entry.file.name}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {formatFileSize(entry.file.size)}
                    </span>
                    {entry.status === 'uploading' && (
                      <div className="w-20">
                        <Progress value={entry.progress} />
                      </div>
                    )}
                    {entry.status === 'error' && entry.error && (
                      <span className="text-xs text-destructive truncate max-w-[120px]">
                        {entry.error}
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => removeFile(entry.id)}
                      disabled={isSubmitting}
                      aria-label={`Remove ${entry.file.name}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submission progress */}
          {stepLabel && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {step.phase !== 'done' && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {stepLabel}
            </div>
          )}

          {/* Error message */}
          {step.phase === 'error' && (
            <div
              role="alert"
              className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {step.message}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting…
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Submit Package
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
