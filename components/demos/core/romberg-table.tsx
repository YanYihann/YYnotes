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
    <section className="overflow-hidden rounded-apple bg-white shadow-card dark:bg-[#272729]">
      <header className="border-b border-black/10 px-4 py-3 dark:border-white/10">
        <h3 className="font-display text-[21px] font-semibold leading-[1.19] tracking-[0.231px] text-[#1d1d1f] dark:text-white">
          Romberg 表
          <span className="ui-en ml-1 font-text text-[15px] font-normal tracking-tightCaption text-black/58 dark:text-white/66">Romberg Table</span>
        </h3>
      </header>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className="border-b border-black/10 px-4 py-2 text-left font-text text-[13px] font-semibold tracking-tightCaption text-black/70 dark:border-white/10 dark:text-white/75">
                k
              </th>
              {Array.from({ length: maxColumns }, (_, index) => (
                <th
                  key={index}
                  className="border-b border-black/10 px-4 py-2 text-left font-text text-[13px] font-semibold tracking-tightCaption text-black/70 dark:border-white/10 dark:text-white/75"
                >
                  R(k,{index})
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-black/5 last:border-none dark:border-white/5">
                <td className="px-4 py-2.5 font-text text-[14px] tracking-tightCaption text-black/78 dark:text-white/82">{rowIndex}</td>
                {Array.from({ length: maxColumns }, (_, colIndex) => (
                  <td key={colIndex} className="px-4 py-2.5 font-text text-[14px] tracking-tightCaption text-black/78 dark:text-white/82">
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
