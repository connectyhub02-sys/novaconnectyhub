"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getVisitorId, isTrackingDisabled } from "@/lib/tracking/client";

type TrackPayload = {
  event_type: string;
  metadata?: Record<string, unknown>;
};

export function ConnectyTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const trackedPageKey = useRef<string | null>(null);
  const scrollMilestones = useRef(new Set<number>());
  const search = useMemo(() => searchParams?.toString() ?? "", [searchParams]);

  useEffect(() => {
    if (isTrackingDisabled()) {
      return;
    }

    const pageKey = `${pathname ?? "/"}?${search}`;

    if (trackedPageKey.current === pageKey) {
      return;
    }

    trackedPageKey.current = pageKey;
    scrollMilestones.current = new Set();

    void trackEvent({
      event_type: isDashboardPath(pathname) ? "dashboard_page_view" : "public_page_view",
      metadata: getPageMetadata(),
    });
  }, [pathname, search]);

  useEffect(() => {
    if (isTrackingDisabled()) {
      return;
    }

    let timeout: ReturnType<typeof setTimeout> | null = null;

    function handleScroll() {
      if (timeout) {
        clearTimeout(timeout);
      }

      timeout = setTimeout(() => {
        const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;

        if (scrollHeight <= 0) {
          return;
        }

        const percent = Math.round((window.scrollY / scrollHeight) * 100);

        for (const milestone of [25, 50, 75, 90]) {
          if (percent >= milestone && !scrollMilestones.current.has(milestone)) {
            scrollMilestones.current.add(milestone);
            void trackEvent({
              event_type: "scroll_depth",
              metadata: {
                ...getPageMetadata(),
                percentage: milestone,
              },
            });
          }
        }
      }, 500);
    }

    window.addEventListener("scroll", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);

      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, []);

  useEffect(() => {
    if (isTrackingDisabled()) {
      return;
    }

    void capturePermissionSignals();
  }, []);

  return null;
}

async function trackEvent(payload: TrackPayload) {
  if (isTrackingDisabled()) {
    return;
  }

  try {
    await fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        visitor_cookie_id: getVisitorId(),
        event_type: payload.event_type,
        referrer: document.referrer,
        search_params: window.location.search,
        metadata: payload.metadata ?? getPageMetadata(),
      }),
    });
  } catch {
    // Tracking cannot block product flows.
  }
}

async function capturePermissionSignals() {
  if (typeof window === "undefined") {
    return;
  }

  const notificationPermission = typeof Notification !== "undefined" ? Notification.permission : "unsupported";

  await trackEvent({
    event_type: "push_permission_status",
    metadata: {
      ...getPageMetadata(),
      permission: notificationPermission,
    },
  });

  if (!("permissions" in navigator)) {
    return;
  }

  try {
    const permission = await navigator.permissions.query({ name: "geolocation" as PermissionName });

    await trackEvent({
      event_type: "gps_permission_status",
      metadata: {
        ...getPageMetadata(),
        permission: permission.state,
      },
    });

    if (permission.state === "granted" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          void trackEvent({
            event_type: "gps_location_granted",
            metadata: {
              ...getPageMetadata(),
              gps_permission: { status: "granted" },
              precise_location: {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                altitude: position.coords.altitude,
                heading: position.coords.heading,
                speed: position.coords.speed,
                captured_at: new Date().toISOString(),
              },
            },
          });
        },
        (error) => {
          void trackEvent({
            event_type: "gps_location_failed",
            metadata: {
              ...getPageMetadata(),
              gps_permission: {
                status: "unavailable",
                code: error.code,
                message: error.message,
              },
            },
          });
        },
        {
          enableHighAccuracy: false,
          timeout: 5000,
          maximumAge: 10 * 60 * 1000,
        },
      );
    }
  } catch {
    await trackEvent({
      event_type: "gps_permission_status",
      metadata: {
        ...getPageMetadata(),
        permission: "unsupported",
      },
    });
  }
}

function getPageMetadata() {
  return {
    page_path: window.location.pathname,
    page_url: window.location.href,
    page_title: document.title,
  };
}

function isDashboardPath(pathname: string | null) {
  return Boolean(pathname?.startsWith("/dashboard") || pathname?.startsWith("/admin"));
}
