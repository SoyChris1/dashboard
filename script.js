

const GITHUB_USER = "SoyChris1";
const GITHUB_REPO = "dashboard";
const GITHUB_BRANCH = "master";

const MATCHES_URL = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}/data/output/matches.json`;
const PATCHES_URL = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}/data/output/patches.json`;

let juegoActivo = "valorant";
let vistaActiva = "parches"; 
let datosPartidos = null;
let datosParches = null;


function actualizarReloj() {
    const el = document.getElementById('reloj');
    if (!el) return;
    const ahora = new Date();
    const h = String(ahora.getHours()).padStart(2, '0');
    const m = String(ahora.getMinutes()).padStart(2, '0');
    const s = String(ahora.getSeconds()).padStart(2, '0');
    el.textContent = `${h}:${m}:${s}`;
}


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


function formatearFecha(isoString) {
    if (!isoString) return "Fecha no disponible";
    const fecha = new Date(isoString);
    if (isNaN(fecha.getTime())) return "Fecha no disponible";
    return fecha.toLocaleString('es-MX', {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit'
    });
}


function renderParches() {
    const panel = document.getElementById('content-panel');
    const parche = datosParches?.patches?.[juegoActivo];

    if (!parche || !parche.title) {
        panel.innerHTML = `<div class="empty-state">Sin datos de parche disponibles.</div>`;
        return;
    }

    panel.innerHTML = `
        <div class="patch-card">
            ${parche.image ? `<img class="patch-preview" src="${parche.image}" alt="Preview del parche">` : ''}
            <div class="patch-title">${parche.title}</div>
            <div class="patch-meta">${parche.date ? formatearFecha(parche.date) : ''}</div>
            ${parche.description ? `<div class="patch-desc">${parche.description}</div>` : ''}
            ${parche.url ? `<a class="patch-link" href="${parche.url}" target="_blank" rel="noopener">Ver notas completas →</a>` : ''}
        </div>
    `;
}

function renderPartidos() {
    const panel = document.getElementById('content-panel');
    const partidos = datosPartidos?.matches?.[juegoActivo] || [];

    if (partidos.length === 0) {
        panel.innerHTML = `<div class="empty-state">No hay partidos próximos registrados.</div>`;
        return;
    }

    panel.innerHTML = partidos.map(p => `
        <div class="match-row">
            <div>
                <div class="match-teams">${p.team_a} vs ${p.team_b}</div>
                <div class="match-meta">${p.league || p.tournament || 'Torneo'}</div>
            </div>
            <div class="match-meta">${formatearFecha(p.begin_at)}</div>
        </div>
    `).join('');
}

function renderContenido() {
    if (vistaActiva === "parches") renderParches();
    else renderPartidos();
}

function renderEstado(matchesInfo, patchesInfo) {
    const estado = document.getElementById('estado-actualizacion');
    if (matchesInfo.fromCache || patchesInfo.fromCache) {
        estado.textContent = '⚠️ Mostrando última copia guardada (sin conexión a los datos más recientes)';
    } else {
        const generado = datosParches?.generated_at || datosPartidos?.generated_at;
        estado.textContent = generado ? `Última actualización: ${formatearFecha(generado)}` : '';
    }
}


function activarNavegacion() {
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


async function init() {
    actualizarReloj();
    setInterval(actualizarReloj, 1000);
    activarNavegacion();

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
