import { Link } from 'react-router-dom';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { CheckCircle2, AlertTriangle, XCircle, Info, X, ArrowRight, Settings as SettingsIcon } from 'lucide-react';

export interface ScanTotals {
  scanned: number;
  drafted: number;
  skipped: number;
  errors: string[];
}

export interface ScanResultPayload {
  totals: ScanTotals;
  ruleId?: string;       // present when scan was scoped to a single rule
  ruleName?: string;
  error?: string;        // top-level failure (network/etc.)
}

export function ScanResultBanner({
  result,
  onDismiss,
}: {
  result: ScanResultPayload | null;
  onDismiss: () => void;
}) {
  if (!result) return null;

  // Top-level error (scan call itself threw)
  if (result.error) {
    return (
      <Frame variant="error" onDismiss={onDismiss} icon={<XCircle className="h-5 w-5" />}>
        <div className="font-semibold">Scan failed</div>
        <div className="text-sm">{result.error}</div>
      </Frame>
    );
  }

  const { scanned, drafted, skipped, errors } = result.totals;
  const queueLink = result.ruleId ? `/queue?rule=${result.ruleId}` : '/queue';
  const ruleLabel = result.ruleName ? `the "${result.ruleName}" queue` : 'the queue';

  // 1. Some drafts added
  if (drafted > 0) {
    return (
      <Frame variant="success" onDismiss={onDismiss} icon={<CheckCircle2 className="h-5 w-5" />}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-semibold">
              {drafted} new draft{drafted === 1 ? '' : 's'} added to {ruleLabel}
            </div>
            <div className="text-sm">
              Scanned {scanned} contact{scanned === 1 ? '' : 's'}
              {skipped > 0 ? `, ${skipped} skipped (already drafted recently or filtered out)` : ''}.
            </div>
          </div>
          <Button asChild size="sm">
            <Link to={queueLink}>
              View queue <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </Frame>
    );
  }

  // 2. Nothing surfaced from the GHL side
  if (scanned === 0) {
    return (
      <Frame variant="warning" onDismiss={onDismiss} icon={<AlertTriangle className="h-5 w-5" />}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-semibold">No contacts found</div>
            <div className="text-sm">
              Launchpad returned no contacts for this sub-account.
              {errors.length > 0 ? ` First error: ${errors[0]}` : ' Check that the rule is active and the Launchpad token has the contacts scope.'}
            </div>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/settings">
              <SettingsIcon className="mr-2 h-4 w-4" /> Open Settings
            </Link>
          </Button>
        </div>
      </Frame>
    );
  }

  // 3. Contacts were scanned but every one was filtered/deduped
  return (
    <Frame variant="info" onDismiss={onDismiss} icon={<Info className="h-5 w-5" />}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold">No new drafts — every contact was skipped</div>
          <div className="text-sm">
            Scanned {scanned} contact{scanned === 1 ? '' : 's'}, none qualified. Common reasons:
          </div>
          <ul className="mt-1 ml-4 list-disc text-xs text-muted-foreground">
            <li>Already has a draft in the last 30 days</li>
            <li>Last activity is still inside the rule's inactivity window</li>
            <li>Doesn't match the rule's tag / pipeline-stage / activity-source filters</li>
          </ul>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/rules">Adjust rule</Link>
        </Button>
      </div>
    </Frame>
  );
}

function Frame({
  variant,
  children,
  onDismiss,
  icon,
}: {
  variant: 'success' | 'warning' | 'error' | 'info';
  children: React.ReactNode;
  onDismiss: () => void;
  icon: React.ReactNode;
}) {
  const styles = {
    success: 'border-emerald-300 bg-emerald-50 text-emerald-900',
    warning: 'border-amber-300 bg-amber-50 text-amber-900',
    error: 'border-red-300 bg-red-50 text-red-900',
    info: 'border-blue-300 bg-blue-50 text-blue-900',
  }[variant];
  return (
    <div className={cn('relative flex gap-3 rounded-md border p-4', styles)}>
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1">{children}</div>
      <button
        onClick={onDismiss}
        className="absolute right-2 top-2 rounded p-1 opacity-60 hover:opacity-100"
        title="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
