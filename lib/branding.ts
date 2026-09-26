import type { CSSProperties } from "react";

export const PLATFORM_BRAND = {
  primary: "#1e3a8a",
  secondary: "#f59e0b",
} as const;

const HEX = /^#[0-9a-f]{6}$/i;

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Pick black or white text — whichever has higher contrast on the colour. */
export function readableForeground(background: string): "#ffffff" | "#111827" {
  return contrast(background, "#ffffff") >= contrast(background, "#111827") ? "#ffffff" : "#111827";
}

/**
 * CSS custom properties for a school's brand. Invalid or missing colours fall
 * back to the platform default. Values are validated here as well as by the
 * database CHECK constraint, because they are injected into a style attribute.
 */
export function brandStyle(primaryColor: string | null | undefined): CSSProperties {
  const brand = primaryColor && HEX.test(primaryColor) ? primaryColor : PLATFORM_BRAND.primary;
  return {
    "--brand": brand,
    "--brand-foreground": readableForeground(brand),
  } as CSSProperties;
}

export function initialsFor(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  const letters = words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}
