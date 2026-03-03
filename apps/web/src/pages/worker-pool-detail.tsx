import { useParams } from 'react-router-dom';

export default function WorkerPoolDetailPage() {
  const { slug } = useParams<{ slug: string }>();

  return (
    <div>
      <h2 className="text-xl font-semibold">Worker Pool: {slug}</h2>
      <p className="mt-2 text-muted-foreground">Coming soon: Worker Pool Detail</p>
    </div>
  );
}
