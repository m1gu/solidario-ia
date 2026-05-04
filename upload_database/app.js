/* ============================================================
   Banco Solidario Cobros - Upload Database
   ============================================================ */

// ---- Column mapping: input header -> SQL column name ----
const COLUMN_MAP = {
    // Campos esperados del TXT de Altiva
    numerooperacion: 'num_operacion',
    identificacion: 'cedula',
    nombres: 'nombre',
    apellidos: 'apellido',
    telefono1: 'telefono1',
    telefono2: 'telefono2',
    telefono3: 'telefono3',
    telefono4: 'telefono4',
    telefono5: 'telefono5',
    telefono6: 'telefono6',
    valorcompletocuota: 'monto',
    fechaproximovencimiento: 'fecha_vencimiento',
    diasvencido: 'dias_retraso',
    dias_retraso: 'dias_retraso',
    producto: 'producto',

    // Alias compatibles
    num_operacion: 'num_operacion',
    numero_operacion: 'num_operacion',
    cedula: 'cedula',
    nombre: 'nombre',
    apellido: 'apellido',
    monto: 'monto',
    fecha_vencimiento: 'fecha_vencimiento',
};

// Integer columns (need parseInt)
const INT_COLUMNS = new Set(['intentos_llamada', 'win_tries', 'telefono_index']);

// Float columns (need parseFloat)
const FLOAT_COLUMNS = new Set(['monto']);

// Date columns (store as YYYY-MM-DD)
const DATE_COLUMNS = new Set(['fecha_vencimiento']);

// Campos que se suben desde archivo y se muestran en preview
const UPLOAD_COLUMNS = [
    'num_operacion',
    'cedula',
    'nombre',
    'apellido',
    'telefono1',
    'telefono2',
    'telefono3',
    'telefono4',
    'telefono5',
    'telefono6',
    'monto',
    'fecha_vencimiento',
    'dias_retraso',
    'producto',
    // Estado del flujo: si no viene en el archivo se fija a 'PENDIENTE' en mapRowToColumns()
    'estado_flujo',
];

// ---- Hardcoded Supabase credentials (local use only) ----
const SUPABASE_URL = 'https://suokpkpzpfvadwemxzfa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1b2twa3B6cGZ2YWR3ZW14emZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkyNjM0ODgsImV4cCI6MjA3NDgzOTQ4OH0.bSMXRoVj_5vjIftDV1VcjauQQhYhK5AL7fz3VFln72A';
const TABLE_NAME = 'solidario_registros_DUP';

// ---- State ----
let supabaseClient = null;
let parsedData = [];
let fileHeaders = [];
let dryRunMode = false;

// ---- DOM Elements (initialized in init()) ----
let connectionStatus, statusText;
let tabUpload, viewUpload;
let dropZone, fileInput, fileInfo, fileName, fileMeta;
let btnClearFile, previewSection, previewHead, previewBody;
let rowCount, actionSection, actionTitle, btnUpload;
let progressSection, progressBar, progressText, progressCount;
let resultSection, resultContent, processingOverlay;

const $ = (sel) => document.querySelector(sel);

// ---- Initialize ----
document.addEventListener('DOMContentLoaded', init);

function init() {
    connectionStatus = $('#connectionStatus');
    statusText = $('.status-text');
    tabUpload = $('#tabUpload');
    viewUpload = $('#viewUpload');
    dropZone = $('#dropZone');
    fileInput = $('#fileInput');
    fileInfo = $('#fileInfo');
    fileName = $('#fileName');
    fileMeta = $('#fileMeta');
    btnClearFile = $('#btnClearFile');
    previewSection = $('#previewSection');
    previewHead = $('#previewHead');
    previewBody = $('#previewBody');
    rowCount = $('#rowCount');
    actionSection = $('#actionSection');
    actionTitle = $('#actionTitle');
    btnUpload = $('#btnUpload');
    progressSection = $('#progressSection');
    progressBar = $('#progressBar');
    progressText = $('#progressText');
    progressCount = $('#progressCount');
    resultSection = $('#resultSection');
    resultContent = $('#resultContent');
    processingOverlay = $('#processingOverlay');

    connectToSupabase();

    tabUpload.addEventListener('click', () => showView('upload'));

    fileInput.addEventListener('change', handleFileSelect);
    btnClearFile.addEventListener('click', handleClearFile);
    btnUpload.addEventListener('click', handleUpload);

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', (e) => {
        if (!dropZone.contains(e.relatedTarget)) {
            dropZone.classList.remove('drag-over');
        }
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) processFile(file);
    });

    const dryRunCheck = $('#dryRunCheck');
    if (dryRunCheck) {
        dryRunCheck.addEventListener('change', (e) => {
            dryRunMode = e.target.checked;
        });
    }
}

function showView(view) {
    tabUpload.classList.toggle('active', view === 'upload');
    viewUpload.classList.toggle('hidden', view !== 'upload');
}

// ---- Supabase Connection ----
async function connectToSupabase() {
    setConnectionStatus('loading', 'Conectando...');

    try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        // Validar contra la tabla real (la raiz /rest/v1/ puede responder 401 para anon)
        const { error } = await supabaseClient.from(TABLE_NAME).select('num_operacion').limit(1);
        if (error) {
            const status = error?.code || error?.status || '';
            if (String(status).includes('401') || String(status).includes('403')) {
                setConnectionStatus('error', 'Credenciales o permisos invalidos');
            } else {
                setConnectionStatus('error', `Error tabla: ${error.message || 'desconocido'}`);
            }
            return;
        }

        setConnectionStatus('connected', 'Conectado');
    } catch (err) {
        setConnectionStatus('error', 'Sin conexion');
        console.error('Connection error:', err);
    }
}

function setConnectionStatus(state, text) {
    connectionStatus.className = 'connection-status ' + state;
    statusText.textContent = text;
}

// ---- File Handling ----
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) processFile(file);
}

async function processFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();

    if (!['xlsx', 'csv', 'txt'].includes(ext)) {
        alert('Formato no soportado. Usa .xlsx, .csv o .txt');
        return;
    }

    fileInfo.classList.remove('hidden');
    fileName.textContent = file.name;
    fileMeta.textContent = `${formatFileSize(file.size)} · ${ext.toUpperCase()}`;

    dropZone.classList.add('processing');
    processingOverlay.classList.remove('hidden');

    try {
        await new Promise((r) => setTimeout(r, 100));

        if (ext === 'xlsx') {
            await parseXLSX(file);
        } else if (ext === 'txt') {
            await parseTXT(file);
        } else {
            await parseCSV(file);
        }

        parsedData = prepareRowsForUpload(parsedData);
        fileHeaders = [...UPLOAD_COLUMNS];

        if (parsedData.length === 0) {
            throw new Error('No hay filas validas con num_operacion para subir');
        }

        showPreview();
        showActionSection();
    } catch (err) {
        alert('Error al leer el archivo: ' + err.message);
        console.error(err);
        handleClearFile();
    } finally {
        processingOverlay.classList.add('hidden');
        dropZone.classList.remove('processing');
        if (parsedData.length > 0) {
            dropZone.style.display = 'none';
        }
    }
}

async function parseXLSX(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];

                let maxRow = 0;
                for (const key in sheet) {
                    if (key[0] === '!') continue;
                    try {
                        const cell = XLSX.utils.decode_cell(key);
                        if (cell.r > maxRow) maxRow = cell.r;
                    } catch (_ignored) {}
                }

                const range = XLSX.utils.decode_range(sheet['!ref']);
                if (maxRow < range.e.r) {
                    range.e.r = maxRow;
                    sheet['!ref'] = XLSX.utils.encode_range(range);
                }

                const jsonDataRaw = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
                const jsonDataDisplay = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

                // Preserve Excel-displayed text for keys mapped to num_operacion.
                // This keeps leading zeros when the sheet shows them (e.g. 0034559693).
                const jsonData = jsonDataRaw.map((row, idx) => {
                    const displayRow = jsonDataDisplay[idx] || {};
                    const patched = { ...row };
                    for (const header of Object.keys(row)) {
                        const normalizedHeader = normalizeHeader(header);
                        if (COLUMN_MAP[normalizedHeader] === 'num_operacion') {
                            const shown = displayRow[header];
                            if (shown !== null && shown !== undefined && String(shown).trim() !== '') {
                                patched[header] = String(shown).trim();
                            }
                        }
                    }
                    return patched;
                });

                const filteredData = jsonData.filter((row) =>
                    Object.values(row).some((val) => val !== null && val !== undefined && String(val).trim() !== ''),
                );

                if (filteredData.length === 0) {
                    reject(new Error('El archivo no contiene datos validos'));
                    return;
                }

                fileHeaders = Object.keys(filteredData[0]);
                parsedData = filteredData;
                resolve();
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

async function parseCSV(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const lines = text.split(/\r?\n/).filter((l) => l.trim());

                if (lines.length < 2) {
                    reject(new Error('El archivo esta vacio o no tiene datos'));
                    return;
                }

                fileHeaders = parseCSVLine(lines[0]);
                parsedData = [];

                for (let i = 1; i < lines.length; i++) {
                    const values = parseCSVLine(lines[i]);
                    const row = {};
                    fileHeaders.forEach((h, idx) => {
                        row[h] = values[idx] || '';
                    });

                    if (Object.values(row).some((v) => String(v).trim() !== '')) {
                        parsedData.push(row);
                    }
                }

                if (parsedData.length === 0) {
                    reject(new Error('El archivo no contiene datos validos'));
                    return;
                }

                resolve();
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = reject;
        reader.readAsText(file, 'UTF-8');
    });
}

async function parseTXT(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = String(e.target.result || '');
                const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');

                if (lines.length < 2) {
                    reject(new Error('El archivo .txt esta vacio o no tiene datos'));
                    return;
                }

                fileHeaders = lines[0].split('\t').map((h) => String(h || '').replace(/^\uFEFF/, '').trim());
                parsedData = [];

                for (let i = 1; i < lines.length; i++) {
                    const values = lines[i].split('\t');
                    const row = {};
                    fileHeaders.forEach((h, idx) => {
                        row[h] = values[idx] || '';
                    });

                    if (Object.values(row).some((v) => String(v).trim() !== '')) {
                        parsedData.push(row);
                    }
                }

                if (parsedData.length === 0) {
                    reject(new Error('El archivo .txt no contiene datos validos'));
                    return;
                }

                resolve();
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = reject;
        reader.readAsText(file, 'UTF-8');
    });
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if ((char === ',' || char === ';') && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

function handleClearFile() {
    parsedData = [];
    fileHeaders = [];
    fileInput.value = '';
    fileInfo.classList.add('hidden');
    dropZone.style.display = '';
    previewSection.classList.add('hidden');
    actionSection.classList.add('hidden');
    progressSection.classList.add('hidden');
    resultSection.classList.add('hidden');
}

// ---- Preview ----
function showPreview() {
    previewSection.classList.remove('hidden');
    rowCount.textContent = `${parsedData.length.toLocaleString()} filas`;

    const maxCols = Math.min(fileHeaders.length, 10);
    const maxRows = Math.min(parsedData.length, 5);

    let headerHTML = '<tr>';
    for (let i = 0; i < maxCols; i++) {
        headerHTML += `<th>${escapeHTML(fileHeaders[i])}</th>`;
    }
    if (fileHeaders.length > maxCols) {
        headerHTML += `<th>... +${fileHeaders.length - maxCols} cols</th>`;
    }
    headerHTML += '</tr>';
    previewHead.innerHTML = headerHTML;

    let bodyHTML = '';
    for (let r = 0; r < maxRows; r++) {
        bodyHTML += '<tr>';
        for (let c = 0; c < maxCols; c++) {
            let val = parsedData[r][fileHeaders[c]];
            if (val instanceof Date) {
                val = val.toISOString().split('T')[0];
            }
            bodyHTML += `<td>${escapeHTML(String(val ?? ''))}</td>`;
        }
        if (fileHeaders.length > maxCols) {
            bodyHTML += '<td>...</td>';
        }
        bodyHTML += '</tr>';
    }
    if (parsedData.length > maxRows) {
        bodyHTML += `<tr><td colspan="${maxCols + 1}" style="text-align:center;color:var(--text-muted);font-style:italic;">... ${(parsedData.length - maxRows).toLocaleString()} filas mas</td></tr>`;
    }
    previewBody.innerHTML = bodyHTML;
}

function showActionSection() {
    actionSection.classList.remove('hidden');
    actionTitle.textContent = `Listo para cargar ${parsedData.length.toLocaleString()} filas`;
    const tableDisplay = $('#tableNameDisplay');
    if (tableDisplay) tableDisplay.textContent = TABLE_NAME;
    btnUpload.disabled = false;
    progressSection.classList.add('hidden');
    resultSection.classList.add('hidden');
}

// ---- Upload ----
async function handleUpload() {
    if (!supabaseClient) {
        alert('Primero conecta a Supabase');
        return;
    }

    if (parsedData.length === 0) {
        alert('No hay datos para cargar');
        return;
    }

    btnUpload.disabled = true;
    progressSection.classList.remove('hidden');
    resultSection.classList.add('hidden');

    const BATCH_SIZE = 500;
    const totalInputRows = parsedData.length;
    const preparedRows = dedupeRowsByNumOperacion(parsedData);
    const totalRows = preparedRows.length;
    let inserted = 0;
    let errors = [];
    const dryRun = dryRunMode;

    for (let i = 0; i < totalRows; i += BATCH_SIZE) {
        const mappedBatch = preparedRows.slice(i, i + BATCH_SIZE);

        if (dryRun) {
            await new Promise((r) => setTimeout(r, 30));
        } else {
            try {
                const { error } = await supabaseClient.from(TABLE_NAME).upsert(mappedBatch, {
                    onConflict: 'num_operacion',
                    ignoreDuplicates: false,
                });

                if (error) {
                    errors.push(`Lote ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
                } else {
                    inserted += mappedBatch.length;
                }
            } catch (err) {
                errors.push(`Lote ${Math.floor(i / BATCH_SIZE) + 1}: ${err.message}`);
            }
        }

        const progress = Math.min(((i + mappedBatch.length) / totalRows) * 100, 100);
        progressBar.style.width = progress + '%';
        progressText.textContent = Math.round(progress) + '%';
        progressCount.textContent = `${Math.min(i + mappedBatch.length, totalRows).toLocaleString()} / ${totalRows.toLocaleString()} filas`;

        await new Promise((r) => setTimeout(r, 50));
    }

    showResult(inserted, errors, totalRows, totalInputRows, dryRun);
}

function showResult(inserted, errors, total, totalInputRows = total, dryRun = false) {
    resultSection.classList.remove('hidden');
    const deduped = Math.max(0, totalInputRows - total);
    const dedupeNote = deduped > 0 ? `<br><span class="result-detail">Se deduplicaron ${deduped.toLocaleString()} filas por num_operacion.</span>` : '';
    const dryRunNote = dryRun ? `<br><span class="result-detail" style="color:var(--warning);">MODO PRUEBA - No se ejecutaron cambios en la base de datos</span>` : '';

    if (errors.length === 0) {
        resultSection.className = 'result-section success';
        resultContent.innerHTML = `
            <span class="result-icon">${dryRun ? 'D' : 'OK'}</span>
            <span class="result-title">${dryRun ? 'Simulacion completada' : 'Carga completada'}</span>
            <span class="result-detail">Se procesarian ${total.toLocaleString()} filas en la base de datos${dryRun ? ' (sin cambios reales)' : ''}.</span>
            ${dedupeNote}
            ${dryRunNote}
        `;
    } else if (inserted > 0 || dryRun) {
        resultSection.className = dryRun ? 'result-section warning' : 'result-section error';
        resultContent.innerHTML = `
            <span class="result-icon">!</span>
            <span class="result-title">${dryRun ? 'Simulacion con advertencias' : 'Carga parcial'}</span>
            <span class="result-detail">
                Se procesarian ${total.toLocaleString()} filas${dryRun ? ' (sin cambios reales)' : ''}.<br>
                Errores esperados (${errors.length}):<br>
                ${errors.map((e) => `- ${escapeHTML(e)}`).join('<br>')}
            </span>
            ${dedupeNote}
            ${dryRunNote}
        `;
    } else {
        resultSection.className = 'result-section error';
        resultContent.innerHTML = `
            <span class="result-icon">X</span>
            <span class="result-title">Error en la carga</span>
            <span class="result-detail">
                No se pudieron insertar datos.<br>
                ${errors.map((e) => `- ${escapeHTML(e)}`).join('<br>')}
            </span>
            ${dedupeNote}
        `;
    }

    btnUpload.disabled = false;
}

function mapRowToColumns(row) {
    const mapped = {};

    for (const [excelHeader, value] of Object.entries(row)) {
        const normalizedHeader = normalizeHeader(excelHeader);
        const sqlColumn = COLUMN_MAP[normalizedHeader];
        if (!sqlColumn) continue;

        let finalValue = value;

        if (value instanceof Date) {
            finalValue = value.toISOString().replace('T', ' ').substring(0, 19);
        }

        if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
            finalValue = String(value);
        }

        if (finalValue === null || finalValue === undefined || finalValue === '') {
            finalValue = null;
        } else {
            finalValue = String(finalValue).trim();
        }

        if (INT_COLUMNS.has(sqlColumn) && finalValue !== null) {
            const parsed = parseInt(finalValue, 10);
            finalValue = Number.isNaN(parsed) ? null : parsed;
        }

        if (FLOAT_COLUMNS.has(sqlColumn) && finalValue !== null) {
            const normalizedNumber = finalValue.replace(',', '.');
            const parsed = parseFloat(normalizedNumber);
            if (Number.isNaN(parsed)) {
                finalValue = null;
            } else {
                // Normaliza monto a dos decimales (ej. 220.5 -> 220.50)
                finalValue = sqlColumn === 'monto' ? Number(parsed.toFixed(2)) : parsed;
            }
        }

        if (DATE_COLUMNS.has(sqlColumn) && finalValue !== null) {
            finalValue = toISODate(finalValue);
        }

        mapped[sqlColumn] = finalValue;
    }

    // Implementación Escenario B para forzar reintento y continuar llamadas
    // Si no viene estado en el archivo, forzamos PENDIENTE
    if (mapped.estado_flujo == null || mapped.estado_flujo === '') {
        mapped.estado_flujo = 'PENDIENTE';
    }
    
    // Anulamos tiempos de espera y contadores de franja para que llame de inmediato
    mapped.fecha_reagenda = null;
    mapped.fecha_ultima_llamada = null;
    mapped.win_tries = 0;

    // NOTA (Escenario B): NO forzamos 'intentos_llamada', 'telefono_index' ni 'win_stamp'. 
    // De esta manera, si es un UPSERT (actualización), Supabase respetará los valores que ya tenía,
    // y el flujo continuará marcando al teléfono que tocaba sin exceder el límite global.
    // Si es un registro nuevo (INSERT), n8n manejará los NULL como 0 automáticamente.

    return mapped;
}

function prepareRowsForUpload(rawRows) {
    const mapped = rawRows
        .map((row) => mapRowToColumns(row))
        .filter((row) => String(row.num_operacion ?? '').trim() !== '')
        .map((row) => {
            const picked = {};
            UPLOAD_COLUMNS.forEach((col) => {
                picked[col] = row[col] ?? null;
            });
            
            // Incluir campos forzados del Escenario B que no están en UPLOAD_COLUMNS
            if (row.win_tries !== undefined) picked.win_tries = row.win_tries;
            if (row.fecha_ultima_llamada !== undefined) picked.fecha_ultima_llamada = row.fecha_ultima_llamada;
            if (row.fecha_reagenda !== undefined) picked.fecha_reagenda = row.fecha_reagenda;

            return picked;
        });

    return dedupeRowsByNumOperacion(mapped);
}

function dedupeRowsByNumOperacion(rows) {
    const byOperacion = new Map();
    rows.forEach((row) => {
        const key = String(row.num_operacion ?? '').trim();
        if (!key) return;
        // Si viene repetido en el archivo, conservar la ultima fila.
        byOperacion.set(key, row);
    });
    return [...byOperacion.values()];
}

// ---- Utilities ----
function parseDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

function toISODate(value) {
    const d = parseDate(value);
    if (!d) return null;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function formatDateTime(value) {
    const d = parseDate(value);
    if (!d) return '-';
    return d.toLocaleString('es-EC', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function normalizeText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function formatMoney(amount) {
    return new Intl.NumberFormat('es-EC', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Number(amount) || 0);
}

function normalizeHeader(header) {
    return String(header || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_')
        .toLowerCase()
        .trim();
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
