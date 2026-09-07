import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { commercialDb } from "./helpers/commercial-db";
let db: PGlite;
beforeAll(async () => {
  db = await commercialDb();
}, 45000);
afterAll(async () => {
  await db?.close();
});
async function fixture() {
  const user = randomUUID(),
    org = randomUUID(),
    sub = randomUUID(),
    inv = randomUUID(),
    pay = randomUUID(),
    campaign = randomUUID();
  await db.query("insert into auth.users(id) values($1)", [user]);
  await db.query(
    "insert into organizations(id,owner_id,plan_code,status) values($1,$2,'pro','active')",
    [org, user],
  );
  const plan = (
    await db.query<{ id: string }>(
      "insert into billing_plans(plan_code,name,monthly_price_brl,included_credits) values($1,'Pro',100,1000) returning id",
      [randomUUID()],
    )
  ).rows[0].id;
  await db.query(
    "insert into organization_subscriptions(id,organization_id,plan_id,plan_code,status,current_period_end,metadata) values($1,$2,$3,'pro','active',now()+interval '1 month',$4)",
    [
      sub,
      org,
      plan,
      JSON.stringify({
        commercial_terms: {
          billing_cycle: "recurring",
          billing_interval: "month",
          price_brl: 100,
          included_credits: 1000,
        },
      }),
    ],
  );
  await db.query(
    "insert into billing_invoices(id,organization_id,subscription_id,status,subtotal_brl,discount_brl,total_brl) values($1,$2,$3,'open',100,0,100)",
    [inv, org, sub],
  );
  await db.query(
    "insert into billing_invoice_items(invoice_id,organization_id,item_type,total_brl,unit_price_brl) values($1,$2,'plan',100,100)",
    [inv, org],
  );
  await db.query(
    "insert into billing_payments(id,organization_id,subscription_id,invoice_id,status,amount_brl,payload) values($1,$2,$3,$4,'pending',100,$5)",
    [
      pay,
      org,
      sub,
      inv,
      JSON.stringify({
        checkout_kind: "renewal",
        target_plan_code: "pro",
        commercial_terms: {
          billing_cycle: "recurring",
          billing_interval: "month",
          price_brl: 100,
        },
      }),
    ],
  );
  const cfg = {
    name: "Campanha",
    description: "",
    status: "active",
    startsAt: "2020-01-01",
    endsAt: "2099-01-01",
    targetIds: ["pro"],
    originIds: [],
    audience: "all",
    buyerIds: [],
    operations: ["renewal"],
    options: [
      { id: "month", interval: "month", price: 100, permanentDiscount: 0 },
    ],
    stages: [{ cycles: 3, kind: "percent", value: 90 }],
    maxUses: 1,
    message: "",
  };
  await db.query(
    "insert into commercial_campaigns(id,owner_type,configuration) values($1,'platform',$2)",
    [campaign, JSON.stringify(cfg)],
  );
  return { user, org, sub, inv, pay, campaign, cfg };
}
async function adopt(f: Awaited<ReturnType<typeof fixture>>) {
  return (
    await db.query<{ id: string }>(
      "select reserve_commercial_agreement($1,1,$2,$3,$4,null,'pro','month',$5,null,'renewal',true,false,'pro') as id",
      [f.campaign, f.org, f.user, f.user, f.sub],
    )
  ).rows[0].id;
}
describe("commercial financial transactions", () => {
  it("reserves an existing account's offer and applies one invoice atomically", async () => {
    const f = await fixture(),
      id = await adopt(f);
    await db.query("select apply_platform_campaign_period($1,$2,0)", [
      id,
      f.pay,
    ]);
    expect(
      (
        await db.query(
          "select amount_brl::float8 as amount_brl from billing_payments where id=$1",
          [f.pay],
        )
      ).rows[0],
    ).toEqual({ amount_brl: 10 });
    expect(
      (
        await db.query(
          "select discount_brl::float8 as discount_brl,total_brl::float8 as total_brl from billing_invoices where id=$1",
          [f.inv],
        )
      ).rows[0],
    ).toEqual({ discount_brl: 90, total_brl: 10 });
    expect(await adopt(f)).toBe(id);
  });
  it("does not consume a promotional period on a refused attempt or duplicate webhook", async () => {
    const f = await fixture(),
      id = await adopt(f);
    await db.query("select apply_platform_campaign_period($1,$2,0)", [
      id,
      f.pay,
    ]);
    await db.query(
      "update billing_payments set status='rejected' where id=$1",
      [f.pay],
    );
    expect(
      (
        await db.query(
          "select paid_cycles from commercial_agreements where id=$1",
          [id],
        )
      ).rows[0],
    ).toEqual({ paid_cycles: 0 });
    await db.query(
      "update billing_payments set status='approved' where id=$1",
      [f.pay],
    );
    await db.query(
      "update billing_payments set status='approved' where id=$1",
      [f.pay],
    );
    expect(
      (
        await db.query(
          "select paid_cycles from commercial_agreements where id=$1",
          [id],
        )
      ).rows[0],
    ).toEqual({ paid_cycles: 1 });
  });
  it("preserves accepted stages when the campaign is paused or edited", async () => {
    const f = await fixture(),
      id = await adopt(f);
    await db.query(
      "update commercial_campaigns set configuration=$2 where id=$1",
      [f.campaign, JSON.stringify({ ...f.cfg, status: "paused", stages: [] })],
    );
    expect(
      (
        await db.query<{ price: { price_brl: number } }>(
          "select commercial_program_price(configuration,option_id,1) as price from commercial_agreements where id=$1",
          [id],
        )
      ).rows[0].price.price_brl,
    ).toBe(10);
    expect(
      (
        await db.query(
          "select count(*)::int as n from commercial_campaign_versions where campaign_id=$1",
          [f.campaign],
        )
      ).rows[0],
    ).toEqual({ n: 2 });
  });
  it("rejects cross-company financial targets and provider payments already in progress", async () => {
    const f = await fixture(),
      other = await fixture(),
      id = await adopt(f);
    await expect(
      db.query("select apply_platform_campaign_period($1,$2,0)", [
        id,
        other.pay,
      ]),
    ).rejects.toThrow("CAMPAIGN_PAYMENT_NOT_FOUND");
    await db.query(
      "update billing_payments set provider_payment_id='pay_live' where id=$1",
      [f.pay],
    );
    await expect(
      db.query("select apply_platform_campaign_period($1,$2,0)", [id, f.pay]),
    ).rejects.toThrow("CAMPAIGN_PAYMENT_BUSY");
  });
  it("ends the temporary benefit on the fourth invoice and preserves the regular renewal", async () => {
    const f = await fixture(),
      id = await adopt(f);
    expect(
      (
        await db.query<{ p: { price_brl: number } }>(
          "select commercial_program_price(configuration,option_id,3) as p from commercial_agreements where id=$1",
          [id],
        )
      ).rows[0].p.price_brl,
    ).toBe(100);
  });
  it("keeps financial campaign functions and card vault inaccessible to browsers", async () => {
    expect(
      (
        await db.query(
          "select has_table_privilege('authenticated','commercial_card_vault','select') as allowed",
        )
      ).rows[0],
    ).toEqual({ allowed: false });
    expect(
      (
        await db.query(
          "select has_function_privilege('anon','apply_platform_campaign_period(uuid,uuid,integer)','execute') as allowed",
        )
      ).rows[0],
    ).toEqual({ allowed: false });
  });
});

async function storeFixture(interval = "month") {
  const f = await fixture(),
    lead = randomUUID(),
    order = randomUUID(),
    item = randomUUID(),
    product = randomUUID(),
    campaign = randomUUID();
  await db.query(
    "insert into leads(id,organization_id,channel,phone_number) values($1,$2,'whatsapp',$3)",
    [lead, f.org, randomUUID()],
  );
  await db.query(
    "insert into sales_catalog_orders(id,organization_id,lead_id,status,payment_status,subtotal,total,discount_total,shipping_total,metadata) values($1,$2,$3,'pending_payment','pending','125','135','0','10','{}')",
    [order, f.org, lead],
  );
  await db.query(
    "insert into sales_catalog_order_items(id,order_id,organization_id,catalog_item_id,title,quantity,unit_price,total,metadata) values($1,$2,$3,$4,'Assinatura',1,'100','100',$5)",
    [
      item,
      order,
      f.org,
      product,
      JSON.stringify({
        billing_cycle: "recurring",
        billing_interval: interval,
      }),
    ],
  );
  await db.query(
    "insert into sales_catalog_order_items(order_id,organization_id,title,quantity,unit_price,total,metadata) values($1,$2,'Adicional avulso',1,'25','25','{\"billing_cycle\":\"one_time\",\"order_bump\":true}')",
    [order, f.org],
  );
  const cfg = {
    ...f.cfg,
    targetIds: [product],
    operations: ["initial", "renewal"],
    options: [{ id: interval, interval, price: 100, permanentDiscount: 0 }],
  };
  await db.query(
    "insert into commercial_campaigns(id,organization_id,owner_type,configuration) values($1,$2,'store',$3)",
    [campaign, f.org, JSON.stringify(cfg)],
  );
  const id = (
    await db.query<{ id: string }>(
      "select reserve_commercial_agreement($1,1,$2,$3,null,$4,$5,$6,null,$7,'initial',false,false,null) as id",
      [campaign, f.org, lead, lead, product, interval, order],
    )
  ).rows[0].id;
  await db.query("select apply_store_campaign_period($1,$2,0,$3)", [
    id,
    order,
    item,
  ]);
  return { ...f, lead, order, item, product, campaign, agreement: id };
}
describe("store subscription periods", () => {
  it("revises an unpaid renewal into a separate order without rebinding the previous financial period", async () => {
    const f = await storeFixture();
    await db.query(
      "update sales_catalog_orders set payment_status='confirmed' where id=$1",
      [f.order],
    );
    await db.query(
      "update commercial_agreements set period_end=now() where id=$1",
      [f.agreement],
    );
    const renewal = (
      await db.query<{ id: string }>(
        "select prepare_store_contract_period($1,now()) as id",
        [f.agreement],
      )
    ).rows[0].id;
    const campaign = randomUUID(),
      token = randomUUID();
    await db.query(
      "insert into commercial_campaigns(id,organization_id,owner_type,configuration) select $1,organization_id,owner_type,configuration from commercial_campaigns where id=$2",
      [campaign, f.campaign],
    );
    const replacement = (
      await db.query<{ id: string }>(
        "select reserve_commercial_agreement($1,1,$2,$3::text,null,$3::uuid,$4,'month',null,$5,'renewal',true,false,$4) as id",
        [campaign, f.org, f.lead, f.product, renewal],
      )
    ).rows[0].id;
    await db.query("select hold_store_campaign_revision($1,$2,$3)", [
      renewal,
      f.org,
      token,
    ]);
    const revised = (
      await db.query<{ id: string }>(
        "select revise_store_campaign_order($1,$2,$3) as id",
        [renewal, replacement, token],
      )
    ).rows[0].id;
    expect(revised).not.toBe(renewal);
    await db.query(
      "select prepare_store_agreement_replacement($1,$2,'renewal')",
      [replacement, f.agreement],
    );
    const item = (
      await db.query<{ id: string }>(
        "select id from sales_catalog_order_items where order_id=$1",
        [revised],
      )
    ).rows[0].id;
    await db.query("select apply_store_campaign_period($1,$2,0,$3)", [
      replacement,
      revised,
      item,
    ]);
    await db.query("select release_store_campaign_revision($1,$2)", [
      revised,
      token,
    ]);
    await db.query("select release_store_campaign_revision($1,$2)", [
      renewal,
      token,
    ]);
    expect(
      (
        await db.query(
          "select agreement_id,paid_at from commercial_agreement_periods where order_id=$1",
          [renewal],
        )
      ).rows[0],
    ).toEqual({ agreement_id: f.agreement, paid_at: null });
    await db.query(
      "update sales_catalog_orders set payment_status='confirmed' where id=$1",
      [revised],
    );
    expect(
      (
        await db.query(
          "select state,paid_cycles from commercial_agreements where id=$1",
          [f.agreement],
        )
      ).rows[0],
    ).toEqual({ state: "cancelled", paid_cycles: 1 });
    expect(
      (
        await db.query(
          "select paid_cycles from commercial_agreements where id=$1",
          [replacement],
        )
      ).rows[0],
    ).toEqual({ paid_cycles: 1 });
  });
  it("blocks a new Pix while the offer is revised and after cancellation, while allowing provider reconciliation", async () => {
    const f = await storeFixture(),
      session = randomUUID(),
      token = randomUUID();
    await db.query(
      "insert into sales_catalog_payment_sessions(id,order_id,organization_id,status,metadata) values($1,$2,$3,'created','{}')",
      [session, f.order, f.org],
    );
    await db.query("select hold_store_campaign_revision($1,$2,$3)", [
      f.order,
      f.org,
      token,
    ]);
    await expect(
      db.query(
        "update sales_catalog_payment_sessions set metadata='{" +
          '"gateway_request_inflight":true' +
          "}' where id=$1",
        [session],
      ),
    ).rejects.toThrow("CAMPAIGN_REVISION_PENDING");
    await db.query("select release_store_campaign_revision($1,$2)", [
      f.order,
      token,
    ]);
    await db.query("select cancel_store_commercial_agreement($1,$2)", [
      f.agreement,
      f.org,
    ]);
    await expect(
      db.query(
        "update sales_catalog_payment_sessions set metadata='{" +
          '"gateway_request_inflight":true' +
          "}' where id=$1",
        [session],
      ),
    ).rejects.toThrow("COMMERCE_SUBSCRIPTION_CANCELLED");
    await db.query(
      "update sales_catalog_orders set payment_status='confirmed' where id=$1",
      [f.order],
    );
    expect(
      (
        await db.query(
          "select paid_cycles,cancel_at_period_end from commercial_agreements where id=$1",
          [f.agreement],
        )
      ).rows[0],
    ).toEqual({ paid_cycles: 1, cancel_at_period_end: true });
  });
  it("reuses one product subscription and one renewal invoice when a platform customer buys it again", async () => {
    const f = await fixture(),
      product = randomUUID();
    await db.query(
      "insert into platform_products(id,name,billing_cycle,billing_interval) values($1,'Clube','recurring','month')",
      [product],
    );
    const terms = JSON.stringify({
      billing_cycle: "recurring",
      billing_interval: "month",
      price_brl: 100,
      included_credits: 0,
    });
    const first = (
      await db.query<{ id: string }>(
        "select create_product_purchase_intent($1,$2,$3,100,$4) as id",
        [f.org, f.user, product, terms],
      )
    ).rows[0].id;
    await db.query(
      "update organization_subscriptions set status='active',current_period_end=now()+interval '1 month' where id=$1",
      [first],
    );
    for (let n = 0; n < 2; n++)
      expect(
        (
          await db.query<{ id: string }>(
            "select create_product_purchase_intent($1,$2,$3,100,$4) as id",
            [f.org, f.user, product, terms],
          )
        ).rows[0].id,
      ).toBe(first);
    expect(
      (
        await db.query(
          "select count(*)::int as n from billing_payments where subscription_id=$1 and payload->>'checkout_kind'='renewal'",
          [first],
        )
      ).rows[0],
    ).toEqual({ n: 1 });
  });
  it("pauses the previous subscription during an upgrade and preserves its paid time only after approval", async () => {
    const f = await storeFixture();
    await db.query(
      "update sales_catalog_orders set payment_status='confirmed' where id=$1",
      [f.order],
    );
    const next = randomUUID();
    await db.query(
      "insert into commercial_agreements(id,organization_id,owner_type,buyer_key,lead_id,configuration,option_id,target_id,metadata) select $1,organization_id,owner_type,buyer_key,lead_id,configuration,option_id,target_id,metadata from commercial_agreements where id=$2",
      [next, f.agreement],
    );
    await db.query(
      "select prepare_store_agreement_replacement($1,$2,'upgrade')",
      [next, f.agreement],
    );
    expect(
      (
        await db.query("select store_agreement_change_pending($1) as pending", [
          f.agreement,
        ])
      ).rows[0],
    ).toEqual({ pending: true });
    expect(
      (
        await db.query(
          "select prepare_store_contract_period($1,now()+interval '1 month') as id",
          [f.agreement],
        )
      ).rows[0],
    ).toEqual({ id: null });
    await db.query(
      "update commercial_agreements set paid_cycles=1,consumed_at=now(),state='active',period_start=now(),period_end=now()+interval '1 month' where id=$1",
      [next],
    );
    expect(
      (
        await db.query(
          "select n.period_end>=n.period_start+interval '1 month'+(p.period_end-n.period_start)-interval '2 seconds' as preserved,p.cancel_at_period_end from commercial_agreements n join commercial_agreements p on p.id=$2 where n.id=$1",
          [next, f.agreement],
        )
      ).rows[0],
    ).toEqual({ preserved: true, cancel_at_period_end: true });
  });
  it("resumes the previous subscription if an unpaid replacement expires", async () => {
    const f = await storeFixture();
    await db.query(
      "update sales_catalog_orders set payment_status='confirmed' where id=$1",
      [f.order],
    );
    const next = randomUUID();
    await db.query(
      "insert into commercial_agreements(id,organization_id,owner_type,buyer_key,lead_id,configuration,option_id,target_id) select $1,organization_id,owner_type,buyer_key,lead_id,configuration,option_id,target_id from commercial_agreements where id=$2",
      [next, f.agreement],
    );
    await db.query(
      "select prepare_store_agreement_replacement($1,$2,'renewal')",
      [next, f.agreement],
    );
    await db.query(
      "update commercial_agreements set reservation_expires_at=now()-interval '1 second' where id=$1",
      [next],
    );
    expect(
      (
        await db.query(
          "select store_agreement_change_pending($1) as pending,cancel_at_period_end from commercial_agreements where id=$1",
          [f.agreement],
        )
      ).rows[0],
    ).toEqual({ pending: false, cancel_at_period_end: false });
  });
  it("archives a campaign announcement at scheduling and provider submission without claiming delivery", async () => {
    const f = await storeFixture(),
      pipeline = randomUUID();
    const meta = {
      commercial_campaign: {
        campaign_id: f.campaign,
        revision: 1,
        recipients: [{ id: f.lead, organizationId: f.org }],
      },
    };
    await db.query(
      "insert into content_pipeline_items(id,scope,organization_id,status,body,metadata) values($1,'organization',$2,'scheduled','Oferta de teste',$3)",
      [pipeline, f.org, JSON.stringify(meta)],
    );
    await db.query(
      "update content_pipeline_items set status='published' where id=$1",
      [pipeline],
    );
    await db.query(
      "update content_pipeline_items set status='published' where id=$1",
      [pipeline],
    );
    const events = await db.query<{
      event_type: string;
      payload: { notice: string };
    }>(
      "select event_type,payload from commercial_events where event_key like $1 order by event_type",
      [`announcement:${pipeline}:%`],
    );
    expect(events.rows.map((e) => e.event_type)).toEqual([
      "announcement_scheduled",
      "announcement_submitted",
    ]);
    expect(events.rows[1].payload.notice).toContain("encaminhada ao provedor");
    const other = await storeFixture();
    await expect(
      db.query(
        "insert into content_pipeline_items(scope,organization_id,status,body,metadata) values('organization',$1,'scheduled','Inválida',$2)",
        [other.org, JSON.stringify(meta)],
      ),
    ).rejects.toThrow("CAMPAIGN_ANNOUNCEMENT_SCOPE_INVALID");
  });
  it("voids a checkout only after a held provider retirement and preserves its original financial metadata", async () => {
    const f = await fixture();
    await expect(
      db.query("select void_commercial_invoice_revision($1,$2,'scale')", [
        f.pay,
        f.user,
      ]),
    ).rejects.toThrow("CAMPAIGN_PAYMENT_BUSY");
    await db.query("select hold_commercial_invoice_revision($1)", [f.pay]);
    await db.query("select void_commercial_invoice_revision($1,$2,'scale')", [
      f.pay,
      f.user,
    ]);
    expect(
      (
        await db.query(
          "select status,payload->>'target_plan_code' as original,payload->>'replaced_by_plan_code' as target from billing_payments where id=$1",
          [f.pay],
        )
      ).rows[0],
    ).toEqual({ status: "canceled", original: "pro", target: "scale" });
    expect(
      (
        await db.query("select status from billing_invoices where id=$1", [
          f.inv,
        ])
      ).rows[0],
    ).toEqual({ status: "void" });
  });
  it("discounts only the selected subscription, keeping freight and the avulso bump", async () => {
    const f = await storeFixture();
    expect(
      (
        await db.query(
          "select total::float8 as total,discount_total::float8 as discount from sales_catalog_orders where id=$1",
          [f.order],
        )
      ).rows[0],
    ).toEqual({ total: 45, discount: 90 });
  });
  it("bills three discounted periods and returns to regular price, without repeating avulsos", async () => {
    const f = await storeFixture();
    let order: string = f.order;
    for (let cycle = 0; cycle < 4; cycle++) {
      if (cycle > 0) {
        const due = (
          await db.query<{ period_end: string }>(
            "select period_end from commercial_agreements where id=$1",
            [f.agreement],
          )
        ).rows[0].period_end;
        const next = (
          await db.query<{ id: string }>(
            "select prepare_store_contract_period($1,$2::timestamptz-interval '2 days') as id",
            [f.agreement, due],
          )
        ).rows[0].id;
        expect(next).toBeTruthy();
        expect(
          (
            await db.query<{ id: string }>(
              "select prepare_store_contract_period($1,$2::timestamptz-interval '1 day') as id",
              [f.agreement, due],
            )
          ).rows[0].id,
        ).toBe(next);
        order = next;
        expect(
          (
            await db.query(
              "select count(*)::int as n from sales_catalog_order_items where order_id=$1",
              [order],
            )
          ).rows[0],
        ).toEqual({ n: 1 });
      }
      expect(
        (
          await db.query<{ total: number }>(
            "select total::float8 as total from sales_catalog_orders where id=$1",
            [order],
          )
        ).rows[0].total,
      ).toBe(cycle === 0 ? 45 : cycle < 3 ? 20 : 110);
      await db.query(
        "update sales_catalog_orders set payment_status='failed' where id=$1",
        [order],
      );
      expect(
        (
          await db.query<{ paid_cycles: number }>(
            "select paid_cycles from commercial_agreements where id=$1",
            [f.agreement],
          )
        ).rows[0].paid_cycles,
      ).toBe(cycle);
      await db.query(
        "update sales_catalog_orders set payment_status='confirmed' where id=$1",
        [order],
      );
      await db.query(
        "update sales_catalog_orders set payment_status='confirmed' where id=$1",
        [order],
      );
      expect(
        (
          await db.query<{ paid_cycles: number }>(
            "select paid_cycles from commercial_agreements where id=$1",
            [f.agreement],
          )
        ).rows[0].paid_cycles,
      ).toBe(cycle + 1);
    }
    expect(
      (
        await db.query(
          "select count(*)::int as n from commercial_events where agreement_id=$1 and event_type='campaign_benefit_completed'",
          [f.agreement],
        )
      ).rows[0],
    ).toEqual({ n: 1 });
  });
  it("grants six months for a prepaid semester and never emits an intervening monthly invoice", async () => {
    const f = await storeFixture("semester");
    await db.query(
      "update sales_catalog_orders set payment_status='confirmed' where id=$1",
      [f.order],
    );
    expect(
      (
        await db.query(
          "select period_end=period_start+interval '6 months' as correct from commercial_agreements where id=$1",
          [f.agreement],
        )
      ).rows[0],
    ).toEqual({ correct: true });
    expect(
      (
        await db.query(
          "select prepare_store_contract_period($1,now()+interval '1 month') as id",
          [f.agreement],
        )
      ).rows[0],
    ).toEqual({ id: null });
  });
  it("cancels future billing, preserves paid time, and rejects another store's order", async () => {
    const f = await storeFixture(),
      other = await storeFixture();
    await expect(
      db.query("select apply_store_campaign_period($1,$2,0,$3)", [
        f.agreement,
        other.order,
        other.item,
      ]),
    ).rejects.toThrow("CAMPAIGN_ORDER_NOT_FOUND");
    await db.query(
      "update sales_catalog_orders set payment_status='confirmed' where id=$1",
      [f.order],
    );
    const before = (
      await db.query<{ period_end: string }>(
        "select period_end from commercial_agreements where id=$1",
        [f.agreement],
      )
    ).rows[0].period_end;
    await db.query("select cancel_store_commercial_agreement($1,$2)", [
      f.agreement,
      f.org,
    ]);
    expect(
      (
        await db.query(
          "select prepare_store_contract_period($1,now()+interval '2 months') as id",
          [f.agreement],
        )
      ).rows[0],
    ).toEqual({ id: null });
    expect(
      (
        await db.query<{ period_end: string }>(
          "select period_end from commercial_agreements where id=$1",
          [f.agreement],
        )
      ).rows[0].period_end,
    ).toEqual(before);
  });
});

describe("invoice replacement and unattended renewal", () => {
  it("holds an issued invoice before replacement and creates the new promotional total atomically", async () => {
    const f = await fixture(),
      id = await adopt(f);
    await db.query(
      "update billing_payments set provider_payment_id='pay_old' where id=$1",
      [f.pay],
    );
    await db.query("select hold_commercial_invoice_revision($1)", [f.pay]);
    await expect(
      db.query("update billing_payments set status='in_process' where id=$1", [
        f.pay,
      ]),
    ).rejects.toThrow("CAMPAIGN_REVISION_PENDING");
    const newId = (
      await db.query<{ id: string }>(
        "select replace_commercial_invoice($1,$2) as id",
        [f.pay, id],
      )
    ).rows[0].id;
    expect(newId).not.toBe(f.pay);
    expect(
      (
        await db.query(
          "select status,amount_brl::float8 as amount from billing_payments where id=$1",
          [newId],
        )
      ).rows[0],
    ).toEqual({ status: "pending", amount: 10 });
    expect(
      (
        await db.query("select status from billing_payments where id=$1", [
          f.pay,
        ])
      ).rows[0],
    ).toEqual({ status: "canceled" });
    expect(
      (
        await db.query("select status from billing_invoices where id=$1", [
          f.inv,
        ])
      ).rows[0],
    ).toEqual({ status: "void" });
  });
  it("does not replace a payment that was confirmed during provider reconciliation", async () => {
    const f = await fixture(),
      id = await adopt(f);
    await db.query("select hold_commercial_invoice_revision($1)", [f.pay]);
    await db.query(
      "update billing_payments set status='approved' where id=$1",
      [f.pay],
    );
    await expect(
      db.query("select replace_commercial_invoice($1,$2)", [f.pay, id]),
    ).rejects.toThrow("CAMPAIGN_PAYMENT_BUSY");
  });
  it("uses the next stage on D−3 and retries only once per day without consuming periods", async () => {
    const f = await fixture();
    await db.query(
      "update commercial_campaigns set configuration=$2 where id=$1",
      [
        f.campaign,
        JSON.stringify({
          ...f.cfg,
          stages: [
            { cycles: 1, kind: "percent", value: 90 },
            { cycles: 1, kind: "percent", value: 50 },
          ],
        }),
      ],
    );
    const a = (
      await db.query<{ id: string }>(
        "select reserve_commercial_agreement($1,2,$2,$3,$4,null,'pro','month',$5,null,'renewal',true,false,'pro') as id",
        [f.campaign, f.org, f.user, f.user, f.sub],
      )
    ).rows[0].id;
    await db.query("select apply_platform_campaign_period($1,$2,0)", [
      a,
      f.pay,
    ]);
    await db.query(
      "update billing_payments set status='approved' where id=$1",
      [f.pay],
    );
    const prior = randomUUID(),
      vault = randomUUID();
    await db.query(
      "insert into billing_card_attempts(id,organization_id,subscription_id,invoice_id,payment_id,amount,recurring_amount,external_reference,state) values($1,$2,$3,$4,$5,10,50,$6,'approved')",
      [prior, f.org, f.sub, f.inv, f.pay, randomUUID()],
    );
    await db.query(
      "insert into billing_asaas_card_vault(id,organization_id,subscription_id,activation_attempt_id,customer_id,token_encrypted,consent_version,status) values($1,$2,$3,$4,'cus_test','encrypted-test','connectyhub-advance-3-2-1-v1','active')",
      [vault, f.org, f.sub, prior],
    );
    await db.query(
      "update organization_subscriptions set billing_provider='asaas',current_period_end='2029-02-07T15:00:00Z' where id=$1",
      [f.sub],
    );
    const next = (
      await db.query<{ p: { payment_id: string } }>(
        "select prepare_contract_renewal($1,'2029-02-07T15:00:00Z','2029-02-07T15:00:00Z','2029-03-07T15:00:00Z','asaas','{\"target_plan_code\":\"pro\"}') as p",
        [f.sub],
      )
    ).rows[0].p.payment_id;
    expect(
      (
        await db.query(
          "select amount_brl::float8 as amount from billing_payments where id=$1",
          [next],
        )
      ).rows[0],
    ).toEqual({ amount: 50 });
    const attempt = randomUUID();
    const claim = (
      await db.query<{
        c: { claimed: boolean; attempt: { recurring_amount: number } };
      }>(
        "select claim_managed_asaas_renewal($1,$2,$3,$4,'2029-02-07T15:00:00Z','2029-02-04T15:00:00Z') as c",
        [f.sub, next, attempt, vault],
      )
    ).rows[0].c;
    expect(claim.claimed).toBe(true);
    expect(Number(claim.attempt.recurring_amount)).toBe(100);
    await db.query(
      "update billing_card_attempts set state='rejected' where id=$1",
      [attempt],
    );
    await db.query(
      "update billing_payments set status='rejected' where id=$1",
      [next],
    );
    expect(
      (
        await db.query(
          "select claim_managed_asaas_renewal($1,$2,$3,$4,'2029-02-07T15:00:00Z','2029-02-04T16:00:00Z') as c",
          [f.sub, next, randomUUID(), vault],
        )
      ).rows[0],
    ).toEqual({ c: null });
    expect(
      (
        await db.query<{ c: { claimed: boolean } }>(
          "select claim_managed_asaas_renewal($1,$2,$3,$4,'2029-02-07T15:00:00Z','2029-02-05T15:00:00Z') as c",
          [f.sub, next, randomUUID(), vault],
        )
      ).rows[0].c.claimed,
    ).toBe(true);
    expect(
      (
        await db.query(
          "select paid_cycles from commercial_agreements where id=$1",
          [a],
        )
      ).rows[0],
    ).toEqual({ paid_cycles: 1 });
  });
  it("stops store debits after a refund without resetting the promotion", async () => {
    const f = await storeFixture();
    await db.query(
      "update sales_catalog_orders set payment_status='confirmed' where id=$1",
      [f.order],
    );
    await db.query(
      "update sales_catalog_orders set payment_status='refunded' where id=$1",
      [f.order],
    );
    expect(
      (
        await db.query(
          "select paid_cycles,cancel_at_period_end from commercial_agreements where id=$1",
          [f.agreement],
        )
      ).rows[0],
    ).toEqual({ paid_cycles: 1, cancel_at_period_end: true });
  });
});
