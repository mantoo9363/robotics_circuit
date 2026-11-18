// circuit/src/components/auth/AuthRouteGuard.tsx
import { ReactNode } from "react";

export default function AuthRouteGuard({ children }: { children: ReactNode }) {
  return <>{children}</>;
}