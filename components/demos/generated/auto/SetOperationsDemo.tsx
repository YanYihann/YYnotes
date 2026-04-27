"use client";

import { AutoInteractiveDemoRenderer } from "@/components/demos/generated/runtime/auto-interactive-demo-renderer";
import type { GeneratedDemoComponentProps } from "@/components/demos/generated/registry";
import type { DynamicInteractiveDemoSpec } from "@/lib/dynamic-demo-components";

const spec: DynamicInteractiveDemoSpec = {
  "componentName": "SetOperationsDemo",
  "anchorId": "generated-demo-set-operations",
  "title": "集合运算",
  "description": "比较 set1 和 set2 的 union、intersection、difference 与 symmetric_difference。",
  "learnerTask": "依次点击四种集合运算按钮，比较每种运算返回的新集合中包含哪些元素。",
  "kind": "set-operations",
  "inputs": [
    {
      "name": "setA",
      "label": "集合 set1",
      "type": "array",
      "defaultValue": [
        1,
        2,
        3,
        4
      ],
      "options": []
    },
    {
      "name": "setB",
      "label": "集合 set2",
      "type": "array",
      "defaultValue": [
        3,
        4,
        5,
        6
      ],
      "options": []
    },
    {
      "name": "operation",
      "label": "集合运算",
      "type": "select",
      "defaultValue": "union",
      "options": [
        "union",
        "intersection",
        "difference",
        "symmetric_difference"
      ]
    }
  ],
  "outputs": [
    {
      "name": "unionResult",
      "label": "set1.union(set2) 或 set1 | set2 的结果"
    },
    {
      "name": "intersectionResult",
      "label": "set1.intersection(set2) 或 set1 & set2 的结果"
    },
    {
      "name": "differenceResult",
      "label": "set1.difference(set2) 或 set1 - set2 的结果"
    },
    {
      "name": "symmetricDifferenceResult",
      "label": "set1.symmetric_difference(set2) 或 set1 ^ set2 的结果"
    }
  ],
  "buttons": [
    {
      "label": "运行 union",
      "action": "runUnion"
    },
    {
      "label": "运行 intersection",
      "action": "runIntersection"
    },
    {
      "label": "运行 difference",
      "action": "runDifference"
    },
    {
      "label": "运行 symmetric_difference",
      "action": "runSymmetricDifference"
    },
    {
      "label": "重置",
      "action": "reset"
    }
  ],
  "compareCases": [
    {
      "label": "并集",
      "expected": "结果包含两个集合中的所有元素"
    },
    {
      "label": "交集",
      "expected": "结果只包含两个集合共有的元素"
    },
    {
      "label": "差集",
      "expected": "结果包含只出现在第一个集合中的元素"
    },
    {
      "label": "对称差集",
      "expected": "结果包含两个集合不共享的元素"
    }
  ],
  "initialSetA": [
    1,
    2,
    3,
    4
  ],
  "initialSetB": [
    3,
    4,
    5,
    6
  ],
  "defaultOperation": "union"
};

export default function SetOperationsDemo({ anchorId }: GeneratedDemoComponentProps) {
  return <AutoInteractiveDemoRenderer spec={spec} anchorId={anchorId} />;
}

export { SetOperationsDemo };
