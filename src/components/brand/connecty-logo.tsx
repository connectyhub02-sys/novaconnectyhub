import type { ComponentProps } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

type ConnectyLogoTone = "blue" | "white";
type ConnectyLogoType = "full" | "mark";

const logoSource: Record<ConnectyLogoType, Record<ConnectyLogoTone, string>> = {
  full: {
    blue: "/brand/connectyhub-logo-blue.png",
    white: "/brand/connectyhub-logo-white.png",
  },
  mark: {
    blue: "/brand/connectyhub-mark-blue.png",
    white: "/brand/connectyhub-mark-white.png",
  },
};

const logoSize: Record<ConnectyLogoType, { width: number; height: number }> = {
  full: { width: 1280, height: 165 },
  mark: { width: 100, height: 100 },
};

export function ConnectyLogo({
  tone = "blue",
  type = "full",
  className,
  imageClassName,
  alt = "ConnectyHub",
  loading = "eager",
}: {
  tone?: ConnectyLogoTone;
  type?: ConnectyLogoType;
  className?: string;
  imageClassName?: string;
  alt?: string;
  loading?: ComponentProps<"img">["loading"];
}) {
  const size = logoSize[type];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center",
        type === "mark" ? "aspect-square" : "aspect-[1280/165]",
        className,
      )}
    >
      <Image
        alt={alt}
        className={cn("block h-full w-full object-contain", imageClassName)}
        draggable={false}
        height={size.height}
        loading={loading}
        src={logoSource[type][tone]}
        width={size.width}
      />
    </span>
  );
}
