import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

type FieldProps = {
  labelZh: string;
  labelEn: string;
  children: ReactNode;
};

export function ControlField({ labelZh, labelEn, children }: FieldProps) {
  return (
    <label className="block space-y-1.5">
      <span className="font-text text-[14px] font-semibold tracking-tightCaption text-black/75 dark:text-white/78">
        {labelZh}
        <span className="ui-en ml-1 font-normal text-black/58 dark:text-white/64">{labelEn}</span>
      </span>
      {children}
    </label>
  );
}

const commonInputClass =
  "w-full rounded-apple border border-black/10 bg-[#fafafc] px-3 py-2 font-text text-[15px] leading-[1.4] tracking-tightCaption text-[#1d1d1f] outline-none transition focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/25 dark:border-white/10 dark:bg-[#1d1d1f] dark:text-white";

export function ControlInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={[commonInputClass, props.className].filter(Boolean).join(" ")} />;
}

export function ControlSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={[commonInputClass, props.className].filter(Boolean).join(" ")} />;
}

export function ControlTextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={[commonInputClass, props.className].filter(Boolean).join(" ")} />;
}
