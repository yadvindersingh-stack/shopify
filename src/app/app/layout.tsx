import PolarisProvider from "../polaris-provider";
import { Suspense } from "react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <PolarisProvider>{children}</PolarisProvider>
    </Suspense>
  );
}
