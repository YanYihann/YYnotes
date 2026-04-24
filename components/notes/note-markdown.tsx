"use client";

import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import allComponents from "@/components/mdx/mdx-components";

const markdownComponents = {
  h1: allComponents.h1,
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
  img: allComponents.img,
  div: allComponents.div,
};

type NoteMarkdownProps = {
  source: string;
};

export function NoteMarkdown({ source }: NoteMarkdownProps) {
  return (
    <ReactMarkdown
      components={markdownComponents}
      urlTransform={(url, key, node) => {
        if (key === "src" && node.tagName === "img" && /^data:image\//i.test(url)) {
          return url;
        }
        return defaultUrlTransform(url);
      }}
      remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
      rehypePlugins={[
        rehypeRaw,
        [rehypeHighlight, { detect: true, ignoreMissing: true }],
        [rehypeKatex, { throwOnError: false, strict: "ignore" }],
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
