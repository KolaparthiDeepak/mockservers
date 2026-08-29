"use client";
import { useEffect, useState } from "react";

function probe(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  if (window.matchMedia?.("(max-width: 959px)").matches) return false;
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch {
    return false;
  }
}

export function useSupports3D(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const update = () => setOk(probe());
    update();
    const mq = window.matchMedia("(max-width: 959px)");
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return ok;
}
