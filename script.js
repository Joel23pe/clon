// Variables de estado global
let latInicio = -12.0464; let lonInicio = -77.0302;
let latFin = -12.0945; let lonFin = -77.0321;
let map, markerPasajero, markerDestino, markerTaxi, lineaRuta;
let simulacionInterval; let tarifaGuardada = 0;

// Configuración inicial al cargar la ventana
window.onload = function() {
    const hoy = new Date();
    document.getElementById('fecha-viaje').value = hoy.toISOString().split('T')[0];
    document.getElementById('hora-viaje').value = hoy.toTimeString().split(' ')[0].substring(0, 5);

    // Inicializar mapa Leaflet enfocado en Lima por defecto
    map = L.map('map', { zoomControl: false }).setView([latInicio, lonInicio], 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(map);

    // Recalcular el tamaño del mapa cuando cambia el viewport
    window.addEventListener('resize', () => { if (map) map.invalidateSize(); });

    const mapContainerEl = document.getElementById('map-container');
    if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => { if (map) map.invalidateSize(); });
        ro.observe(mapContainerEl);
    }

    // Refuerzo adicional para navegadores móviles lentos
    [100, 400, 900].forEach(ms => setTimeout(() => { if (map) map.invalidateSize(); }, ms));
};

// Iconos personalizados para los marcadores en el mapa
const iconoPuntoInicio = L.divIcon({ html: '<div class="w-4 h-4 bg-green-500 rounded-full border-4 border-white shadow-lg"></div>', className: 'pin-i' });
const iconoPuntoFin = L.divIcon({ html: '<div class="w-4 h-4 bg-orange-500 rounded-full border-4 border-white shadow-lg"></div>', className: 'pin-f' });

// Marcador del taxi
const iconoTaxi = L.icon({
    iconUrl: 'carrito.png',
    iconSize: [42, 42],
    iconAnchor: [21, 21]
});

// Obtiene una ruta real siguiendo calles (OSRM). Si falla, devuelve línea recta como respaldo.
async function obtenerRutaCallesReales(latO, lonO, latD, lonD) {
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${lonO},${latO};${lonD},${latD}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        if (!res.ok) {
            console.error('OSRM respondió con error HTTP:', res.status);
            return null;
        }
        const data = await res.json();
        if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
            console.error('OSRM no devolvió una ruta válida:', data);
            return null;
        }
        const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        if (coords.length < 2) {
            console.error('OSRM devolvió muy pocos puntos:', coords);
            return null;
        }
        return coords;
    } catch (e) {
        console.error('Error al obtener la ruta real por calles (posible bloqueo de red/CORS):', e);
        return null;
    }
}

// Petición asíncrona de direcciones reales
async function buscarDireccionesReales() {
    const origenText = document.getElementById('origen').value;
    const destinoText = document.getElementById('destino').value;
    const btn = document.getElementById('btn-buscar');

    if (!origenText || !destinoText) { alert('Por favor, ingresa las direcciones.'); return; }
    btn.innerText = "Buscando...";

    // Siempre agregamos contexto de país/región, salvo que el texto YA termine explícitamente en "peru"
    const terminaEnPeru = (txt) => txt.trim().toLowerCase().endsWith('peru');
    const queryOrigen = terminaEnPeru(origenText) ? origenText : `${origenText}, Lima, Peru`;
    const queryDestino = terminaEnPeru(destinoText) ? destinoText : `${destinoText}, Callao, Peru`;

    // Restringimos la búsqueda al área metropolitana de Lima-Callao para evitar resultados de otras regiones/distritos lejanos
    const viewboxLimaCallao = '-77.20,-11.85,-76.85,-12.30'; // izquierda,arriba,derecha,abajo

    try {
        const resInicio = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryOrigen)}&viewbox=${viewboxLimaCallao}&bounded=1&countrycodes=pe&limit=1`);
        const dataInicio = await resInicio.json();
        const resDestino = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryDestino)}&viewbox=${viewboxLimaCallao}&bounded=1&countrycodes=pe&limit=1`);
        const dataDestino = await resDestino.json();

        console.log('Query origen:', queryOrigen, '| Query destino:', queryDestino);

        if (dataInicio.length === 0) {
            console.warn('No se encontró geocodificación para el origen, se usa respaldo aproximado de San Martín de Porres.');
            latInicio = -12.0000; lonInicio = -77.0630; // Av. Eduardo de Habich, San Martín de Porres (aprox.)
        }
        else { latInicio = parseFloat(dataInicio[0].lat); lonInicio = parseFloat(dataInicio[0].lon); }

        if (dataDestino.length === 0) {
            console.warn('No se encontró geocodificación para el destino, se usa respaldo aproximado de Bocanegra, Callao.');
            latFin = -12.0330; lonFin = -77.1080; // Av. Peru, Bocanegra, Callao (aprox.)
        }
        else { latFin = parseFloat(dataDestino[0].lat); lonFin = parseFloat(dataDestino[0].lon); }

        console.log('Coordenadas usadas → Origen:', latInicio, lonInicio, '| Destino:', latFin, lonFin);

        if (markerPasajero) map.removeLayer(markerPasajero);
        if (markerDestino) map.removeLayer(markerDestino);
        if (lineaRuta) map.removeLayer(lineaRuta);

        markerPasajero = L.marker([latInicio, lonInicio], { icon: iconoPuntoInicio }).addTo(map);
        markerDestino = L.marker([latFin, lonFin], { icon: iconoPuntoFin }).addTo(map);
        lineaRuta = L.polyline([[latInicio, lonInicio], [latFin, lonFin]], {color: '#94a3b8', weight: 3, dashArray: '5, 5'}).addTo(map);
        map.invalidateSize();
        map.fitBounds(lineaRuta.getBounds(), { padding: [40, 40] });

        btn.innerText = "Confirmar Solicitud";
        iniciarFlujoApp();
    } catch (e) {
        latInicio = -12.0210; lonInicio = -77.0250;
        latFin = -12.0350; lonFin = -77.0950;
        iniciarFlujoApp();
    }
}

// Formateador: Devuelve fecha + hora estilo "1 de jul., 2:51 pm"
function formatearFechaEstiloReplica(fechaStr, horaStr) {
    const meses = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'];
    const [anio, mesNum, dia] = fechaStr.split('-').map(Number);
    const textoFecha = `${dia} de ${meses[mesNum - 1]}`;

    let [horas, minutos] = horaStr.split(":");
    horas = parseInt(horas);
    let ampm = horas >= 12 ? 'pm' : 'am';
    horas = horas % 12 || 12;

    return `${textoFecha}, ${horas}:${minutos} ${ampm}`;
}

// Control de flujo de pantallas e inyección dinámica con estilos forzados
function iniciarFlujoApp() {
    const destinoText = document.getElementById('destino').value;
    const fechaText = document.getElementById('fecha-viaje').value;
    const horaText = document.getElementById('hora-viaje').value;
    tarifaGuardada = document.getElementById('monto').value;

    // Capturamos el elemento del título de destino
    const h3Destino = document.getElementById('recibo-destino-replica');
    h3Destino.innerText = destinoText;

    // CORRECCIÓN: Forzamos el espacio exacto (Flecha Roja) directo al elemento
    h3Destino.style.setProperty('margin-bottom', '16px', 'important');
    h3Destino.style.setProperty('line-height', '1.1', 'important');

    // Forzamos también que la línea inferior de Express no se mueva de su eje
    const pExpress = document.getElementById('recibo-express-linea');
    if (pExpress) {
        pExpress.style.setProperty('line-height', '1.1', 'important');
        pExpress.style.setProperty('margin-top', '0px', 'important');
    }

    document.getElementById('recibo-costo-replica').innerText = `S/ ${parseFloat(tarifaGuardada).toFixed(2)}`;
    document.getElementById('recibo-tiempo-replica').innerText = formatearFechaEstiloReplica(fechaText, horaText);

    document.getElementById('panel-solicitar').classList.add('hidden');
    document.getElementById('panel-estado').classList.remove('hidden');
    document.getElementById('monto-final').innerText = `S/. ${parseFloat(tarifaGuardada).toFixed(2)}`;

    setTimeout(() => { asignacionYRecogida(); }, 2000);
}

// Simulación: Conductor asignado
function asignacionYRecogida() {
    document.getElementById('status-icon').className = "w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-2xl";
    document.getElementById('status-icon').innerHTML = '<i class="fa-solid fa-car-side"></i>';
    document.getElementById('status-title').innerText = "Conductor en camino";
    document.getElementById('driver-info').classList.remove('hidden');

    let taxiLat = latInicio + 0.003; let taxiLon = lonInicio + 0.003;
    if (markerTaxi) { map.removeLayer(markerTaxi); }
    markerTaxi = L.marker([taxiLat, taxiLon], { icon: iconoTaxi }).addTo(map);

    let paso = 0; const pasosTotales = 30;
    const dLat = (latInicio - taxiLat) / pasosTotales; const dLon = (lonInicio - taxiLon) / pasosTotales;

    simulacionInterval = setInterval(() => {
        if (paso < pasosTotales) {
            taxiLat += dLat; taxiLon += dLon;
            markerTaxi.setLatLng([taxiLat, taxiLon]);
            paso++;
        } else {
            clearInterval(simulacionInterval);
            taxistaLlegoAlOrigen();
        }
    }, 100);
}

function taxistaLlegoAlOrigen() {
    document.getElementById('status-icon').className = "w-16 h-16 bg-green-500 text-white rounded-full flex items-center justify-center text-2xl animate-bounce";
    document.getElementById('status-icon').innerHTML = '<i class="fa-solid fa-bell"></i>';
    document.getElementById('status-title').innerText = "¡Tu taxista ya llegó!";

    const btn = document.getElementById('btn-accion');
    btn.className = "w-full bg-green-600 text-white font-bold py-3 rounded-2xl text-sm";
    btn.innerText = "Abordar y Empezar Viaje";
    btn.setAttribute('onclick', 'iniciarViajeHaciaDestino()');
}

function iniciarViajeHaciaDestino() {
    document.getElementById('status-icon').className = "w-16 h-16 bg-slate-100 text-slate-700 rounded-full flex items-center justify-center text-2xl";
    document.getElementById('status-icon').innerHTML = '<i class="fa-solid fa-route"></i>';
    document.getElementById('status-title').innerText = "Viajando al destino";
    document.getElementById('btn-accion').classList.add('hidden');

    if (lineaRuta) { map.removeLayer(lineaRuta); }
    lineaRuta = L.polyline([[latInicio, lonInicio], [latFin, lonFin]], {color: '#f97316', weight: 5}).addTo(map);

    let paso = 0; const pasosTotales = 30;
    let taxiLat = latInicio; let taxiLon = lonInicio;
    const dLat = (latFin - latInicio) / pasosTotales; const dLon = (lonFin - lonInicio) / pasosTotales;

    simulacionInterval = setInterval(() => {
        if (paso < pasosTotales) {
            taxiLat += dLat; taxiLon += dLon;
            markerTaxi.setLatLng([taxiLat, taxiLon]);
            markerPasajero.setLatLng([taxiLat, taxiLon]);
            paso++;
        } else {
            clearInterval(simulacionInterval);
            finalizarCarreraExitosamente();
        }
    }, 100);
}

async function finalizarCarreraExitosamente() {
    document.getElementById('panel-estado').classList.add('hidden');
    document.getElementById('panel-recibo').classList.remove('hidden');

    // Quitamos el taxi porque el viaje ya terminó
    if (markerTaxi) map.removeLayer(markerTaxi);
    if (lineaRuta) map.removeLayer(lineaRuta);

    // 1) Dibujamos de inmediato una línea recta como base, para que SIEMPRE se vea algo
    lineaRuta = L.polyline([[latInicio, lonInicio], [latFin, lonFin]], {
        color: '#22c55e',
        weight: 5,
        opacity: 0.9
    }).addTo(map);
    map.invalidateSize();
    map.fitBounds(lineaRuta.getBounds(), { padding: [40, 40] });

    // 2) Intentamos mejorarla con la ruta real por calles (OSRM)
    const coordsRutaReal = await obtenerRutaCallesReales(latInicio, lonInicio, latFin, lonFin);
    if (coordsRutaReal) {
        map.removeLayer(lineaRuta);
        lineaRuta = L.polyline(coordsRutaReal, {
            color: '#22c55e',
            weight: 5,
            opacity: 0.9
        }).addTo(map);
        map.invalidateSize();
        map.fitBounds(lineaRuta.getBounds(), { padding: [40, 40] });
    }
    // Si coordsRutaReal es null, se queda la línea recta que ya está dibujada (revisa la consola del navegador para ver el motivo del fallo)
}

function regresarAlInicio() {
    document.getElementById('panel-recibo').classList.add('hidden');
    document.getElementById('panel-solicitar').classList.remove('hidden');
    document.getElementById('btn-accion').classList.remove('hidden');
    map.setView([-12.0464, -77.0302], 13);
    setTimeout(() => map.invalidateSize(), 200);
}

function cancelarViaje() {
    clearInterval(simulacionInterval);
    regresarAlInicio();
}
