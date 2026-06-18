import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { StagingProvider } from "@/context/staging-context";
import { ProjectProvider } from "@/context/project-context";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Forge Studio",
  description: "Visual editor for Eve agents",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("dark font-sans", geist.variable)}>
      <body>
        <TooltipProvider>
          <ProjectProvider>
            <StagingProvider>
              {children}
              <Toaster richColors position="bottom-left" />
            </StagingProvider>
          </ProjectProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
