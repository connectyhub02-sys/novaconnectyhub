import { expect, it } from "vitest";
import { panelColorGrid, panelColors } from "@/lib/ui/panel-theme";

function luminance(hex: string) {
  const channels = hex.match(/[a-f\d]{2}/gi)!.map(pair => parseInt(pair, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((a,b) => b-a);
  return (values[0] + .05) / (values[1] + .05);
}
it("keeps all documented foreground/background text pairs at AA contrast", () => {
  for (const pair of panelColorGrid) expect(contrast(pair.color, pair.foreground), pair.role).toBeGreaterThanOrEqual(4.5);
  expect(contrast(panelColors.primary, panelColors.surface)).toBeGreaterThanOrEqual(3);
});
