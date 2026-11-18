import { GlobalSkeleton } from '@cs/components/ui/GlobalSkeleton';

export default function LoginLoading() {
  return <GlobalSkeleton variant="auth" rows={2} />;
}
