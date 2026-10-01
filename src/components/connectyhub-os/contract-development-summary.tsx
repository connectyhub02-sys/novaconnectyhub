import { developmentScopeFields, type ContractDevelopmentScope } from "@/lib/billing/contract-development";

export function ContractDevelopmentSummary({ scope, title = "Desenvolvimento contratado" }: {
  scope: ContractDevelopmentScope | null | undefined;
  title?: string;
}) {
  if (!scope) return null;
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 text-slate-900">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-slate-500">Objetivos, entregas previstas e serviços incluídos no projeto.</p>
      <dl className="mt-4 space-y-4 text-sm">
        {developmentScopeFields.filter(field => scope[field.key]).map(field => (
          <div key={field.key} className="min-w-0">
            <dt className="font-semibold text-slate-700">{field.label}</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words leading-6">{scope[field.key]}</dd>
          </div>
        ))}
        {(scope.additional_fields ?? []).map((field, index) => (
          <div key={index} className="min-w-0">
            <dt className="break-words font-semibold text-slate-700">{field.label}</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words leading-6">{field.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
