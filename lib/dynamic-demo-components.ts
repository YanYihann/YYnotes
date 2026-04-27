export type DynamicDemoKind = "set-operations" | "generic";

export type DynamicDemoInput = {
  name: string;
  label: string;
  type: string;
  defaultValue?: string | number | boolean | Array<string | number>;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
};

export type DynamicDemoOutput = {
  name: string;
  label: string;
};

export type DynamicDemoButton = {
  label: string;
  action: string;
};

export type DynamicDemoCompareCase = {
  label: string;
  expected?: string;
};

export type DynamicInteractiveDemoSpec = {
  componentName: string;
  anchorId: string;
  title: string;
  description: string;
  learnerTask: string;
  kind: DynamicDemoKind;
  inputs: DynamicDemoInput[];
  outputs: DynamicDemoOutput[];
  buttons: DynamicDemoButton[];
  compareCases: DynamicDemoCompareCase[];
  initialSetA?: Array<string | number>;
  initialSetB?: Array<string | number>;
  defaultOperation?: string;
};

function toKebabCase(value: string): string {
  return value
    .trim()
    .replace(/Demo$/i, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 64);
}

function encodeSpec(spec: DynamicInteractiveDemoSpec): string {
  return encodeURIComponent(JSON.stringify(spec));
}

function safeQuotedMatch(source: string, name: string): string {
  const match = source.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i"));
  return match?.[1]?.trim() ?? "";
}

function extractBalancedProp(source: string, name: string): string {
  const propIndex = source.search(new RegExp(`${name}\\s*=`, "i"));
  if (propIndex < 0) {
    return "";
  }

  let cursor = propIndex + name.length;
  while (cursor < source.length && /\s|=/.test(source[cursor] ?? "")) {
    cursor += 1;
  }

  if ((source[cursor] ?? "") === '"') {
    let end = cursor + 1;
    while (end < source.length) {
      const current = source[end] ?? "";
      if (current === '"' && source[end - 1] !== "\\") {
        return source.slice(cursor + 1, end).trim();
      }
      end += 1;
    }
    return "";
  }

  if ((source[cursor] ?? "") !== "{") {
    return "";
  }

  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let index = cursor;

  while (index < source.length) {
    const current = source[index] ?? "";
    const previous = source[index - 1] ?? "";

    if (!inDouble && current === "'" && previous !== "\\") {
      inSingle = !inSingle;
      index += 1;
      continue;
    }

    if (!inSingle && current === '"' && previous !== "\\") {
      inDouble = !inDouble;
      index += 1;
      continue;
    }

    if (inSingle || inDouble) {
      index += 1;
      continue;
    }

    if (current === "{") {
      depth += 1;
    } else if (current === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(cursor + 1, index).trim();
      }
    }

    index += 1;
  }

  return "";
}

function parseStringArray(source: string): string[] {
  const values: string[] = [];
  const matcher = /"([^"]+)"|'([^']+)'/g;
  let match = matcher.exec(source);
  while (match) {
    const value = (match[1] ?? match[2] ?? "").trim();
    if (value) {
      values.push(value);
    }
    match = matcher.exec(source);
  }
  return values;
}

function parseScalarArray(source: string): Array<string | number> {
  const body = source.trim().replace(/^\[/, "").replace(/\]$/, "");
  if (!body) {
    return [];
  }

  return body
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
        return token.slice(1, -1);
      }
      const num = Number(token);
      return Number.isFinite(num) ? num : token;
    });
}

function parseObjectEntries(source: string): string[] {
  const entries: string[] = [];
  const objectMatcher = /\{([\s\S]*?)\}/g;
  let match = objectMatcher.exec(source);
  while (match) {
    entries.push(match[1] ?? "");
    match = objectMatcher.exec(source);
  }
  return entries;
}

function parseInputs(source: string): DynamicDemoInput[] {
  const mapped = parseObjectEntries(source).map((entry): DynamicDemoInput | null => {
    const name = safeQuotedMatch(entry, "name") || safeQuotedMatch(entry, "id");
    const label = safeQuotedMatch(entry, "labelZh") || safeQuotedMatch(entry, "label") || name;
    const type = safeQuotedMatch(entry, "type").toLowerCase();
    if (!name || !label || !type) {
      return null;
    }

    const defaultValueRaw = entry.match(/\bdefaultValue\s*:\s*(\[[^\]]*\]|"[^"]*"|'[^']*'|-?\d+(?:\.\d+)?|true|false)/)?.[1] ?? "";
    const optionsSource = entry.match(/\boptions\s*:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
    const parsedDefaultValue =
      defaultValueRaw === "true"
        ? true
        : defaultValueRaw === "false"
          ? false
          : defaultValueRaw.startsWith("[")
            ? parseScalarArray(defaultValueRaw)
            : defaultValueRaw.startsWith('"') || defaultValueRaw.startsWith("'")
              ? defaultValueRaw.slice(1, -1)
              : defaultValueRaw
                ? Number.isFinite(Number(defaultValueRaw))
                  ? Number(defaultValueRaw)
                  : defaultValueRaw
                : undefined;

    const minMatch = entry.match(/\bmin\s*:\s*(-?\d+(?:\.\d+)?)/)?.[1];
    const maxMatch = entry.match(/\bmax\s*:\s*(-?\d+(?:\.\d+)?)/)?.[1];
    const stepMatch = entry.match(/\bstep\s*:\s*(-?\d+(?:\.\d+)?)/)?.[1];

    return {
      name,
      label,
      type,
      defaultValue: parsedDefaultValue,
      options: parseStringArray(optionsSource),
      min: minMatch ? Number(minMatch) : undefined,
      max: maxMatch ? Number(maxMatch) : undefined,
      step: stepMatch ? Number(stepMatch) : undefined,
    };
  });

  return mapped.filter((item): item is DynamicDemoInput => item !== null);
}

function parseOutputs(source: string): DynamicDemoOutput[] {
  const mapped = parseObjectEntries(source).map((entry): DynamicDemoOutput | null => {
    const name = safeQuotedMatch(entry, "name");
    const label = safeQuotedMatch(entry, "label");
    return name && label ? { name, label } : null;
  });

  return mapped.filter((item): item is DynamicDemoOutput => item !== null);
}

function parseButtons(source: string): DynamicDemoButton[] {
  const mapped = parseObjectEntries(source).map((entry): DynamicDemoButton | null => {
    const label = safeQuotedMatch(entry, "label");
    const action = safeQuotedMatch(entry, "action");
    return label && action ? { label, action } : null;
  });

  return mapped.filter((item): item is DynamicDemoButton => item !== null);
}

function parseCompareCases(source: string): DynamicDemoCompareCase[] {
  const mapped = parseObjectEntries(source).map((entry): DynamicDemoCompareCase | null => {
    const label = safeQuotedMatch(entry, "label");
    const expected = safeQuotedMatch(entry, "expected");
    return label ? { label, expected } : null;
  });

  return mapped.filter((item): item is DynamicDemoCompareCase => item !== null);
}

function inferKind(componentName: string, propSource: string): DynamicDemoKind {
  const haystack = `${componentName} ${propSource}`.toLowerCase();
  if (
    haystack.includes("setoperationsdemo") ||
    haystack.includes("union") ||
    haystack.includes("intersection") ||
    haystack.includes("symmetric_difference")
  ) {
    return "set-operations";
  }

  return "generic";
}

function buildSpecFromComponent(componentName: string, propSource: string): DynamicInteractiveDemoSpec | null {
  const title = safeQuotedMatch(propSource, "title") || componentName.replace(/Demo$/, "");
  if (!title) {
    return null;
  }

  const inputs = parseInputs(extractBalancedProp(propSource, "inputs"));
  const outputs = parseOutputs(extractBalancedProp(propSource, "outputs"));
  const buttons = parseButtons(extractBalancedProp(propSource, "buttons"));
  const compareCases = parseCompareCases(extractBalancedProp(propSource, "compareCases"));
  const description = safeQuotedMatch(propSource, "description");
  const learnerTask = safeQuotedMatch(propSource, "learnerTask");
  const initialSetA = parseScalarArray(extractBalancedProp(propSource, "initialSetA"));
  const initialSetB = parseScalarArray(extractBalancedProp(propSource, "initialSetB"));
  const operationInput = inputs.find((input) => input.name === "operation");
  const defaultOperation =
    typeof operationInput?.defaultValue === "string" ? operationInput.defaultValue : operationInput?.options?.[0] ?? "union";

  return {
    componentName,
    anchorId: `generated-demo-${toKebabCase(componentName) || "demo"}`,
    title,
    description,
    learnerTask,
    kind: inferKind(componentName, propSource),
    inputs,
    outputs,
    buttons,
    compareCases,
    initialSetA,
    initialSetB,
    defaultOperation,
  };
}

function findNextComponentBlock(source: string, startIndex: number): {
  start: number;
  end: number;
  componentName: string;
  propSource: string;
} | null {
  const matcher = /<([A-Z][A-Za-z0-9]*Demo)\b/g;
  matcher.lastIndex = startIndex;
  const match = matcher.exec(source);
  if (!match || match.index === undefined) {
    return null;
  }

  const componentName = match[1];
  let index = matcher.lastIndex;
  let braceDepth = 0;
  let inSingle = false;
  let inDouble = false;

  while (index < source.length) {
    const current = source[index] ?? "";
    const previous = source[index - 1] ?? "";

    if (!inDouble && current === "'" && previous !== "\\") {
      inSingle = !inSingle;
      index += 1;
      continue;
    }

    if (!inSingle && current === '"' && previous !== "\\") {
      inDouble = !inDouble;
      index += 1;
      continue;
    }

    if (inSingle || inDouble) {
      index += 1;
      continue;
    }

    if (current === "{") {
      braceDepth += 1;
      index += 1;
      continue;
    }

    if (current === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      index += 1;
      continue;
    }

    if (current === "/" && source[index + 1] === ">" && braceDepth === 0) {
      return {
        start: match.index,
        end: index + 2,
        componentName,
        propSource: source.slice(matcher.lastIndex, index).trim(),
      };
    }

    index += 1;
  }

  return null;
}

export function extractDynamicDemoSpecsFromContent(source: string): DynamicInteractiveDemoSpec[] {
  const specs: DynamicInteractiveDemoSpec[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const block = findNextComponentBlock(source, cursor);
    if (!block) {
      break;
    }

    const spec = buildSpecFromComponent(block.componentName, block.propSource);
    if (spec && !specs.some((item) => item.componentName === spec.componentName)) {
      specs.push(spec);
    }

    cursor = block.end;
  }

  return specs;
}

export function normalizeDynamicDemoMarkup(source: string): string {
  let cursor = 0;
  let output = "";

  while (cursor < source.length) {
    const block = findNextComponentBlock(source, cursor);
    if (!block) {
      output += source.slice(cursor);
      break;
    }

    output += source.slice(cursor, block.start);
    const spec = buildSpecFromComponent(block.componentName, block.propSource);
    if (!spec) {
      output += source.slice(block.start, block.end);
      cursor = block.end;
      continue;
    }

    output += `<div id="${spec.anchorId}" class="interactive-demo-generated" data-demo-component="${spec.componentName}" data-demo-spec="${encodeSpec(spec)}"></div>`;
    cursor = block.end;
  }

  return output.replace(/\n{3,}/g, "\n\n").trim();
}

export function decodeDynamicDemoSpec(encodedSpec: string): DynamicInteractiveDemoSpec | null {
  try {
    const decoded = decodeURIComponent(encodedSpec);
    const parsed = JSON.parse(decoded) as DynamicInteractiveDemoSpec;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
