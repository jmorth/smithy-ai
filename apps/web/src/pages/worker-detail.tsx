import { useParams } from 'react-router-dom';

export default function WorkerDetailPage() {
  const { slug } = useParams<{ slug: string }>();

  return (
    <div>
      <h2 className="text-xl font-semibold">Worker: {slug}</h2>
      <p className="mt-2 text-muted-foreground">Coming soon: Worker Detail</p>
    </div>
  );
}
