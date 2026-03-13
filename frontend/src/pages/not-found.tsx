import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Meta } from '@/components/shared/meta';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  const location = useLocation();
  const isAppRoute = location.pathname.startsWith('/app');

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-4">
      <Meta title="Page Not Found" />
      <p className="text-6xl font-bold tracking-tight text-muted-foreground/30">404</p>
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        The page <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{location.pathname}</code> doesn&apos;t exist.
      </p>
      <Button asChild variant="outline" size="sm" className="mt-2">
        <Link to={isAppRoute ? '/app' : '/'}>
          <ArrowLeft className="mr-2 h-3.5 w-3.5" />
          {isAppRoute ? 'Back to Dashboard' : 'Back to Home'}
        </Link>
      </Button>
    </div>
  );
}
