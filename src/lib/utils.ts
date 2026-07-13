import type { ActivoFormula } from '@/db/schema';
import { PREFIJO_LOTE_PI } from './config';

// ---- Fechas ----
export function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function sumarMeses(iso: string, meses: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1 + meses, d));
  return f.toISOString().slice(0, 10);
}

export function fechaAR(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// ---- Lotes ----
export function formatoLote(prefijo: string, numero: number | null): string {
  if (numero == null) return `${prefijo} / P—`;
  return `${prefijo} / P${String(numero).padStart(3, '0')}`;
}

export function formatoLotePI(poe: string, numero: number | null): string {
  const p = numero == null ? 'P—' : `P${String(numero).padStart(3, '0')}`;
  return `${PREFIJO_LOTE_PI}/${poe || 'FPI.—'}/${p}`;
}

// ---- Dosis por cápsula (para el rótulo y el documento) ----
export function dosisPorCapsula(a: ActivoFormula, capsulasPorToma: number): string {
  const v = a.dosis / (capsulasPorToma || 1);
  const redondeado = Math.round(v * 1000) / 1000;
  return `${redondeado} ${a.unidad}`;
}

// ---- Cálculo de cápsulas totales ----
// 60 días con 1 cápsula/toma = 60 cápsulas; con 2 por toma = 120.
export function capsulasSugeridas(dias: number | null, capsulasPorToma: number): number | null {
  if (!dias) return null;
  return dias * (capsulasPorToma || 1);
}
