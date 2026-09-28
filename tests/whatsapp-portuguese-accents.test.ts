import { describe, expect, it } from "vitest";
import { normalizeOutboundLanguageText, normalizeOutboundSpeechText, restorePortugueseAccents } from "../src/lib/whatsapp/outbound-language";

describe("Portuguese accent correction", () => {
  it("fixes the campaign audio scripts that were read wrong by the voice", () => {
    const script = "Fala turma tudo bem. Para quem procura um anabolico de rapida acao e focado em forca explosiva o Propionato e perfeito. Ele conta com selo de qualidade com certificacao GMP. Se voce busca seguranca eficacia e potencia, nao perca.";
    expect(restorePortugueseAccents(script)).toBe("Fala turma tudo bem. Para quem procura um anabólico de rápida ação e focado em força explosiva o Propionato e perfeito. Ele conta com selo de qualidade com certificação GMP. Se você busca segurança eficácia e potência, não perca.");
  });

  it("covers the common endings: -ção, -ções, -ão, -ões, -ência, -ância, -ável, -ível", () => {
    expect(restorePortugueseAccents("A definicao das opcoes com padroes e botoes, a importancia da experiencia: e possivel, disponivel e responsavel. Entao o cartao, voce."))
      .toBe("A definição das opções com padrões e botões, a importância da experiência: e possível, disponível e responsável. Então o cartão, você.");
  });

  it("keeps capitalization and all caps", () => {
    expect(restorePortugueseAccents("ACAO RAPIDA com Promocao e Voce")).toBe("AÇÃO RÁPIDA com Promoção e Você");
  });

  it("leaves Spanish, English, links and already accented text alone", () => {
    const spanish = "Hola, gracias por tu mensaje. La referencia de la opción es rapida y la informacion está aquí.";
    expect(restorePortugueseAccents(spanish)).toBe(spanish);
    const english = "The heroes ate breakfast and the shoes are so nice.";
    expect(restorePortugueseAccents(english)).toBe(english);
    expect(restorePortugueseAccents("Veja com calma: https://loja.test/acao?opcao=nao")).toBe("Veja com calma: https://loja.test/acao?opcao=nao");
    expect(restorePortugueseAccents("Você já viu a promoção? Não perca!")).toBe("Você já viu a promoção? Não perca!");
  });

  it("is part of every outbound text and of the text sent to the voice", () => {
    expect(normalizeOutboundLanguageText("Voce ja conhece a nossa acao de hoje?")).toBe("Você já conhece a nossa ação de hoje?");
    expect(normalizeOutboundSpeechText("A definicao sai por R$ 50,00, voce vai gostar.")).toContain("A definição sai por cinquenta reais, você vai gostar.");
  });
});
