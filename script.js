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
};

// Iconos personalizados para los marcadores en el mapa
const iconoPuntoInicio = L.divIcon({ html: '<div class="w-4 h-4 bg-green-500 rounded-full border-4 border-white shadow-lg"></div>', className: 'pin-i' });
const iconoPuntoFin = L.divIcon({ html: '<div class="w-4 h-4 bg-orange-500 rounded-full border-4 border-white shadow-lg"></div>', className: 'pin-f' });

// Marcador del taxi configurado con la nueva carpeta IMAGEN y tu archivo 'carrito.png'
const iconoTaxi = L.icon({
    iconUrl: 'carrito.png',   // Ruta apuntando hacia la carpeta correspondiente
    iconSize: [42, 42],               // Dimensiones en píxeles de la imagen
    iconAnchor: [21, 21]              // Punto medio exacto para el anclaje
});

// Petición asíncrona de coordenadas basadas en la dirección de texto
async function buscarDireccionesReales() {
    const origenText = document.getElementById('origen').value;
    const destinoText = document.getElementById('destino').value;
    const btn = document.getElementById('btn-buscar');

    if (!origenText || !destinoText) { alert('Por favor, ingresa las direcciones.'); return; }
    btn.innerText = "Buscando...";

    const queryOrigen = origenText.toLowerCase().includes("peru") ? origenText : `${origenText}, Lima, Peru`;
    const queryDestino = destinoText.toLowerCase().includes("peru") ? destinoText : `${destinoText}, Lima, Peru`;

    try {
        const resInicio = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryOrigen)}&limit=1`);
        const dataInicio = await resInicio.json();
        const resDestino = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryDestino)}&limit=1`);
        const dataDestino = await resDestino.json();

        if (dataInicio.length === 0) { latInicio = -12.0210; lonInicio = -77.0250; } 
        else { latInicio = parseFloat(dataInicio[0].lat); lonInicio = parseFloat(dataInicio[0].lon); }

        if (dataDestino.length === 0) { latFin = -12.0350; lonFin = -77.0950; } 
        else { latFin = parseFloat(dataDestino[0].lat); lonFin = parseFloat(dataDestino[0].lon); }

        // Limpiar capas previas si existen
        if (markerPasajero) map.removeLayer(markerPasajero);
        if (markerDestino) map.removeLayer(markerDestino);
        if (lineaRuta) map.removeLayer(lineaRuta);

        // Renderizado en mapa de ruta inicial
        markerPasajero = L.marker([latInicio, lonInicio], { icon: iconoPuntoInicio }).addTo(map);
        markerDestino = L.marker([latFin, lonFin], { icon: iconoPuntoFin }).addTo(map);
        lineaRuta = L.polyline([[latInicio, lonInicio], [latFin, lonFin]], {color: '#94a3b8', weight: 3, dashArray: '5, 5'}).addTo(map);
        map.fitBounds(lineaRuta.getBounds(), { padding: [40, 40] });

        btn.innerText = "Confirmar Solicitud";
        iniciarFlujoApp();
    } catch (e) {
        latInicio = -12.0210; lonInicio = -77.0250;
        latFin = -12.0350; lonFin = -77.0950;
        iniciarFlujoApp();
    }
}

// Formateador de fechas para el estilo del recibo final
function formatearFechaEstiloReplica(fechaStr, horaStr) {
    const meses = ["de ene.", "de feb.", "de mar.", "de abr.", "de may.", "de jun.", "de jul.", "de ago.", "de set.", "de oct.", "de nov.", "de dic."];
    const partes = fechaStr.split("-");
    const dia = parseInt(partes[2]);
    const mesText = meses[parseInt(partes[1]) - 1];
    
    let [horas, minutos] = horaStr.split(":");
    horas = parseInt(horas);
    let ampm = horas >= 12 ? 'pm' : 'am';
    horas = horas % 12 || 12;

    return `${dia} ${mesText}, ${horas}:${minutos} ${ampm}`;
}

// Control de flujo de pantallas e inyección de datos de tarifa
function iniciarFlujoApp() {
    const destinoText = document.getElementById('destino').value;
    const fechaText = document.getElementById('fecha-viaje').value;
    const horaText = document.getElementById('hora-viaje').value;
    tarifaGuardada = document.getElementById('monto').value;

    document.getElementById('recibo-destino-replica').innerText = destinoText;
    document.getElementById('recibo-costo-replica').innerText = `S/ ${parseFloat(tarifaGuardada).toFixed(2)}`;
    document.getElementById('recibo-tiempo-replica').innerText = formatearFechaEstiloReplica(fechaText, horaText);

    document.getElementById('panel-solicitar').classList.add('hidden');
    document.getElementById('panel-estado').classList.remove('hidden');
    document.getElementById('monto-final').innerText = `S/. ${parseFloat(tarifaGuardada).toFixed(2)}`;

    setTimeout(() => { asignacionYRecogida(); }, 2000);
}

// Simulación: Conductor asignado viajando hacia el punto de origen
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

// Evento: Conductor llega al origen del usuario
function taxistaLlegoAlOrigen() {
    document.getElementById('status-icon').className = "w-16 h-16 bg-green-500 text-white rounded-full flex items-center justify-center text-2xl animate-bounce";
    document.getElementById('status-icon').innerHTML = '<i class="fa-solid fa-bell"></i>';
    document.getElementById('status-title').innerText = "¡Tu taxista ya llegó!";

    const btn = document.getElementById('btn-accion');
    btn.className = "w-full bg-green-600 text-white font-bold py-3 rounded-2xl text-sm";
    btn.innerText = "Abordar y Empezar Viaje";
    btn.setAttribute('onclick', 'iniciarViajeHaciaDestino()');
}

// Simulación: Trayecto en movimiento hacia el destino final
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

// Conclusión del viaje y paso a la ventana de recibo
function finalizarCarreraExitosamente() {
    document.getElementById('panel-estado').classList.add('hidden');
    document.getElementById('panel-recibo').classList.remove('hidden');
    if (lineaRuta) map.removeLayer(lineaRuta);
    if (markerTaxi) map.removeLayer(markerTaxi);
}

// Reinicio del layout para una nueva consulta
function regresarAlInicio() {
    document.getElementById('panel-recibo').classList.add('hidden');
    document.getElementById('panel-solicitar').classList.remove('hidden');
    document.getElementById('btn-accion').classList.remove('hidden');
    map.setView([-12.0464, -77.0302], 13);
}

// Cancelación activa por parte del usuario
function cancelarViaje() {
    clearInterval(simulacionInterval);
    regresarAlInicio();
}
