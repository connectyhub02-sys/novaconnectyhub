/** Marcas coloridas das redes para identificação visual; decorativas, o texto ao lado nomeia a rede. */
export type SocialBrand = "instagram" | "facebook" | "whatsapp" | "youtube" | "tiktok" | "google";

export function SocialBrandMark({ brand, size = 28 }: { brand: SocialBrand; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 32 32", "aria-hidden": true as const, className: "shrink-0" };

  if (brand === "google") {
    return <svg {...common} viewBox="0 0 48 48">
      <path fill="#4285F4" d="M43.6 24.5c0-1.5-.1-2.9-.4-4.3H24v8.1h11a9.4 9.4 0 0 1-4.1 6.2v5.2h6.6c3.9-3.6 6.1-8.9 6.1-15.2z"/>
      <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5.2c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20.4 20.4 0 0 0 24 44z"/>
      <path fill="#FBBC05" d="M12.6 27.5a12 12 0 0 1 0-7V15H5.8a20 20 0 0 0 0 18l6.8-5.5z"/>
      <path fill="#EA4335" d="M24 12.1c3 0 5.6 1 7.7 3l5.8-5.8A19.5 19.5 0 0 0 24 4 20.4 20.4 0 0 0 5.8 15l6.8 5.5C14.2 15.7 18.7 12.1 24 12.1z"/>
    </svg>;
  }

  if (brand === "instagram") {
    return (
      <svg {...common}>
        <defs>
          <linearGradient id="ch-ig" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#FEDA75" />
            <stop offset="0.3" stopColor="#FA7E1E" />
            <stop offset="0.6" stopColor="#D62976" />
            <stop offset="1" stopColor="#4F5BD5" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8" fill="url(#ch-ig)" />
        <rect x="7.5" y="7.5" width="17" height="17" rx="5" fill="none" stroke="#fff" strokeWidth="2.2" />
        <circle cx="16" cy="16" r="4" fill="none" stroke="#fff" strokeWidth="2.2" />
        <circle cx="21.2" cy="10.8" r="1.3" fill="#fff" />
      </svg>
    );
  }

  if (brand === "facebook") {
    return (
      <svg {...common}>
        <circle cx="16" cy="16" r="16" fill="#1877F2" />
        <path
          fill="#fff"
          d="M17.6 26v-8.4h2.8l.45-3.3H17.6v-2.1c0-.95.27-1.6 1.63-1.6h1.74V7.65c-.3-.04-1.33-.13-2.53-.13-2.5 0-4.2 1.53-4.2 4.33v2.45h-2.83v3.3h2.83V26h3.36z"
        />
      </svg>
    );
  }

  if (brand === "whatsapp") {
    return (
      <svg {...common}>
        <circle cx="16" cy="16" r="16" fill="#25D366" />
        <path d="M8.5 24l1.2-3.6a8.2 8.2 0 1 1 2.9 2.6L8.5 24z" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinejoin="round" />
        <path
          fill="#fff"
          d="M13.1 11.6c.25-.02.5.1.62.33l.78 1.6c.1.22.06.48-.1.66l-.5.55c.6 1.2 1.55 2.15 2.75 2.75l.55-.5c.18-.16.44-.2.66-.1l1.6.78c.23.12.35.37.33.62-.1 1.12-1.04 1.7-2.03 1.6-3.12-.3-5.6-2.8-5.9-5.9-.1-.99.48-1.93 1.6-2.03z"
        />
      </svg>
    );
  }

  if (brand === "youtube") {
    return (
      <svg {...common}>
        <rect y="5" width="32" height="22" rx="6.5" fill="#FF0000" />
        <path d="M13 11.2v9.6l8.2-4.8z" fill="#fff" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <rect width="32" height="32" rx="8" fill="#000" />
      <g fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.4 7.6v11.6a3.6 3.6 0 1 1-3.6-3.6" stroke="#25F4EE" transform="translate(-0.9 -0.7)" />
        <path d="M17.4 7.6c.4 2.4 2 3.9 4.4 4.1" stroke="#25F4EE" transform="translate(-0.9 -0.7)" />
        <path d="M17.4 7.6v11.6a3.6 3.6 0 1 1-3.6-3.6" stroke="#FE2C55" transform="translate(0.9 0.7)" />
        <path d="M17.4 7.6c.4 2.4 2 3.9 4.4 4.1" stroke="#FE2C55" transform="translate(0.9 0.7)" />
        <path d="M17.4 7.6v11.6a3.6 3.6 0 1 1-3.6-3.6" stroke="#fff" />
        <path d="M17.4 7.6c.4 2.4 2 3.9 4.4 4.1" stroke="#fff" />
      </g>
    </svg>
  );
}
