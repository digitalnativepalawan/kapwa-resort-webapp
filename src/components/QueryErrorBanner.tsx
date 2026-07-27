import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface QueryErrorBannerProps {
  error: unknown;
  /** What failed to load, e.g. "housekeeping assignments". */
  what: string;
  onRetry?: () => void;
  retrying?: boolean;
}

/**
 * Shows a failed data load instead of hiding it behind an empty list.
 *
 * Most screens in this app did `const { data } = await supabase.from(...)` and
 * returned `data || []`, discarding the error. When RLS started rejecting
 * anonymous reads, every one of those screens rendered "nothing here" — which
 * looked like a data problem rather than an auth problem and sent the
 * investigation in the wrong direction for a long time.
 *
 * The Supabase message is shown verbatim: "new row violates row-level security
 * policy" and "JWT expired" are the two answers worth reading, and paraphrasing
 * them loses the diagnosis.
 */
const QueryErrorBanner = ({ error, what, onRetry, retrying }: QueryErrorBannerProps) => {
  if (!error) return null;

  const message = error instanceof Error ? error.message : String(error);

  return (
    <Card className="p-4 border-destructive/50 bg-destructive/10">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
        <div className="space-y-2 min-w-0">
          <p className="font-body text-sm text-foreground">Could not load {what}.</p>
          <p className="font-body text-xs text-muted-foreground break-words">{message}</p>
          {onRetry && (
            <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
              {retrying && <Loader2 className="w-3 h-3 mr-2 animate-spin" />}
              Try again
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};

export default QueryErrorBanner;
