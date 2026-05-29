"use client";

import dynamic from "next/dynamic";
import {
  Component,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

const Spline = dynamic(() => import("@splinetool/react-spline"), {
  ssr: false,
  loading: () => null,
});

type SceneState = "checking" | "waiting" | "enabled" | "static";

type IdleWindow = Window &
  typeof globalThis & {
    requestIdleCallback?: (
      callback: () => void,
      options?: { timeout?: number },
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

type NavigatorWithHints = Navigator & {
  connection?: {
    effectiveType?: string;
    saveData?: boolean;
  };
  deviceMemory?: number;
};

interface SplineSceneProps {
  scene: string;
  className?: string;
}

export function SplineScene({ scene, className }: SplineSceneProps) {
  const [sceneState, setSceneState] = useState<SceneState>("waiting");
  const [blocked, setBlocked] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const handleWebglError = (event: ErrorEvent) => {
      if (
        event.message.includes("WebGL") ||
        event.message.includes("THREE.WebGLRenderer")
      ) {
        event.preventDefault();
        setBlocked(true);
      }
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = String(event.reason?.message || event.reason || "");
      if (reason.includes("WebGL") || reason.includes("THREE.WebGLRenderer")) {
        event.preventDefault();
        setBlocked(true);
      }
    };

    window.addEventListener("error", handleWebglError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleWebglError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  useEffect(() => {
    const win = window as IdleWindow;
    let finished = false;
    let idleId: number | undefined;
    let timeoutId: number | undefined;

    const enableScene = () => {
      if (finished) {
        return;
      }

      finished = true;
      setSceneState("enabled");
    };

    const prepareScene = () => {
      if (!canUseWebgl() || shouldUseStaticScene()) {
        finished = true;
        setSceneState("static");
        return;
      }

      timeoutId = window.setTimeout(enableScene, 2400);

      if (win.requestIdleCallback) {
        idleId = win.requestIdleCallback(enableScene, { timeout: 1800 });
      }
    };

    const frameId = window.requestAnimationFrame(prepareScene);

    return () => {
      finished = true;
      window.cancelAnimationFrame(frameId);

      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }

      if (idleId !== undefined && win.cancelIdleCallback) {
        win.cancelIdleCallback(idleId);
      }
    };
  }, []);

  if (blocked || sceneState === "static") {
    return <SplineFallback className={className} />;
  }

  const shouldLoadScene = sceneState === "enabled";

  return (
    <div className={cn("relative h-full w-full", className)}>
      <ReactiveGreenLight enabled={shouldLoadScene && loaded} />
      <RobotChestLabel active={loaded} />
      {!loaded && (
        <SplineFallback className="pointer-events-none absolute inset-0" loading />
      )}
      <SplineBoundary fallback={<SplineFallback className="absolute inset-0" />}>
        {shouldLoadScene && (
          <Spline
            scene={scene}
            className="relative z-10 h-full w-full"
            onLoad={() => setLoaded(true)}
          />
        )}
      </SplineBoundary>
    </div>
  );
}

function RobotChestLabel({ active }: { active: boolean }) {
  const labelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || !window.matchMedia("(min-width: 1024px) and (pointer: fine)").matches) {
      return;
    }

    let frame = 0;
    let nextX = window.innerWidth / 2;
    let nextY = window.innerHeight / 2;

    const updateLabel = () => {
      frame = 0;
      const label = labelRef.current;

      if (!label) {
        return;
      }

      const x = (nextX / window.innerWidth - 0.5) * 18;
      const y = (nextY / window.innerHeight - 0.5) * 10;
      const rotate = x * -0.18;

      label.style.setProperty("--label-x", `${x}px`);
      label.style.setProperty("--label-y", `${y}px`);
      label.style.setProperty("--label-rotate", `${rotate}deg`);
    };

    const handlePointerMove = (event: PointerEvent) => {
      nextX = event.clientX;
      nextY = event.clientY;

      if (!frame) {
        frame = window.requestAnimationFrame(updateLabel);
      }
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);

      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [active]);

  return (
    <div
      className={cn(
        "robot-chest-label display-type pointer-events-none absolute left-[49%] top-[48.5%] z-20 hidden select-none lg:block",
        active && "is-loaded",
      )}
      ref={labelRef}
    >
      Connecty<span className="robot-chest-accent">Hub</span>
    </div>
  );
}

function ReactiveGreenLight({ enabled }: { enabled: boolean }) {
  const lightRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      setMounted(true);
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [enabled]);

  useEffect(() => {
    if (
      !enabled ||
      !mounted ||
      !window.matchMedia("(min-width: 1024px) and (pointer: fine)").matches
    ) {
      return;
    }

    let frame = 0;
    let nextX = window.innerWidth * 0.58;
    let nextY = window.innerHeight * 0.45;

    const updateLight = () => {
      frame = 0;
      const light = lightRef.current;

      if (!light) {
        return;
      }

      light.style.setProperty("--light-x", `${nextX}px`);
      light.style.setProperty("--light-y", `${nextY}px`);
      light.style.setProperty("--light-opacity", "0.74");
    };

    const handlePointerMove = (event: PointerEvent) => {
      nextX = event.clientX;
      nextY = event.clientY;

      if (!frame) {
        frame = window.requestAnimationFrame(updateLight);
      }
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);

      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [enabled, mounted]);

  if (!enabled || !mounted || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="reactive-green-light pointer-events-none hidden lg:block"
      ref={lightRef}
      style={{
        "--light-x": "58%",
        "--light-y": "45%",
        "--light-opacity": "0.34",
      } as CSSProperties}
    />,
    document.body,
  );
}

function canUseWebgl() {
  if (typeof document === "undefined") {
    return false;
  }

  const canvas = document.createElement("canvas");
  return Boolean(
    canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl"),
  );
}

function shouldUseStaticScene() {
  const navigatorWithHints = navigator as NavigatorWithHints;
  const connection = navigatorWithHints.connection;
  const effectiveType = connection?.effectiveType;
  const lowMemory =
    typeof navigatorWithHints.deviceMemory === "number" &&
    navigatorWithHints.deviceMemory <= 4;

  return (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    !window.matchMedia("(min-width: 1024px) and (pointer: fine)").matches ||
    connection?.saveData === true ||
    effectiveType === "slow-2g" ||
    effectiveType === "2g" ||
    lowMemory
  );
}

class SplineBoundary extends Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function SplineFallback({
  className,
  loading,
}: {
  className?: string;
  loading?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex h-full w-full items-center justify-center overflow-hidden",
        className,
      )}
    >
      <div className="absolute h-[58%] w-[58%] rounded-full bg-[#0aff0a]/10 blur-3xl lg:h-[60%] lg:w-[60%]" />
      <div className="relative flex aspect-[3/4] h-[60%] max-h-[620px] min-h-[220px] flex-col items-center justify-center rounded-full border border-[#0aff0a]/25 bg-black/40 shadow-[0_0_80px_rgba(10,255,10,0.16)] sm:h-[70%] sm:min-h-[280px] lg:h-[78%] lg:min-h-[300px]">
        <div className="mb-4 rounded-full border border-[#00f3ff]/40 bg-[#00f3ff]/10 p-5 text-[#0aff0a] shadow-[0_0_30px_rgba(0,243,255,0.16)] sm:mb-5 sm:p-7">
          <Bot size={56} strokeWidth={1.25} className="sm:hidden" />
          <Bot size={86} strokeWidth={1.25} className="hidden sm:block" />
        </div>
        <div className="font-mono text-[10px] uppercase text-[#00f3ff] sm:text-xs">
          {loading ? "Carregando agente 3D" : "Agente IA online"}
        </div>
        <div className="mt-3 h-1 w-24 overflow-hidden rounded-full bg-white/10 sm:w-32">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-[#0aff0a]" />
        </div>
      </div>
    </div>
  );
}
