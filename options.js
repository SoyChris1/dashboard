const PAISES_LATAM = [
    { codigo: "MX", nombre: "México" },
    { codigo: "GT", nombre: "Guatemala" },
    { codigo: "HN", nombre: "Honduras" },
    { codigo: "SV", nombre: "El Salvador" },
    { codigo: "NI", nombre: "Nicaragua" },
    { codigo: "CR", nombre: "Costa Rica" },
    { codigo: "PA", nombre: "Panamá" },
    { codigo: "CU", nombre: "Cuba" },
    { codigo: "DO", nombre: "República Dominicana" },
    { codigo: "CO", nombre: "Colombia" },
    { codigo: "VE", nombre: "Venezuela" },
    { codigo: "EC", nombre: "Ecuador" },
    { codigo: "PE", nombre: "Perú" },
    { codigo: "BO", nombre: "Bolivia" },
    { codigo: "PY", nombre: "Paraguay" },
    { codigo: "CL", nombre: "Chile" },
    { codigo: "AR", nombre: "Argentina" },
    { codigo: "UY", nombre: "Uruguay" },
    { codigo: "BR", nombre: "Brasil" },
];

function poblarSelector() {
    const select = document.getElementById('selector-pais');
    select.innerHTML = `<option value="">— Selecciona —</option>` +
        PAISES_LATAM.map(p => `<option value="${p.codigo}">${p.nombre}</option>`).join('');
}

function mostrarGuardado() {
    const aviso = document.getElementById('guardado');
    aviso.classList.add('visible');
    setTimeout(() => aviso.classList.remove('visible'), 1500);
}

function init() {
    poblarSelector();
    const select = document.getElementById('selector-pais');

    chrome.storage.sync.get(['paisCodigo'], (result) => {
        if (result.paisCodigo) select.value = result.paisCodigo;
    });

    select.addEventListener('change', () => {
        chrome.storage.sync.set({ paisCodigo: select.value || null }, mostrarGuardado);
    });
}

document.addEventListener('DOMContentLoaded', init);
