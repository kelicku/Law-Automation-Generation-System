"use client";
import { MotionConfig } from "motion/react";

/** Honours the OS "reduce motion" setting for every Motion animation. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
