export default function formatCurrency(value, currency = 'INR', maximumFractionDigits = 2) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits,
  }).format(Number(value) || 0);
}
