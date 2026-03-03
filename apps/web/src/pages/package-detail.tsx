import { useParams } from 'react-router-dom';

export default function PackageDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div>
      <h2 className="text-xl font-semibold">Package: {id}</h2>
      <p className="mt-2 text-muted-foreground">Coming soon: Package Detail</p>
    </div>
  );
}
