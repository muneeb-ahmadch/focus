import { colors, font, space } from "@/theme/tokens";

type Props = {
  value: string;
  min: string;
  onChange: (day: string) => void;
};

export function TestDatePicker({ value, min, onChange }: Props) {
  return (
    <input
      type="date"
      value={value}
      min={min}
      onChange={(e) => onChange(e.target.value)}
      style={{
        fontSize: font.md,
        color: colors.text,
        padding: space.md,
        border: "none",
        background: "transparent",
        width: "100%",
        fontFamily: "inherit",
      }}
    />
  );
}
