export function formatBrazilPhoneInput(value: string | null | undefined) {
  const digits = limitBrazilPhoneDigits(value);
  const hasCountryCode = digits.startsWith("55");
  const local = hasCountryCode ? digits.slice(2) : digits;
  const prefix = hasCountryCode ? "+55 " : "";

  if (!local) {
    return hasCountryCode ? "+55" : "";
  }

  if (local.length <= 2) {
    return `${prefix}(${local}`;
  }

  if (local.length <= 6) {
    return `${prefix}(${local.slice(0, 2)}) ${local.slice(2)}`;
  }

  if (local.length <= 10) {
    return `${prefix}(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }

  return `${prefix}(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7, 11)}`;
}

export function normalizeBrazilPhoneForApi(value: string | null | undefined) {
  const digits = limitBrazilPhoneDigits(value);
  const local = digits.startsWith("55") ? digits.slice(2) : digits;

  if (!isValidBrazilLocalPhone(local)) {
    return null;
  }

  return digits.startsWith("55") ? digits : `55${digits}`;
}

export function isValidBrazilPhoneInput(value: string | null | undefined) {
  return Boolean(normalizeBrazilPhoneForApi(value));
}

export function formatCpfInput(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 11);

  if (digits.length <= 3) {
    return digits;
  }

  if (digits.length <= 6) {
    return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  }

  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }

  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function limitBrazilPhoneDigits(value: string | null | undefined) {
  let digits = String(value ?? "").replace(/\D/g, "");

  if (digits.length > 11 && digits.startsWith("55")) {
    return digits.slice(0, 13);
  }

  if (digits.length > 11 && digits.startsWith("0")) {
    digits = digits.replace(/^0+/, "");
  }

  return digits.slice(0, 11);
}

function isValidBrazilLocalPhone(local: string) {
  if (!(local.length === 10 || local.length === 11)) {
    return false;
  }

  const ddd = Number(local.slice(0, 2));

  if (!Number.isInteger(ddd) || ddd < 11 || ddd > 99) {
    return false;
  }

  if (/^(\d)\1+$/.test(local)) {
    return false;
  }

  if (local.length === 11 && local[2] !== "9") {
    return false;
  }

  return true;
}
