import { describe, expect, it } from "vitest";
import { quoteFoodComposition, validateFoodComposition, type FoodCompositionPolicy, type FoodUnitSelection } from "@/lib/sales-catalog/food-composition";
const policy = (): FoodCompositionPolicy => ({ enabled: true, pricing: "highest", localOnly: true,
  sizes: [{ id: "large", name: "Grande", active: true, portions: 4, maxFlavors: 2, price: "50" }],
  flavors: [{ id: "cheese", name: "Queijo", active: true, prices: { large: "60" }, incompatibleWith: [] }, { id: "chicken", name: "Frango", active: true, prices: { large: "80" }, incompatibleWith: [] }],
  groups: [{ id: "border", name: "Borda", min: 0, max: 1, scope: "unit", options: [{ id: "cream", name: "Borda recheada", active: true, price: "12", maxQuantity: 1 }] }, { id: "extra", name: "Adicional", min: 0, max: 2, scope: "portion", options: [{ id: "bacon", name: "Bacon", active: true, price: "10", maxQuantity: 2 }] }],
});
const half = (): FoodUnitSelection => ({ sizeId: "large", flavors: [{ flavorId: "cheese", portions: 2 }, { flavorId: "chicken", portions: 2 }], options: [], note: "" });
describe("food composition pricing and fulfillment snapshot", () => {
  it("uses highest or weighted whole-flavor prices only as configured", () => {
    expect(quoteFoodComposition(policy(), [half()], 1)?.totalCents).toBe(8000);
    expect(quoteFoodComposition({ ...policy(), pricing: "weighted" }, [half()], 1)?.totalCents).toBe(7000);
  });
  it("charges whole-unit border and fractional repeated extra, keeping notes free", () => {
    const unit = half(); unit.note = "Sem cebola; cortar em oito";
    unit.options = [{ groupId: "border", optionId: "cream", quantity: 1 }, { groupId: "extra", optionId: "bacon", quantity: 2, flavorId: "cheese" }];
    const result = quoteFoodComposition(policy(), [unit], 1)!;
    expect(result.totalCents).toBe(10200);
    expect(result.units[0].options.map(option => option.totalCents)).toEqual([1200, 1000]);
    expect(result.summary).toContain("2/4 Queijo + 2/4 Frango"); expect(result.summary).toContain("Bacon em Queijo"); expect(result.units[0].note).toBe(unit.note);
  });
  it("preserves two different units of the same product and reproduces the exact total", () => {
    const second = half(); second.flavors = [{ flavorId: "cheese", portions: 4 }]; second.note = "Sem orégano";
    const result = quoteFoodComposition(policy(), [half(), second], 2)!;
    expect(result.totalCents).toBe(14000); expect(result.units.map(unit => unit.totalCents)).toEqual([8000, 6000]);
    expect(quoteFoodComposition(policy(), result.units.map(unit => unit.selection), 2)).toEqual(result);
  });
  it("supports a configured fixed combo with mandatory choices and priced substitutions", () => {
    const data = policy(); data.pricing = "fixed"; data.flavors = []; data.groups = [{ id: "drink", name: "Bebida do combo", min: 1, max: 1, scope: "unit", options: [{ id: "water", name: "Água", active: true, price: "0", maxQuantity: 1 }, { id: "juice", name: "Suco", active: true, price: "5", maxQuantity: 1 }] }];
    const unit = { sizeId: "large", flavors: [], options: [{ groupId: "drink", optionId: "juice", quantity: 1 }], note: "" };
    expect(quoteFoodComposition(data, [unit], 1)?.totalCents).toBe(5500);
    expect(() => quoteFoodComposition(data, [{ ...unit, options: [] }], 1)).toThrow("Bebida do combo");
  });
  it.each([0, 1, 3, 5])("rejects incomplete or excessive total portions: %s", portions => {
    const unit = half(); unit.flavors = [{ flavorId: "cheese", portions }];
    expect(() => quoteFoodComposition(policy(), [unit], 1)).toThrow();
  });
  it("rejects unavailable flavor, incompatible flavors, duplicated flavor and guessed prices", () => {
    const data = policy(); data.flavors[1].active = false;
    expect(() => quoteFoodComposition(data, [half()], 1)).toThrow();
    data.flavors[1].active = true; data.flavors[0].incompatibleWith = ["chicken"];
    expect(() => quoteFoodComposition(data, [half()], 1)).toThrow("não podem");
    expect(() => quoteFoodComposition(policy(), [{ ...half(), flavors: [{ flavorId: "cheese", portions: 2 }, { flavorId: "cheese", portions: 2 }] }], 1)).toThrow();
    data.flavors[0].prices.large = "a combinar"; expect(validateFoodComposition(data)).toContain("preço");
  });
  it("rejects a unit extra placed on a fraction and a portion extra without a target", () => {
    for (const option of [{ groupId: "border", optionId: "cream", quantity: 1, flavorId: "cheese" }, { groupId: "extra", optionId: "bacon", quantity: 1 }]) expect(() => quoteFoodComposition(policy(), [{ ...half(), options: [option] }], 1)).toThrow("Informe onde");
  });
  it("does not collapse extra duplicates to bypass maximum quantities", () => {
    const option = { groupId: "extra", optionId: "bacon", quantity: 2, flavorId: "cheese" };
    expect(() => quoteFoodComposition(policy(), [{ ...half(), options: [option, option] }], 1)).toThrow("Agrupe");
  });
  it("requires a separate explicit composition for each unit and ignores client totals", () => {
    expect(() => quoteFoodComposition(policy(), [half()], 2)).toThrow("cada unidade");
    expect(quoteFoodComposition(policy(), [{ ...half(), totalCents: 1 }], 1)?.totalCents).toBe(8000);
  });
  it("does not invent a composition policy for legacy products", () => expect(quoteFoodComposition(undefined, [], 1)).toBeNull());
});
