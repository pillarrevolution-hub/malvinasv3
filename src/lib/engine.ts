// ================================================================
// MOTOR DE CÁLCULO MALVINAS 2.0
// Portado y extendido desde MALVINAS (lib/calculations.ts)
//
// Reglas de oro (validadas con I+D):
// - Extrusión (mL) = (dosis por cápsula en mg ÷ concentración) ÷ 1000 ÷ IP
// - El IP SIEMPRE se mantiene, aunque se cambie la concentración
// - División automática: cápsulas por toma = ceil(volumen total ÷ 0.95)
// - Mínimo de extrusión de la impresora: 0.03 mL por capa
// - Capacidad: cuerpo 0.9 mL + tapa 0.1 mL (límite de trabajo 0.95 por expansión)
// - Dilución: apunta a llenar 0.8 mL; por debajo de 0.55 mL la cápsula
//   queda "demasiado vacía". NUNCA se sugiere concentrar.
// ================================================================

import type { CapaTinta, Tinta } from '@/db/schema';

export const CAPACIDAD_TRABAJO_ML = 0.95;
export const CAPACIDAD_CUERPO_ML = 0.9;
export const CAPACIDAD_TAPA_ML = 0.1;
export const EXTRUSION_MINIMA_ML = 0.03;
export const OBJETIVO_LLENADO_ML = 0.8;
export const MINIMO_ACEPTADO_ML = 0.55;

// ---------- Conversión de unidades a mg ----------
export function aMg(dosis: number, unidad: string): number | null {
  const u = unidad.toLowerCase().replace('μ', 'µ');
  if (u === 'mg') return dosis;
  if (u === 'µg' || u === 'ug' || u === 'mcg') return dosis / 1000;
  if (u === 'g') return dosis * 1000;
  return null; // UI, ml, % → requieren conversión manual según la tinta
}

// ---------- Cálculo por capa ----------
// dosisMg es POR TOMA; capsulasPorToma divide la dosis en N cápsulas iguales.
export function extrusionCapa(
  dosisMg: number | null,
  concentracion: number | null,
  ip: number | null,
  capsulasPorToma: number
): number | null {
  if (!dosisMg || !concentracion || !ip || dosisMg <= 0 || concentracion <= 0 || ip <= 0)
    return null;
  const dosisPorCapsula = dosisMg / (capsulasPorToma || 1);
  const masaTintaMg = dosisPorCapsula / concentracion;
  return masaTintaMg / 1000 / ip;
}

export type CapaCalculada = CapaTinta & {
  extrusion: number | null; // extrusión por cápsula (mL) con la división actual
  bajoMinimo: boolean; // extrusión < 0.03 mL
  concentracionMaxParaMinimo: number | null; // conc. máxima para llegar al mínimo de 0.03
};

export type ResultadoCapsula = {
  capas: CapaCalculada[];
  capsulasPorTomaAuto: number; // lo que calcula el sistema
  capsulasPorToma: number; // lo aplicado (auto u override)
  volumenTotal: number; // mL por cápsula con la división aplicada
  volumenCuerpo: number;
  volumenTapa: number;
  ocupacionPct: number; // % sobre 0.95
  seDivide: boolean; // capsulasPorToma > 1 → AVISO ROJO
  excedeCuerpo: boolean;
  excedeTapa: boolean;
  muyVacia: boolean; // volumenTotal < 0.55
  sugerenciaDilucion: SugerenciaDilucion | null;
};

export type SugerenciaDilucion = {
  capaRef: number;
  tinta: string;
  concentracionActual: number;
  concentracionSugerida: number; // para llegar a OBJETIVO_LLENADO_ML total
  volumenResultante: number;
};

function volumenTotalConDivision(capas: CapaTinta[], n: number): number {
  let total = 0;
  for (const c of capas) {
    const v = extrusionCapa(c.dosisMg, c.concentracion, c.ip, n);
    if (v) total += v;
  }
  return total;
}

// ---------- Cálculo completo de la cápsula ----------
export function calcularCapsula(
  capas: CapaTinta[],
  override: { manual: boolean; capsulasPorToma: number }
): ResultadoCapsula {
  // 1. División automática: con N=1, ¿cuánto ocupa? → ceil(vol / 0.95)
  const volumenBase = volumenTotalConDivision(capas, 1);
  const capsulasPorTomaAuto = Math.max(1, Math.ceil(volumenBase / CAPACIDAD_TRABAJO_ML) || 1);
  const capsulasPorToma = override.manual ? override.capsulasPorToma : capsulasPorTomaAuto;

  // 2. Calcular cada capa con la división aplicada
  const capasCalc: CapaCalculada[] = capas.map((c) => {
    const extrusion = extrusionCapa(c.dosisMg, c.concentracion, c.ip, capsulasPorToma);
    const bajoMinimo = extrusion !== null && extrusion < EXTRUSION_MINIMA_ML;
    // Concentración máxima que llevaría esta capa al mínimo imprimible:
    // 0.03 = (dosis/N ÷ C) ÷ 1000 ÷ IP  →  C = dosis/N ÷ (0.03 × 1000 × IP)
    let concentracionMaxParaMinimo: number | null = null;
    if (bajoMinimo && c.dosisMg && c.ip) {
      concentracionMaxParaMinimo =
        c.dosisMg / capsulasPorToma / (EXTRUSION_MINIMA_ML * 1000 * c.ip);
    }
    return { ...c, extrusion, bajoMinimo, concentracionMaxParaMinimo };
  });

  // 3. Volúmenes por ubicación
  const volumenTotal = capasCalc.reduce((s, c) => s + (c.extrusion ?? 0), 0);
  const volumenTapa = capasCalc
    .filter((c) => c.ubicacion === 'tapa')
    .reduce((s, c) => s + (c.extrusion ?? 0), 0);
  const volumenCuerpo = volumenTotal - volumenTapa;

  // 4. Sugerencia de dilución para llenar la cápsula (solo diluir, nunca concentrar)
  //    Se aplica sobre la capa de MAYOR volumen (la "principal").
  let sugerenciaDilucion: SugerenciaDilucion | null = null;
  const muyVacia = volumenTotal > 0 && volumenTotal < MINIMO_ACEPTADO_ML;
  if (volumenTotal > 0 && volumenTotal < OBJETIVO_LLENADO_ML) {
    const candidatas = capasCalc.filter(
      (c) => c.extrusion && c.dosisMg && c.ip && c.concentracion
    );
    if (candidatas.length > 0) {
      const mayor = candidatas.reduce((a, b) => (a.extrusion! >= b.extrusion! ? a : b));
      const volumenObjetivoCapa = mayor.extrusion! + (OBJETIVO_LLENADO_ML - volumenTotal);
      // C' = dosisPorCápsula ÷ (V_objetivo × 1000 × IP)
      const nueva =
        mayor.dosisMg! / capsulasPorToma / (volumenObjetivoCapa * 1000 * mayor.ip!);
      if (nueva < mayor.concentracion!) {
        sugerenciaDilucion = {
          capaRef: mayor.ref,
          tinta: mayor.tinta,
          concentracionActual: mayor.concentracion!,
          concentracionSugerida: nueva,
          volumenResultante: volumenObjetivoCapa,
        };
      }
    }
  }

  return {
    capas: capasCalc,
    capsulasPorTomaAuto,
    capsulasPorToma,
    volumenTotal,
    volumenCuerpo,
    volumenTapa,
    ocupacionPct: Math.min((volumenTotal / CAPACIDAD_TRABAJO_ML) * 100, 100),
    seDivide: capsulasPorToma > 1,
    excedeCuerpo: volumenCuerpo > CAPACIDAD_CUERPO_ML + 1e-9,
    excedeTapa: volumenTapa > CAPACIDAD_TAPA_ML + 1e-9,
    muyVacia,
    sugerenciaDilucion,
  };
}

// ---------- Mapeo receta → tinta ----------
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type OpcionTinta = {
  tinta: Tinta;
  extrusion: number | null; // con dosisMg dada, cápsulas por toma = 1
  imprimible: boolean; // extrusión >= 0.03
};

// Devuelve las tintas que matchean un activo de la receta, ordenadas:
// primero las imprimibles de menor volumen (criterio: la que menos ocupa),
// después las que quedan bajo el mínimo.
export function tintasParaActivo(
  activoReceta: string,
  dosisMg: number | null,
  catalogo: Tinta[]
): OpcionTinta[] {
  const objetivo = normalizar(activoReceta);
  if (!objetivo) return [];

  const matches = catalogo.filter((t) => {
    if (!t.activo) return false;
    const kws = (t.keywords ?? '')
      .split(',')
      .map((k) => normalizar(k))
      .filter(Boolean);
    const nombreNorm = normalizar(t.nombre);
    return (
      kws.some((k) => objetivo.includes(k) || k.includes(objetivo)) ||
      objetivo.includes(nombreNorm) ||
      nombreNorm.includes(objetivo)
    );
  });

  const opciones: OpcionTinta[] = matches.map((t) => {
    const extrusion = extrusionCapa(dosisMg, t.concentracion, t.ip, 1);
    return { tinta: t, extrusion, imprimible: extrusion !== null && extrusion >= EXTRUSION_MINIMA_ML };
  });

  return opciones.sort((a, b) => {
    if (a.imprimible !== b.imprimible) return a.imprimible ? -1 : 1;
    return (a.extrusion ?? Infinity) - (b.extrusion ?? Infinity);
  });
}

// Crear una capa a partir de una tinta del catálogo
export function capaDesdeTinta(
  ref: number,
  activoReceta: string,
  dosisMg: number | null,
  unidadOriginal: string,
  t: Tinta | null
): CapaTinta {
  return {
    ref,
    activoReceta,
    dosisMg,
    unidadOriginal,
    tintaId: t?.id ?? null,
    tinta: t?.nombre ?? '',
    concentracion: t?.concentracion ?? null,
    ip: t?.ip ?? null,
    ubicacion: t?.ubicacion ?? 'cuerpo',
    lote: '',
    poe: t?.poe ?? '',
    alerta: t?.alerta ?? '',
    aManopla: t?.aManopla ?? false,
    extrusionMl: null,
  };
}

// ---------- Producto intermedio: pesadas teóricas ----------
export type PesadaTeorica = {
  nombre: string;
  esPI: boolean;
  gramos: number;
};

// Dada una tinta, su concentración (editable) y la cantidad total a producir,
// desglosa el activo y los excipientes por sus fracciones exactas.
export function pesadasPI(
  activoNombre: string,
  concentracion: number,
  cantidadTotalG: number,
  excipientes: { nombre: string; fraccion: number }[],
  catalogoTintas: Tinta[]
): PesadaTeorica[] {
  const activoG = cantidadTotalG * concentracion;
  const excipienteTotalG = cantidadTotalG - activoG;
  const nombresTintas = catalogoTintas.map((t) => normalizar(t.nombre));
  const rows: PesadaTeorica[] = [
    { nombre: activoNombre, esPI: false, gramos: activoG },
  ];
  for (const e of excipientes) {
    const esPI = nombresTintas.some(
      (n) => n.includes(normalizar(e.nombre)) || normalizar(e.nombre).includes(n)
    );
    rows.push({ nombre: e.nombre, esPI, gramos: excipienteTotalG * e.fraccion });
  }
  return rows;
}

// ---------- Formato ----------
export function fmtMl(v: number | null | undefined, dec = 3): string {
  if (v == null || isNaN(v)) return '—';
  return `${v.toFixed(dec)} mL`;
}
export function fmtPct(c: number | null | undefined, dec = 2): string {
  if (c == null || isNaN(c)) return '—';
  const p = c * 100;
  return `${Number(p.toFixed(dec))}%`;
}
export function fmtG(v: number | null | undefined, dec = 2): string {
  if (v == null || isNaN(v)) return '—';
  return `${v.toFixed(dec)} g`;
}
