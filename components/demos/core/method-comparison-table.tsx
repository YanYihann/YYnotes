import { DemoResultTable } from "@/components/demos/core/demo-result-table";
import { ErrorBadge } from "@/components/demos/core/error-badge";
import { formatNumber } from "@/lib/numerical/format";
import type { IntegrationComparisonRow } from "@/lib/numerical/integration";

type MethodComparisonTableProps = {
  rows: IntegrationComparisonRow[];
};

export function MethodComparisonTable({ rows }: MethodComparisonTableProps) {
  return (
    <DemoResultTable
      captionZh="方法对比"
      captionEn="Method Comparison"
      rows={rows}
      columns={[
        {
          key: "method",
          title: "Method / 方法",
          render: (row) => row.label,
        },
        {
          key: "n",
          title: "n",
          render: (row) => row.n,
        },
        {
          key: "value",
          title: "Approximation / 近似值",
          render: (row) => formatNumber(row.approximation, 10),
        },
        {
          key: "error",
          title: "Error / 误差",
          render: (row) => <ErrorBadge error={row.error} />,
        },
      ]}
    />
  );
}
