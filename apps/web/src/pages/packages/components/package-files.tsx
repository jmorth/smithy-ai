import { useState } from 'react';
import {
  Download,
  FileText,
  Image as ImageIcon,
  File,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useDownloadFile } from '@/api/hooks/use-packages';
import type { PackageFile } from '@smithy/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isTextMime(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/yaml' ||
    mimeType === 'application/x-yaml' ||
    mimeType === 'application/xml'
  );
}

function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

function getFileIcon(mimeType: string) {
  if (isTextMime(mimeType)) return FileText;
  if (isImageMime(mimeType)) return ImageIcon;
  return File;
}

// ---------------------------------------------------------------------------
// File row component
// ---------------------------------------------------------------------------

interface FileRowProps {
  file: PackageFile;
  packageId: string;
  previewContent?: string;
  previewLoading?: boolean;
  previewOpen: boolean;
  onTogglePreview: () => void;
}

function FileRow({
  file,
  packageId,
  previewContent,
  previewLoading,
  previewOpen,
  onTogglePreview,
}: FileRowProps) {
  const downloadMutation = useDownloadFile();
  const Icon = getFileIcon(file.mimeType);
  const canPreview = isTextMime(file.mimeType) || isImageMime(file.mimeType);

  return (
    <div className="rounded-lg border" data-testid={`file-${file.id}`}>
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-3 min-w-0">
          <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{file.filename}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{formatFileSize(file.sizeBytes)}</span>
              <Badge variant="outline" className="text-xs">
                {file.mimeType}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {canPreview && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onTogglePreview}
              data-testid={`preview-toggle-${file.id}`}
            >
              {previewOpen ? (
                <ChevronUp className="mr-1 h-4 w-4" />
              ) : (
                <ChevronDown className="mr-1 h-4 w-4" />
              )}
              Preview
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadMutation.mutate({ packageId, fileId: file.id })
            }
            disabled={downloadMutation.isPending}
            data-testid={`download-${file.id}`}
          >
            {downloadMutation.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1 h-4 w-4" />
            )}
            Download
          </Button>
        </div>
      </div>

      {previewOpen && (
        <div className="border-t bg-muted/30 p-3" data-testid={`preview-${file.id}`}>
          {previewLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading preview…
            </div>
          ) : isImageMime(file.mimeType) ? (
            <div className="flex justify-center">
              <img
                src={previewContent}
                alt={file.filename}
                className="max-h-64 rounded object-contain"
              />
            </div>
          ) : (
            <pre className="max-h-80 overflow-auto rounded bg-muted p-3 text-xs font-mono">
              {previewContent ?? 'No preview available'}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface PackageFilesProps {
  files: PackageFile[];
  packageId: string;
}

export function PackageFiles({ files, packageId }: PackageFilesProps) {
  const [openPreviews, setOpenPreviews] = useState<Set<string>>(new Set());

  const togglePreview = (fileId: string) => {
    setOpenPreviews((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  if (files.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="no-files">
        No files attached to this package.
      </p>
    );
  }

  return (
    <div className="space-y-2" data-testid="package-files">
      {files.map((file) => (
        <FileRow
          key={file.id}
          file={file}
          packageId={packageId}
          previewOpen={openPreviews.has(file.id)}
          onTogglePreview={() => togglePreview(file.id)}
        />
      ))}
    </div>
  );
}
