import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <h2 className="text-2xl font-semibold">Page Not Found</h2>
      <p className="mt-2 text-muted-foreground">
        The page you are looking for does not exist.
      </p>
      <Link
        to="/"
        className="mt-4 text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
