import { GlobalSkeleton } from '@cs/components/ui/GlobalSkeleton';

export default function RegisterLoading() {
  return <GlobalSkeleton variant="auth" rows={3} />;
}
