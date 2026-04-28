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

function fmtArgHora(iso) {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' })
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
  const [historialMesEmp, setHistorialMesEmp] = useState(null)
  const [historialMesLogs, setHistorialMesLogs] = useState([])
  const [editandoEmp, setEditandoEmp] = useState(null)
  const [editPin, setEditPin] = useState('')
  const [editTarifa, setEditTarifa] = useState('')
  const [editRol, setEditRol] = useState('')
  const [guardandoEdit, setGuardandoEdit] = useState(false)
  // Configuracion premios y descuentos
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

  useEffect(() => {
    if (autenticado) { cargarDatos(); cargarTurnos() }
  }, [autenticado, fechaFiltro])

  useEffect(() => {
    if (autenticado && tab === 'liquidacion') cargarFichajesMes()
  }, [autenticado, tab, mesFiltro])

  async function cargarDatos() {
    const { data: emps } = await supabase.from('empleados').select('*').eq('activo', true).order('nombre')
    // Traer 36 horas antes del inicio del dia seleccionado para capturar entradas de turnos nocturnos
    // fechaFiltro en arg = fechaFiltro + T03:00:00Z en UTC (inicio del dia arg)
    // Restamos 12 horas mas para cubrir entradas de la tarde del dia anterior
    const inicioUTC = new Date(fechaFiltro + 'T03:00:00Z')
    inicioUTC.setHours(inicioUTC.getHours() - 12)
    const finUTC = new Date(fechaFiltro + 'T03:00:00Z')
    finUTC.setDate(finUTC.getDate() + 1)

    const { data: fich } = await supabase
      .from('fichajes').select('*, empleados(nombre, rol)')
      .gte('hora', inicioUTC.toISOString())
      .lte('hora', finUTC.toISOString())
      .order('hora', { ascending: true })
    setEmpleados(emps || [])
    setFichajes(fich || [])
    // Cargar tarifas desde la base de datos
    const tarifasObj = {}
    ;(emps || []).forEach(e => { if (e.tarifa_hora) tarifasObj[e.id] = e.tarifa_hora })
    setTarifas(tarifasObj)
  }

  async function cargarTurnos() {
    const { data } = await supabase.from('turnos').select('*, empleados(nombre)').order('dia_semana')
    setTurnos(data || [])
  }

  async function cargarFichajesMes() {
    const inicio = mesFiltro + '-01T03:00:00Z'
    const fin = new Date(mesFiltro + '-01')
    fin.setMonth(fin.getMonth() + 1)
    const finStr = nextArgDate(toArgDate(fin)) + 'T02:59:59Z'
    const { data } = await supabase
      .from('fichajes').select('*, empleados(nombre, rol)')
      .gte('hora', inicio).lte('hora', finStr)
      .order('hora', { ascending: true })
    setFichajesMes(data || [])
  }

  function verificarPin() {
    supabase.from('empleados').select('*').eq('pin', pinInput).eq('es_admin', true).then(({ data }) => {
      if (data && data.length > 0) { setAutenticado(true); setPinError(false) }
      else { setPinError(true); setPinInput(''); setTimeout(() => setPinError(false), 1500) }
    })
  }

  async function agregarEmpleado() {
    if (!nuevoNombre.trim() || !nuevoPin || nuevoPin.length !== 4) return
    setGuardando(true)
    await supabase.from('empleados').insert({ nombre: nuevoNombre.trim(), rol: nuevoRol.trim() || 'Empleado', pin: nuevoPin, es_admin: nuevoAdmin })
    setNuevoNombre(''); setNuevoRol(''); setNuevoPin(''); setNuevoAdmin(false)
    await cargarDatos(); setGuardando(false)
  }

  async function desactivarEmpleado(id) {
    if (!confirm('Dar de baja este empleado?')) return
    await supabase.from('empleados').update({ activo: false }).eq('id', id)
    await cargarDatos()
  }

  async function agregarFichajeManual() {
    if (!empManual) return
    setGuardandoManual(true)
    // Convertir hora argentina a UTC sumando 3 horas
    const horaUTC = new Date(`${fechaManual}T${horaManual}:00-03:00`).toISOString()
    await supabase.from('fichajes').insert({
      empleado_id: empManual,
      accion: accionManual,
      hora: horaUTC
    })
    setEmpManual('')
    setHoraManual('09:00')
    await cargarDatos()
    setGuardandoManual(false)
  }

  async function guardarTarifaDB(empId, valor) {
    await supabase.from('empleados').update({ tarifa_hora: valor }).eq('id', empId)
    setTarifas(t => ({ ...t, [empId]: valor }))
  }

  function abrirEdicion(emp) {
    setEditandoEmp(emp)
    setEditPin('')
    setEditTarifa(emp.tarifa_hora || '')
    setEditRol(emp.rol || '')
  }

  async function guardarEdicion() {
    if (!editandoEmp) return
    setGuardandoEdit(true)
    const updates = { rol: editRol, tarifa_hora: editTarifa ? Number(editTarifa) : 0 }
    if (editPin && editPin.length === 4) updates.pin = editPin
    await supabase.from('empleados').update(updates).eq('id', editandoEmp.id)
    setEditandoEmp(null)
    await cargarDatos()
    setGuardandoEdit(false)
  }

  async function verHistorialMes(emp) {
    console.log('verHistorialMes called for', emp.nombre)
    const inicio = mesFiltro + '-01T03:00:00Z'
    const fin = new Date(mesFiltro + '-01')
    fin.setMonth(fin.getMonth() + 1)
    const finStr = fin.toISOString().slice(0,10) + 'T03:00:00Z'
    console.log('Fetching from', inicio, 'to', finStr)
    const { data, error } = await supabase.from('fichajes').select('*')
      .eq('empleado_id', emp.id)
      .gte('hora', inicio)
      .lte('hora', finStr)
      .order('hora', { ascending: true })
    console.log('Got', data?.length, 'records', error)
    setHistorialMesEmp(emp)
    setHistorialMesLogs(data || [])
  }

  async function borrarRegistro(id) {
    if (!confirm('Borrar este registro?')) return
    setBorrandoId(id)
    await supabase.from('fichajes').delete().eq('id', id)
    await cargarDatos()
    setBorrandoId(null)
  }

  async function borrarPorFiltro() {
    let msg = 'Borrar registros'
    if (empBorrar) msg += ` de ${empleados.find(e=>e.id===empBorrar)?.nombre}`
    msg += ` del ${fechaBorrar}?`
    if (!confirm(msg)) return
    let query = supabase.from('fichajes').delete()
      .gte('hora', fechaBorrar + 'T03:00:00Z').lte('hora', nextArgDate(fechaBorrar) + 'T02:59:59Z')
    if (empBorrar) query = query.eq('empleado_id', empBorrar)
    await query
    await cargarDatos()
  }

  async function guardarTurno(empId, dia, entrada, salida, franco) {
    const existing = turnos.find(t => t.empleado_id === empId && t.dia_semana === dia)
    if (existing) {
      await supabase.from('turnos').update({ hora_entrada: franco ? null : entrada, hora_salida: franco ? null : salida, es_franco: franco }).eq('id', existing.id)
    } else {
      await supabase.from('turnos').insert({ empleado_id: empId, dia_semana: dia, hora_entrada: franco ? null : entrada, hora_salida: franco ? null : salida, es_franco: franco })
    }
    await cargarTurnos()
  }

  function getTurno(empId, dia) {
    return turnos.find(t => t.empleado_id === empId && t.dia_semana === dia)
  }

  // Empareja entradas con salidas por proximidad — funciona con turnos nocturnos que cruzan medianoche
  function emparejarTurnos(logs) {
    const sorted = [...logs].sort((a,b) => new Date(a.hora)-new Date(b.hora))
    const pares = []
    let i = 0
    while (i < sorted.length) {
      if (sorted[i].accion === 'entrada') {
        const entrada = sorted[i]
        // Buscar la siguiente salida dentro de las proximas 18 horas
        let salida = null
        for (let j = i+1; j < sorted.length; j++) {
          if (sorted[j].accion === 'salida') {
            const diff = new Date(sorted[j].hora) - new Date(entrada.hora)
            if (diff > 0 && diff <= 18 * 3600000) { salida = sorted[j]; i = j; break }
          }
        }
        pares.push({ entrada, salida })
      }
      i++
    }
    return pares
  }

  function horasTrabajadas(empId) {
    const logs = fichajes.filter(f => f.empleado_id === empId)
    const pares = emparejarTurnos(logs)
    let total = 0
    pares.forEach(p => { if (p.salida) total += new Date(p.salida.hora) - new Date(p.entrada.hora) })
    if (total === 0) return null
    return `${Math.floor(total/3600000)}h ${Math.floor((total%3600000)/60000)}m`
  }

  function calcularLiquidacion(empId) {
    const logs = fichajesMes.filter(f => f.empleado_id === empId)
    const tarifa = tarifas[empId] || 0
    const pares = emparejarTurnos(logs)

    // Agrupar por dia de entrada en hora argentina
    const diasMap = {}
    pares.forEach(par => {
      const entrada = new Date(par.entrada.hora)
      const dia = toArgDate(entrada)
      const horas = par.salida ? (new Date(par.salida.hora) - entrada) / 3600000 : 0

      // Calcular tardanza usando hora argentina
      const horaArgEntrada = new Date(par.entrada.hora).toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' })
      const entradaArg = new Date(horaArgEntrada)
      const diaSemana = entradaArg.getDay()
      const turno = getTurno(empId, diaSemana)
      let minTardanza = 0
      if (turno && !turno.es_franco && turno.hora_entrada) {
        const [hT, mT] = turno.hora_entrada.slice(0,5).split(':').map(Number)
        const minEsperado = hT * 60 + mT
        const minReal = entradaArg.getHours() * 60 + entradaArg.getMinutes()
        minTardanza = Math.max(0, minReal - minEsperado - toleranciaTardanza)
      }

      if (!diasMap[dia]) diasMap[dia] = { horas: 0, tardanza: 0 }
      diasMap[dia].horas += horas
      diasMap[dia].tardanza = Math.max(diasMap[dia].tardanza, minTardanza)
    })

    let hn = 0, he = 0, minDescuento = 0, diasPuntuales = 0
    const diasTrabajados = Object.keys(diasMap).length

    Object.values(diasMap).forEach(d => {
      const h = d.horas
      if (h <= horasJornada) { hn += h } else { hn += horasJornada; he += h - horasJornada }
      if (descuentoTardanza) minDescuento += d.tardanza
      if (d.tardanza <= toleranciaTardanza) diasPuntuales++
    })

    // Calcular dias laborables del mes (sin francos)
    const diasLaborablesMes = []
    const inicio = new Date(mesFiltro + '-01')
    const fin = new Date(mesFiltro + '-01')
    fin.setMonth(fin.getMonth() + 1)
    for (let d = new Date(inicio); d < fin; d.setDate(d.getDate() + 1)) {
      const diaSem = d.getDay()
      const turno = getTurno(empId, diaSem)
      if (!turno || !turno.es_franco) diasLaborablesMes.push(toArgDate(d))
    }

    const horasDescuento = minDescuento / 60
    const hnReal = Math.max(0, hn - horasDescuento)
    const tn = Math.round(hnReal * tarifa)
    const te = Math.round(he * tarifa * (1 + recargo/100))

    const tienePresentismo = diasTrabajados >= diasLaborablesMes.length && diasLaborablesMes.length > 0
    const tienePuntualidad = diasPuntuales >= diasPuntualidad
    const bonoPresentismo = tienePresentismo ? premioPresentismo : 0
    const bonoPuntualidad = tienePuntualidad ? premioPuntualidad : 0
    const total = tn + te + bonoPresentismo + bonoPuntualidad

    return {
      dias: diasTrabajados, diasLaborables: diasLaborablesMes.length,
      hn: Math.round(hnReal * 10) / 10, he: Math.round(he * 10) / 10,
      tardanzaMin: Math.round(minDescuento), diasPuntuales,
      tn, te, bonoPresentismo, bonoPuntualidad,
      tienePresentismo, tienePuntualidad, total
    }
  }

  function exportarExcel() {
    let csv = 'Empleado,Rol,Dias,Hs normales,Hs extra,Tardanzas,Premio presentismo,Premio puntualidad,TOTAL\n'
    empleados.filter(e => !e.es_admin).forEach(emp => {
      const l = calcularLiquidacion(emp.id)
      if (l.dias > 0 || tarifas[emp.id] > 0)
        csv += `${emp.nombre},${emp.rol},${l.dias},${l.hn},${l.he},${l.tardanzaMin}min,$${l.bonoPresentismo},$${l.bonoPuntualidad},$${l.total}\n`
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `liquidacion-${mesFiltro}.csv`
    a.click()
  }

  function verificarAlertas() {
    const [hA, mA] = horaAlerta.split(':').map(Number)
    const ahora = new Date()
    if (ahora.getHours() * 60 + ahora.getMinutes() < hA * 60 + mA) {
      alert(`Todavia no llegó la hora limite de ${horaAlerta}`); return
    }
    const sin = empleados.filter(emp => !emp.es_admin && fichajes.filter(f => f.empleado_id === emp.id).length === 0)
    if (sin.length === 0) alert('Todos ficharon entrada hoy.')
    else alert(`Sin fichar:\n\n${sin.map(e => '• ' + e.nombre).join('\n')}`)
  }

  function getEstadoTurnoHoy(emp) {
    const hoy = new Date()
    const turno = getTurno(emp.id, hoy.getDay())
    if (!turno) return null
    if (turno.es_franco) return { tipo: 'franco', label: 'Franco' }
    const fichajeHoy = fichajes.filter(f => f.empleado_id === emp.id && f.accion === 'entrada')
    if (fichajeHoy.length === 0) {
      const [hT, mT] = turno.hora_entrada.slice(0,5).split(':').map(Number)
      if (hoy.getHours() * 60 + hoy.getMinutes() > hT * 60 + mT + 15)
        return { tipo: 'ausente', label: 'No ficho' }
      return { tipo: 'pendiente', label: `Entra ${turno.hora_entrada.slice(0,5)}` }
    }
    const horaFichaje = new Date(fichajeHoy[0].hora)
    const [hT, mT] = turno.hora_entrada.slice(0,5).split(':').map(Number)
    const diff = horaFichaje.getHours() * 60 + horaFichaje.getMinutes() - (hT * 60 + mT)
    if (diff <= toleranciaTardanza) return { tipo: 'ok', label: 'A tiempo' }
    return { tipo: 'tarde', label: `Tarde ${diff}min` }
  }

  function fmtHoraStr(iso) { return fmtArgHora(iso) }
  function fmtPeso(n) { return '$' + Math.round(n).toLocaleString('es-AR') }

  const presentes = empleados.filter(emp => {
    const logs = fichajes.filter(f => f.empleado_id === emp.id)
    return logs.length > 0 && logs[0].accion === 'entrada'
  }).length
  const noFicharonHoy = empleados.filter(emp => !emp.es_admin && fichajes.filter(f => f.empleado_id === emp.id).length === 0)
  const colorEstado = { ok: '#dcfce7', tarde: '#fef9c3', ausente: '#fee2e2', franco: '#f1f5f9', pendiente: '#e0f2fe' }
  const textEstado = { ok: '#166534', tarde: '#854d0e', ausente: '#991b1b', franco: '#475569', pendiente: '#0369a1' }

  if (!autenticado) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: '36px 32px', width: 300, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔐</div>
          <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 4 }}>Panel Admin</div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>Ingresa tu PIN de administrador</div>
          <input type="password" maxLength={4} value={pinInput} onChange={e => setPinInput(e.target.value.replace(/\D/g,'').slice(0,4))} onKeyDown={e => e.key === 'Enter' && verificarPin()} placeholder="PIN"
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

      {/* Modal historial mensual */}
      {historialMesEmp && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, overflowY: 'auto', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 600, padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 17 }}>{historialMesEmp.nombre}</div>
                <div style={{ fontSize: 13, color: '#64748b' }}>Historial de {new Date(mesFiltro+'-02').toLocaleDateString('es-AR',{month:'long',year:'numeric'})}</div>
              </div>
              <button onClick={() => setHistorialMesEmp(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>
            {(() => {
              const pares = emparejarTurnos(historialMesLogs)
              const diasMap = {}
              pares.forEach(p => {
                const dia = toArgDate(new Date(p.entrada.hora))
                if (!diasMap[dia]) diasMap[dia] = []
                diasMap[dia].push(p)
              })
              let totalMes = 0
              const diasOrdenados = Object.keys(diasMap).sort()
              return (
                <div>
                  {diasOrdenados.map(dia => {
                    const paresDia = diasMap[dia]
                    let totalDia = 0
                    paresDia.forEach(p => { if (p.salida) totalDia += new Date(p.salida.hora) - new Date(p.entrada.hora) })
                    totalMes += totalDia
                    const hD = Math.floor(totalDia/3600000); const mD = Math.floor((totalDia%3600000)/60000)
                    return (
                      <div key={dia} style={{ borderBottom: '1px solid #f1f5f9', padding: '10px 0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontSize: 14, fontWeight: 500, textTransform: 'capitalize' }}>
                            {new Date(dia+'T12:00:00').toLocaleDateString('es-AR',{weekday:'short',day:'numeric',month:'short'})}
                          </div>
                          {totalDia > 0 ? <span style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: 20, fontSize: 12 }}>{hD}h {mD}m</span>
                            : <span style={{ background: '#fef9c3', color: '#854d0e', padding: '2px 8px', borderRadius: 20, fontSize: 12 }}>En curso</span>}
                        </div>
                        {paresDia.map((p,i) => (
                          <div key={i} style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 13, color: '#475569' }}>
                            <span style={{ background: '#dcfce7', color: '#166534', padding: '1px 8px', borderRadius: 6, fontSize: 12 }}>entrada {fmtHoraStr(p.entrada.hora)}</span>
                            {p.salida ? <span style={{ background: '#fee2e2', color: '#991b1b', padding: '1px 8px', borderRadius: 6, fontSize: 12 }}>salida {fmtHoraStr(p.salida.hora)}</span>
                              : <span style={{ color: '#94a3b8', fontSize: 12 }}>sin salida registrada</span>}
                          </div>
                        ))}
                      </div>
                    )
                  })}
                  <div style={{ marginTop: 16, padding: '12px', background: '#f8fafc', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 500, fontSize: 14 }}>Total del mes</span>
                    <span style={{ fontWeight: 600, fontSize: 16, color: '#1e40af' }}>{Math.floor(totalMes/3600000)}h {Math.floor((totalMes%3600000)/60000)}m</span>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* Modal editar empleado */}
      {editandoEmp && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '24px', width: '90%', maxWidth: 360 }}>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 20 }}>Editar — {editandoEmp.nombre}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Rol</div>
                <input value={editRol} onChange={e => setEditRol(e.target.value)}
                  style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 14 }} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Nuevo PIN (dejar vacio para no cambiar)</div>
                <input type="password" value={editPin} onChange={e => setEditPin(e.target.value.replace(/\D/g,'').slice(0,4))}
                  placeholder="4 digitos" maxLength={4}
                  style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 14, letterSpacing: 6 }} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Tarifa por hora ($)</div>
                <input type="number" value={editTarifa} onChange={e => setEditTarifa(e.target.value)} placeholder="0" min={0}
                  style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 14 }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setEditandoEmp(null)} style={{ flex: 1, padding: '10px', background: '#f1f5f9', border: 'none', borderRadius: 9, fontSize: 14, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={guardarEdicion} disabled={guardandoEdit}
                style={{ flex: 1, padding: '10px', background: '#1e293b', color: '#fff', border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                {guardandoEdit ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

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
          <div style={{ fontSize: 13, color: '#94a3b8' }}>{presentes} presentes</div>
          {noFicharonHoy.length > 0 && <div style={{ background: '#dc2626', color: '#fff', borderRadius: 20, padding: '2px 10px', fontSize: 12 }}>{noFicharonHoy.length} sin fichar</div>}
          <button onClick={() => router.push('/')} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}>Fichaje</button>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px' }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid #e2e8f0', overflowX: 'auto' }}>
          {[['hoy','Registros'],['turnos','Turnos'],['alertas','Alertas'],['liquidacion','Liquidacion'],['empleados','Empleados']].map(([key,label]) => (
            <button key={key} onClick={() => setTab(key)} style={{ padding: '10px 14px', border: 'none', background: 'none', fontSize: 14, fontWeight: tab===key?600:400, color: tab===key?'#1e293b':'#64748b', borderBottom: tab===key?'2px solid #1e293b':'2px solid transparent', marginBottom: -1, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {label}
            </button>
          ))}
        </div>

        {(tab === 'hoy' || tab === 'resumen') && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <input type="date" value={fechaFiltro} onChange={e => setFechaFiltro(e.target.value)} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 13 }} />
            <button onClick={cargarDatos} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>Actualizar</button>
          </div>
        )}

        {tab === 'hoy' && (
          <div>
            {/* Agregar fichaje manual */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
              <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 12 }}>Agregar fichaje manual</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Empleado</div>
                  <select value={empManual} onChange={e => setEmpManual(e.target.value)} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 13, background: '#fff' }}>
                    <option value="">Elegir...</option>
                    {empleados.filter(e => !e.es_admin).map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Tipo</div>
                  <select value={accionManual} onChange={e => setAccionManual(e.target.value)} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 13, background: '#fff' }}>
                    <option value="entrada">Entrada</option>
                    <option value="salida">Salida</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Fecha</div>
                  <input type="date" value={fechaManual} onChange={e => setFechaManual(e.target.value)} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 13 }} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Hora</div>
                  <input type="time" value={horaManual} onChange={e => setHoraManual(e.target.value)} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 13 }} />
                </div>
                <button onClick={agregarFichajeManual} disabled={!empManual || guardandoManual}
                  style={{ background: '#1e293b', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: !empManual ? 0.4 : 1 }}>
                  {guardandoManual ? 'Guardando...' : 'Agregar'}
                </button>
              </div>
            </div>

            {/* Borrar por filtro */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px', marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Borrar registros del</div>
                <input type="date" value={fechaBorrar} onChange={e => setFechaBorrar(e.target.value)} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 13 }} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Empleado (opcional)</div>
                <select value={empBorrar} onChange={e => setEmpBorrar(e.target.value)} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 13, background: '#fff' }}>
                  <option value="">Todos</option>
                  {empleados.filter(e => !e.es_admin).map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </div>
              <button onClick={borrarPorFiltro} style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>Borrar</button>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14 }}>
              {fichajes.length === 0 && <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Sin registros.</div>}
              {empleados.filter(e => !e.es_admin).map(emp => {
                const logsEmp = [...fichajes].filter(f => f.empleado_id === emp.id)
                if (!logsEmp.length) return null
                // Usar emparejamiento por proximidad para turnos nocturnos
                const pares = emparejarTurnos(logsEmp)
                // Mostrar pares donde la salida es del dia seleccionado,
                // O donde la entrada es del dia seleccionado (sin salida aun)
                // Esto captura turnos nocturnos: entraron ayer y salieron hoy
                const paresDia = pares.filter(p => {
                  const fechaSalida = p.salida ? toArgDate(new Date(p.salida.hora)) : null
                  const fechaEntrada = toArgDate(new Date(p.entrada.hora))
                  // Incluir si: la salida es hoy, O la entrada es hoy sin salida
                  return fechaSalida === fechaFiltro || (!p.salida && fechaEntrada === fechaFiltro)
                })
                // Tambien mostrar entradas sueltas del dia (sin salida aun)
                const entradasSueltas = logsEmp.filter(f => 
                  f.accion === 'entrada' && 
                  toArgDate(new Date(f.hora)) === fechaFiltro &&
                  !pares.find(p => p.entrada.id === f.id && p.salida)
                )
                if (!paresDia.length && !entradasSueltas.length) return null

                // Calcular total horas del dia
                let totalMs = 0
                paresDia.forEach(p => { if (p.salida) totalMs += new Date(p.salida.hora) - new Date(p.entrada.hora) })
                const thH = Math.floor(totalMs/3600000); const tmM = Math.floor((totalMs%3600000)/60000)

                // Todos los registros a mostrar ordenados
                const todosLogs = []
                paresDia.forEach(p => { todosLogs.push(p.entrada); if (p.salida) todosLogs.push(p.salida) })
                entradasSueltas.forEach(e => { if (!todosLogs.find(l => l.id === e.id)) todosLogs.push(e) })
                todosLogs.sort((a,b) => new Date(a.hora)-new Date(b.hora))
                const ultimaFoto = [...todosLogs].reverse().find(f => f.foto_url)
                return (
                  <div key={emp.id} style={{ borderBottom: '1px solid #f1f5f9', padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {ultimaFoto?.foto_url ? (
                          <img src={ultimaFoto.foto_url} onClick={() => setFotoModal({ url: ultimaFoto.foto_url, nombre: emp.nombre, accion: '', hora: '' })}
                            style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', cursor: 'pointer', border: '1px solid #e2e8f0' }} alt="foto" />
                        ) : (
                          <div style={{ width: 40, height: 40, borderRadius: 8, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>👤</div>
                        )}
                        <div>
                          <div onClick={() => verHistorialMes(emp)} style={{ fontWeight: 500, fontSize: 14, color: '#1e40af', textDecoration: 'underline', cursor: 'pointer' }}>{emp.nombre} 📋</div>
                          <div style={{ fontSize: 12, color: '#94a3b8' }}>{emp.rol}</div>
                        </div>
                      </div>
                      {totalMs > 0 && <span style={{ background: '#dbeafe', color: '#1e40af', padding: '3px 10px', borderRadius: 20, fontSize: 13, fontWeight: 500 }}>{thH}h {tmM}m</span>}
                      {totalMs === 0 && todosLogs.length > 0 && <span style={{ background: '#fef9c3', color: '#854d0e', padding: '3px 10px', borderRadius: 20, fontSize: 12 }}>En curso</span>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {todosLogs.map(f => (
                        <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', borderRadius: 8, padding: '6px 10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, background: f.accion==='entrada'?'#dcfce7':'#fee2e2', color: f.accion==='entrada'?'#166534':'#991b1b', fontWeight: 500 }}>{f.accion}</span>
                            <span style={{ fontFamily: 'monospace', fontSize: 14, color: '#334155', fontWeight: 500 }}>{fmtHoraStr(f.hora)}</span>
                            {toArgDate(new Date(f.hora)) !== fechaFiltro && <span style={{ fontSize: 11, color: '#94a3b8' }}>(dia anterior)</span>}
                            {f.foto_url && (
                              <img src={f.foto_url} onClick={() => setFotoModal({ url: f.foto_url, nombre: emp.nombre, accion: f.accion, hora: fmtHoraStr(f.hora) })}
                                style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover', cursor: 'pointer', border: '1px solid #e2e8f0' }} alt="foto" />
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            {f.lat && f.lng && (
                              <button onClick={() => window.open(`https://www.google.com/maps?q=${f.lat},${f.lng}&z=17`, '_blank')}
                                style={{ background: '#dbeafe', border: 'none', color: '#1e40af', borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}>Mapa</button>
                            )}
                            <button onClick={() => borrarRegistro(f.id)} disabled={borrandoId === f.id}
                              style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 14, cursor: 'pointer', padding: '2px 4px' }}>✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {tab === 'resumen' && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 500, color: '#64748b', fontSize: 12, textTransform: 'uppercase' }}>Empleado</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 500, color: '#64748b', fontSize: 12, textTransform: 'uppercase' }}>Registros</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 500, color: '#64748b', fontSize: 12, textTransform: 'uppercase' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {empleados.filter(e => !e.es_admin).map(emp => {
                  const logs = fichajes.filter(f => f.empleado_id === emp.id).sort((a,b) => new Date(a.hora)-new Date(b.hora))
                  const horas = horasTrabajadas(emp.id)
                  if (!logs.length) return null
                  return (
                    <tr key={emp.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 16px' }}><div style={{ fontWeight: 500 }}>{emp.nombre}</div><div style={{ fontSize: 12, color: '#94a3b8' }}>{emp.rol}</div></td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {logs.map(l => (
                            <span key={l.id} style={{ padding: '2px 8px', borderRadius: 6, fontSize: 12, background: l.accion==='entrada'?'#dcfce7':'#fee2e2', color: l.accion==='entrada'?'#166534':'#991b1b', fontFamily: 'monospace' }}>
                              {l.accion==='entrada'?'E':'S'} {fmtHoraStr(l.hora)}
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

        {tab === 'turnos' && (
          <div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>Toca cualquier celda para editar el turno. Los cambios se guardan automaticamente.</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 500, color: '#64748b', fontSize: 12, textTransform: 'uppercase', minWidth: 100 }}>Empleado</th>
                    {DIAS.map((d,i) => <th key={i} style={{ padding: '12px 8px', textAlign: 'center', fontWeight: 500, color: '#64748b', fontSize: 12, textTransform: 'uppercase', minWidth: 110 }}>{d}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {empleados.filter(e => !e.es_admin).map(emp => (
                    <tr key={emp.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 500, fontSize: 13 }}>{emp.nombre}</td>
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

        {tab === 'alertas' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 20 }}>
              {empleados.filter(e => !e.es_admin).map(emp => {
                const estado = getEstadoTurnoHoy(emp)
                const dentro = fichajes.filter(f => f.empleado_id === emp.id).length > 0 && fichajes.filter(f => f.empleado_id === emp.id)[0].accion === 'entrada'
                return (
                  <div key={emp.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px', textAlign: 'center' }}>
                    <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 6 }}>{emp.nombre}</div>
                    {estado ? (
                      <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, background: colorEstado[estado.tipo], color: textEstado[estado.tipo] }}>{estado.label}</span>
                    ) : (
                      <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, background: '#f1f5f9', color: '#94a3b8' }}>Sin turno</span>
                    )}
                    {dentro && <div style={{ fontSize: 11, color: '#16a34a', marginTop: 4 }}>Presente</div>}
                  </div>
                )
              })}
            </div>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '20px' }}>
              <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 16 }}>Verificar por hora limite</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Hora limite</div>
                  <input type="time" value={horaAlerta} onChange={e => setHoraAlerta(e.target.value)} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 14 }} />
                </div>
                <button onClick={verificarAlertas} style={{ background: '#1e293b', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Verificar ahora</button>
              </div>
            </div>
          </div>
        )}

        {tab === 'liquidacion' && (
          <div>
            {/* Config general */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '20px', marginBottom: 16 }}>
              <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 16 }}>Configuracion general</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Mes</div>
                  <input type="month" value={mesFiltro} onChange={e => setMesFiltro(e.target.value)} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 14 }} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Jornada normal (hs)</div>
                  <input type="number" value={horasJornada} onChange={e => setHorasJornada(Number(e.target.value))} min={1} max={12} style={{ width: 80, border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 14 }} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Recargo horas extra</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setRecargo(50)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: recargo===50?'#1e293b':'#f8fafc', color: recargo===50?'#fff':'#475569', fontSize: 14, cursor: 'pointer' }}>50%</button>
                    <button onClick={() => setRecargo(100)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: recargo===100?'#1e293b':'#f8fafc', color: recargo===100?'#fff':'#475569', fontSize: 14, cursor: 'pointer' }}>100%</button>
                  </div>
                </div>
              </div>

              {/* Premios */}
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16, marginTop: 8 }}>
                <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 12, color: '#16a34a' }}>Premios</div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Premio presentismo (no faltó ningún día)</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 14, color: '#64748b' }}>$</span>
                      <input type="number" value={premioPresentismo} onChange={e => setPremioPresentismo(Number(e.target.value))} min={0} placeholder="0"
                        style={{ width: 100, border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 14 }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Premio puntualidad (llego a horario)</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 14, color: '#64748b' }}>$</span>
                        <input type="number" value={premioPuntualidad} onChange={e => setPremioPuntualidad(Number(e.target.value))} min={0} placeholder="0"
                          style={{ width: 100, border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 14 }} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 12, color: '#64748b' }}>si llegó a horario</span>
                        <input type="number" value={diasPuntualidad} onChange={e => setDiasPuntualidad(Number(e.target.value))} min={1} max={31}
                          style={{ width: 60, border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 14 }} />
                        <span style={{ fontSize: 12, color: '#64748b' }}>días o más</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Descuentos */}
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16, marginTop: 8 }}>
                <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 12, color: '#dc2626' }}>Descuentos por tardanza</div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Tolerancia (minutos)</div>
                    <input type="number" value={toleranciaTardanza} onChange={e => setToleranciaTardanza(Number(e.target.value))} min={0} max={60}
                      style={{ width: 80, border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 14 }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20 }}>
                    <input type="checkbox" id="descuento" checked={descuentoTardanza} onChange={e => setDescuentoTardanza(e.target.checked)} />
                    <label htmlFor="descuento" style={{ fontSize: 13, color: '#475569' }}>Descontar minutos de tardanza del sueldo</label>
                  </div>
                </div>
              </div>

              {/* Tarifas */}
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16, marginTop: 8 }}>
                <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 10 }}>Valor por hora por empleado</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {empleados.filter(e => !e.es_admin).map(emp => (
                    <div key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 14, minWidth: 150 }}>{emp.nombre}</span>
                      <span style={{ fontSize: 14, color: '#64748b' }}>$</span>
                      <input type="number" value={tarifas[emp.id] || ''} onChange={e => {
                        const val = Number(e.target.value)
                        setTarifas(t => ({ ...t, [emp.id]: val }))
                      }} onBlur={e => guardarTarifaDB(emp.id, Number(e.target.value))} placeholder="0" min={0}
                        style={{ width: 100, border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 14 }} />
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>/ hora</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Tabla liquidacion */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 500, fontSize: 15 }}>Liquidacion — {new Date(mesFiltro+'-02').toLocaleDateString('es-AR',{month:'long',year:'numeric'})}</div>
                <button onClick={exportarExcel} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Exportar Excel</button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 500, color: '#64748b', fontSize: 11, textTransform: 'uppercase' }}>Empleado</th>
                      <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 500, color: '#64748b', fontSize: 11, textTransform: 'uppercase' }}>Dias</th>
                      <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 500, color: '#64748b', fontSize: 11, textTransform: 'uppercase' }}>Hs norm.</th>
                      <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 500, color: '#64748b', fontSize: 11, textTransform: 'uppercase' }}>Hs extra</th>
                      <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 500, color: '#dc2626', fontSize: 11, textTransform: 'uppercase' }}>Tardanza</th>
                      <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 500, color: '#16a34a', fontSize: 11, textTransform: 'uppercase' }}>Premios</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 500, color: '#64748b', fontSize: 11, textTransform: 'uppercase' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empleados.filter(e => !e.es_admin).map(emp => {
                      const l = calcularLiquidacion(emp.id)
                      const tarifa = tarifas[emp.id] || 0
                      if (l.dias === 0 && !tarifa) return null
                      return (
                        <tr key={emp.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px 12px' }}>
                            <div style={{ fontWeight: 500 }}>{emp.nombre}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{tarifa > 0 ? `${fmtPeso(tarifa)}/h` : 'Sin tarifa'}</div>
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                            <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 20, fontSize: 12 }}>{l.dias}/{l.diasLaborables}</span>
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                            <div>{l.hn}h</div>
                            {tarifa > 0 && <div style={{ fontSize: 11, color: '#94a3b8' }}>{fmtPeso(l.tn)}</div>}
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                            <div style={{ color: l.he > 0 ? '#d97706' : '#94a3b8' }}>{l.he}h</div>
                            {tarifa > 0 && l.he > 0 && <div style={{ fontSize: 11, color: '#d97706' }}>{fmtPeso(l.te)}</div>}
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                            {l.tardanzaMin > 0 ? (
                              <div>
                                <span style={{ color: '#dc2626', fontSize: 12 }}>{l.tardanzaMin}min</span>
                                {tarifa > 0 && <div style={{ fontSize: 11, color: '#dc2626' }}>-{fmtPeso(l.tardanzaMin/60*tarifa)}</div>}
                              </div>
                            ) : <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>}
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                              {l.tienePresentismo && premioPresentismo > 0 && (
                                <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: 6, fontSize: 11 }}>
                                  Pres. {fmtPeso(l.bonoPresentismo)}
                                </span>
                              )}
                              {l.tienePuntualidad && premioPuntualidad > 0 && (
                                <span style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 6px', borderRadius: 6, fontSize: 11 }}>
                                  Punt. {fmtPeso(l.bonoPuntualidad)}
                                </span>
                              )}
                              {!l.tienePresentismo && !l.tienePuntualidad && <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>}
                            </div>
                          </td>
                          <td style={{ padding: '12px 12px', textAlign: 'right' }}>
                            {tarifa > 0 ? <span style={{ fontWeight: 600, fontSize: 15, color: '#16a34a' }}>{fmtPeso(l.total)}</span> : <span style={{ fontSize: 12, color: '#94a3b8' }}>Cargar tarifa</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === 'empleados' && (
          <div>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '20px', marginBottom: 20 }}>
              <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 16 }}>Agregar empleado</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                <input value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} placeholder="Nombre completo" style={{ flex: 2, minWidth: 160, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14 }} />
                <input value={nuevoRol} onChange={e => setNuevoRol(e.target.value)} placeholder="Rol" style={{ flex: 1, minWidth: 120, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14 }} />
                <input value={nuevoPin} onChange={e => setNuevoPin(e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="PIN (4 digitos)" maxLength={4} style={{ flex: 1, minWidth: 120, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, letterSpacing: 4 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <input type="checkbox" id="esAdmin" checked={nuevoAdmin} onChange={e => setNuevoAdmin(e.target.checked)} />
                <label htmlFor="esAdmin" style={{ fontSize: 13, color: '#475569' }}>Es administrador</label>
              </div>
              <button onClick={agregarEmpleado} disabled={guardando || !nuevoNombre || nuevoPin.length < 4}
                style={{ background: '#1e293b', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer', opacity: (!nuevoNombre || nuevoPin.length < 4) ? 0.4 : 1 }}>
                {guardando ? 'Guardando...' : 'Agregar'}
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
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => abrirEdicion(emp)} style={{ background: 'none', border: '1px solid #e2e8f0', color: '#475569', borderRadius: 7, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>Editar</button>
                    <button onClick={() => desactivarEmpleado(emp.id)} style={{ background: 'none', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 7, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>Dar de baja</button>
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

  useEffect(() => {
    setEntrada(turno?.hora_entrada?.slice(0,5) || '09:00')
    setSalida(turno?.hora_salida?.slice(0,5) || '17:00')
    setFranco(turno?.es_franco || false)
  }, [turno])

  async function guardar() {
    await onSave(entrada, salida, franco)
    setEditando(false)
  }

  if (!editando) {
    return (
      <td style={{ padding: '8px', textAlign: 'center' }} onClick={() => setEditando(true)}>
        {turno ? (
          turno.es_franco ? (
            <span style={{ background: '#f1f5f9', color: '#64748b', padding: '3px 8px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>Franco</span>
          ) : (
            <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>
              {turno.hora_entrada?.slice(0,5)} - {turno.hora_salida?.slice(0,5)}
            </span>
          )
        ) : (
          <span style={{ color: '#cbd5e1', fontSize: 12, cursor: 'pointer' }}>+ Agregar</span>
        )}
      </td>
    )
  }

  return (
    <td style={{ padding: '6px', textAlign: 'center', background: '#f8fafc' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#64748b' }}>
          <input type="checkbox" checked={franco} onChange={e => setFranco(e.target.checked)} />
          Franco
        </label>
        {!franco && (
          <>
            <input type="time" value={entrada} onChange={e => setEntrada(e.target.value)} style={{ width: 90, border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 6px', fontSize: 12 }} />
            <input type="time" value={salida} onChange={e => setSalida(e.target.value)} style={{ width: 90, border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 6px', fontSize: 12 }} />
          </>
        )}
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={guardar} style={{ background: '#1e293b', color: '#fff', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}>OK</button>
          <button onClick={() => setEditando(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}>X</button>
        </div>
      </div>
    </td>
  )
}
