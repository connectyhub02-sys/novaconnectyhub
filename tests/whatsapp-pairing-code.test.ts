import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractWhatsappPairCode } from "../src/lib/whatsapp/connection-diagnostics";

const consoleSource = readFileSync("src/components/connectyhub-os/whatsapp-console.tsx", "utf8");
const clientWorkspaceSource = readFileSync("src/lib/whatsapp/client-workspace.ts", "utf8");
const platformConsoleSource = readFileSync("src/lib/admin/platform-whatsapp-console.ts", "utf8");
const gatewaySource = readFileSync("src/lib/connectyhub-api/gateway.ts", "utf8");

describe("WhatsApp phone pairing code", () => {
  it("extracts common provider pairing code fields without confusing raw QR code", () => {
    expect(extractWhatsappPairCode({ pairingCode: "ABCD-EFGH" })).toBe("ABCDEFGH");
    expect(extractWhatsappPairCode({ data: { phone_pairing_code: "12ab 34cd" } })).toBe("12AB34CD");
    expect(extractWhatsappPairCode({ pair_code: "wxyz-7890" })).toBe("WXYZ7890");
    expect(extractWhatsappPairCode({ code: "2@raw-whatsapp-qr-code" })).toBeNull();
  });

  it("uses the shared pairing code extractor in every connection surface", () => {
    [clientWorkspaceSource, platformConsoleSource, gatewaySource].forEach((source) => {
      expect(source).toContain("extractWhatsappPairCode");
      expect(source).not.toContain('findString(result.data, ["paircode", "pairCode", "pair_code"])');
      expect(source).not.toContain('findString(connectResult.data, ["paircode", "pairCode", "pair_code"])');
    });

    [clientWorkspaceSource, platformConsoleSource].forEach((source) => {
      expect(source).toContain('const qrCodeForPanel = connectionMode === "phone" ? null : qrCode');
      expect(source).toContain("A Uazapi nao retornou codigo de pareamento para esse telefone.");
    });
  });

  it("explains that the code is entered in WhatsApp, not in ConnectyHub", () => {
    expect(consoleSource).toContain("Nao ha campo no ConnectyHub para inserir o codigo.");
    expect(consoleSource).toContain("Aparelhos conectados");
    expect(consoleSource).toContain("Conectar com numero de telefone");
    expect(consoleSource).toContain("formatConnectionFinalStatus(attempt.finalStatus, attempt.mode)");
    expect(consoleSource).toContain('const visibleQrCode = phoneModeSelected || status === "connected" || connectionAttemptFinished ? null : qrCode');
    expect(consoleSource).toContain("setQrCode((current) => pollingPhoneMode ? null : responseQrCode ?? current)");
    expect(consoleSource).toContain("setQrCode(data.state.instance?.status === \"connected\" || nextPairCode ? null : data.qrCode ?? null)");
    expect(consoleSource).toContain("setQrModalOpen(false)");
    expect(consoleSource).toContain('onConnectModeChange={(mode) =>');
  });
});
