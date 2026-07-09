"use client";

import Image from "next/image";
import { Copy, CreditCard, QrCode } from "lucide-react";
import { useState, type ReactNode } from "react";
import { MercadoPagoCardBrick } from "./mercado-pago-card-brick";
import { cn } from "@/lib/utils";

type CheckoutPaymentOptionsProps = {
  sessionId: string;
  amount: number;
  payerEmail: string | null;
  canUseCard: boolean;
  cardPublicKey: string | null;
  pixQrCode: string | null;
  pixQrCodeBase64: string | null;
  pixTicketUrl: string | null;
};

type PaymentMethod = "pix" | "card";

export function CheckoutPaymentOptions({
  sessionId,
  amount,
  payerEmail,
  canUseCard,
  cardPublicKey,
  pixQrCode,
  pixQrCodeBase64,
  pixTicketUrl,
}: CheckoutPaymentOptionsProps) {
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const showCard = canUseCard && Boolean(cardPublicKey);
  const activeMethod = method === "card" && showCard ? "card" : "pix";

  return (
    <div className="mt-6">
      {showCard ? (
        <div className="grid grid-cols-2 gap-2 rounded-[8px] border border-slate-700 bg-slate-900/70 p-1">
          <PaymentMethodButton
            active={activeMethod === "pix"}
            icon={<QrCode className="h-4 w-4" />}
            label="Pix"
            onClick={() => setMethod("pix")}
          />
          <PaymentMethodButton
            active={activeMethod === "card"}
            icon={<CreditCard className="h-4 w-4" />}
            label="Cartao"
            onClick={() => setMethod("card")}
          />
        </div>
      ) : null}

      {activeMethod === "card" && cardPublicKey ? (
        <MercadoPagoCardBrick
          publicKey={cardPublicKey}
          sessionId={sessionId}
          amount={amount}
          payerEmail={payerEmail}
        />
      ) : (
        <PixPaymentPanel
          pixQrCode={pixQrCode}
          pixQrCodeBase64={pixQrCodeBase64}
          pixTicketUrl={pixTicketUrl}
        />
      )}
    </div>
  );
}

function PaymentMethodButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-[7px] px-3 text-sm font-semibold transition",
        active
          ? "bg-cyan-300 text-slate-950"
          : "text-slate-300 hover:bg-slate-800 hover:text-white",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function PixPaymentPanel({
  pixQrCode,
  pixQrCodeBase64,
  pixTicketUrl,
}: {
  pixQrCode: string | null;
  pixQrCodeBase64: string | null;
  pixTicketUrl: string | null;
}) {
  const [copied, setCopied] = useState(false);

  async function copyPixCode() {
    if (!pixQrCode) return;

    try {
      await navigator.clipboard.writeText(pixQrCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-5">
      {pixQrCodeBase64 ? (
        <div className="flex justify-center rounded-[8px] border border-slate-700 bg-white p-4">
          <Image
            src={`data:image/png;base64,${pixQrCodeBase64}`}
            alt="QR Code Pix"
            width={220}
            height={220}
            unoptimized
            className="h-[220px] w-[220px]"
          />
        </div>
      ) : (
        <div className="rounded-[8px] border border-cyan-300/40 bg-cyan-400/12 p-4">
          <p className="font-semibold text-white">Pix sendo gerado</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">Aguarde alguns instantes ou solicite um novo link pelo WhatsApp.</p>
        </div>
      )}

      {pixQrCode ? (
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300" htmlFor="pix-code">
              Pix copia e cola
            </label>
            <button
              type="button"
              onClick={copyPixCode}
              className="inline-flex min-h-9 items-center gap-2 rounded-[8px] border border-cyan-300/35 px-3 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/10"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? "Copiado" : "Copiar codigo"}
            </button>
          </div>
          <textarea
            id="pix-code"
            readOnly
            value={pixQrCode}
            className="mt-2 h-32 w-full resize-none rounded-[8px] border border-slate-700 bg-slate-900 p-3 text-xs leading-5 text-cyan-50 outline-none"
          />
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Depois de pagar, volte para a conversa no WhatsApp. O pedido sera atualizado automaticamente.
          </p>
        </div>
      ) : null}

      {pixTicketUrl ? (
        <a
          href={pixTicketUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-[8px] bg-cyan-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
        >
          Abrir pagamento no Mercado Pago
        </a>
      ) : null}
    </div>
  );
}
