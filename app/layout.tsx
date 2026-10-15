import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
import "./drake-note.css";
import "./workspace.css";
import "./monochrome.css";
import { AuthProvider } from "@/components/auth/auth-provider";
import { LanguageProvider } from "@/components/language-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import { getWeekNotes } from "@/lib/content";

export const metadata: Metadata = {
  title: "YYNotes",
  description: "Generate, organize, and study bilingual notes from documents, lectures, and research material.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const notes = await getWeekNotes();
  const publicNotes = notes.map((note) => ({ slug: note.slug, href: `/notes/${encodeURIComponent(note.slug)}`, title: note.zhTitle, englishTitle: note.enTitle, description: note.descriptionZh, englishDescription: note.descriptionEn, topic: note.topicZh, englishTopic: note.topicEn, tags: note.tags }));
  return (
    <html lang="en" data-language="en" suppressHydrationWarning>
      <body className="bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <AuthProvider>
            <LanguageProvider>
              <SiteHeader publicNotes={publicNotes} />
              <main id="workspace-main" className="site-main" tabIndex={-1}>{children}</main>
              <SiteFooter />
            </LanguageProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
