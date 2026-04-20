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
    <section className="overflow-hidden rounded-apple bg-card text-card-foreground shadow-card">
      {(captionZh || captionEn) && (
        <header className="border-b border-border px-4 py-3">
          <p className="font-text text-[14px] font-semibold tracking-tightCaption text-muted-foreground">
            {captionZh}
            {captionEn ? <span className="ui-en ml-1 font-normal text-muted-foreground">{captionEn}</span> : null}
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
                  className="border-b border-border px-4 py-2 font-text text-[13px] font-semibold tracking-tightCaption text-muted-foreground"
                >
                  {column.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-border/50 last:border-none">
                {columns.map((column) => (
                  <td key={column.key} className="px-4 py-2.5 font-text text-[14px] tracking-tightCaption text-muted-foreground">
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
