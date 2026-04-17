'use client';

import * as React from 'react';
import { Mic, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * VoicePermissionPrompt — surfaced when microphone permission is needed
 * or has been denied. Covers the two web states the browser exposes:
 *
 *   - 'prompt' (or unknown): we show the request CTA; tapping triggers
 *     navigator.mediaDevices.getUserMedia which opens the native dialog.
 *   - 'denied': the browser will no longer surface a dialog, so we show
 *     instructions for re-enabling in site settings.
 *
 * The component is intentionally self-contained: no props are required to
 * detect state. Consumers can pass onGranted / onDismiss callbacks to close
 * the prompt after resolution.
 */

export type MicPermissionState = 'unknown' | 'prompt' | 'granted' | 'denied';

export interface VoicePermissionPromptProps {
  onGranted?:  () => void;
  onDismiss?:  () => void;
  className?:  string;
}

export function VoicePermissionPrompt({
  onGranted,
  onDismiss,
  className,
}: VoicePermissionPromptProps) {
  const [permission, setPermission] = React.useState<MicPermissionState>('unknown');
  const [requesting, setRequesting] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    // Permissions API is not universally supported; fall through to 'prompt'.
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
      setPermission('prompt');
      return;
    }
    navigator.permissions
      .query({ name: 'microphone' as PermissionName })
      .then((status) => {
        if (cancelled) return;
        setPermission(mapPermissionState(status.state));
        status.onchange = () => {
          setPermission(mapPermissionState(status.state));
        };
      })
      .catch(() => {
        if (!cancelled) setPermission('prompt');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const requestPermission = async () => {
    setRequesting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Immediately release the tracks — we only needed the grant.
      stream.getTracks().forEach((t) => t.stop());
      setPermission('granted');
      onGranted?.();
    } catch (err) {
      const denied = err instanceof Error && err.name === 'NotAllowedError';
      setPermission(denied ? 'denied' : 'prompt');
    } finally {
      setRequesting(false);
    }
  };

  if (permission === 'granted') return null;

  return (
    <div
      role="dialog"
      aria-label="Microphone permission"
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-border bg-background p-4 shadow-sm',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Mic className="size-4" aria-hidden />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">
            Microphone access needed
          </p>
          <p className="text-xs text-muted-foreground">
            NeuraLaunch transcribes your voice to text during recording.
            Audio is not stored.
          </p>
        </div>
      </div>

      {permission === 'denied' ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            Your browser is blocking microphone access for this site. Open the
            site settings (usually the lock icon next to the URL) and switch
            microphone to &ldquo;Allow&rdquo;, then reload the page.
          </p>
          <div className="flex items-center gap-2">
            {onDismiss && (
              <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
                Close
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={requestPermission}
            disabled={requesting}
            className="gap-1.5"
          >
            <ShieldCheck className="size-3.5" aria-hidden />
            Allow microphone
          </Button>
          {onDismiss && (
            <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
              Not now
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function mapPermissionState(state: PermissionState): MicPermissionState {
  switch (state) {
    case 'granted': return 'granted';
    case 'denied':  return 'denied';
    default:        return 'prompt';
  }
}
