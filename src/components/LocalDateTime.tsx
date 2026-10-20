"use client";

import { useEffect, useState } from "react";

export type LocalDateFormat = "date" | "datetime" | "time";

type Props = {
  value: string;
  format?: LocalDateFormat;
  className?: string;
};

const OPTIONS: Record<LocalDateFormat, Intl.DateTimeFormatOptions> = {
  date: { dateStyle: "medium" },
  datetime: { dateStyle: "medium", timeStyle: "short" },
  time: { timeStyle: "short" },
};

export default function LocalDateTime({ value, format = "datetime", className }: Props) {
  const [label, setLabel] = useState("—");

  useEffect(() => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      setLabel("—");
      return;
    }
    setLabel(new Intl.DateTimeFormat(undefined, OPTIONS[format]).format(date));
  }, [format, value]);

  return (
    <time dateTime={value} className={className} suppressHydrationWarning>
      {label}
    </time>
  );
}
