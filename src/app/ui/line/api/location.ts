import { callApp, isInTownPass } from "@/lib/townpass-bridge";
import type { Coordinates } from "./types";

/**
 * 發問時要分享位置（approximate／exact）就必須附上座標（api-spec.md POST /questions）。
 * 在城市通 App 內用 bridge 的 location，一般瀏覽器用 Geolocation；拿不到就回傳 null。
 */
export async function getCurrentLocation(): Promise<Coordinates | null> {
  if (isInTownPass()) {
    const p = await callApp<{ latitude?: unknown; longitude?: unknown; accuracy?: unknown } | []>(
      "location",
      null,
      20000,
    ).catch(() => undefined);
    if (p && !Array.isArray(p) && typeof p.latitude === "number" && typeof p.longitude === "number") {
      return {
        lat: p.latitude,
        lng: p.longitude,
        accuracy_m: typeof p.accuracy === "number" ? p.accuracy : undefined,
      };
    }
    return null;
  }
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy,
        }),
      () => resolve(null),
      { timeout: 10000, maximumAge: 5 * 60 * 1000 },
    );
  });
}
