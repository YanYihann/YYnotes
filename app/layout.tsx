import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
import "./drake-note.css";
import { AuthProvider } from "@/components/auth/auth-provider";
import { LanguageProvider } from "@/components/language-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "YYNotes",
  description: "A clean bilingual note site for organizing and reading cross-subject study notes.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AuthProvider>
            <LanguageProvider>
              <SiteHeader />
              <main className="min-h-screen pt-12">{children}</main>
              <SiteFooter />
            </LanguageProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
