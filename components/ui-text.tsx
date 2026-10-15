"use client";
import { useLanguage } from "@/components/language-provider";

export function UiText({ zh, en }: { zh: string; en: string }) {
  const { t } = useLanguage();
  return t(zh, en);
}
