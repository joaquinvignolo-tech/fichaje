import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/router'

export default function Admin() {
  const router = useRouter()
  const [autenticado, setAutenticado] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState(false)
  const [tab, setTab] = useState('hoy')
  const [empleados, setEmpleados] = useState([])
  const [fichajes, setFichajes] = useState([])
  const [fichajesMes, setFichajesMes] = useState([])
  const [fechaFiltro, setFechaFiltro] = useState(new Date().toISOString().slice(0,10))
  const [mesFiltro, setMesFiltro] = useState(new Date().toISOString().slice(0,7))
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoRol, setNuevoRol] = useState('')
  const [nuevoPin, setNuevoPin] = useState('')
  const [nuevoAdmin, setNuevoAdmin] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [fotoModal, setFotoModal] = useState(null)
  const [tarifas, setTarifas] = useState({})
  const [recargo, setRecargo] = useState(50)
  const [horasJornada, setHorasJornada] = useState(8)

  useEffect(() => {
    if (autenticado) cargarDatos()
  }, [autenticado, fechaFiltro])

  useEffect(() => {
    if (autenticado && tab === 'liquidacion') cargarFichajesMes()
  }, [autenticado, tab, mesFiltro])

  async function cargarDatos() {
    const { data: emps } = await supabase.from('empleados').select('*').eq('activo', true).order('nombre')
    const { data: fich } = await supabase
      .from('fichajes')
      .select('*, empleados(nombre, rol)')
      .gte('hora', fechaFiltro + 'T00:00:00')
      .lte('hora', fechaFiltro + 'T23:59:59')
      .order('hora', { ascending: false })
    setEmpleados(emps || [])
    setFichajes(fich || [])
  }

  async function cargarFichajesMes() {
    const inicio = mesFiltro + '-01T00:00:00'
    const fin = new Date(mesFiltro + '-01')
    fin.setMonth(fin.getMonth() + 1)
    const finStr = fin.toISOString().slice(0,10) + 'T23:59:59'
    const { data } = await supabase
      .from('fichajes')
      .select('*, empleados(nombre, rol)')
      .gte('hora', inicio)
      .lte('hora', finStr)
      .order('hora', { ascending: true })
    setFichajesMes(data || [])
  }

  function verificarPin() {
    supabase.from('empleados').select('*').eq('pin', pinInput).eq('es_admin', true).then(({ data }) => {
      if (data && data.length > 0) {
        setAutenticado(true)
        setPinError(false)
      } else {
        setPinError(true)
        setPinInput('')
        setTimeout(() => setPinError(false), 1500)
      }
    })
  }

  async function agregarEmpleado() {
    if (!nuevoNombre.trim() || !nuevoPin || nuevoPin.length !== 4) return
    setGuardando(true)
    await supabase.from('empleados').insert({
      nombre: nuevoNombre.trim(),
      rol: nuevoRol.trim() || 'Empleado',
      pin: nuevoPin,
      es_admin: nuevoAdmin
    })
    setNuevoNombre(''); setNuevoRol(''); setNuevoPin(''); setNuevoAdmin(false)
    await cargarDatos()
    setGuardando(false)
  }

  async function desactivarEmpleado(id) {
    if (!confirm('Dar de baja este empleado?')) return
    await supabase.from('empleados').update({ activo: false }).eq('id', id)
    await cargarDatos()
  }

  function horasTrabajadas(empId) {
    const logs = fichajes.filter(f => f.empleado_id === empId).sort((a,b) => new Date(a.hora)-new Date(b.hora))
    let total = 0
    for (let i = 0; i < logs.length - 1; i++) {
      if (logs[i].accion === 'entrada' && logs[i+1].accion === 'salida') {
        total += new Date(logs[i+1].hora) - new Date(logs[i].hora)
      }
    }
    if (total === 0) return null
    const h = Math.floor(total / 3600000)
    const m = Math.floor((total % 3600000) / 60000)
    return `${h}h ${m}m`
  }

  function calcularLiquidacion(empId) {
    const logs = fichajesMes.filter(f => f.empleado_id === empId).sort((a,b) => new Date(a.hora)-new Date(b.hora))
    const diasTrabajados = {}
    for (let i = 0; i < logs.length - 1; i++) {
      if (logs[i].accion === 'entrada' && logs[i+1].accion === 'salida') {
        const entrada = new Date(logs[i].hora)
        const salida = new Date(logs[i+1].hora)
        const dia = entrada.toISOString().slice(0,10)
        const horas = (salida - entrada) / 3600000
        diasTrabajados[dia] = (diasTrabajados[dia] || 0) + horas
      }
    }
    let horasNormales = 0
    let horasExtra = 0
    Object.values(diasTrabajados).forEach(h => {
      if (h <= horasJornada) {
        horasNormales += h
      } else {
        horasNormales += horasJornada
        horasExtra += h - horasJornada
      }
    })
    const tarifa = tarifas[empId] || 0
    const tarifaExtra = tarifa * (1 + recargo / 100)
    const totalNormal = horasNormales * tarifa
    const totalExtra = horasExtra * tarifaExtra
    const total = totalNormal + totalExtra
    return {
      diasTrabajados: Object.keys(diasTrabajados).length,
      horasNormales: Math.round(horasNormales * 10) / 10,
      horasExtra: Math.round(horasExtra * 10) / 10,
      totalNormal: Math.round(totalNormal),
      totalExtra: Math.round(totalExtra),
      total: Math.round(total)
    }
  }

  function exportarExcel() {
    const empleadosSinAdmin = empleados.filter(e => !e.es_admin)
    let csv = 'Empleado,Rol,Dias trabajados,Horas normales,Horas extra,Total normal,Total extra,TOTAL\n'
    empleadosSinAdmin.forEach(emp => {
      const liq = calcularLiquidacion(emp.id)
      const tarifa = tarifas[emp.id] || 0
      if (tarifa > 0 || liq.diasTrabajados > 0) {
        csv += `${emp.nombre},${emp.rol},${liq.diasTrabajados},${liq.horasNormales},${liq.horasExtra},$${liq.totalNormal},$${liq.totalExtra},$${liq.total}\n`
      }
    })
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `liquidacion-${mesFiltro}.csv`
    a.click()
  }

  function fmtHora(iso) {
    return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  function fmtPeso(n) {
    return '$' + n.toLocaleString('es-AR')
  }

  const presentes = empleados.filter(emp => {
    const logs = fichajes.filter(f => f.empleado_id === emp.id)
    return logs.length > 0 && logs[0].accion === 'entrada'
  }).length

  if (!autenticado) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: '36px 32px', width: 300, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔐</div>
          <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 4 }}>Panel Admin</div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>Ingresa tu PIN de administrador</div>
          <input type="password" maxLength={4} value={pinInput}
            onChange={e => setPinInput(e.target.value.replace(/\D/g,'').slice(0,4))}
            onKeyDown={e => e.key === 'Enter' && verificarPin()}
            placeholder="PIN"
            style={{ width: '100%', padding: '12px', textAlign: 'center', fontSize: 20, letterSpacing: 8, border: pinError ? '2px solid #dc2626' : '1px solid #e2e8f0', borderRadius: 10, marginBottom: 12, outline: 'none' }} />
          {pinError && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 8 }}>PIN incorrecto</div>}
          <button onClick={verificarPin} style={{ width: '100%', padding: '12px', background: '#1e293b', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 500, cursor: 'pointer' }}>Entrar</button>
          <button onClick={() => router.push('/')} style={{ marginTop: 12, background: 'none', border: 'none', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>Volver al fichaje</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {fotoModal && (
        <div onClick={() => setFotoModal(null)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ maxWidth: 400, width: '90%' }}>
            <img src={fotoModal.url} style={{ width: '100%', borderRadius: 12 }} alt="foto" />
            <div style={{ color: '#fff', textAlign: 'center', marginTop: 12, fontSize: 14 }}>{fotoModal.nombre} — {fotoModal.accion} a las {fotoModal.hora}</div>
            <div style={{ color: '#94a3b8', textAlign: 'center', marginTop: 4, fontSize: 12 }}>Toca para cerrar</div>
          </div>
        </div>
      )}

      <div style={{ background: '#1e293b', color: '#fff', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 600, fontSize: 17 }}>Panel de administracion</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>{presentes} presentes hoy</div>
          <button onClick={() => router.push('/')} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}>Fichaje</button>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px' }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid #e2e8f0', overflowX: 'auto' }}>
          {[['hoy','Registros'],['resumen','Resumen'],['liquidacion','Liquidacion'],['empleados','Empleados']].map(([key,label]) => (
            <button key={key} onClick={() => setTab(key)} style={{ padding: '10px 16px', border: 'none', background: 'none', fontSize: 14, fontWeight: tab===key?600:400, color: tab===key?'#1e293b':'#64748b', borderBottom: tab===key?'2px solid #1e293b':'2px solid transparent', marginBottom: -1, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {label}
            </button>
          ))}
        </div>

        {(tab === 'hoy' || tab === 'resumen') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <label style={{ fontSize: 13, color: '#64748b' }}>Fecha:</label>
            <input type="date" value={fechaFiltro} onChange={e => setFechaFiltro(e.target.value)}
              style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 13 }} />
            <button onClick={cargarDatos} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>Actualizar</button>
          </div>
        )}

        {tab === 'hoy' && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14 }}>
            {fichajes.length === 0 && <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Sin registros para esta fecha.</div>}
            {fichajes.map(f => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {f.foto_url ? (
                    <img src={f.foto_url} onClick={() => setFotoModal({ url: f.foto_url, nombre: f.empleados?.nombre, accion: f.accion, hora: fmtHora(f.hora) })}
                      style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', cursor: 'pointer', border: '1px solid #e2e8f0' }} alt="foto" />
                  ) : (
                    <div style={{ width: 44, height: 44, borderRadius: 8, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>👤</div>
                  )}
                  <div>
                    <span style={{ fontWeight: 500, fontSize: 14 }}>{f.empleados?.nombre}</span>
                    <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>{f.empleados?.rol}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, background: f.accion==='entrada'?'#dcfce7':'#fee2e2', color: f.accion==='entrada'?'#166534':'#991b1b' }}>{f.accion}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 14, color: '#475569' }}>{fmtHora(f.hora)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'resumen' && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 500, color: '#64748b', fontSize: 12, textTransform: 'uppercase' }}>Empleado</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 500, color: '#64748b', fontSize: 12, textTransform: 'uppercase' }}>Entradas / Salidas</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 500, color: '#64748b', fontSize: 12, textTransform: 'uppercase' }}>Total horas</th>
                </tr>
              </thead>
              <tbody>
                {empleados.filter(e => !e.es_admin).map(emp => {
                  const logs = fichajes.filter(f => f.empleado_id === emp.id).sort((a,b) => new Date(a.hora)-new Date(b.hora))
                  const horas = horasTrabajadas(emp.id)
                  if (!logs.length) return null
                  return (
                    <tr key={emp.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 500 }}>{emp.nombre}</div>
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>{emp.rol}</div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {logs.map(l => (
                            <span key={l.id} style={{ padding: '2px 8px', borderRadius: 6, fontSize: 12, background: l.accion==='entrada'?'#dcfce7':'#fee2e2', color: l.accion==='entrada'?'#166534':'#991b1b', fontFamily: 'monospace' }}>
                              {l.accion === 'entrada' ? 'E' : 'S'} {fmtHora(l.hora)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {horas ? <span style={{ background: '#dbeafe', color: '#1e40af', padding: '3px 10px', borderRadius: 20, fontSize: 13 }}>{horas}</span> : <span style={{ color: '#94a3b8' }}>—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'liquidacion' && (
          <div>
            {/* Configuracion */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '20px', marginBottom: 16 }}>
              <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 16 }}>Configuracion</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Mes a liquidar</div>
                  <input type="month" value={mesFiltro} onChange={e => setMesFiltro(e.target.value)}
                    style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 14 }} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Jornada normal (hs)</div>
                  <input type="number" value={horasJornada} onChange={e => setHorasJornada(Number(e.target.value))} min={1} max={12}
                    style={{ width: 80, border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 14 }} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Recargo horas extra</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setRecargo(50)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: recargo===50?'#1e293b':'#f8fafc', color: recargo===50?'#fff':'#475569', fontSize: 14, cursor: 'pointer' }}>50%</button>
                    <button onClick={() => setRecargo(100)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: recargo===100?'#1e293b':'#f8fafc', color: recargo===100?'#fff':'#475569', fontSize: 14, cursor: 'pointer' }}>100%</button>
                  </div>
                </div>
              </div>

              {/* Tarifas por empleado */}
              <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 10 }}>Valor por hora por empleado</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {empleados.filter(e => !e.es_admin).map(emp => (
                  <div key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 14, minWidth: 150 }}>{emp.nombre}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 14, color: '#64748b' }}>$</span>
                      <input type="number" value={tarifas[emp.id] || ''} onChange={e => setTarifas(t => ({ ...t, [emp.id]: Number(e.target.value) }))}
                        placeholder="0" min={0}
                        style={{ width: 100, border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 14 }} />
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>/ hora</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Liquidacion */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 500, fontSize: 15 }}>Liquidacion — {new Date(mesFiltro + '-02').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}</div>
                <button onClick={exportarExcel} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                  Exportar Excel
                </button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#64748b', fontSize: 12, textTransform: 'uppercase' }}>Empleado</th>
                    <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 500, color: '#64748b', fontSize: 12, textTransform: 'uppercase' }}>Dias</th>
                    <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 500, color: '#64748b', fontSize: 12, textTransform: 'uppercase' }}>Hs normales</th>
                    <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 500, color: '#64748b', fontSize: 12, textTransform: 'uppercase' }}>Hs extra</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 500, color: '#64748b', fontSize: 12, textTransform: 'uppercase' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {empleados.filter(e => !e.es_admin).map(emp => {
                    const liq = calcularLiquidacion(emp.id)
                    const tarifa = tarifas[emp.id] || 0
                    if (liq.diasTrabajados === 0 && tarifa === 0) return null
                    return (
                      <tr key={emp.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 500 }}>{emp.nombre}</div>
                          <div style={{ fontSize: 12, color: '#94a3b8' }}>{tarifa > 0 ? `${fmtPeso(tarifa)}/h` : 'Sin tarifa'}</div>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <span style={{ background: '#f1f5f9', padding: '2px 10px', borderRadius: 20, fontSize: 13 }}>{liq.diasTrabajados}</span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <div style={{ fontSize: 13 }}>{liq.horasNormales}h</div>
                          {tarifa > 0 && <div style={{ fontSize: 11, color: '#94a3b8' }}>{fmtPeso(liq.totalNormal)}</div>}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <div style={{ fontSize: 13, color: liq.horasExtra > 0 ? '#d97706' : '#94a3b8' }}>{liq.horasExtra}h</div>
                          {tarifa > 0 && liq.horasExtra > 0 && <div style={{ fontSize: 11, color: '#d97706' }}>{fmtPeso(liq.totalExtra)} (+{recargo}%)</div>}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          {tarifa > 0 ? (
                            <span style={{ fontWeight: 600, fontSize: 15, color: '#16a34a' }}>{fmtPeso(liq.total)}</span>
                          ) : (
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>Cargar tarifa</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'empleados' && (
          <div>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '20px', marginBottom: 20 }}>
              <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 16 }}>Agregar empleado</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                <input value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} placeholder="Nombre completo" style={{ flex: 2, minWidth: 160, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14 }} />
                <input value={nuevoRol} onChange={e => setNuevoRol(e.target.value)} placeholder="Rol (ej: Cajero)" style={{ flex: 1, minWidth: 120, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14 }} />
                <input value={nuevoPin} onChange={e => setNuevoPin(e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="PIN (4 digitos)" maxLength={4} style={{ flex: 1, minWidth: 120, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, letterSpacing: 4 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <input type="checkbox" id="esAdmin" checked={nuevoAdmin} onChange={e => setNuevoAdmin(e.target.checked)} />
                <label htmlFor="esAdmin" style={{ fontSize: 13, color: '#475569' }}>Es administrador</label>
              </div>
              <button onClick={agregarEmpleado} disabled={guardando || !nuevoNombre || nuevoPin.length < 4}
                style={{ background: '#1e293b', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer', opacity: (!nuevoNombre || nuevoPin.length < 4) ? 0.4 : 1 }}>
                {guardando ? 'Guardando...' : 'Agregar empleado'}
              </button>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
              {empleados.map(emp => (
                <div key={emp.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
                  <div>
                    <span style={{ fontWeight: 500, fontSize: 14 }}>{emp.nombre}</span>
                    <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>{emp.rol}</span>
                    {emp.es_admin && <span style={{ marginLeft: 8, background: '#ede9fe', color: '#5b21b6', fontSize: 11, padding: '2px 7px', borderRadius: 20 }}>Admin</span>}
                  </div>
                  <button onClick={() => desactivarEmpleado(emp.id)} style={{ background: 'none', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 7, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>
                    Dar de baja
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
