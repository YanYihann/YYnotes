import Link from "next/link";
import { UiText } from "@/components/ui-text";

export function SiteFooter() {
  return <footer className="workspace-footer"><span>© {new Date().getFullYear()} YYNotes</span><div><Link href="/notes"><UiText zh="笔记" en="Notes" /></Link><a href="https://github.com/YanYihann/YYnotes" target="_blank" rel="noreferrer">GitHub</a></div></footer>;
}
