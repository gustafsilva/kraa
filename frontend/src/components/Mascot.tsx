import { cn } from "@/lib/utils";
import wave from "@/assets/mascot/wave.webp";
import typing from "@/assets/mascot/typing.webp";
import success from "@/assets/mascot/success.webp";
import error from "@/assets/mascot/error.webp";
import empty from "@/assets/mascot/empty.webp";
import profile from "@/assets/mascot/profile.webp";

export type MascotPose = "wave" | "typing" | "success" | "error" | "empty" | "profile";

const sources: Record<MascotPose, string> = { wave, typing, success, error, empty, profile };

interface MascotProps {
  pose: MascotPose;
  /** Rendered size in px (square). Kept small: the modal is compact. */
  size?: number;
  className?: string;
}

/**
 * Kraa, the app's crow mascot. Purely decorative (empty alt, hidden from
 * assistive tech): every state it decorates already has its own text.
 */
export function Mascot({ pose, size = 48, className }: MascotProps) {
  return (
    <img
      src={sources[pose]}
      alt=""
      aria-hidden="true"
      draggable={false}
      width={size}
      height={size}
      data-slot="mascot"
      data-pose={pose}
      className={cn(
        "pointer-events-none shrink-0 select-none object-contain mascot-in",
        pose === "typing" && "mascot-bob",
        className,
      )}
    />
  );
}
