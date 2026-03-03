// ---------------------------------------------------------------------------
// YamlViewer — read-only YAML configuration viewer with syntax highlighting
// ---------------------------------------------------------------------------

interface YamlViewerProps {
  config: Record<string, unknown>;
}

let keyCounter = 0;
function nextKey(prefix: string): string {
  return `${prefix}-${keyCounter++}`;
}

// Recursively format a value as YAML-like text with syntax-highlighted spans
function formatValue(value: unknown, indent: number): JSX.Element[] {
  const pad = '  '.repeat(indent);
  const elements: JSX.Element[] = [];

  if (value === null || value === undefined) {
    elements.push(
      <span key={nextKey('null')} className="text-gray-500">
        null
      </span>,
    );
    return elements;
  }

  if (typeof value === 'string') {
    elements.push(
      <span key={nextKey('str')} className="text-green-600 dark:text-green-400">
        {value}
      </span>,
    );
    return elements;
  }

  if (typeof value === 'number') {
    elements.push(
      <span key={nextKey('num')} className="text-orange-600 dark:text-orange-400">
        {String(value)}
      </span>,
    );
    return elements;
  }

  if (typeof value === 'boolean') {
    elements.push(
      <span key={nextKey('bool')} className="text-purple-600 dark:text-purple-400">
        {String(value)}
      </span>,
    );
    return elements;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      elements.push(
        <span key={nextKey('arr-empty')} className="text-gray-500">
          []
        </span>,
      );
      return elements;
    }

    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        elements.push(
          <span key={nextKey('arr-dash')}>
            {'\n'}
            {pad}- {' '}
          </span>,
        );
        const entries = Object.entries(item as Record<string, unknown>);
        entries.forEach(([k, v], j) => {
          if (j > 0) {
            elements.push(
              <span key={nextKey('arr-pad')}>
                {'\n'}
                {pad}{'  '}
              </span>,
            );
          }
          elements.push(
            <span
              key={nextKey('arr-key')}
              className="text-blue-600 dark:text-blue-400"
            >
              {k}
            </span>,
          );
          elements.push(<span key={nextKey('arr-colon')}>: </span>);
          elements.push(...formatValue(v, indent + 2));
        });
      } else {
        elements.push(
          <span key={nextKey('arr-item')}>
            {'\n'}
            {pad}-{' '}
          </span>,
        );
        elements.push(...formatValue(item, indent + 1));
      }
    }
    return elements;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      elements.push(
        <span key={nextKey('obj-empty')} className="text-gray-500">
          {'{}'}
        </span>,
      );
      return elements;
    }

    for (let i = 0; i < entries.length; i++) {
      const [key, val] = entries[i]!;
      elements.push(
        <span key={nextKey('obj-nl')}>
          {'\n'}
          {pad}
        </span>,
      );
      elements.push(
        <span
          key={nextKey('obj-key')}
          className="text-blue-600 dark:text-blue-400"
        >
          {key}
        </span>,
      );
      elements.push(<span key={nextKey('obj-colon')}>: </span>);

      if (
        typeof val === 'object' &&
        val !== null
      ) {
        elements.push(...formatValue(val, indent + 1));
      } else {
        elements.push(...formatValue(val, indent));
      }
    }
    return elements;
  }

  elements.push(<span key={nextKey('other')}>{String(value)}</span>);
  return elements;
}

export default function YamlViewer({ config }: YamlViewerProps) {
  const entries = Object.entries(config);

  if (entries.length === 0) {
    return (
      <div
        className="rounded-md border bg-muted/50 p-4"
        data-testid="yaml-viewer"
      >
        <p className="text-sm text-muted-foreground">No configuration</p>
      </div>
    );
  }

  // Reset counter per render to keep keys stable
  keyCounter = 0;

  const elements: JSX.Element[] = [];
  for (let i = 0; i < entries.length; i++) {
    const [key, value] = entries[i]!;
    if (i > 0) {
      elements.push(<span key={nextKey('root-nl')}>{'\n'}</span>);
    }
    elements.push(
      <span
        key={nextKey('root-key')}
        className="text-blue-600 dark:text-blue-400"
      >
        {key}
      </span>,
    );
    elements.push(<span key={nextKey('root-colon')}>: </span>);

    if (typeof value === 'object' && value !== null) {
      elements.push(...formatValue(value, 1));
    } else {
      elements.push(...formatValue(value, 0));
    }
  }

  return (
    <div
      className="rounded-md border bg-muted/50 p-4 overflow-auto"
      data-testid="yaml-viewer"
    >
      <pre className="text-sm font-mono leading-relaxed whitespace-pre">
        <code>{elements}</code>
      </pre>
    </div>
  );
}
