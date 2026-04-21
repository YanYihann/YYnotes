import Link from "next/link";

export default function NotFound() {
  return (
    <div className="section-dark flex min-h-[70vh] items-center justify-center px-4 py-20 text-center sm:px-6">
      <div className="max-w-[640px]">
        <p className="font-text text-[12px] font-semibold uppercase tracking-[0.1em] text-white/60">404</p>
        <h1 className="mt-3 font-display text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-[1.07] tracking-tightDisplay text-white">
          该笔记页面尚未创建
          <span className="ui-en mt-2 block text-[0.6em] font-normal text-white/80">This note page does not exist yet.</span>
        </h1>
        <p className="mt-4 font-text text-[17px] leading-[1.47] text-white/80">
          可能是路由地址有误，或对应 MDX 文件还未添加。
          <span className="ui-en ml-1">The route may be incorrect, or the corresponding MDX file has not been added.</span>
        </p>
        <div className="mt-8">
          <Link
            href="/notes"
            className="inline-flex rounded-apple bg-primary px-5 py-2 text-[17px] text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
          >
            返回笔记
            <span className="ui-en ml-1">Back to Notes</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
