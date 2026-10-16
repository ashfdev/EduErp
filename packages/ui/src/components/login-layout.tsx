"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "../lib/utils";
import { Input } from "./input";

// Login screen shared by the admin, teacher and portal apps: the institution's
// name set large as a wordmark on the left, the sign-in form on the right
// (stacked on phones). Each app keeps its own form logic and passes it as children.

export interface LoginInstitution {
  name_en?: string | null;
  name_bn?: string | null;
  logo_url?: string | null;
}

// Breaks a long name into a big first line and a smaller second line, e.g.
// "আল-হুমাইরা (রা.) মহিলা ফাযিল (ডিগ্রি) মাদ্রাসা" → "আল-হুমাইরা (রা.)" + the rest.
// Splits after the first closing bracket when there is one, otherwise after two words.
export function splitWordmark(name: string): [string, string] {
  const trimmed = name.trim();
  const bracket = trimmed.indexOf(")");
  if (bracket > 0 && bracket < trimmed.length - 1) {
    return [trimmed.slice(0, bracket + 1), trimmed.slice(bracket + 1).trim()];
  }
  const words = trimmed.split(/\s+/);
  if (words.length <= 2) return [trimmed, ""];
  return [words.slice(0, 2).join(" "), words.slice(2).join(" ")];
}

export const loginStyles = {
  title: "text-[26px] font-bold leading-tight text-forest lg:text-[32px]",
  subtitle: "text-[15px] leading-relaxed text-muted-foreground lg:text-base",
  label: "text-sm font-semibold lg:text-[15px]",
  input: "h-[54px] rounded-lg px-4 shadow-none text-base lg:h-14 lg:text-[17px]",
  button: "h-[54px] w-full rounded-lg bg-forest text-[17px] font-semibold text-white hover:bg-forest/90 lg:h-14",
  secondaryButton: "h-[54px] w-full rounded-lg text-base font-semibold lg:h-14",
  link: "rounded-sm text-sm font-semibold text-forest underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:text-[15px]",
  help: "text-[13px] leading-relaxed text-muted-foreground",
};

export interface LoginLayoutProps {
  institution?: LoginInstitution | null;
  // Which app this is, shown next to the logo ("অ্যাডমিন প্যানেল").
  portalLabel: string;
  footer: string;
  topEnd?: React.ReactNode;
  children: React.ReactNode;
}

export function LoginLayout({ institution, portalLabel, footer, topEnd, children }: LoginLayoutProps) {
  const name = institution?.name_bn || institution?.name_en || "";
  const [first, second] = name ? splitWordmark(name) : ["", ""];
  const englishName = institution?.name_bn && institution?.name_en ? institution.name_en : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col gap-7 px-6 py-6 sm:px-10 lg:flex-row lg:gap-14 lg:px-16 lg:py-12">
        <section className="flex min-w-0 flex-col gap-7 lg:flex-1 lg:justify-between">
          <div className="flex items-center gap-3">
            {institution?.logo_url ? (
              <img src={institution.logo_url} alt="" className="h-12 w-12 shrink-0 object-contain lg:h-16 lg:w-16" />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-forest text-lg font-bold text-lime lg:h-16 lg:w-16">{name.charAt(0)}</div>
            )}
            <span className="text-[13px] text-muted-foreground lg:text-[15px]">{portalLabel}</span>
          </div>

          <div className="flex flex-col gap-0.5 lg:gap-1.5">
            {first ? (
              <p className="text-[42px] font-semibold leading-[1.15] text-forest lg:text-[clamp(3.25rem,5.5vw,4.75rem)] lg:leading-[1.12]">{first}</p>
            ) : (
              <div aria-hidden="true" className="h-12 w-3/4 animate-pulse rounded bg-muted lg:h-20" />
            )}
            {second && <p className="text-xl font-medium leading-snug text-forest/85 lg:text-[clamp(1.5rem,2.5vw,2.125rem)]">{second}</p>}
            <div aria-hidden="true" className="mt-3.5 h-2 w-[72px] rounded-[3px] bg-lime lg:mt-[22px] lg:h-2.5 lg:w-[104px]" />
            {englishName && <p className="mt-4 hidden text-[17px] text-muted-foreground lg:block">{englishName}</p>}
          </div>

          <p className="hidden text-[13px] text-muted-foreground lg:block">{footer}</p>
        </section>

        <section className="flex w-full flex-col justify-center gap-4 lg:w-[520px] lg:shrink-0">
          {topEnd && <div className="flex justify-end">{topEnd}</div>}
          <div className="lg:rounded-xl lg:border lg:p-12">{children}</div>
        </section>

        <p className="mt-auto pt-4 text-center text-[13px] text-muted-foreground lg:hidden">{footer}</p>
      </div>
    </div>
  );
}

export interface LoginPasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  showLabel: string;
  hideLabel: string;
}

export const LoginPasswordInput = React.forwardRef<HTMLInputElement, LoginPasswordInputProps>(({ showLabel, hideLabel, className, ...props }, ref) => {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <Input ref={ref} type={visible ? "text" : "password"} className={cn(loginStyles.input, "pr-14", className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? hideLabel : showLabel}
        aria-pressed={visible}
        className="absolute right-1 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  );
});
LoginPasswordInput.displayName = "LoginPasswordInput";
