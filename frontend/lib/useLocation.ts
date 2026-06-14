"use client";

import { useCallback, useEffect, useState } from "react";

export interface Coords {
  lat: number;
  lng: number;
}

export interface UseLocationResult {
  coords: Coords | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * useLocation — wraps navigator.geolocation.getCurrentPosition (high accuracy).
 * Runs on mount and exposes refetch(). Returns a human-readable error string
 * on permission denial / unavailability. SSR-safe.
 */
export function useLocation(): UseLocationResult {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const locate = useCallback(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setLoading(false);
      setError("Geolocation is not supported by this browser.");
      return;
    }

    setLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLoading(false);
        setError(null);
      },
      (err) => {
        let message: string;
        switch (err.code) {
          case err.PERMISSION_DENIED:
            message =
              "Location permission denied. Enable location access to see roads near you.";
            break;
          case err.POSITION_UNAVAILABLE:
            message = "Your location is currently unavailable. Please try again.";
            break;
          case err.TIMEOUT:
            message = "Timed out while fetching your location. Please retry.";
            break;
          default:
            message = "Unable to determine your location.";
        }
        setError(message);
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => {
    locate();
  }, [locate]);

  return { coords, loading, error, refetch: locate };
}
