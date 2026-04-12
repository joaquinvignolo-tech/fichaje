import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/router'

const ADMIN_PIN = process.env.NEXT_PUBLIC_ADMIN_PIN || '0000'

export default function Admin() {
  const router = useRouter()
  const [autenticado, setAutenticado] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState(false)
  const [tab, setTab] = useState('hoy')
  const [empleados, setEmpleados] = useState([])
  const [fichajes, setFichajes] = useState([])
  const [fechaFiltro, setFechaFiltro] = useState(new Date().toISOString().slice(0,10))
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoRol, setNuevoRol] = useState('')
  const [nuevoPin, setNuevoPin] = useState('')
  const [nuevoAdmin, setNuevoAdmin] = useState(false)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (autenticado) cargarDatos()
  }, [autenticado, fechaFiltro])

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

  function verificarPin() {
    // Verificar contra admins en la base de datos
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
    if (!confirm('¿Dar de baja este empleado?')) return
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

  function fmtHora(iso) {
    return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
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
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>Ingresá tu PIN de administrador</div>
          <input
            type="password"
            maxLength={4}
            value={pinInput}
            onChange={e => setPinInput(e.target.value.replace(/\D/g,'').slice(0,4))}
            onKeyDown={e => e.key === 'Enter' && verificarPin()}
            placeholder="PIN"
            style={{ width: '100%', padding: '12px', textAlign: 'center', fontSize: 20, letterSpacing: 8, border: pinError ? '2px solid #dc2626' : '1px solid #e2e8f0', borderRadius: 10, marginBottom: 12, outline: 'none' }}
          />
          {pinError && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 8 }}>PIN incorrecto</div>}
          <button onClick={verificarPin} style={{ width: '100%', padding: '12px', background: '#1e293b', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 500, cursor: 'pointer' }}>
            Entrar
          </button>
          <button onClick={() => router.push('/')} style={{ marginTop: 12, background: 'none', border: 'none', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>
            ← Volver al fichaje
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {/* Header */}
      <div style={{ background: '#1e293b', color: '#fff', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 600, fontSize: 17 }}>Panel de administración</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>{presentes} presentes hoy</div>
          <button onClick={() => router.push('/')} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}>
            ← Fichaje
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid #e2e8f0' }}>
          {[['hoy','Registros del día'],['resumen','Resumen'],['empleados','Empleados']].map(([key,label]) => (
            <button key={key} onClick={() => setTab(key)} style={{ padding: '10px 18px', border: 'none', background: 'none', fontSize: 14, fontWeight: tab===key?600:400, color: tab===key?'#1e293b':'#64748b', borderBottom: tab===key?'2px solid #1e293b':'2px solid transparent', marginBottom: -1, cursor: 'pointer' }}>
              {label}
            </button>
          ))}
        </div>

        {/* Filtro de fecha */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <label style={{ fontSize: 13, color: '#64748b' }}>Fecha:</label>
          <input type="date" value={fechaFiltro} onChange={e => setFechaFiltro(e.target.value)}
            style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 13 }} />
          <button onClick={cargarDatos} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>
            Actualizar
          </button>
        </div>

        {/* Tab: Registros del día */}
        {tab === 'hoy' && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14 }}>
            {fichajes.length === 0 && <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Sin registros para esta fecha.</div>}
            {fichajes.map(f => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
                <div>
                  <span style={{ fontWeight: 500, fontSize: 14 }}>{f.empleados?.nombre}</span>
                  <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>{f.empleados?.rol}</span>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, background: f.accion==='entrada'?'#dcfce7':'#fee2e2', color: f.accion==='entrada'?'#166534':'#991b1b' }}>
                    {f.accion}
                  </span>
                  <span style={{ fontFamily: 'monospace', fontSize: 14, color: '#475569' }}>{fmtHora(f.hora)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab: Resumen */}
        {tab === 'resumen' && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 500, color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Empleado</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 500, color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Entradas / Salidas</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 500, color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total horas</th>
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
                              {l.accion === 'entrada' ? '↓' : '↑'} {fmtHora(l.hora)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {horas ? <span style={{ background: '#dbeafe', color: '#1e40af', padding: '3px 10px', borderRadius: 20, fontSize: 13 }}>{horas}</span> : <span style={{ color: '#94a3b8', fontSize: 13 }}>—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab: Empleados */}
        {tab === 'empleados' && (
          <div>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '20px', marginBottom: 20 }}>
              <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 16 }}>Agregar empleado</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                <input value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} placeholder="Nombre completo" style={{ flex: 2, minWidth: 160, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14 }} />
                <input value={nuevoRol} onChange={e => setNuevoRol(e.target.value)} placeholder="Rol (ej: Cajero)" style={{ flex: 1, minWidth: 120, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14 }} />
                <input value={nuevoPin} onChange={e => setNuevoPin(e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="PIN (4 dígitos)" maxLength={4} style={{ flex: 1, minWidth: 120, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: 'monospace', letterSpacing: 4 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <input type="checkbox" id="esAdmin" checked={nuevoAdmin} onChange={e => setNuevoAdmin(e.target.checked)} />
                <label htmlFor="esAdmin" style={{ fontSize: 13, color: '#475569' }}>Es administrador (puede acceder al panel admin)</label>
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
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '3px 10px', borderRadius: 6, fontSize: 13, letterSpacing: 3 }}>{'•'.repeat(emp.pin.length)}</span>
                    <button onClick={() => desactivarEmpleado(emp.id)} style={{ background: 'none', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 7, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>
                      Dar de baja
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
