'use client';
import { useMemo, useState } from 'react';
import type { Registro, RegistroPi, MateriaPrima } from '@/db/schema';
import type { Catalogos } from '@/app/page';
import { hoyISO, sumarMeses, formatoLote, formatoLotePI, fechaAR } from '@/lib/utils';
import { MESES_VENCIMIENTO } from '@/lib/config';
import {
  extrusionCapa, pesadasPI, limpiarNombreTinta, fmtG, fmtMl, fmtPct,
} from '@/lib/engine';

// =====================================================================
// 📊 NECESIDADES DE PRODUCCIÓN
// Lee TODOS los registros en proceso (Pendientes + En producción) y suma,
// tinta por tinta, cuánta tinta hace falta para cubrirlos. Es 100% en
// vivo: cuando un paciente pasa a Terminados, sus gramos desaparecen de
// acá solos. El botón "Hacer" crea el registro de Producto Intermedio ya
// precargado (cantidad, jeringas, pesadas teóricas, lote siguiente).
// Abajo: estadística mensual de PI producido (gramos, jeringas, lotes).
// =====================================================================

const VOLUMEN_JERINGA_ML = 10;

type DetalleNecesidad = {
  registroId: number;
  paciente: string;
  formula: string;
  lote: string;
  enProduccion: boolean;
  ml: number;
  gramos: number;
};

type GrupoNecesidad = {
  key: string;
  tintaId: number | null;
  tintaNombre: string; // nombre interno de la tinta (con concentración)
  nombreLimpio: string; // solo el activo
  concentracion: number; // concentración del LOTE a producir (puede ser dilución)
  esDilucion: boolean; // concentración distinta a la del catálogo
  ip: number;
  poe: string;
  ml: number;
  gramos: number;
  jeringas: number;
  detalles: DetalleNecesidad[];
};

type Incompleto = { paciente: string; formula: string; motivo: string };

const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function nombreMes(key: string): string {
  const [y, m] = key.split('-').map(Number);
  if (!m) return key;
  return `${MESES_ES[m - 1]} ${y}`;
}

export default function Necesidades({
  registros,
  registrosPi,
  catalogos,
  onCambio,
  onIrPI,
}: {
  registros: Registro[]; // SOLO en proceso (Pendientes + En producción)
  registrosPi: RegistroPi[]; // TODOS (para la estadística mensual)
  catalogos: Catalogos;
  onCambio: () => void;
  onIrPI: () => void;
}) {
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});
  const [creando, setCreando] = useState<string | null>(null);

  // ---------------- Necesidades en vivo ----------------
  const { grupos, incompletos } = useMemo(() => {
    const mapa = new Map<string, GrupoNecesidad>();
    const incompletos: Incompleto[] = [];

    for (const r of registros) {
      const caps = r.capsulasTotales;
      if (!caps || caps <= 0) {
        if ((r.capas ?? []).length > 0)
          incompletos.push({ paciente: r.paciente, formula: r.tituloFormula, motivo: 'sin cápsulas totales' });
        continue;
      }
      for (const c of r.capas ?? []) {
        if (!c.tinta && c.tintaId == null) continue; // capa sin tinta elegida
        const ext = extrusionCapa(c.dosisMg, c.concentracion, c.ip, r.capsulasPorToma);
        if (!ext || !c.ip || !c.concentracion) {
          incompletos.push({
            paciente: r.paciente, formula: r.tituloFormula,
            motivo: `capa "${c.tinta || c.activoReceta}" sin dosis/concentración/IP`,
          });
          continue;
        }
        const ml = ext * caps;
        const gramos = ml * c.ip; // masa de tinta (g) = volumen (mL) × IP
        const key = `${c.tintaId ?? `manual:${c.tinta}`}|${c.concentracion.toFixed(6)}`;
        let g = mapa.get(key);
        if (!g) {
          const t = c.tintaId != null ? catalogos.tintas.find((x) => x.id === c.tintaId) : undefined;
          g = {
            key,
            tintaId: c.tintaId,
            tintaNombre: c.tinta || (t?.nombre ?? ''),
            nombreLimpio: limpiarNombreTinta(c.tinta || t?.nombre || c.activoReceta),
            concentracion: c.concentracion,
            esDilucion: t ? Math.abs(t.concentracion - c.concentracion) > 1e-9 : false,
            ip: c.ip,
            poe: c.poe || t?.poe || '',
            ml: 0, gramos: 0, jeringas: 0, detalles: [],
          };
          mapa.set(key, g);
        }
        g.ml += ml;
        g.gramos += gramos;
        g.detalles.push({
          registroId: r.id, paciente: r.paciente, formula: r.tituloFormula,
          lote: formatoLote(r.lotePrefijo, r.loteNumero),
          enProduccion: r.enProduccion, ml, gramos,
        });
      }
    }
    const grupos = Array.from(mapa.values())
      .map((g) => ({ ...g, jeringas: Math.ceil(g.ml / VOLUMEN_JERINGA_ML) }))
      .sort((a, b) => b.gramos - a.gramos);
    return { grupos, incompletos };
  }, [registros, catalogos.tintas]);

  // ---------------- Crear el PI precargado ----------------
  async function hacer(g: GrupoNecesidad) {
    setCreando(g.key);
    try {
      const t = g.tintaId != null ? catalogos.tintas.find((x) => x.id === g.tintaId) : undefined;
      const poe = t?.poe || g.poe;
      const nl = await fetch(`/api/next-lote-pi?poe=${encodeURIComponent(poe)}`).then((x) => x.json());
      const cantidad = Math.ceil(g.gramos); // redondeo a g enteros — editable después
      const jeringas = Math.ceil(cantidad / g.ip / VOLUMEN_JERINGA_ML);
      const teoricas = pesadasPI(g.nombreLimpio, g.concentracion, cantidad, t?.excipientes ?? [], catalogos.tintas);
      const materiasPrimas: MateriaPrima[] = teoricas.map((p, i) => ({
        ref: i + 1,
        nombre: p.nombre,
        pureza: p.esPI ? 'N.A.' : '-',
        lote: '',
        esPI: p.esPI,
        cantidadTeorica: Math.round(p.gramos * 100) / 100,
        pesadaReal: '',
      }));
      const fechaElab = hoyISO();
      const res = await fetch('/api/registros-pi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estado: 'en_proceso',
          tintaId: g.tintaId,
          tintaNombre: g.tintaNombre,
          nombreProducto: `TINTA DE ${g.nombreLimpio.toUpperCase()}`,
          poe,
          loteNumero: nl.proximo,
          concentracion: g.concentracion,
          cantidadProductoG: cantidad,
          jeringas,
          volumenJeringaMl: VOLUMEN_JERINGA_ML,
          materiasPrimas,
          fechaElab,
          fechaVto: sumarMeses(fechaElab, MESES_VENCIMIENTO),
          fechaHoraInicio: '',
          fechaHoraFin: '',
        }),
      });
      if (!res.ok) throw new Error();
      onCambio();
      onIrPI();
    } catch {
      alert('No se pudo crear el registro de PI. Revisá la conexión.');
    } finally {
      setCreando(null);
    }
  }

  // ---------------- Estadística mensual de PI ----------------
  const meses = useMemo(() => {
    const set = new Set<string>();
    for (const r of registrosPi) {
      const f = r.fechaElab || (r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : '');
      if (f) set.add(f.slice(0, 7));
    }
    set.add(hoyISO().slice(0, 7));
    return Array.from(set).sort().reverse();
  }, [registrosPi]);

  const [mes, setMes] = useState(() => hoyISO().slice(0, 7));

  const statsMes = useMemo(() => {
    const mapa = new Map<string, { nombre: string; gramos: number; jeringas: number; lotes: number; enProceso: number }>();
    for (const r of registrosPi) {
      const f = r.fechaElab || (r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : '');
      if (!f || f.slice(0, 7) !== mes) continue;
      const nombre = limpiarNombreTinta(r.tintaNombre || r.nombreProducto) || 'SIN NOMBRE';
      const key = nombre.toUpperCase();
      const s = mapa.get(key) ?? { nombre, gramos: 0, jeringas: 0, lotes: 0, enProceso: 0 };
      s.gramos += r.cantidadProductoG ?? 0;
      s.jeringas += r.jeringas ?? 0;
      s.lotes += 1;
      if (r.estado === 'en_proceso') s.enProceso += 1;
      mapa.set(key, s);
    }
    return Array.from(mapa.values()).sort((a, b) => b.gramos - a.gramos);
  }, [registrosPi, mes]);

  return (
    <div className="space-y-6">
      {/* ================= Necesidades en vivo ================= */}
      <div>
        <h2 className="section-title">📊 Necesidad de tinta para cubrir Pendientes + En producción</h2>
        <p className="mb-3 text-sm text-slate-500">
          Se calcula en vivo con los pacientes pendientes y en producción; cuando un lote pasa a
          Terminados, sus gramos dejan de contar solos. La cantidad se precarga redondeada a gramos
          enteros y <b>todo queda editable</b> en el registro de PI.
        </p>

        {incompletos.length > 0 && (
          <div className="alerta-quimica mb-3 text-xs">
            ⚠ {incompletos.length} capa{incompletos.length === 1 ? '' : 's'} no suma{incompletos.length === 1 ? '' : 'n'} al
            cálculo por datos incompletos:{' '}
            {incompletos.slice(0, 4).map((x) => `${x.paciente || 'SIN NOMBRE'} (${x.motivo})`).join(' · ')}
            {incompletos.length > 4 && ` · +${incompletos.length - 4} más`}
          </div>
        )}

        {grupos.length === 0 ? (
          <div className="card p-8 text-center text-slate-500">
            No hay necesidades pendientes: no hay registros en Pendientes ni En producción con capas calculadas.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {grupos.map((g) => {
              const abierto = expandido[g.key] ?? false;
              return (
                <div key={g.key} className="card overflow-hidden border-l-4 border-l-indigo-600">
                  <div className="flex flex-wrap items-start justify-between gap-2 bg-indigo-50/60 px-4 py-3">
                    <div>
                      <p className="text-xl font-black uppercase leading-none">{g.nombreLimpio}</p>
                      <p className="mt-1 text-sm font-medium text-slate-600">
                        {g.tintaNombre && g.tintaNombre !== g.nombreLimpio ? `${g.tintaNombre} · ` : ''}
                        al <b>{fmtPct(g.concentracion)}</b>
                        {g.esDilucion && <span className="badge ml-2 bg-violet-100 text-violet-700">⚗ dilución</span>}
                        {g.poe && <span className="ml-2 font-mono text-xs">{g.poe}</span>}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black leading-none text-indigo-700">{fmtG(g.gramos)}</p>
                      <p className="text-xs text-slate-500">{fmtMl(g.ml, 1)} · ~{g.jeringas} jeringa{g.jeringas === 1 ? '' : 's'}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <button className="text-sm font-semibold text-indigo-700 hover:underline"
                      onClick={() => setExpandido((e) => ({ ...e, [g.key]: !abierto }))}>
                      {abierto ? '▾' : '▸'} {g.detalles.length} paciente{g.detalles.length === 1 ? '' : 's'}
                    </button>
                    <button className="btn-primary" disabled={creando === g.key}
                      title="Crea el registro de Producto Intermedio con cantidad, jeringas y pesadas teóricas precargadas"
                      onClick={() => hacer(g)}>
                      {creando === g.key ? '… creando' : `🧪 Hacer ${Math.ceil(g.gramos)} g →`}
                    </button>
                  </div>
                  {abierto && (
                    <table className="w-full border-t border-slate-100 text-xs">
                      <thead>
                        <tr className="text-left uppercase text-slate-400">
                          <th className="px-4 py-1">Paciente</th><th>Lote</th><th>Estado</th>
                          <th className="pr-4 text-right">Tinta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.detalles.map((d, i) => (
                          <tr key={i} className="border-t border-slate-50">
                            <td className="px-4 py-1 font-semibold">{d.paciente || 'SIN NOMBRE'} · {d.formula}</td>
                            <td className="font-mono">{d.lote}</td>
                            <td>{d.enProduccion ? '🖨️ en producción' : '📋 pendiente'}</td>
                            <td className="pr-4 text-right">{fmtG(d.gramos)} · {fmtMl(d.ml, 1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ================= Estadística mensual de PI ================= */}
      <div>
        <h2 className="section-title">📅 Producto intermedio producido por mes</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          {meses.map((m) => (
            <button key={m} onClick={() => setMes(m)}
              className={`rounded-full border px-3 py-1 text-sm font-semibold capitalize transition-colors ${
                mes === m ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}>
              {nombreMes(m)}
            </button>
          ))}
        </div>
        {statsMes.length === 0 ? (
          <div className="card p-8 text-center text-slate-500">
            No se registró producción de PI en {nombreMes(mes)}.
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <th className="px-4 py-2">Producto intermedio</th>
                  <th className="text-right">Gramos</th>
                  <th className="text-right">Jeringas</th>
                  <th className="px-4 text-right">Lotes</th>
                </tr>
              </thead>
              <tbody>
                {statsMes.map((s, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-bold uppercase">{s.nombre}</td>
                    <td className="text-right font-semibold">{fmtG(s.gramos)}</td>
                    <td className="text-right">{s.jeringas}</td>
                    <td className="px-4 text-right">
                      {s.lotes}
                      {s.enProceso > 0 && <span className="ml-1 text-xs text-amber-600">({s.enProceso} en proceso)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
              Cuenta todos los lotes de PI con fecha de elaboración en {nombreMes(mes)}, terminados y en proceso.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
