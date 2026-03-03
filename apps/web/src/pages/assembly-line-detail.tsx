import { useParams } from 'react-router-dom';

export default function AssemblyLineDetailPage() {
  const { slug } = useParams<{ slug: string }>();

  return (
    <div>
      <h2 className="text-xl font-semibold">Assembly Line: {slug}</h2>
      <p className="mt-2 text-muted-foreground">Coming soon: Assembly Line Detail</p>
    </div>
  );
}
