import { cn } from "@/lib/utils";

type IconProps = { className?: string };

/**
 * Brand platform icons — inline SVG because lucide-react 1.x removed brand glyphs.
 */

export function LinkedinIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("h-4 w-4", className)} aria-hidden>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

export function XIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("h-4 w-4", className)} aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  );
}

export function WechatIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("h-4 w-4", className)} aria-hidden>
      <path d="M8.691 2C4.547 2 1.195 4.94 1.195 8.55c0 1.84.885 3.486 2.291 4.663a.522.522 0 01.13.672l-.583 1.56c-.095.256.131.478.369.34l2.003-1.16a.702.702 0 01.531-.077c.894.257 1.84.39 2.794.39.098 0 .196-.003.294-.006-.183-.589-.285-1.212-.285-1.85 0-3.284 3.08-5.948 6.876-5.948.1 0 .199.002.298.006C16.5 4.214 12.873 2 8.691 2zm-2.18 3.486c.605 0 1.097.492 1.097 1.097 0 .606-.492 1.098-1.098 1.098-.605 0-1.097-.492-1.097-1.098 0-.605.492-1.097 1.097-1.097zm4.367 0c.605 0 1.097.492 1.097 1.097 0 .606-.492 1.098-1.097 1.098-.606 0-1.098-.492-1.098-1.098 0-.605.492-1.097 1.098-1.097zm4.742 3.537c-3.493 0-6.325 2.383-6.325 5.322 0 2.94 2.832 5.322 6.325 5.322.723 0 1.42-.101 2.07-.291.1-.03.212-.021.299.042l1.738.977c.206.117.398-.07.323-.289l-.507-1.33a.45.45 0 01.112-.58C21.216 17.194 22 15.74 22 14.153c0-2.94-2.882-5.322-6.38-5.322zm-2.011 2.583c.459 0 .832.373.832.832 0 .46-.373.833-.832.833-.46 0-.833-.373-.833-.833 0-.459.373-.832.833-.832zm4.023 0c.459 0 .832.373.832.832 0 .46-.373.833-.832.833-.46 0-.833-.373-.833-.833 0-.459.373-.832.833-.832z" />
    </svg>
  );
}

export function XiaohongshuIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn("h-4 w-4", className)} aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="6" fill="currentColor" />
      <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff" fontFamily="system-ui">小</text>
    </svg>
  );
}
