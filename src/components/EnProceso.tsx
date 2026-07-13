'use client';
import { useState } from 'react';
import type { Registro } from '@/db/schema';
import type { Catalogos } from '@/app/page';
import { colorDeGrupo } from '@/lib/colors';
import { formatoLote } from '@/lib/utils';
import RegistroEditor from './RegistroEditor';

// =====================================================================
// MODO FOCO: la lista muestra tarjetas compactas por paciente; al abrir
// una, ese paciente ocupa TODA la pantalla con marco y cabecera de su
// color (imposible cruzar datos). Chips arriba para saltar de paciente.
// =====================================================================

export default function EnProceso({
  registros,
  catalogos,
  onCambio,
}: {
  registros: Registro[];
  catalogos: Catalogos;
  onCambio: () => void;
}) {
  const [abiertoId, setAbiertoId] = useState<number | null>(null);

  if (registros.length === 0) {
    return (
      <div className="card p-10 text-center text-slate-500">
        No hay registros en proceso. Cargá una receta desde el <b>Lector de recetas</b>.
      </div>
    );
  }

  const abierto = registros.find((r) => r.id === abiertoId) ?? null;

  // ---------------- MODO FOCO: un paciente, pantalla entera ----------------
  if (abierto) {
    const color = colorDeGrupo(abierto.grupoPaciente || abierto.paciente);
    return (
      <div>
        {/* Selector rápido de pacientes en proceso */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button className="btn-ghost" onClick={() => setAbiertoId(null)}>← Todos</button>
          {registros.map((r) => {
            const c = colorDeGrupo(r.grupoPaciente || r.paciente);
            const activo = r.id === abierto.id;
            return (
              <button key={r.id} onClick={() => setAbiertoId(r.id)}
                className={`rounded-full border-2 px-3 py-1 text-sm font-bold uppercase transition-all ${
                  activo ? 'scale-105 shadow' : 'opacity-60 hover:opacity-100'
                }`}
                style={{ background: c.bg, borderColor: c.border }}>
                {r.paciente || 'SIN NOMBRE'} · {r.tituloFormula}
              </button>
            );
          })}
        </div>

        {/* Marco completo del color del paciente */}
        <div className="overflow-hidden rounded-2xl border-4 bg-white shadow-sm"
          style={{ borderColor: color.border }}>
          <div className="sticky top-0 z-10 px-5 py-3"
            style={{ background: color.bg, borderBottom: `4px solid ${color.border}` }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-3xl font-black uppercase leading-none tracking-tight">
                {abierto.paciente || 'SIN NOMBRE'}
              </p>
              <p className="text-sm font-semibold">
                Fórmula {abierto.tituloFormula || '—'}
                {abierto.indicacion && <> · {abierto.indicacion}</>} · Lote{' '}
                <b>{formatoLote(abierto.lotePrefijo, abierto.loteNumero)}</b>
              </p>
            </div>
          </div>
          <RegistroEditor
            key={abierto.id}
            registro={abierto}
            catalogos={catalogos}
            colorPaciente={color}
            onCambio={onCambio}
          />
        </div>
      </div>
    );
  }

  // ---------------- LISTA: tarjetas compactas ----------------
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {registros.map((r) => {
        const color = colorDeGrupo(r.grupoPaciente || r.paciente);
        return (
          <button key={r.id} className="card overflow-hidden text-left transition-transform hover:scale-[1.01]"
            style={{ borderColor: color.border, borderWidth: 2 }}
            onClick={() => setAbiertoId(r.id)}>
            <div className="px-4 py-3" style={{ background: color.bg, borderBottom: `4px solid ${color.border}` }}>
              <p className="text-2xl font-black uppercase leading-none tracking-tight">
                {r.paciente || 'SIN NOMBRE'}
              </p>
            </div>
            <div className="space-y-1 px-4 py-3 text-sm text-slate-600">
              <p>Fórmula <b>{r.tituloFormula || '—'}</b>{r.indicacion && <> · {r.indicacion}</>}</p>
              <p>Lote <b>{formatoLote(r.lotePrefijo, r.loteNumero)}</b></p>
              <p className="text-xs text-slate-400">
                {(r.formula ?? []).slice(0, 3).map((a) => a.activo).join(' · ')}
                {(r.formula ?? []).length > 3 && ` +${r.formula.length - 3}`}
              </p>
              <p className="pt-1 text-xs font-semibold text-teal-700">Abrir en pantalla completa →</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
