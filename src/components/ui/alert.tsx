import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

export function Alert({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "destructive" | "warning";
}) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-lg border px-4 py-3 text-sm",
        variant === "destructive" &&
          "border-red-200 bg-red-50 text-red-800",
        variant === "warning" &&
          "border-amber-200 bg-amber-50 text-amber-900",
        variant === "default" &&
          "border-slate-200 bg-slate-50 text-slate-800",
        className
      )}
      {...props}
    />
  );
}
