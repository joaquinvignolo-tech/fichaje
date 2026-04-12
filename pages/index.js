import { useState, useEffect } from 'react'
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

export default function Home() {
  const router = useRouter()
  const [empleados, setEmpleados] = useState([])
  const [fichajes, setFichajes] = useState([])
  const [seleccionado, setSeleccionado] = useState(null)
  const [pin, setPin] = useState('')
  const [estado, setEstado] = useState(null) // 'ok' | 'error' | 'ubicacion' | 'lejos' | 'cargando'
  const [hora, setHora] = useState('')
  const [geoError, setGeoError] = useState(false)

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
    const { data: fich } = await supabase.from('fichajes').select('*').gte('hora', new Date().toISOString().slice(0,10)).order('hora', { ascending: false })
    setEmpleados(emps || [])
    setFichajes(fich || [])
  }

  function estaAdentro(empId) {
    const logs = fichajes.filter(f => f.empleado_id === empId)
    if (!logs.length) return false
    return logs[0].accion === 'entrada'
  }

  function seleccionar(emp) {
    setSeleccionado(emp)
    setPin('')
    setEstado(null)
  }

  function presionarPin(digit) {
    if (pin.length < 4) setPin(p => p + digit)
  }

  function borrarPin() {
    setPin(p => p.slice(0, -1))
  }

  async function confirmar() {
    if (pin.length < 4) return
    if (pin !== seleccionado.pin) {
      setEstado('error')
      setPin('')
      setTimeout(() => setEstado(null), 1500)
      return
    }
    setEstado('ubicacion')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const dist = distancia(pos.coords.latitude, pos.coords.longitude, NEGOCIO_LAT, NEGOCIO_LNG)
        if (dist > RADIO_METROS) {
          setEstado('lejos')
          setTimeout(() => { setEstado(null); setPin('') }, 3000)
          return
        }
        const accion = estaAdentro(seleccionado.id) ? 'salida' : 'entrada'
        await supabase.from('fichajes').insert({
          empleado_id: seleccionado.id,
          accion,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        })
        setEstado(accion === 'entrada' ? 'ok_entrada' : 'ok_salida')
        await cargarDatos()
        setTimeout(() => { setSeleccionado(null); setPin(''); setEstado(null) }, 2000)
      },
      () => { setGeoError(true); setEstado('geo_error') },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const fecha = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  const presentes = empleados.filter(e => estaAdentro(e.id)).length

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '0' }}>
      {/* Header */}
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
          <button
            onClick={() => router.push('/admin')}
            style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: '#475569', cursor: 'pointer' }}
          >
            Admin →
          </button>
        </div>
      </div>

      {/* Grid de empleados */}
      {!seleccionado && (
        <div style={{ padding: '24px', maxWidth: 700, margin: '0 auto' }}>
          <div style={{ fontSize: 15, color: '#64748b', marginBottom: 16 }}>Tocá tu nombre para fichar</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
            {empleados.map((emp, i) => {
              const dentro = estaAdentro(emp.id)
              const ci = i % COLORS.length
              return (
                <div
                  key={emp.id}
                  onClick={() => seleccionar(emp)}
                  style={{
                    background: '#fff',
                    border: dentro ? '2px solid #16a34a' : '1px solid #e2e8f0',
                    borderRadius: 14,
                    padding: '20px 12px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'transform 0.1s',
                  }}
                >
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: COLORS[ci], color: TEXT_C[ci], display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 16, margin: '0 auto 10px' }}>
                    {initials(emp.nombre)}
                  </div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{emp.nombre}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{emp.rol}</div>
                  <div style={{ marginTop: 8, display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, background: dentro ? '#dcfce7' : '#f1f5f9', color: dentro ? '#166534' : '#94a3b8' }}>
                    {dentro ? 'Presente' : 'Fuera'}
                  </div>
                </div>
              )
            })}
          </div>
          {empleados.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8', fontSize: 14 }}>
              No hay empleados cargados aún.<br />Entrá al panel admin para agregarlos.
            </div>
          )}
        </div>
      )}

      {/* Pantalla de PIN */}
      {seleccionado && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 73px)', padding: '24px' }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: '32px 28px', width: '100%', maxWidth: 320, textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: COLORS[0], color: TEXT_C[0], display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 18, margin: '0 auto 12px' }}>
              {initials(seleccionado.nombre)}
            </div>
            <div style={{ fontWeight: 600, fontSize: 17 }}>{seleccionado.nombre}</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>
              {estaAdentro(seleccionado.id) ? 'Registrar salida' : 'Registrar entrada'}
            </div>

            {/* Dots */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 24 }}>
              {[0,1,2,3].map(i => (
                <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: i < pin.length ? '#334155' : '#e2e8f0', transition: 'background 0.15s' }} />
              ))}
            </div>

            {/* Mensaje de estado */}
            {estado === 'error' && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>PIN incorrecto</div>}
            {estado === 'ubicacion' && <div style={{ color: '#2563eb', fontSize: 13, marginBottom: 12 }}>Verificando ubicación...</div>}
            {estado === 'lejos' && <div style={{ color: '#d97706', fontSize: 13, marginBottom: 12 }}>Estás muy lejos del negocio para fichar</div>}
            {estado === 'geo_error' && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>Activá la ubicación en tu celular</div>}
            {estado === 'ok_entrada' && <div style={{ color: '#16a34a', fontSize: 14, fontWeight: 500, marginBottom: 12 }}>✓ Entrada registrada</div>}
            {estado === 'ok_salida' && <div style={{ color: '#dc2626', fontSize: 14, fontWeight: 500, marginBottom: 12 }}>✓ Salida registrada</div>}

            {/* Teclado */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
              {[1,2,3,4,5,6,7,8,9].map(n => (
                <button
                  key={n}
                  onClick={() => presionarPin(String(n))}
                  disabled={!!estado}
                  style={{ padding: '16px', fontSize: 20, fontWeight: 500, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, cursor: 'pointer' }}
                >
                  {n}
                </button>
              ))}
              <button onClick={() => seleccionar(null)} style={{ padding: '16px', fontSize: 13, color: '#94a3b8', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, cursor: 'pointer' }}>
                ←
              </button>
              <button
                onClick={() => presionarPin('0')}
                disabled={!!estado}
                style={{ padding: '16px', fontSize: 20, fontWeight: 500, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, cursor: 'pointer' }}
              >
                0
              </button>
              <button onClick={borrarPin} style={{ padding: '16px', fontSize: 18, color: '#64748b', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, cursor: 'pointer' }}>
                ⌫
              </button>
            </div>

            <button
              onClick={confirmar}
              disabled={pin.length < 4 || !!estado}
              style={{ width: '100%', padding: '14px', background: pin.length === 4 && !estado ? (estaAdentro(seleccionado.id) ? '#dc2626' : '#16a34a') : '#e2e8f0', color: pin.length === 4 && !estado ? '#fff' : '#94a3b8', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: pin.length === 4 ? 'pointer' : 'default', transition: 'background 0.15s' }}
            >
              {estaAdentro(seleccionado.id) ? 'Registrar salida' : 'Registrar entrada'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
