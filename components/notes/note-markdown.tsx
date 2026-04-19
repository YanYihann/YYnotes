"use client";

import ReactMarkdown from "react-markdown";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import allComponents from "@/components/mdx/mdx-components";

const markdownComponents = {
  p: allComponents.p,
  h2: allComponents.h2,
  h3: allComponents.h3,
  h4: allComponents.h4,
  ul: allComponents.ul,
  ol: allComponents.ol,
  li: allComponents.li,
  a: allComponents.a,
  blockquote: allComponents.blockquote,
  pre: allComponents.pre,
  code: allComponents.code,
  table: allComponents.table,
  th: allComponents.th,
  td: allComponents.td,
};

type NoteMarkdownProps = {
  source: string;
};

export function NoteMarkdown({ source }: NoteMarkdownProps) {
  return (
    <ReactMarkdown
      components={markdownComponents}
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[
        rehypeKatex,
        rehypeSlug,
        [
          rehypeAutolinkHeadings,
          {
            behavior: "append",
            properties: {
              className: ["anchor-link"],
              "aria-label": "Anchor",
            },
          },
        ],
      ]}
    >
      {source}
    </ReactMarkdown>
  );
}

