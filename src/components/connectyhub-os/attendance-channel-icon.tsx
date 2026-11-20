import type { AttendanceChannelIcon } from "@/lib/ui/panel-navigation";

const svg = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  className: "size-4 shrink-0",
};

function WhatsApp({ official }: { official?: boolean }) {
  return (
    <svg {...svg} style={{ color: "#25D366" }}>
      <path d="M3 21l1.65-3.8A9 9 0 1 1 7.6 20.1L3 21z" />
      <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
      {official ? (
        <g stroke="none">
          <circle cx="19" cy="19" r="5" fill="#1877F2" />
          <path d="M16.8 19.1l1.5 1.5 2.9-3" stroke="#fff" strokeWidth={1.6} fill="none" />
        </g>
      ) : null}
    </svg>
  );
}

function Instagram() {
  return (
    <svg {...svg} style={{ color: "#E1306C" }}>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <path d="M17.5 6.5h.01" />
    </svg>
  );
}

function Messenger() {
  return (
    <svg {...svg} style={{ color: "#0084FF" }}>
      <path d="M12 3C7 3 3 6.7 3 11.3c0 2.5 1.2 4.7 3.1 6.2V21l2.9-1.6c.95.27 1.95.4 3 .4 5 0 9-3.7 9-8.5S17 3 12 3z" />
      <path d="M7.5 13.5l3-3.2 2.5 2 3.5-3.6" />
    </svg>
  );
}

/** Brand marks for the Atendimento channel tabs; decorative, the tab text names the channel. */
export function AttendanceChannelIconMark({ icon }: { icon?: AttendanceChannelIcon }) {
  if (icon === "whatsapp") return <WhatsApp />;
  if (icon === "whatsapp-official") return <WhatsApp official />;
  if (icon === "meta-direct")
    return (
      <span className="inline-flex items-center gap-0.5" aria-hidden="true">
        <Instagram />
        <Messenger />
      </span>
    );
  return null;
}
