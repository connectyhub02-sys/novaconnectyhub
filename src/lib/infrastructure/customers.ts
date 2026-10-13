export type InfrastructureCustomer = { id: string; name: string; owner: string; email: string };
export type CustomerMembership = {
  user_id: string;
  organizations: { id: string; name: string; owner_id: string | null; status: string; plan_code: string } | null;
};

// Memberships arrive in creation order, as in the client account and Admin > Clientes.
// Choose the titular's primary account, never merge unrelated customers by name.
export function primaryCustomerAccounts(memberships: CustomerMembership[]) {
  const accounts = new Map<string, NonNullable<CustomerMembership["organizations"]>>();
  for (const row of memberships) {
    const org = row.organizations;
    if (!org || org.owner_id !== row.user_id || org.status === "archived" || org.plan_code === "internal") continue;
    if (!accounts.has(row.user_id)) accounts.set(row.user_id, org);
  }
  return [...accounts.values()];
}

export function filterInfrastructureCustomers(customers: InfrastructureCustomer[], query: string) {
  const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  return customers.filter(c => {
    const text = normalize(`${c.name} ${c.owner} ${c.email}`);
    return terms.every(term => text.includes(term));
  });
}
