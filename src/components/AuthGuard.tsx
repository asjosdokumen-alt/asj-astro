/**
 * AuthGuard.tsx — Client-side route protection
 * Per PDF Fase 8: "Implement client-side route protection"
 *
 * Wraps protected content — redirects to login if no valid session.
 */
import { useStore } from '@nanostores/preact';
import { authStore } from '../store/authReactive';
import type { ComponentChildren } from 'preact';
import Icon from './ui/Icon';
import { ErrorBoundary } from './ErrorBoundary';
import { t } from '../store/i18n';

interface Props {
  children: ComponentChildren;
  requiredRole?: 'admin' | 'kandidat';
  redirectTo?: string;
}

export default function AuthGuard({ children, requiredRole, redirectTo = '/' }: Props) {
  const auth = useStore(authStore);

  // Not logged in → redirect
  if (!auth.isLoggedIn) {
    if (typeof window !== 'undefined') {
      window.location.href = redirectTo;
    }
    return (
      <div class="flex items-center justify-center min-h-screen">
        <div class="text-center">
          <Icon name="lock" class="text-4xl text-slate-500 mb-4" />
          <p class="text-slate-400">{t("ui.redirecting_login")}</p>
        </div>
      </div>
    );
  }

  // Wrong role → redirect
  if (requiredRole && auth.role !== requiredRole) {
    if (typeof window !== 'undefined') {
      window.location.href = redirectTo;
    }
    return (
      <div class="flex items-center justify-center min-h-screen">
        <div class="text-center">
          <Icon name="ban" class="text-4xl text-red-500 mb-4" />
          <p class="text-slate-400">{t("ui.access_denied_redirect")}</p>
        </div>
      </div>
    );
  }

  // Authorized → render children
  return <ErrorBoundary>{children}</ErrorBoundary>;
}
