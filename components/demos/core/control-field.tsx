import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

type FieldProps = {
  labelZh: string;
  labelEn: string;
  children: ReactNode;
};

export function ControlField({ labelZh, labelEn, children }: FieldProps) {
  return (
    <label className="block space-y-1.5">
      <span className="font-text text-[14px] font-semibold tracking-tightCaption text-muted-foreground">
        {labelZh}
        <span className="ui-en ml-1 font-normal text-muted-foreground">{labelEn}</span>
      </span>
      {children}
    </label>
  );
}

const commonInputClass =
  "w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[15px] leading-[1.4] tracking-tightCaption text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/25";

export function ControlInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={[commonInputClass, props.className].filter(Boolean).join(" ")} />;
}

export function ControlSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={[commonInputClass, props.className].filter(Boolean).join(" ")} />;
}

export function ControlTextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={[commonInputClass, props.className].filter(Boolean).join(" ")} />;
}
