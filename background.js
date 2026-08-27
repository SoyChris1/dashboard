const GITHUB_USER = "SoyChris1";
const GITHUB_REPO = "dashboard";
const GITHUB_BRANCH = "master";
const MATCHES_URL = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}/data/output/matches.json`;

chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create("revisar-en-vivo", { periodInMinutes: 5 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "revisar-en-vivo") {
        revisarPartidosEnVivo();
        return;
    }

    if (alarm.name.startsWith("inicio-")) {
        const clave = `alarmData:${alarm.name}`;
        const resultado = await chrome.storage.local.get(clave);
        const datos = resultado[clave];

        if (datos) {
            chrome.notifications.create(alarm.name, {
                type: "basic",
                iconUrl: "icons/icon128.png",
                title: "¡Tu partido está por empezar!",
                message: `${datos.team_a} vs ${datos.team_b} (${datos.league}) empieza en 15 minutos`,
            });
        }

        chrome.storage.local.remove(clave);
    }
});

async function revisarPartidosEnVivo() {
    try {
        const resp = await fetch(MATCHES_URL, { cache: "no-store" });
        if (!resp.ok) return;
        const data = await resp.json();

        const { partidosSeguidos = [] } = await chrome.storage.local.get("partidosSeguidos");
        const { liveNotificados = [] } = await chrome.storage.local.get("liveNotificados");

        if (partidosSeguidos.length === 0) return;

        const todos = Object.values(data.matches || {}).flat();
        const nuevosNotificados = [...liveNotificados];

        for (const clave of partidosSeguidos) {
            const partido = todos.find(m => `${m.game}-${m.id}` === clave);
            if (!partido) continue;

            if (partido.status === "running" && !liveNotificados.includes(clave)) {
                chrome.notifications.create(`live-${clave}`, {
                    type: "basic",
                    iconUrl: "icons/icon128.png",
                    title: "¡EN VIVO!",
                    message: `${partido.team_a} vs ${partido.team_b} ya empezó`,
                });
                nuevosNotificados.push(clave);
            }
        }

        chrome.storage.local.set({ liveNotificados: nuevosNotificados });
    } catch (err) {
        console.warn("No se pudo revisar partidos en vivo:", err);
    }
}
