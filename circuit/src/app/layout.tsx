// src/app/layout.tsx
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthRouteGuard } from '@cs/components/auth/AuthRouteGuard';
import { ClientSimulationBind } from '@cs/components/ClientSimulationBind'; // <-- Double check this path!
import { GlobalSkeleton } from '@cs/components/ui/GlobalSkeleton';
import { AuthProvider } from "@cs/provider/AuthProvider";
import './globals.css';

export const metadata: Metadata = {
  title: 'Circuit Studio',
  description: 'Professional circuit simulation workspace with synchronized 2D and 3D views.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body suppressHydrationWarning>
        <ClientSimulationBind />
        <AuthProvider>
          <Suspense fallback={<GlobalSkeleton variant="page" rows={4} />}>
            <AuthRouteGuard>
              {children}
            </AuthRouteGuard>
          </Suspense>
        </AuthProvider>
      </body>
    </html>
  );
}
