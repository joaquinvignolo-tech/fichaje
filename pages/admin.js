import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/router'

const DIAS = ['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado']

function toArgDate(date) {
  return new Date(date).toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' })
}

function nextArgDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setDate(d.getDate() + 1)
  return d.toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' })
}

function fmtHora(iso) {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' })
}

function fmtPeso(n) { return '$' + Math.round(n).toLocaleString('es-AR') }

// Empareja entradas con salidas por proximidad — soporta turnos nocturnos
function emparejar(logs) {
  const sorted = [...logs].sort((a,b) => new Date(a.hora)-new Date(b.hora))
  const pares = []
  let i = 0
  while (i < sorted.length) {
    if (sorted[i].accion === 'entrada') {
      const entrada = sorted[i]
      let salida = null
      for (let j = i+1; j < sorted.length; j++) {
        if (sorted[j].accion === 'salida') {
          const diff = new Date(sorted[j].hora) - new Date(entrada.hora)
          if (diff > 0 && diff <= 20 * 3600000) { salida = sorted[j]; i = j; break }
        }
      }
      pares.push({ entrada, salida })
    }
    i++
  }
  return pares
}

export default function Admin() {
  const router = useRouter()
  const [autenticado, setAutenticado] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState(false)
  const [tab, setTab] = useState('hoy')
  const [empleados, setEmpleados] = useState([])
  const [fichajes, setFichajes] = useState([])
  const [fichajesMes, setFichajesMes] = useState([])
  const [turnos, setTurnos] = useState([])
  const [fechaFiltro, setFechaFiltro] = useState(toArgDate(new Date()))
  const [mesFiltro, setMesFiltro] = useState(toArgDate(new Date()).slice(0,7))
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoRol, setNuevoRol] = useState('')
  const [nuevoPin, setNuevoPin] = useState('')
  const [nuevoAdmin, setNuevoAdmin] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [fotoModal, setFotoModal] = useState(null)
  const [tarifas, setTarifas] = useState({})
  const [recargo, setRecargo] = useState(50)
  const [horasJornada, setHorasJornada] = useState(8)
  const [horaAlerta, setHoraAlerta] = useState('09:00')
  const [borrandoId, setBorrandoId] = useState(null)
  const [fechaBorrar, setFechaBorrar] = useState(toArgDate(new Date()))
  const [empBorrar, setEmpBorrar] = useState('')
  const [premioPresentismo, setPremioPresentismo] = useState(0)
  const [premioPuntualidad, setPremioPuntualidad] = useState(0)
  const [diasPuntualidad, setDiasPuntualidad] = useState(20)
  const [toleranciaTardanza, setToleranciaTardanza] = useState(10)
  const [descuentoTardanza, setDescuentoTardanza] = useState(true)
  const [empManual, setEmpManual] = useState('')
  const [accionManual, setAccionManual] = useState('entrada')
  const [fechaManual, setFechaManual] = useState(toArgDate(new Date()))
  const [horaManual, setHoraManual] = useState('09:00')
  const [guardandoManual, setGuardandoManual] = useState(false)
  const [historialEmp, setHistorialEmp] = useState(null)
  const [historialLogs, setHistorialLogs] = useState([])
  const [cargandoHistorial, setCargandoHistorial] = useState(false)
  const [editandoEmp, setEditandoEmp] = useState(null)
  const [editPin, setEditPin] = useState('')
  const [editTarifa, setEditTarifa] = useState('')
  const [editRol, setEditRol] = useState('')

  useEffect(() => { if (autenticado) { cargarDatos(); cargarTurnos() } }, [autenticado, fechaFiltro])
  useEffect(() => { if (autenticado && tab === 'liquidacion') cargarFichajesMes() }, [autenticado, tab, mesFiltro])

  async function cargarDatos() {
    const { data: emps } = await supabase.from('empleados').select('*').eq('activo', true).order('nombre')
    // Traer desde 15hs arg del dia anterior hasta 03hs arg del dia siguiente
    // Para capturar turnos que empezaron tarde y terminaron despues de medianoche
    const inicioUTC = new Date(fechaFiltro + 'T18:00:00Z') // 15hs arg = 18hs UTC
    inicioUTC.setDate(inicioUTC.getDate() - 1) // dia anterior
    const finUTC = new Date(nextArgDate(fechaFiltro) + 'T06:00:00Z') // 03hs arg del dia siguiente = 06hs UTC
    const { data: fich } = await supabase
      .from('fichajes').select('*, empleados(nombre, rol)')
      .gte('hora', inicioUTC.toISOString())
      .lte('hora', finUTC.toISOString())
      .order('hora', { ascending: true })
    setEmpleados(emps || [])
    setFichajes(fich || [])
    const tarifasObj = {}
    ;(emps || []).forEach(e => { if (e.tarifa_hora) tarifasObj[e.id] = e.tarifa_hora })
    setTarifas(tarifasObj)
  }

  async function cargarTurnos() {
    const { data } = await supabase.from('turnos').select('*').order('dia_semana')
    setTurnos(data || [])
  }

  async function cargarFichajesMes() {
    const inicio = new Date(mesFiltro + '-01T03:00:00Z')
    inicio.setDate(inicio.getDate() - 1) // un dia antes para turnos nocturnos
    const fin = new Date(mesFiltro + '-01')
    fin.setMonth(fin.getMonth() + 1)
    fin.setDate(fin.getDate() + 1)
    const { data } = await supabase
      .from('fichajes').select('*')
      .gte('hora', inicio.toISOString())
      .lte('hora', fin.toISOString())
      .order('hora', { ascending: true })
    setFichajesMes(data || [])
  }

  async function verHistorial(emp) {
    setCargandoHistorial(true)
    setHistorialEmp(emp)
    const inicio = new Date(mesFiltro + '-01T03:00:00Z')
    inicio.setDate(inicio.getDate() - 1)
    const fin = new Date(mesFiltro + '-01')
    fin.setMonth(fin.getMonth() + 1)
    fin.setDate(fin.getDate() + 1)
    const { data } = await supabase.from('fichajes').select('*')
      .eq('empleado_id', emp.id)
      .gte('hora', inicio.toISOString())
      .lte('hora', fin.toISOString())
      .order('hora', { ascending: true })
    setHistorialLogs(data || [])
    setCargandoHistorial(false)
  }

  function verificarPin() {
    supabase.from('empleados').select('*').eq('pin', pinInput).eq('es_admin', true).then(({ data }) => {
      if (data && data.length > 0) { setAutenticado(true); setPinError(false) }
      else { setPinError(true); setPinInput(''); setTimeout(() => setPinError(false), 1500) }
    })
  }

  async function agregarEmpleado() {
    if (!nuevoNombre.trim() || nuevoPin.length !== 4) return
    setGuardando(true)
    await supabase.from('empleados').insert({ nombre: nuevoNombre.trim(), rol: nuevoRol.trim() || 'Empleado', pin: nuevoPin, es_admin: nuevoAdmin })
    setNuevoNombre(''); setNuevoRol(''); setNuevoPin(''); setNuevoAdmin(false)
    await cargarDatos(); setGuardando(false)
  }

  async function guardarEdicion() {
    if (!editandoEmp) return
    const updates = { rol: editRol, tarifa_hora: editTarifa ? Number(editTarifa) : 0 }
    if (editPin && editPin.length === 4) updates.pin = editPin
    await supabase.from('empleados').update(updates).eq('id', editandoEmp.id)
    setEditandoEmp(null)
    await cargarDatos()
  }

  async function desactivarEmpleado(id) {
    if (!confirm('Dar de baja este empleado?')) return
    await supabase.from('empleados').update({ activo: false }).eq('id', id)
    await cargarDatos()
  }

  async function borrarRegistro(id) {
    if (!confirm('Borrar este registro?')) return
    setBorrandoId(id)
    await supabase.from('fichajes').delete().eq('id', id)
    await cargarDatos()
    setBorrandoId(null)
  }

  async function borrarPorFiltro() {
    const empNombre = empBorrar ? empleados.find(e => e.id === empBorrar)?.nombre : 'todos'
    if (!confirm(`Borrar registros de ${empNombre} del ${fechaBorrar}?`)) return
    const inicioUTC = new Date(fechaBorrar + 'T18:00:00Z')
    inicioUTC.setDate(inicioUTC.getDate() - 1)
    const finUTC = new Date(nextArgDate(fechaBorrar) + 'T06:00:00Z')
    let query = supabase.from('fichajes').delete().gte('hora', inicioUTC.toISOString()).lte('hora', finUTC.toISOString())
    if (empBorrar) query = query.eq('empleado_id', empBorrar)
    await query
    await cargarDatos()
  }

  async function agregarFichajeManual() {
    if (!empManual) return
    setGuardandoManual(true)
    const horaUTC = new Date(`${fechaManual}T${horaManual}:00-03:00`).toISOString()
    await supabase.from('fichajes').insert({ empleado_id: empManual, accion: accionManual, hora: horaUTC })
    setEmpManual(''); setHoraManual('09:00')
    await cargarDatos()
    setGuardandoManual(false)
  }

  async function guardarTurno(empId, dia, entrada, salida, franco) {
    const existing = turnos.find(t => t.empleado_id === empId && t.dia_semana === dia)
    if (existing) await supabase.from('turnos').update({ hora_entrada: franco ? null : entrada, hora_salida: franco ? null : salida, es_franco: franco }).eq('id', existing.id)
    else await supabase.from('turnos').insert({ empleado_id: empId, dia_semana: dia, hora_entrada: franco ? null : entrada, hora_salida: franco ? null : salida, es_franco: franco })
    await cargarTurnos()
  }

  async function guardarTarifaDB(empId, valor) {
    await supabase.from('empleados').update({ tarifa_hora: valor }).eq('id', empId)
    setTarifas(t => ({ ...t, [empId]: valor }))
  }

  function getTurno(empId, dia) { return turnos.find(t => t.empleado_id === empId && t.dia_semana === dia) }

  function calcularLiquidacion(empId) {
    const logs = fichajesMes.filter(f => f.empleado_id === empId)
    const tarifa = tarifas[empId] || 0
    const pares = emparejar(logs)
    const diasMap = {}
    pares.forEach(par => {
      if (!par.salida) return
      const dia = toArgDate(new Date(par.entrada.hora))
      const horas = (new Date(par.salida.hora) - new Date(par.entrada.hora)) / 3600000
      const horaArgStr = new Date(par.entrada.hora).toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' })
      const entradaArg = new Date(horaArgStr)
      const diaSemana = entradaArg.getDay()
      const turno = getTurno(empId, diaSemana)
      let minTardanza = 0
      if (turno && !turno.es_franco && turno.hora_entrada) {
        const [hT, mT] = turno.hora_entrada.slice(0,5).split(':').map(Number)
        const minReal = entradaArg.getHours() * 60 + entradaArg.getMinutes()
        minTardanza = Math.max(0, minReal - (hT * 60 + mT) - toleranciaTardanza)
      }
      if (!diasMap[dia]) diasMap[dia] = { horas: 0, tardanza: 0 }
      diasMap[dia].horas += horas
      diasMap[dia].tardanza = Math.max(diasMap[dia].tardanza, minTardanza)
    })
    let hn = 0, he = 0, minDesc = 0, diasPunt = 0
    Object.values(diasMap).forEach(d => {
      if (d.horas <= horasJornada) { hn += d.horas } else { hn += horasJornada; he += d.horas - horasJornada }
      if (descuentoTardanza) minDesc += d.tardanza
      if (d.tardanza <= toleranciaTardanza) diasPunt++
    })
    const diasTrab = Object.keys(diasMap).length
    const diasLab = (() => {
      let c = 0
      const ini = new Date(mesFiltro + '-01')
      const fin = new Date(mesFiltro + '-01'); fin.setMonth(fin.getMonth() + 1)
      for (let d = new Date(ini); d < fin; d.setDate(d.getDate() + 1)) {
        const t = getTurno(empId, d.getDay())
        if (!t || !t.es_franco) c++
      }
      return c
    })()
    const hnReal = Math.max(0, hn - minDesc/60)
    const tn = Math.round(hnReal * tarifa)
    const te = Math.round(he * tarifa * (1 + recargo/100))
    const tienePres = diasTrab >= diasLab && diasLab > 0
    const tienePunt = diasPunt >= diasPuntualidad
    const bPres = tienePres ? premioPresentismo : 0
    const bPunt = tienePunt ? premioPuntualidad : 0
    return { dias: diasTrab, diasLab, hn: Math.round(hnReal*10)/10, he: Math.round(he*10)/10, tardanzaMin: Math.round(minDesc), diasPunt, tn, te, bPres, bPunt, tienePres, tienePunt, total: tn+te+bPres+bPunt }
  }

  function exportarExcel() {
    let csv = 'Empleado,Dias,Hs normales,Hs extra,Tardanzas,Premio pres,Premio punt,TOTAL\n'
    empleados.filter(e => !e.es_admin).forEach(emp => {
      const l = calcularLiquidacion(emp.id)
      if (l.dias > 0) csv += `${emp.nombre},${l.dias},${l.hn},${l.he},${l.tardanzaMin}min,${fmtPeso(l.bPres)},${fmtPeso(l.bPunt)},${fmtPeso(l.total)}\n`
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `liquidacion-${mesFiltro}.csv`
    a.click()
  }

  function verificarAlertas() {
    const [hA, mA] = horaAlerta.split(':').map(Number)
    const ahora = new Date()
    const ahoraArg = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
    if (ahoraArg.getHours() * 60 + ahoraArg.getMinutes() < hA * 60 + mA) { alert(`Todavia no llego la hora limite de ${horaAlerta}`); return }
    const sin = empleados.filter(emp => !emp.es_admin && fichajes.filter(f => f.empleado_id === emp.id && f.accion === 'entrada').length === 0)
    if (sin.length === 0) alert('Todos ficharon entrada hoy.')
    else alert(`Sin fichar:\n\n${sin.map(e => '• ' + e.nombre).join('\n')}`)
  }

  function getEstadoHoy(emp) {
    const ahora = new Date()
    const turno = getTurno(emp.id, new Date(ahora.toLocaleString('en-US', {timeZone:'America/Argentina/Buenos_Aires'})).getDay())
    if (!turno) return null
    if (turno.es_franco) return { tipo: 'franco', label: 'Franco' }
    const fichajeHoy = fichajes.filter(f => f.empleado_id === emp.id && f.accion === 'entrada')
    if (!fichajeHoy.length) {
      const [hT, mT] = turno.hora_entrada.slice(0,5).split(':').map(Number)
      const ahoraArg = new Date(ahora.toLocaleString('en-US', {timeZone:'America/Argentina/Buenos_Aires'}))
      if (ahoraArg.getHours() * 60 + ahoraArg.getMinutes() > hT * 60 + mT + 15) return { tipo: 'ausente', label: 'No ficho' }
      return { tipo: 'pendiente', label: `Entra ${turno.hora_entrada.slice(0,5)}` }
    }
    const horaFichaje = new Date(fichajeHoy[fichajeHoy.length-1].hora)
    const horaFichajeArg = new Date(horaFichaje.toLocaleString('en-US', {timeZone:'America/Argentina/Buenos_Aires'}))
    const [hT, mT] = turno.hora_entrada.slice(0,5).split(':').map(Number)
    const diff = horaFichajeArg.getHours() * 60 + horaFichajeArg.getMinutes() - (hT * 60 + mT)
    if (diff <= toleranciaTardanza) return { tipo: 'ok', label: 'A tiempo' }
    return { tipo: 'tarde', label: `Tarde ${diff}min` }
  }

  const presentes = empleados.filter(emp => {
    const logs = [...fichajes].filter(f => f.empleado_id === emp.id).sort((a,b) => new Date(b.hora)-new Date(a.hora))
    return logs.length > 0 && logs[0].accion === 'entrada'
  }).length
  const noFicharon = empleados.filter(emp => !emp.es_admin && fichajes.filter(f => f.empleado_id === emp.id).length === 0)
  const colorEstado = { ok:'#dcfce7', tarde:'#fef9c3', ausente:'#fee2e2', franco:'#f1f5f9', pendiente:'#e0f2fe' }
  const textEstado = { ok:'#166534', tarde:'#854d0e', ausente:'#991b1b', franco:'#475569', pendiente:'#0369a1' }

  if (!autenticado) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f8fafc' }}>
      <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:20, padding:'36px 32px', width:300, textAlign:'center' }}>
        <div style={{ fontSize:28, marginBottom:8 }}>🔐</div>
        <div style={{ fontWeight:600, fontSize:18, marginBottom:4 }}>Panel Admin</div>
        <div style={{ fontSize:13, color:'#64748b', marginBottom:24 }}>Ingresa tu PIN de administrador</div>
        <input type="password" maxLength={4} value={pinInput} onChange={e => setPinInput(e.target.value.replace(/\D/g,'').slice(0,4))} onKeyDown={e => e.key==='Enter' && verificarPin()} placeholder="PIN"
          style={{ width:'100%', padding:'12px', textAlign:'center', fontSize:20, letterSpacing:8, border:pinError?'2px solid #dc2626':'1px solid #e2e8f0', borderRadius:10, marginBottom:12, outline:'none' }} />
        {pinError && <div style={{ color:'#dc2626', fontSize:13, marginBottom:8 }}>PIN incorrecto</div>}
        <button onClick={verificarPin} style={{ width:'100%', padding:'12px', background:'#1e293b', color:'#fff', border:'none', borderRadius:10, fontSize:15, fontWeight:500, cursor:'pointer' }}>Entrar</button>
        <button onClick={() => router.push('/')} style={{ marginTop:12, background:'none', border:'none', color:'#94a3b8', fontSize:13, cursor:'pointer' }}>Volver al fichaje</button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'#f8fafc' }}>

      {/* Modal foto */}
      {fotoModal && (
        <div onClick={() => setFotoModal(null)} style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div style={{ maxWidth:400, width:'90%' }}>
            <img src={fotoModal.url} style={{ width:'100%', borderRadius:12 }} alt="foto" />
            <div style={{ color:'#fff', textAlign:'center', marginTop:12, fontSize:14 }}>{fotoModal.nombre} — {fotoModal.hora}</div>
            <div style={{ color:'#94a3b8', textAlign:'center', marginTop:4, fontSize:12 }}>Toca para cerrar</div>
          </div>
        </div>
      )}

      {/* Modal historial mensual */}
      {historialEmp && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:1000, overflowY:'auto', padding:'20px' }}>
          <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:600, padding:'20px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <div>
                <div style={{ fontWeight:600, fontSize:17 }}>{historialEmp.nombre}</div>
                <div style={{ fontSize:13, color:'#64748b' }}>Historial — {new Date(mesFiltro+'-02').toLocaleDateString('es-AR',{month:'long',year:'numeric'})}</div>
              </div>
              <button onClick={() => setHistorialEmp(null)} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#64748b' }}>✕</button>
            </div>
            {cargandoHistorial ? (
              <div style={{ textAlign:'center', padding:'2rem', color:'#64748b' }}>Cargando...</div>
            ) : (() => {
              const pares = emparejar(historialLogs)
              const diasMap = {}
              pares.forEach(p => {
                const dia = toArgDate(new Date(p.entrada.hora))
                if (!diasMap[dia]) diasMap[dia] = []
                diasMap[dia].push(p)
              })
              let totalMes = 0
              const diasOrdenados = Object.keys(diasMap).sort()
              if (!diasOrdenados.length) return <div style={{ textAlign:'center', padding:'2rem', color:'#94a3b8' }}>Sin registros este mes.</div>
              return (
                <div>
                  {diasOrdenados.map(dia => {
                    let totalDia = 0
                    diasMap[dia].forEach(p => { if (p.salida) totalDia += new Date(p.salida.hora) - new Date(p.entrada.hora) })
                    totalMes += totalDia
                    const hD = Math.floor(totalDia/3600000); const mD = Math.floor((totalDia%3600000)/60000)
                    return (
                      <div key={dia} style={{ borderBottom:'1px solid #f1f5f9', padding:'10px 0' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                          <div style={{ fontSize:14, fontWeight:500, textTransform:'capitalize' }}>
                            {new Date(dia+'T12:00:00').toLocaleDateString('es-AR',{weekday:'short',day:'numeric',month:'short'})}
                          </div>
                          {totalDia > 0
                            ? <span style={{ background:'#dbeafe', color:'#1e40af', padding:'2px 8px', borderRadius:20, fontSize:12 }}>{hD}h {mD}m</span>
                            : <span style={{ background:'#fef9c3', color:'#854d0e', padding:'2px 8px', borderRadius:20, fontSize:12 }}>En curso</span>}
                        </div>
                        {diasMap[dia].map((p,i) => (
                          <div key={i} style={{ display:'flex', gap:8, fontSize:13 }}>
                            <span style={{ background:'#dcfce7', color:'#166534', padding:'2px 8px', borderRadius:6, fontSize:12 }}>entrada {fmtHora(p.entrada.hora)}</span>
                            {p.salida
                              ? <span style={{ background:'#fee2e2', color:'#991b1b', padding:'2px 8px', borderRadius:6, fontSize:12 }}>salida {fmtHora(p.salida.hora)}</span>
                              : <span style={{ color:'#94a3b8', fontSize:12 }}>sin salida</span>}
                          </div>
                        ))}
                      </div>
                    )
                  })}
                  <div style={{ marginTop:16, padding:'12px', background:'#f8fafc', borderRadius:10, display:'flex', justifyContent:'space-between' }}>
                    <span style={{ fontWeight:500 }}>Total del mes</span>
                    <span style={{ fontWeight:700, color:'#1e40af' }}>{Math.floor(totalMes/3600000)}h {Math.floor((totalMes%3600000)/60000)}m</span>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* Modal editar empleado */}
      {editandoEmp && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:'24px', width:'90%', maxWidth:360 }}>
            <div style={{ fontWeight:600, fontSize:16, marginBottom:20 }}>Editar — {editandoEmp.nombre}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>Rol</div>
                <input value={editRol} onChange={e => setEditRol(e.target.value)} style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:8, padding:'8px 12px', fontSize:14 }} />
              </div>
              <div>
                <div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>Nuevo PIN (dejar vacio para no cambiar)</div>
                <input type="password" value={editPin} onChange={e => setEditPin(e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="4 digitos" maxLength={4}
                  style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:8, padding:'8px 12px', fontSize:14, letterSpacing:6 }} />
              </div>
              <div>
                <div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>Tarifa por hora ($)</div>
                <input type="number" value={editTarifa} onChange={e => setEditTarifa(e.target.value)} min={0}
                  style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:8, padding:'8px 12px', fontSize:14 }} />
              </div>
            </div>
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button onClick={() => setEditandoEmp(null)} style={{ flex:1, padding:'10px', background:'#f1f5f9', border:'none', borderRadius:9, fontSize:14, cursor:'pointer' }}>Cancelar</button>
              <button onClick={guardarEdicion} style={{ flex:1, padding:'10px', background:'#1e293b', color:'#fff', border:'none', borderRadius:9, fontSize:14, fontWeight:500, cursor:'pointer' }}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ background:'#1e293b', color:'#fff', padding:'16px 24px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontWeight:600, fontSize:17 }}>Panel Admin</div>
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          <div style={{ fontSize:13, color:'#94a3b8' }}>{presentes} presentes</div>
          {noFicharon.length > 0 && <div style={{ background:'#dc2626', color:'#fff', borderRadius:20, padding:'2px 10px', fontSize:12 }}>{noFicharon.length} sin fichar</div>}
          <button onClick={() => router.push('/')} style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'#fff', borderRadius:8, padding:'7px 14px', fontSize:13, cursor:'pointer' }}>Fichaje</button>
        </div>
      </div>

      <div style={{ maxWidth:900, margin:'0 auto', padding:'24px' }}>
        {/* Tabs */}
        <div style={{ display:'flex', gap:4, marginBottom:24, borderBottom:'1px solid #e2e8f0', overflowX:'auto' }}>
          {[['hoy','Registros'],['turnos','Turnos'],['alertas','Alertas'],['liquidacion','Liquidacion'],['empleados','Empleados']].map(([key,label]) => (
            <button key={key} onClick={() => setTab(key)} style={{ padding:'10px 14px', border:'none', background:'none', fontSize:14, fontWeight:tab===key?600:400, color:tab===key?'#1e293b':'#64748b', borderBottom:tab===key?'2px solid #1e293b':'2px solid transparent', marginBottom:-1, cursor:'pointer', whiteSpace:'nowrap' }}>
              {label}
            </button>
          ))}
        </div>

        {/* REGISTROS */}
        {tab === 'hoy' && (
          <div>
            <div style={{ display:'flex', gap:10, marginBottom:16 }}>
              <input type="date" value={fechaFiltro} onChange={e => setFechaFiltro(e.target.value)} style={{ border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 10px', fontSize:13 }} />
              <button onClick={cargarDatos} style={{ background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 12px', fontSize:13, cursor:'pointer' }}>Actualizar</button>
            </div>

            {/* Agregar manual */}
            <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:'14px 16px', marginBottom:14 }}>
              <div style={{ fontWeight:500, fontSize:14, marginBottom:10 }}>Agregar fichaje manual</div>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end' }}>
                <div>
                  <div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>Empleado</div>
                  <select value={empManual} onChange={e => setEmpManual(e.target.value)} style={{ border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 10px', fontSize:13, background:'#fff' }}>
                    <option value="">Elegir...</option>
                    {empleados.filter(e => !e.es_admin).map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>Tipo</div>
                  <select value={accionManual} onChange={e => setAccionManual(e.target.value)} style={{ border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 10px', fontSize:13, background:'#fff' }}>
                    <option value="entrada">Entrada</option>
                    <option value="salida">Salida</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>Fecha</div>
                  <input type="date" value={fechaManual} onChange={e => setFechaManual(e.target.value)} style={{ border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 10px', fontSize:13 }} />
                </div>
                <div>
                  <div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>Hora</div>
                  <input type="time" value={horaManual} onChange={e => setHoraManual(e.target.value)} style={{ border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 10px', fontSize:13 }} />
                </div>
                <button onClick={agregarFichajeManual} disabled={!empManual || guardandoManual}
                  style={{ background:'#1e293b', color:'#fff', border:'none', borderRadius:8, padding:'7px 16px', fontSize:13, fontWeight:500, cursor:'pointer', opacity:!empManual?0.4:1 }}>
                  {guardandoManual ? 'Guardando...' : 'Agregar'}
                </button>
              </div>
            </div>

            {/* Borrar filtro */}
            <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:'14px 16px', marginBottom:14, display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end' }}>
              <div>
                <div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>Borrar del</div>
                <input type="date" value={fechaBorrar} onChange={e => setFechaBorrar(e.target.value)} style={{ border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 10px', fontSize:13 }} />
              </div>
              <div>
                <div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>Empleado</div>
                <select value={empBorrar} onChange={e => setEmpBorrar(e.target.value)} style={{ border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 10px', fontSize:13, background:'#fff' }}>
                  <option value="">Todos</option>
                  {empleados.filter(e => !e.es_admin).map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </div>
              <button onClick={borrarPorFiltro} style={{ background:'#fee2e2', color:'#dc2626', border:'1px solid #fca5a5', borderRadius:8, padding:'7px 14px', fontSize:13, cursor:'pointer', fontWeight:500 }}>Borrar</button>
            </div>

            {/* Lista registros agrupada por empleado */}
            <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:14 }}>
              {empleados.filter(e => !e.es_admin).map(emp => {
                const logsEmp = fichajes.filter(f => f.empleado_id === emp.id)
                if (!logsEmp.length) return null
                const pares = emparejar(logsEmp)
                // Mostrar pares donde la salida es del dia filtrado, O entrada del dia sin salida
                const paresDia = pares.filter(p => {
                  // Mostrar si la ENTRADA es del dia filtrado
                  return toArgDate(new Date(p.entrada.hora)) === fechaFiltro
                })
                if (!paresDia.length) return null
                let totalMs = 0
                paresDia.forEach(p => { if (p.salida) totalMs += new Date(p.salida.hora) - new Date(p.entrada.hora) })
                const thH = Math.floor(totalMs/3600000); const tmM = Math.floor((totalMs%3600000)/60000)
                const ultimaFoto = [...logsEmp].reverse().find(f => f.foto_url)
                const todosLogs = []
                paresDia.forEach(p => { todosLogs.push(p.entrada); if (p.salida) todosLogs.push(p.salida) })
                todosLogs.sort((a,b) => new Date(a.hora)-new Date(b.hora))
                return (
                  <div key={emp.id} style={{ borderBottom:'1px solid #f1f5f9', padding:'12px 16px' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        {ultimaFoto?.foto_url
                          ? <img src={ultimaFoto.foto_url} onClick={() => setFotoModal({ url:ultimaFoto.foto_url, nombre:emp.nombre, hora:'' })} style={{ width:40, height:40, borderRadius:8, objectFit:'cover', cursor:'pointer', border:'1px solid #e2e8f0' }} alt="" />
                          : <div style={{ width:40, height:40, borderRadius:8, background:'#f1f5f9', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>👤</div>
                        }
                        <div>
                          <div onClick={() => verHistorial(emp)} style={{ fontWeight:500, fontSize:14, color:'#1e40af', cursor:'pointer', textDecoration:'underline' }}>{emp.nombre}</div>
                          <div style={{ fontSize:12, color:'#94a3b8' }}>{emp.rol}</div>
                        </div>
                      </div>
                      {totalMs > 0
                        ? <span style={{ background:'#dbeafe', color:'#1e40af', padding:'3px 10px', borderRadius:20, fontSize:13, fontWeight:500 }}>{thH}h {tmM}m</span>
                        : <span style={{ background:'#fef9c3', color:'#854d0e', padding:'3px 10px', borderRadius:20, fontSize:12 }}>En curso</span>
                      }
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                      {todosLogs.map(f => (
                        <div key={f.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'#f8fafc', borderRadius:8, padding:'6px 10px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ padding:'2px 8px', borderRadius:20, fontSize:11, background:f.accion==='entrada'?'#dcfce7':'#fee2e2', color:f.accion==='entrada'?'#166534':'#991b1b', fontWeight:500 }}>{f.accion}</span>
                            <span style={{ fontFamily:'monospace', fontSize:14, color:'#334155', fontWeight:500 }}>{fmtHora(f.hora)}</span>
                            {toArgDate(new Date(f.hora)) !== fechaFiltro && <span style={{ fontSize:11, color:'#94a3b8' }}>(dia anterior)</span>}
                            {f.foto_url && <img src={f.foto_url} onClick={() => setFotoModal({ url:f.foto_url, nombre:emp.nombre, hora:fmtHora(f.hora) })} style={{ width:24, height:24, borderRadius:4, objectFit:'cover', cursor:'pointer' }} alt="" />}
                          </div>
                          <div style={{ display:'flex', gap:6 }}>
                            {f.lat && f.lng && <button onClick={() => window.open(`https://www.google.com/maps?q=${f.lat},${f.lng}&z=17`,'_blank')} style={{ background:'#dbeafe', border:'none', color:'#1e40af', borderRadius:6, padding:'3px 8px', fontSize:11, cursor:'pointer' }}>Mapa</button>}
                            <button onClick={() => borrarRegistro(f.id)} disabled={borrandoId===f.id} style={{ background:'none', border:'none', color:'#dc2626', fontSize:14, cursor:'pointer' }}>✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
              {!fichajes.length && <div style={{ padding:'3rem', textAlign:'center', color:'#94a3b8', fontSize:14 }}>Sin registros.</div>}
            </div>
          </div>
        )}

        {/* TURNOS */}
        {tab === 'turnos' && (
          <div>
            <div style={{ fontSize:13, color:'#64748b', marginBottom:16 }}>Toca cualquier celda para editar. Los cambios se guardan automaticamente.</div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, background:'#fff', border:'1px solid #e2e8f0', borderRadius:14 }}>
                <thead>
                  <tr style={{ background:'#f8fafc' }}>
                    <th style={{ padding:'12px 16px', textAlign:'left', fontWeight:500, color:'#64748b', fontSize:12, textTransform:'uppercase', minWidth:100 }}>Empleado</th>
                    {DIAS.map((d,i) => <th key={i} style={{ padding:'12px 8px', textAlign:'center', fontWeight:500, color:'#64748b', fontSize:12, textTransform:'uppercase', minWidth:110 }}>{d}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {empleados.filter(e => !e.es_admin).map(emp => (
                    <tr key={emp.id} style={{ borderTop:'1px solid #f1f5f9' }}>
                      <td style={{ padding:'10px 16px', fontWeight:500, fontSize:13 }}>{emp.nombre}</td>
                      {[0,1,2,3,4,5,6].map(dia => (
                        <TurnoCell key={dia} turno={getTurno(emp.id, dia)} onSave={(e,s,f) => guardarTurno(emp.id, dia, e, s, f)} />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ALERTAS */}
        {tab === 'alertas' && (
          <div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:10, marginBottom:20 }}>
              {empleados.filter(e => !e.es_admin).map(emp => {
                const estado = getEstadoHoy(emp)
                const dentro = (() => { const l = [...fichajes].filter(f=>f.empleado_id===emp.id).sort((a,b)=>new Date(b.hora)-new Date(a.hora)); return l.length>0 && l[0].accion==='entrada' })()
                return (
                  <div key={emp.id} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:'14px', textAlign:'center' }}>
                    <div style={{ fontWeight:500, fontSize:14, marginBottom:6 }}>{emp.nombre}</div>
                    {estado
                      ? <span style={{ display:'inline-block', padding:'3px 10px', borderRadius:20, fontSize:12, background:colorEstado[estado.tipo], color:textEstado[estado.tipo] }}>{estado.label}</span>
                      : <span style={{ display:'inline-block', padding:'3px 10px', borderRadius:20, fontSize:12, background:'#f1f5f9', color:'#94a3b8' }}>Sin turno</span>}
                    {dentro && <div style={{ fontSize:11, color:'#16a34a', marginTop:4 }}>Presente</div>}
                  </div>
                )
              })}
            </div>
            <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:14, padding:'20px' }}>
              <div style={{ fontWeight:500, fontSize:15, marginBottom:16 }}>Verificar por hora limite</div>
              <div style={{ display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap' }}>
                <div>
                  <div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>Hora limite</div>
                  <input type="time" value={horaAlerta} onChange={e => setHoraAlerta(e.target.value)} style={{ border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 10px', fontSize:14 }} />
                </div>
                <button onClick={verificarAlertas} style={{ background:'#1e293b', color:'#fff', border:'none', borderRadius:9, padding:'10px 20px', fontSize:14, fontWeight:500, cursor:'pointer' }}>Verificar ahora</button>
              </div>
            </div>
          </div>
        )}

        {/* LIQUIDACION */}
        {tab === 'liquidacion' && (
          <div>
            <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:14, padding:'20px', marginBottom:16 }}>
              <div style={{ fontWeight:500, fontSize:15, marginBottom:16 }}>Configuracion</div>
              <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:16 }}>
                <div><div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>Mes</div><input type="month" value={mesFiltro} onChange={e => setMesFiltro(e.target.value)} style={{ border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 10px', fontSize:14 }} /></div>
                <div><div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>Jornada normal (hs)</div><input type="number" value={horasJornada} onChange={e => setHorasJornada(Number(e.target.value))} min={1} max={12} style={{ width:80, border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 10px', fontSize:14 }} /></div>
                <div>
                  <div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>Recargo extra</div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => setRecargo(50)} style={{ padding:'6px 14px', borderRadius:8, border:'1px solid #e2e8f0', background:recargo===50?'#1e293b':'#f8fafc', color:recargo===50?'#fff':'#475569', fontSize:14, cursor:'pointer' }}>50%</button>
                    <button onClick={() => setRecargo(100)} style={{ padding:'6px 14px', borderRadius:8, border:'1px solid #e2e8f0', background:recargo===100?'#1e293b':'#f8fafc', color:recargo===100?'#fff':'#475569', fontSize:14, cursor:'pointer' }}>100%</button>
                  </div>
                </div>
              </div>
              <div style={{ borderTop:'1px solid #f1f5f9', paddingTop:16, marginBottom:16 }}>
                <div style={{ fontWeight:500, fontSize:14, color:'#16a34a', marginBottom:10 }}>Premios</div>
                <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
                  <div><div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>Premio presentismo ($)</div><input type="number" value={premioPresentismo} onChange={e => setPremioPresentismo(Number(e.target.value))} min={0} style={{ width:120, border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 10px', fontSize:14 }} /></div>
                  <div><div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>Premio puntualidad ($)</div><input type="number" value={premioPuntualidad} onChange={e => setPremioPuntualidad(Number(e.target.value))} min={0} style={{ width:120, border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 10px', fontSize:14 }} /></div>
                  <div><div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>Dias puntualidad minimos</div><input type="number" value={diasPuntualidad} onChange={e => setDiasPuntualidad(Number(e.target.value))} min={1} style={{ width:80, border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 10px', fontSize:14 }} /></div>
                </div>
              </div>
              <div style={{ borderTop:'1px solid #f1f5f9', paddingTop:16, marginBottom:16 }}>
                <div style={{ fontWeight:500, fontSize:14, color:'#dc2626', marginBottom:10 }}>Tardanzas</div>
                <div style={{ display:'flex', gap:16, flexWrap:'wrap', alignItems:'center' }}>
                  <div><div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>Tolerancia (min)</div><input type="number" value={toleranciaTardanza} onChange={e => setToleranciaTardanza(Number(e.target.value))} min={0} style={{ width:80, border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 10px', fontSize:14 }} /></div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:16 }}>
                    <input type="checkbox" id="desc" checked={descuentoTardanza} onChange={e => setDescuentoTardanza(e.target.checked)} />
                    <label htmlFor="desc" style={{ fontSize:13, color:'#475569' }}>Descontar tardanzas del sueldo</label>
                  </div>
                </div>
              </div>
              <div style={{ borderTop:'1px solid #f1f5f9', paddingTop:16 }}>
                <div style={{ fontWeight:500, fontSize:14, marginBottom:10 }}>Valor por hora</div>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {empleados.filter(e => !e.es_admin).map(emp => (
                    <div key={emp.id} style={{ display:'flex', alignItems:'center', gap:12 }}>
                      <span style={{ fontSize:14, minWidth:150 }}>{emp.nombre}</span>
                      <span style={{ fontSize:14, color:'#64748b' }}>$</span>
                      <input type="number" value={tarifas[emp.id] || ''} onChange={e => setTarifas(t => ({...t, [emp.id]: Number(e.target.value)}))}
                        onBlur={e => guardarTarifaDB(emp.id, Number(e.target.value))} placeholder="0" min={0}
                        style={{ width:100, border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 10px', fontSize:14 }} />
                      <span style={{ fontSize:12, color:'#94a3b8' }}>/ hora</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:14, overflow:'hidden' }}>
              <div style={{ padding:'16px 20px', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ fontWeight:500, fontSize:15 }}>Liquidacion — {new Date(mesFiltro+'-02').toLocaleDateString('es-AR',{month:'long',year:'numeric'})}</div>
                <button onClick={exportarExcel} style={{ background:'#16a34a', color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontSize:13, fontWeight:500, cursor:'pointer' }}>Exportar Excel</button>
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead>
                    <tr style={{ background:'#f8fafc' }}>
                      {['Empleado','Dias','Hs norm.','Hs extra','Tardanza','Premios','Total'].map(h => (
                        <th key={h} style={{ padding:'10px 12px', textAlign:h==='Total'?'right':'center', textAlign:h==='Empleado'?'left':'center', fontWeight:500, color:'#64748b', fontSize:11, textTransform:'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {empleados.filter(e => !e.es_admin).map(emp => {
                      const l = calcularLiquidacion(emp.id)
                      const tarifa = tarifas[emp.id] || 0
                      if (l.dias === 0 && !tarifa) return null
                      return (
                        <tr key={emp.id} style={{ borderTop:'1px solid #f1f5f9' }}>
                          <td style={{ padding:'12px 12px' }}><div style={{ fontWeight:500 }}>{emp.nombre}</div><div style={{ fontSize:11, color:'#94a3b8' }}>{tarifa>0?`${fmtPeso(tarifa)}/h`:'Sin tarifa'}</div></td>
                          <td style={{ padding:'12px 8px', textAlign:'center' }}><span style={{ background:'#f1f5f9', padding:'2px 8px', borderRadius:20, fontSize:12 }}>{l.dias}/{l.diasLab}</span></td>
                          <td style={{ padding:'12px 8px', textAlign:'center' }}><div>{l.hn}h</div>{tarifa>0&&<div style={{ fontSize:11, color:'#94a3b8' }}>{fmtPeso(l.tn)}</div>}</td>
                          <td style={{ padding:'12px 8px', textAlign:'center' }}><div style={{ color:l.he>0?'#d97706':'#94a3b8' }}>{l.he}h</div>{tarifa>0&&l.he>0&&<div style={{ fontSize:11, color:'#d97706' }}>{fmtPeso(l.te)}</div>}</td>
                          <td style={{ padding:'12px 8px', textAlign:'center' }}>{l.tardanzaMin>0?<div style={{ color:'#dc2626', fontSize:12 }}>{l.tardanzaMin}min</div>:<span style={{ color:'#94a3b8' }}>—</span>}</td>
                          <td style={{ padding:'12px 8px', textAlign:'center' }}>
                            {l.tienePres&&premioPresentismo>0&&<div style={{ background:'#dcfce7', color:'#166534', padding:'2px 6px', borderRadius:6, fontSize:11, marginBottom:2 }}>Pres. {fmtPeso(l.bPres)}</div>}
                            {l.tienePunt&&premioPuntualidad>0&&<div style={{ background:'#dbeafe', color:'#1e40af', padding:'2px 6px', borderRadius:6, fontSize:11 }}>Punt. {fmtPeso(l.bPunt)}</div>}
                            {!l.tienePres&&!l.tienePunt&&<span style={{ color:'#94a3b8' }}>—</span>}
                          </td>
                          <td style={{ padding:'12px 12px', textAlign:'right' }}>{tarifa>0?<span style={{ fontWeight:600, fontSize:15, color:'#16a34a' }}>{fmtPeso(l.total)}</span>:<span style={{ fontSize:12, color:'#94a3b8' }}>Cargar tarifa</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* EMPLEADOS */}
        {tab === 'empleados' && (
          <div>
            <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:14, padding:'20px', marginBottom:20 }}>
              <div style={{ fontWeight:500, fontSize:15, marginBottom:16 }}>Agregar empleado</div>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:10 }}>
                <input value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} placeholder="Nombre completo" style={{ flex:2, minWidth:160, padding:'8px 12px', border:'1px solid #e2e8f0', borderRadius:8, fontSize:14 }} />
                <input value={nuevoRol} onChange={e => setNuevoRol(e.target.value)} placeholder="Rol" style={{ flex:1, minWidth:120, padding:'8px 12px', border:'1px solid #e2e8f0', borderRadius:8, fontSize:14 }} />
                <input value={nuevoPin} onChange={e => setNuevoPin(e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="PIN (4 digitos)" maxLength={4} style={{ flex:1, minWidth:120, padding:'8px 12px', border:'1px solid #e2e8f0', borderRadius:8, fontSize:14, letterSpacing:4 }} />
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                <input type="checkbox" id="esAdmin" checked={nuevoAdmin} onChange={e => setNuevoAdmin(e.target.checked)} />
                <label htmlFor="esAdmin" style={{ fontSize:13, color:'#475569' }}>Es administrador</label>
              </div>
              <button onClick={agregarEmpleado} disabled={guardando || !nuevoNombre || nuevoPin.length<4}
                style={{ background:'#1e293b', color:'#fff', border:'none', borderRadius:9, padding:'10px 20px', fontSize:14, fontWeight:500, cursor:'pointer', opacity:(!nuevoNombre||nuevoPin.length<4)?0.4:1 }}>
                {guardando ? 'Guardando...' : 'Agregar'}
              </button>
            </div>
            <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:14, overflow:'hidden' }}>
              {empleados.map(emp => (
                <div key={emp.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', borderBottom:'1px solid #f1f5f9' }}>
                  <div>
                    <span style={{ fontWeight:500, fontSize:14 }}>{emp.nombre}</span>
                    <span style={{ fontSize:12, color:'#94a3b8', marginLeft:8 }}>{emp.rol}</span>
                    {emp.tarifa_hora > 0 && <span style={{ fontSize:12, color:'#64748b', marginLeft:8 }}>{fmtPeso(emp.tarifa_hora)}/h</span>}
                    {emp.es_admin && <span style={{ marginLeft:8, background:'#ede9fe', color:'#5b21b6', fontSize:11, padding:'2px 7px', borderRadius:20 }}>Admin</span>}
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => { setEditandoEmp(emp); setEditPin(''); setEditTarifa(emp.tarifa_hora||''); setEditRol(emp.rol||'') }}
                      style={{ background:'none', border:'1px solid #e2e8f0', color:'#475569', borderRadius:7, padding:'5px 10px', fontSize:12, cursor:'pointer' }}>Editar</button>
                    <button onClick={() => desactivarEmpleado(emp.id)}
                      style={{ background:'none', border:'1px solid #fca5a5', color:'#dc2626', borderRadius:7, padding:'5px 10px', fontSize:12, cursor:'pointer' }}>Dar de baja</button>
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

function TurnoCell({ turno, onSave }) {
  const [editando, setEditando] = useState(false)
  const [entrada, setEntrada] = useState(turno?.hora_entrada?.slice(0,5) || '09:00')
  const [salida, setSalida] = useState(turno?.hora_salida?.slice(0,5) || '17:00')
  const [franco, setFranco] = useState(turno?.es_franco || false)
  useEffect(() => { setEntrada(turno?.hora_entrada?.slice(0,5)||'09:00'); setSalida(turno?.hora_salida?.slice(0,5)||'17:00'); setFranco(turno?.es_franco||false) }, [turno])
  async function guardar() { await onSave(entrada, salida, franco); setEditando(false) }
  if (!editando) return (
    <td style={{ padding:'8px', textAlign:'center' }} onClick={() => setEditando(true)}>
      {turno ? (turno.es_franco
        ? <span style={{ background:'#f1f5f9', color:'#64748b', padding:'3px 8px', borderRadius:8, fontSize:12, cursor:'pointer' }}>Franco</span>
        : <span style={{ background:'#e0f2fe', color:'#0369a1', padding:'3px 8px', borderRadius:8, fontSize:12, cursor:'pointer' }}>{turno.hora_entrada?.slice(0,5)} - {turno.hora_salida?.slice(0,5)}</span>
      ) : <span style={{ color:'#cbd5e1', fontSize:12, cursor:'pointer' }}>+ Agregar</span>}
    </td>
  )
  return (
    <td style={{ padding:'6px', textAlign:'center', background:'#f8fafc' }}>
      <div style={{ display:'flex', flexDirection:'column', gap:4, alignItems:'center' }}>
        <label style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'#64748b' }}>
          <input type="checkbox" checked={franco} onChange={e => setFranco(e.target.checked)} /> Franco
        </label>
        {!franco && <>
          <input type="time" value={entrada} onChange={e => setEntrada(e.target.value)} style={{ width:90, border:'1px solid #e2e8f0', borderRadius:6, padding:'3px 6px', fontSize:12 }} />
          <input type="time" value={salida} onChange={e => setSalida(e.target.value)} style={{ width:90, border:'1px solid #e2e8f0', borderRadius:6, padding:'3px 6px', fontSize:12 }} />
        </>}
        <div style={{ display:'flex', gap:4 }}>
          <button onClick={guardar} style={{ background:'#1e293b', color:'#fff', border:'none', borderRadius:6, padding:'3px 8px', fontSize:11, cursor:'pointer' }}>OK</button>
          <button onClick={() => setEditando(false)} style={{ background:'#f1f5f9', border:'none', borderRadius:6, padding:'3px 8px', fontSize:11, cursor:'pointer' }}>X</button>
        </div>
      </div>
    </td>
  )
}
