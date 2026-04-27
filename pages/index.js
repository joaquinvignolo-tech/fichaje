import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/router'

const NEGOCIO_LAT = parseFloat(process.env.NEXT_PUBLIC_NEGOCIO_LAT)
const NEGOCIO_LNG = parseFloat(process.env.NEXT_PUBLIC_NEGOCIO_LNG)
const RADIO_METROS = parseFloat(process.env.NEXT_PUBLIC_RADIO_METROS) || 150

function distancia(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

const COLORS = ['#dbeafe','#dcfce7','#fce7f3','#fef9c3','#ede9fe','#ffedd5']
const TEXT_C = ['#1e40af','#166534','#9d174d','#854d0e','#5b21b6','#9a3412']

function initials(name) {
  return name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()
}

function esMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export default function Home() {
  const router = useRouter()
  const [empleados, setEmpleados] = useState([])
  const [fichajes, setFichajes] = useState([])
  const [seleccionado, setSeleccionado] = useState(null)
  const [modoHistorial, setModoHistorial] = useState(false)
  const [pin, setPin] = useState('')
  const [estado, setEstado] = useState(null)
  const [hora, setHora] = useState('')
  const [fotoCapturada, setFotoCapturada] = useState(null)
  const [esperandoFoto, setEsperandoFoto] = useState(false)
  const [viendoHistorial, setViendoHistorial] = useState(false)
  const [historialEmpleado, setHistorialEmpleado] = useState([])
  const [empleadoActual, setEmpleadoActual] = useState(null)
  const [webcamActiva, setWebcamActiva] = useState(false)
  const fileInputRef = useRef(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)

  useEffect(() => {
    cargarDatos()
    const iv = setInterval(() => {
      setHora(new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }))
    }, 1000)
    setHora(new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }))
    return () => clearInterval(iv)
  }, [])

  async function cargarDatos() {
    const { data: emps } = await supabase.from('empleados').select('*').eq('activo', true).eq('es_admin', false).order('nombre')
    // Traer ultimas 20 horas para capturar turnos nocturnos que empezaron ayer
    const hace20hs = new Date(Date.now() - 20 * 3600000).toISOString()
    const { data: fich } = await supabase.from('fichajes').select('*').gte('hora', hace20hs).order('hora', { ascending: false })
    setEmpleados(emps || [])
    setFichajes(fich || [])
  }

  async function cargarHistorial(emp) {
    const inicio = new Date(); inicio.setDate(1); inicio.setHours(0,0,0,0)
    const { data } = await supabase.from('fichajes').select('*').eq('empleado_id', emp.id).gte('hora', inicio.toISOString()).order('hora', { ascending: false })
    setHistorialEmpleado(data || [])
    setEmpleadoActual(emp)
    setViendoHistorial(true)
  }

  function calcularHorasMes(logs) {
    const sorted = [...logs].sort((a,b) => new Date(a.hora)-new Date(b.hora))
    let total = 0
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].accion === 'entrada' && sorted[i+1].accion === 'salida')
        total += new Date(sorted[i+1].hora) - new Date(sorted[i].hora)
    }
    const h = Math.floor(total/3600000); const m = Math.floor((total%3600000)/60000)
    return `${h}h ${m}m`
  }

  // Detecta si tiene entrada sin salida (turno nocturno: busca en ultimas 18hs)
  function tieneEntradaSinSalida(empId) {
    const logs = [...fichajes].filter(f => f.empleado_id === empId).sort((a,b) => new Date(b.hora)-new Date(a.hora))
    if (!logs.length) return null
    if (logs[0].accion === 'entrada') {
      const diff = new Date() - new Date(logs[0].hora)
      if (diff < 18 * 3600000) return logs[0]
    }
    return null
  }

  function estaAdentro(empId) {
    const logs = [...fichajes].filter(f => f.empleado_id === empId).sort((a,b) => new Date(b.hora)-new Date(a.hora))
    if (!logs.length) return false
    return logs[0].accion === 'entrada'
  }

  function seleccionar(emp, historial = false) {
    setSeleccionado(emp)
    setModoHistorial(historial)
    setPin('')
    setEstado(null)
    setFotoCapturada(null)
    setEsperandoFoto(false)
    setViendoHistorial(false)
    detenerWebcam()
  }

  function presionarPin(digit) {
    if (pin.length < 4) setPin(p => p + digit)
  }

  function borrarPin() { setPin(p => p.slice(0, -1)) }

  async function abrirCamara() {
    if (esMobile()) {
      fileInputRef.current && fileInputRef.current.click()
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } })
        streamRef.current = stream
        setWebcamActiva(true)
        setTimeout(() => {
          if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play() }
        }, 100)
      } catch(e) {
        fileInputRef.current && fileInputRef.current.click()
      }
    }
  }

  function sacarFotoWebcam() {
    if (!videoRef.current || !canvasRef.current) return
    const canvas = canvasRef.current
    canvas.width = 320; canvas.height = 240
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0, 320, 240)
    const foto = canvas.toDataURL('image/jpeg', 0.8)
    setFotoCapturada(foto)
    detenerWebcam()
    setEsperandoFoto(false)
  }

  function detenerWebcam() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setWebcamActiva(false)
  }

  function handleFotoSeleccionada(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => { setFotoCapturada(ev.target.result); setEsperandoFoto(false) }
    reader.readAsDataURL(file)
  }

  async function subirFoto(dataUrl, nombre) {
    try {
      const blob = await (await fetch(dataUrl)).blob()
      const filename = `${nombre}-${Date.now()}.jpg`
      const { error } = await supabase.storage.from('fichajes-fotos').upload(filename, blob, { contentType: 'image/jpeg' })
      if (error) return null
      const { data: urlData } = supabase.storage.from('fichajes-fotos').getPublicUrl(filename)
      return urlData.publicUrl
    } catch(e) { return null }
  }

  async function confirmar() {
    if (pin.length < 4) return
    if (pin !== seleccionado.pin) {
      setEstado('error'); setPin('')
      setTimeout(() => setEstado(null), 1500)
      return
    }
    if (modoHistorial) {
      await cargarHistorial(seleccionado)
      setSeleccionado(null); setPin(''); setEstado(null)
      return
    }
    // Verificar si tiene entrada sin salida y quiere entrar de nuevo
    const entradaAbierta = tieneEntradaSinSalida(seleccionado.id)
    if (entradaAbierta && !estaAdentro(seleccionado.id) === false && estaAdentro(seleccionado.id) === true) {
      // tiene entrada activa → quiere salir, dejarlo pasar normal
    } else if (entradaAbierta && !estaAdentro(seleccionado.id)) {
      // no deberia pasar pero por las dudas
    }
    // Si esta adentro quiere salir → OK normal
    // Si NO esta adentro pero tiene entrada abierta en las ultimas 18hs → bloquear
    if (!estaAdentro(seleccionado.id) && entradaAbierta) {
      setEstado('bloqueado_entrada')
      return
    }
    await confirmarFichaje(estaAdentro(seleccionado.id) ? 'salida' : 'entrada')
  }

  async function confirmarFichaje(accionForzada) {
    if (!fotoCapturada) {
      setEsperandoFoto(true)
      await abrirCamara()
      return
    }
    setEstado('ubicacion')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const dist = distancia(pos.coords.latitude, pos.coords.longitude, NEGOCIO_LAT, NEGOCIO_LNG)
        if (dist > RADIO_METROS) {
          setEstado('lejos')
          setTimeout(() => { setEstado(null); setPin(''); setFotoCapturada(null) }, 3000)
          return
        }
        let fotoUrl = null
        if (fotoCapturada) fotoUrl = await subirFoto(fotoCapturada, seleccionado.nombre.replace(' ', '_'))
        const accion = accionForzada || (estaAdentro(seleccionado.id) ? 'salida' : 'entrada')
        await supabase.from('fichajes').insert({ empleado_id: seleccionado.id, accion, lat: pos.coords.latitude, lng: pos.coords.longitude, foto_url: fotoUrl })
        setEstado(accion === 'entrada' ? 'ok_entrada' : 'ok_salida')
        await cargarDatos()
        const emp = seleccionado
        setTimeout(async () => {
          setSeleccionado(null); setPin(''); setEstado(null); setFotoCapturada(null)
          await cargarHistorial(emp)
        }, 1500)
      },
      () => { setEstado('geo_error') },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  function fmtFecha(iso) {
    return new Date(iso).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
  }
  function fmtHoraStr(iso) {
    return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  const fecha = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  const presentes = empleados.filter(e => estaAdentro(e.id)).length

  const historialPorDia = {}
  historialEmpleado.forEach(f => {
    const dia = new Date(f.hora).toISOString().slice(0,10)
    if (!historialPorDia[dia]) historialPorDia[dia] = []
    historialPorDia[dia].push(f)
  })

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <input ref={fileInputRef} type="file" accept="image/*" capture="user" style={{ display: 'none' }} onChange={handleFotoSeleccionada} />

      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{hora}</div>
          <div style={{ fontSize: 13, color: '#64748b', textTransform: 'capitalize' }}>{fecha}</div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ background: '#f1f5f9', borderRadius: 10, padding: '8px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#64748b' }}>Presentes</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#16a34a' }}>{presentes}</div>
          </div>
          <button onClick={() => router.push('/admin')} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: '#475569', cursor: 'pointer' }}>Admin →</button>
        </div>
      </div>

      {/* Historial personal */}
      {viendoHistorial && empleadoActual && (
        <div style={{ maxWidth: 500, margin: '0 auto', padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <button onClick={() => { setViendoHistorial(false); setEmpleadoActual(null) }}
              style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#475569' }}>←</button>
            <div>
              <div style={{ fontWeight: 600, fontSize: 17 }}>Mis horas — {empleadoActual.nombre}</div>
              <div style={{ fontSize: 13, color: '#64748b' }}>Este mes: {calcularHorasMes(historialEmpleado)}</div>
            </div>
          </div>
          {Object.keys(historialPorDia).sort((a,b) => b.localeCompare(a)).map(dia => {
            const logs = historialPorDia[dia].sort((a,b) => new Date(a.hora)-new Date(b.hora))
            let horasDia = 0
            for (let i = 0; i < logs.length-1; i++) {
              if (logs[i].accion==='entrada' && logs[i+1].accion==='salida')
                horasDia += new Date(logs[i+1].hora) - new Date(logs[i].hora)
            }
            const h = Math.floor(horasDia/3600000); const m = Math.floor((horasDia%3600000)/60000)
            return (
              <div key={dia} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontWeight: 500, fontSize: 14, textTransform: 'capitalize' }}>{fmtFecha(dia+'T12:00:00')}</div>
                  {horasDia > 0 && <span style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 10px', borderRadius: 20, fontSize: 12 }}>{h}h {m}m</span>}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {logs.map(l => (
                    <span key={l.id} style={{ padding: '3px 10px', borderRadius: 8, fontSize: 13, background: l.accion==='entrada'?'#dcfce7':'#fee2e2', color: l.accion==='entrada'?'#166534':'#991b1b' }}>
                      {l.accion==='entrada'?'Entrada':'Salida'} {fmtHoraStr(l.hora)}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
          {Object.keys(historialPorDia).length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8', fontSize: 14 }}>Sin registros este mes.</div>
          )}
        </div>
      )}

      {/* Grid empleados */}
      {!seleccionado && !viendoHistorial && (
        <div style={{ padding: '24px', maxWidth: 700, margin: '0 auto' }}>
          <div style={{ fontSize: 15, color: '#64748b', marginBottom: 16 }}>Toca tu nombre para fichar</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
            {empleados.map((emp, i) => {
              const dentro = estaAdentro(emp.id)
              const ci = i % COLORS.length
              return (
                <div key={emp.id} style={{ background: '#fff', border: dentro ? '2px solid #16a34a' : '1px solid #e2e8f0', borderRadius: 14, padding: '20px 12px', textAlign: 'center' }}>
                  <div onClick={() => seleccionar(emp, false)} style={{ cursor: 'pointer' }}>
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: COLORS[ci], color: TEXT_C[ci], display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 16, margin: '0 auto 10px' }}>
                      {initials(emp.nombre)}
                    </div>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{emp.nombre}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{emp.rol}</div>
                    <div style={{ marginTop: 8, display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, background: dentro ? '#dcfce7' : '#f1f5f9', color: dentro ? '#166534' : '#94a3b8' }}>
                      {dentro ? 'Presente' : 'Fuera'}
                    </div>
                  </div>
                  <button onClick={() => seleccionar(emp, true)}
                    style={{ marginTop: 8, width: '100%', background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 0', fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
                    Ver mis horas
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* PIN */}
      {seleccionado && !viendoHistorial && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 73px)', padding: '24px' }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: '32px 28px', width: '100%', maxWidth: 340, textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: COLORS[0], color: TEXT_C[0], display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 18, margin: '0 auto 12px' }}>
              {initials(seleccionado.nombre)}
            </div>
            <div style={{ fontWeight: 600, fontSize: 17 }}>{seleccionado.nombre}</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
              {modoHistorial ? 'Ingresa tu PIN para ver tus horas' : estaAdentro(seleccionado.id) ? 'Registrar salida' : 'Registrar entrada'}
            </div>

            {/* Aviso bloqueo entrada sin salida — solo visible despues de PIN correcto */}
            {estado === 'bloqueado_entrada' && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ background: '#fef2f2', border: '0.5px solid #fca5a5', borderRadius: 10, padding: '14px', marginBottom: 14, textAlign: 'left' }}>
                  <div style={{ fontWeight: 500, color: '#991b1b', fontSize: 14, marginBottom: 4 }}>Tenes una entrada sin salida</div>
                  <div style={{ fontSize: 13, color: '#b91c1c' }}>
                    Entraste a las {fmtHoraStr(tieneEntradaSinSalida(seleccionado.id)?.hora)}. Registra tu salida antes de volver a entrar.
                  </div>
                </div>
                <button onClick={async () => {
                  setEstado(null)
                  await confirmarFichaje('salida')
                }} style={{ width: '100%', padding: '14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
                  Registrar salida
                </button>
                <button onClick={() => { setSeleccionado(null); setPin(''); setEstado(null) }}
                  style={{ marginTop: 8, width: '100%', padding: '10px', background: 'none', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, color: '#64748b', cursor: 'pointer' }}>
                  Cancelar
                </button>
              </div>
            )}

            {esperandoFoto && !fotoCapturada && !webcamActiva && (
              <div style={{ marginBottom: 16, padding: '16px', background: '#f1f5f9', borderRadius: 10 }}>
                <div style={{ fontSize: 14, color: '#475569', marginBottom: 12 }}>Saca una foto para continuar</div>
                <button onClick={abrirCamara}
                  style={{ width: '100%', padding: '12px', background: '#1e293b', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                  Abrir camara
                </button>
              </div>
            )}

            {webcamActiva && (
              <div style={{ marginBottom: 16 }}>
                <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', borderRadius: 10, background: '#000' }} />
                <canvas ref={canvasRef} style={{ display: 'none' }} />
                <button onClick={sacarFotoWebcam}
                  style={{ marginTop: 8, width: '100%', padding: '12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                  Sacar foto
                </button>
                <button onClick={() => { detenerWebcam(); setEsperandoFoto(false) }}
                  style={{ marginTop: 6, width: '100%', padding: '8px', background: 'none', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, color: '#64748b', cursor: 'pointer' }}>
                  Cancelar
                </button>
              </div>
            )}

            {fotoCapturada && (
              <div style={{ marginBottom: 16 }}>
                <img src={fotoCapturada} style={{ width: '100%', borderRadius: 10, maxHeight: 200, objectFit: 'cover' }} alt="foto" />
                <button onClick={() => { setFotoCapturada(null); setEsperandoFoto(false) }}
                  style={{ marginTop: 8, background: 'none', border: 'none', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
                  Sacar otra foto
                </button>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 20 }}>
              {[0,1,2,3].map(i => (
                <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: i < pin.length ? '#334155' : '#e2e8f0' }} />
              ))}
            </div>

            {estado === 'error' && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>PIN incorrecto</div>}
            {estado === 'ubicacion' && <div style={{ color: '#2563eb', fontSize: 13, marginBottom: 12 }}>Verificando ubicacion...</div>}
            {estado === 'lejos' && <div style={{ color: '#d97706', fontSize: 13, marginBottom: 12 }}>Estas muy lejos del negocio</div>}
            {estado === 'geo_error' && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>Activa la ubicacion en tu celu</div>}
            {estado === 'ok_entrada' && <div style={{ color: '#16a34a', fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Entrada registrada</div>}
            {estado === 'ok_salida' && <div style={{ color: '#dc2626', fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Salida registrada</div>}

            {!esperandoFoto && !webcamActiva && estado !== 'bloqueado_entrada' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                  {[1,2,3,4,5,6,7,8,9].map(n => (
                    <button key={n} onClick={() => presionarPin(String(n))} disabled={!!estado && estado !== 'error'}
                      style={{ padding: '16px', fontSize: 20, fontWeight: 500, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, cursor: 'pointer' }}>{n}</button>
                  ))}
                  <button onClick={() => setSeleccionado(null)} style={{ padding: '16px', fontSize: 13, color: '#94a3b8', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, cursor: 'pointer' }}>Atras</button>
                  <button onClick={() => presionarPin('0')} disabled={!!estado && estado !== 'error'}
                    style={{ padding: '16px', fontSize: 20, fontWeight: 500, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, cursor: 'pointer' }}>0</button>
                  <button onClick={borrarPin} style={{ padding: '16px', fontSize: 18, color: '#64748b', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, cursor: 'pointer' }}>X</button>
                </div>
                <button onClick={confirmar} disabled={pin.length < 4 || (!!estado && estado !== 'error')}
                  style={{ width: '100%', padding: '14px', background: pin.length === 4 && !estado ? (modoHistorial ? '#2563eb' : estaAdentro(seleccionado.id) ? '#dc2626' : '#16a34a') : '#e2e8f0', color: pin.length === 4 && !estado ? '#fff' : '#94a3b8', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: pin.length === 4 ? 'pointer' : 'default' }}>
                  {modoHistorial ? 'Ver mis horas' : estaAdentro(seleccionado.id) ? 'Registrar salida' : 'Registrar entrada'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
