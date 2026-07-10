import { useTheme } from "@/theme/useTheme";

type Props = {
  value: string;
  min: string;
  onChange: (day: string) => void;
};

export function TestDatePicker({ value, min, onChange }: Props) {
  const t = useTheme();
  return (
    <input
      type="date"
      value={value}
      min={min}
      onChange={(e) => onChange(e.target.value)}
      style={{
        fontSize: t.font.md,
        color: t.colors.text,
        padding: t.space.md,
        border: "none",
        background: "transparent",
        width: "100%",
        fontFamily: "inherit",
      }}
    />
  );
}
