import type { Dispatch, SetStateAction } from "react";
import { ControlField, ControlInput, ControlSelect } from "@/components/demos/core/control-field";
import { getFunctionPresets } from "@/lib/numerical/evaluator";

type FunctionSelectorProps = {
  presetId: string;
  setPresetId: Dispatch<SetStateAction<string>>;
  customExpression: string;
  setCustomExpression: Dispatch<SetStateAction<string>>;
};

const presets = getFunctionPresets();

export function FunctionSelector({
  presetId,
  setPresetId,
  customExpression,
  setCustomExpression,
}: FunctionSelectorProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <ControlField labelZh="示例函数" labelEn="Preset Function">
        <ControlSelect value={presetId} onChange={(event) => setPresetId(event.target.value)}>
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label.zh} / {preset.label.en}
            </option>
          ))}
        </ControlSelect>
      </ControlField>

      <ControlField labelZh="自定义表达式（可选）" labelEn="Custom Expression (Optional)">
        <ControlInput
          value={customExpression}
          onChange={(event) => setCustomExpression(event.target.value)}
          placeholder="例如: sin(x) + x^2"
        />
      </ControlField>
    </div>
  );
}
