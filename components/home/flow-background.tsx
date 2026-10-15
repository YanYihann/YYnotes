"use client";
import { useEffect, useRef, useState } from "react";

export function FlowBackground() {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = true;
    const update = () => setActive(visible && !document.hidden && !motion.matches);
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); });
    if (root.current) observer.observe(root.current);
    motion.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    update();
    return () => { observer.disconnect(); motion.removeEventListener("change", update); document.removeEventListener("visibilitychange", update); };
  }, []);
  return <div ref={root} className={`flow-background ${active ? "is-active" : ""}`} aria-hidden="true"><div className="flow-parallax"><div className="flow-field flow-field-one" /><div className="flow-field flow-field-two" /><div className="flow-grain" /></div><div className="flow-shade" /></div>;
}
