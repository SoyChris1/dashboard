// ---------------------------------------------------------------------------
// CONFIGURACIÓN
// ---------------------------------------------------------------------------
const GITHUB_USER = "SoyChris1";
const GITHUB_REPO = "dashboard";
const GITHUB_BRANCH = "master";

const MATCHES_URL = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}/data/output/matches.json`;
const PATCHES_URL = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}/data/output/patches.json`;

const PAISES_LATAM = [
    { codigo: "MX", nombre: "México", zona: "America/Mexico_City", idioma: "es" },
    { codigo: "GT", nombre: "Guatemala", zona: "America/Guatemala", idioma: "es" },
    { codigo: "HN", nombre: "Honduras", zona: "America/Tegucigalpa", idioma: "es" },
    { codigo: "SV", nombre: "El Salvador", zona: "America/El_Salvador", idioma: "es" },
    { codigo: "NI", nombre: "Nicaragua", zona: "America/Managua", idioma: "es" },
    { codigo: "CR", nombre: "Costa Rica", zona: "America/Costa_Rica", idioma: "es" },
    { codigo: "PA", nombre: "Panamá", zona: "America/Panama", idioma: "es" },
    { codigo: "CU", nombre: "Cuba", zona: "America/Havana", idioma: "es" },
    { codigo: "DO", nombre: "República Dominicana", zona: "America/Santo_Domingo", idioma: "es" },
    { codigo: "CO", nombre: "Colombia", zona: "America/Bogota", idioma: "es" },
    { codigo: "VE", nombre: "Venezuela", zona: "America/Caracas", idioma: "es" },
    { codigo: "EC", nombre: "Ecuador", zona: "America/Guayaquil", idioma: "es" },
    { codigo: "PE", nombre: "Perú", zona: "America/Lima", idioma: "es" },
    { codigo: "BO", nombre: "Bolivia", zona: "America/La_Paz", idioma: "es" },
    { codigo: "PY", nombre: "Paraguay", zona: "America/Asuncion", idioma: "es" },
    { codigo: "CL", nombre: "Chile", zona: "America/Santiago", idioma: "es" },
    { codigo: "AR", nombre: "Argentina", zona: "America/Argentina/Buenos_Aires", idioma: "es" },
    { codigo: "UY", nombre: "Uruguay", zona: "America/Montevideo", idioma: "es" },
    { codigo: "BR", nombre: "Brasil", zona: "America/Sao_Paulo", idioma: "pt" },
];

const TRADUCCIONES = {
    es: {
        parches: "Parches",
        partidos: "Partidos",
        verNotas: "Ver notas completas →",
        sinParche: "Sin datos de parche disponibles.",
        sinPartidos: "No hay partidos próximos registrados.",
        ultimaActualizacion: "Última actualización",
        sinConexion: "⚠️ Mostrando última copia guardada (sin conexión a los datos más recientes)",
        modalTitulo: "PAÍS",
        modalDesc: "Selecciona tu país para ajustar el horario y el idioma:",
        localeFecha: "es-MX",
        enVivo: "EN VIVO",
        verTransmision: "▶ Ver transmisión",
    },
    pt: {
        parches: "Patches",
        partidos: "Partidas",
        verNotas: "Ver notas completas →",
        sinParche: "Sem dados de patch disponíveis.",
        sinPartidos: "Não há partidas próximas registradas.",
        ultimaActualizacion: "Última atualização",
        sinConexion: "⚠️ Mostrando a última cópia salva (sem conexão com os dados mais recentes)",
        modalTitulo: "PAÍS",
        modalDesc: "Selecione seu país para ajustar o horário e o idioma:",
        localeFecha: "pt-BR",
        enVivo: "AO VIVO",
        verTransmision: "▶ Assistir transmissão",
    },
};

let juegoActivo = "valorant";
let vistaActiva = "parches"; // "parches" | "partidos"
let datosPartidos = null;
let datosParches = null;
let paisSeleccionado = null; // objeto de PAISES_LATAM, o null = automático
let partidosSeguidosSet = new Set();

// ---------------------------------------------------------------------------
// RELOJ
// ---------------------------------------------------------------------------
function actualizarReloj() {
    const el = document.getElementById('reloj');
    if (!el) return;
    const ahora = new Date();
    const h = String(ahora.getHours()).padStart(2, '0');
    const m = String(ahora.getMinutes()).padStart(2, '0');
    const s = String(ahora.getSeconds()).padStart(2, '0');
    el.textContent = `${h}:${m}:${s}`;
}

// ---------------------------------------------------------------------------
// TRAER DATOS (con caché local de respaldo)
// ---------------------------------------------------------------------------
async function obtenerJSON(url, storageKey) {
    try {
        const resp = await fetch(url, { cache: "no-store" });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (chrome?.storage?.local) chrome.storage.local.set({ [storageKey]: data });
        return { data, fromCache: false };
    } catch (err) {
        console.warn(`No se pudo obtener ${url}:`, err);
        if (chrome?.storage?.local) {
            const cached = await new Promise((resolve) => {
                chrome.storage.local.get([storageKey], (r) => resolve(r[storageKey]));
            });
            if (cached) return { data: cached, fromCache: true };
        }
        return { data: null, fromCache: false };
    }
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
function idiomaActual() {
    return paisSeleccionado ? paisSeleccionado.idioma : "es";
}

function t(clave) {
    return TRADUCCIONES[idiomaActual()][clave];
}

async function cargarPartidosSeguidos() {
    if (!chrome?.storage?.local) return;
    const { partidosSeguidos = [] } = await chrome.storage.local.get("partidosSeguidos");
    partidosSeguidosSet = new Set(partidosSeguidos);
}

function guardarPartidosSeguidos() {
    if (chrome?.storage?.local) {
        chrome.storage.local.set({ partidosSeguidos: Array.from(partidosSeguidosSet) });
    }
}

function elegirStream(p) {
    const streams = p.streams || [];
    if (streams.length === 0) return null;

    const idioma = idiomaActual();
    return streams.find(s => s.language === idioma)
        || streams.find(s => s.official)
        || streams[0];
}

function claveDePartido(p) {
    return `${p.game}-${p.id}`;
}

function alternarSeguirPartido(p) {
    const clave = claveDePartido(p);
    const alarmName = `inicio-${clave}`;

    if (partidosSeguidosSet.has(clave)) {
        partidosSeguidosSet.delete(clave);
        if (chrome?.alarms) chrome.alarms.clear(alarmName);
        if (chrome?.storage?.local) chrome.storage.local.remove(`alarmData:${alarmName}`);
    } else {
        partidosSeguidosSet.add(clave);

        if (chrome?.alarms && p.begin_at) {
            const momentoAviso = new Date(p.begin_at).getTime() - 15 * 60 * 1000;
            chrome.alarms.create(alarmName, { when: momentoAviso });
        }

        if (chrome?.storage?.local) {
            chrome.storage.local.set({
                [`alarmData:${alarmName}`]: {
                    team_a: p.team_a,
                    team_b: p.team_b,
                    league: p.league || p.tournament || "",
                },
            });
        }
    }

    guardarPartidosSeguidos();
    renderPartidos();
}

function formatearFecha(isoString) {
    if (!isoString) return "Fecha no disponible";
    const fecha = new Date(isoString);
    if (isNaN(fecha.getTime())) return "Fecha no disponible";

    const opciones = {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit'
    };

    if (paisSeleccionado) opciones.timeZone = paisSeleccionado.zona;

    return fecha.toLocaleString(t("localeFecha"), opciones);
}

async function cargarPaisGuardado() {
    if (!chrome?.storage?.sync) return;
    const result = await new Promise((resolve) => {
        chrome.storage.sync.get(['paisCodigo'], resolve);
    });
    if (result.paisCodigo) {
        paisSeleccionado = PAISES_LATAM.find(p => p.codigo === result.paisCodigo) || null;
    }
}

function aplicarTextosEstaticos() {
    document.querySelector('[data-view="parches"] span:last-child').textContent = t("parches");
    document.querySelector('[data-view="partidos"] span:last-child').textContent = t("partidos");
    document.getElementById('modal-titulo').textContent = t("modalTitulo");
    document.getElementById('modal-desc').textContent = t("modalDesc");
}

// ---------------------------------------------------------------------------
// RENDER
// ---------------------------------------------------------------------------
function renderParches() {
    const panel = document.getElementById('content-panel');
    const parche = datosParches?.patches?.[juegoActivo];

    if (!parche || !parche.title) {
        panel.innerHTML = `<div class="empty-state">${t("sinParche")}</div>`;
        return;
    }

    panel.innerHTML = `
        <div class="patch-card">
            ${parche.image ? `<img class="patch-preview" src="${parche.image}" alt="Preview del parche">` : ''}
            <div class="patch-title">${parche.title}</div>
            <div class="patch-meta">${parche.date ? formatearFecha(parche.date) : ''}</div>
            ${parche.description ? `<div class="patch-desc">${parche.description}</div>` : ''}
            ${parche.url ? `<a class="patch-link" href="${parche.url}" target="_blank" rel="noopener">${t("verNotas")}</a>` : ''}
        </div>
    `;
}

function renderPartidos() {
    const panel = document.getElementById('content-panel');
    const partidos = datosPartidos?.matches?.[juegoActivo] || [];

    if (partidos.length === 0) {
        panel.innerHTML = `<div class="empty-state">${t("sinPartidos")}</div>`;
        return;
    }

    panel.innerHTML = partidos.map(p => {
        const seguido = partidosSeguidosSet.has(claveDePartido(p));
        const enVivo = p.status === "running";
        const stream = enVivo ? elegirStream(p) : null;

        return `
        <div class="match-row">
            <div>
                <div class="match-teams">
                    ${p.team_a} vs ${p.team_b}
                    ${enVivo ? `<span class="live-badge">${t("enVivo")}</span>` : ''}
                </div>
                <div class="match-meta">${p.league || p.tournament || 'Torneo'}</div>
                ${stream ? `<a class="watch-btn" href="${stream.url}" target="_blank" rel="noopener">${t("verTransmision")}</a>` : ''}
            </div>
            <div style="display:flex; align-items:center; gap:12px;">
                <div class="match-meta">${formatearFecha(p.begin_at)}</div>
                <button class="seguir-btn" data-clave="${claveDePartido(p)}">${seguido ? '★' : '☆'}</button>
            </div>
        </div>
        `;
    }).join('');

    panel.querySelectorAll('.seguir-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const partido = partidos.find(p => claveDePartido(p) === btn.dataset.clave);
            if (partido) alternarSeguirPartido(partido);
        });
    });
}

function renderContenido() {
    if (vistaActiva === "parches") renderParches();
    else renderPartidos();
}

function renderEstado(matchesInfo, patchesInfo) {
    const estado = document.getElementById('estado-actualizacion');
    if (matchesInfo.fromCache || patchesInfo.fromCache) {
        estado.textContent = t("sinConexion");
    } else {
        const generado = datosParches?.generated_at || datosPartidos?.generated_at;
        estado.textContent = generado ? `${t("ultimaActualizacion")}: ${formatearFecha(generado)}` : '';
    }
}

// ---------------------------------------------------------------------------
// NAVEGACIÓN
// ---------------------------------------------------------------------------
function poblarSelectorPais() {
    const select = document.getElementById('selector-pais');
    select.innerHTML = `<option value="">— Selecciona —</option>` +
        PAISES_LATAM.map(p => `<option value="${p.codigo}">${p.nombre}</option>`).join('');
    if (paisSeleccionado) select.value = paisSeleccionado.codigo;
}

function activarModal() {
    const overlay = document.getElementById('modal-overlay');
    const btnOpciones = document.getElementById('btn-opciones');
    const btnCerrar = document.getElementById('cerrar-modal');
    const selectPais = document.getElementById('selector-pais');

    if (btnOpciones) {
        btnOpciones.addEventListener('click', () => {
            poblarSelectorPais();
            overlay.classList.remove('oculto');
        });
    }

    if (btnCerrar) {
        btnCerrar.addEventListener('click', () => overlay.classList.add('oculto'));
    }

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.add('oculto');
    });

    selectPais.addEventListener('change', () => {
        const codigo = selectPais.value;
        paisSeleccionado = PAISES_LATAM.find(p => p.codigo === codigo) || null;

        if (chrome?.storage?.sync) {
            chrome.storage.sync.set({ paisCodigo: codigo || null });
        }

        aplicarTextosEstaticos();
        renderContenido();
        overlay.classList.add('oculto');
    });
}

function activarNavegacion() {
    activarModal();

    document.querySelectorAll('.game-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.game-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            juegoActivo = btn.dataset.game;
            renderContenido();
        });
    });

    document.querySelectorAll('.side-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.side-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            vistaActiva = btn.dataset.view;
            renderContenido();
        });
    });
}

// ---------------------------------------------------------------------------
// INIT
// ---------------------------------------------------------------------------
async function init() {
    actualizarReloj();
    setInterval(actualizarReloj, 1000);
    activarNavegacion();
    await cargarPaisGuardado();
    await cargarPartidosSeguidos();
    aplicarTextosEstaticos();

    const [matchesInfo, patchesInfo] = await Promise.all([
        obtenerJSON(MATCHES_URL, 'matches_cache'),
        obtenerJSON(PATCHES_URL, 'patches_cache'),
    ]);

    datosPartidos = matchesInfo.data;
    datosParches = patchesInfo.data;

    renderContenido();
    renderEstado(matchesInfo, patchesInfo);
}

document.addEventListener('DOMContentLoaded', init);
