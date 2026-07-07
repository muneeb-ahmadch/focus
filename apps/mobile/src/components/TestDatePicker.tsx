import DateTimePicker from "@react-native-community/datetimepicker";
import { localDayToDate, toLocalDay } from "@/lib/clock";

type Props = {
  value: string;
  min: string;
  onChange: (day: string) => void;
};

export function TestDatePicker({ value, min, onChange }: Props) {
  return (
    <DateTimePicker
      value={localDayToDate(value)}
      mode="date"
      display="inline"
      minimumDate={localDayToDate(min)}
      onChange={(_event, date) => {
        if (date) onChange(toLocalDay(date));
      }}
    />
  );
}
