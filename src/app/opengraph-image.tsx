import { ImageResponse } from "next/og";

export const alt = "ConnectyHub - agentes de IA, automacao e API WhatsApp";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#05070a",
          color: "white",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          padding: 64,
          width: "100%",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 940 }}>
          <div
            style={{
              alignItems: "center",
              color: "#00ff88",
              display: "flex",
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: 0,
            }}
          >
            ConnectyHub
          </div>
          <h1 style={{ fontSize: 76, lineHeight: 1.02, margin: 0 }}>
            Agentes de IA, catalogo e API para vender pelo WhatsApp
          </h1>
          <p style={{ color: "#cbd5e1", fontSize: 30, lineHeight: 1.35, margin: 0 }}>
            Plataforma brasileira para atendimento, automacoes, CRM, checkout e integracoes.
          </p>
        </div>
      </div>
    ),
    size,
  );
}
