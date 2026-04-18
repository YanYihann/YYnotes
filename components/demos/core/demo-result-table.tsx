import type { ReactNode } from "react";

type Column<T> = {
  key: string;
  title: ReactNode;
  render: (row: T) => ReactNode;
};

type DemoResultTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  captionZh?: string;
  captionEn?: string;
};

export function DemoResultTable<T>({ columns, rows, captionZh, captionEn }: DemoResultTableProps<T>) {
  return (
    <section className="overflow-hidden rounded-apple bg-white shadow-card dark:bg-[#272729]">
      {(captionZh || captionEn) && (
        <header className="border-b border-black/10 px-4 py-3 dark:border-white/10">
          <p className="font-text text-[14px] font-semibold tracking-tightCaption text-black/78 dark:text-white/82">
            {captionZh}
            {captionEn ? <span className="ui-en ml-1 font-normal text-black/58 dark:text-white/64">{captionEn}</span> : null}
          </p>
        </header>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="border-b border-black/10 px-4 py-2 font-text text-[13px] font-semibold tracking-tightCaption text-black/70 dark:border-white/10 dark:text-white/78"
                >
                  {column.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-black/5 last:border-none dark:border-white/5">
                {columns.map((column) => (
                  <td key={column.key} className="px-4 py-2.5 font-text text-[14px] tracking-tightCaption text-black/78 dark:text-white/82">
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
