import { Inter } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Toaster } from "sonner";
import { ArtifactProvider, ArtifactTitle, ArtifactContent } from "@/app/components/artifact";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
    >
      <body
        className={inter.className}
        suppressHydrationWarning
      >
        <ArtifactProvider>
          <NuqsAdapter>{children}</NuqsAdapter>
          <Toaster />
          {/* Artifact portal targets — rendered when agent emits artifacts */}
          <ArtifactTitle className="hidden" />
          <ArtifactContent className="hidden" />
        </ArtifactProvider>
      </body>
    </html>
  );
}
