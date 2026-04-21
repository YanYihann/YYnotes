import { formatNumber } from "@/lib/numerical/format";

type RombergTableProps = {
  table: number[][];
};

export function RombergTable({ table }: RombergTableProps) {
  if (!table.length) {
    return null;
  }

  const maxColumns = table.length;

  return (
    <section className="overflow-hidden rounded-apple bg-card text-card-foreground shadow-card">
      <header className="border-b border-border px-4 py-3">
        <h3 className="font-display text-[21px] font-semibold leading-[1.19] tracking-[0.231px] text-foreground">
          Romberg 表
          <span className="ui-en ml-1 font-text text-[15px] font-normal tracking-tightCaption text-muted-foreground">Romberg Table</span>
        </h3>
      </header>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className="border-b border-border px-4 py-2 text-left font-text text-[13px] font-semibold tracking-tightCaption text-muted-foreground">
                k
              </th>
              {Array.from({ length: maxColumns }, (_, index) => (
                <th
                  key={index}
                  className="border-b border-border px-4 py-2 text-left font-text text-[13px] font-semibold tracking-tightCaption text-muted-foreground"
                >
                  R(k,{index})
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-border/50 last:border-none">
                <td className="px-4 py-2.5 font-text text-[14px] tracking-tightCaption text-muted-foreground">{rowIndex}</td>
                {Array.from({ length: maxColumns }, (_, colIndex) => (
                  <td key={colIndex} className="px-4 py-2.5 font-text text-[14px] tracking-tightCaption text-muted-foreground">
                    {colIndex <= rowIndex ? formatNumber(row[colIndex], 10) : "--"}
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
