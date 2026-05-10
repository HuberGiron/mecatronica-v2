'use strict';
let model, maxPredictions;
let currentStream = null;
let labels = [];
let running = false, lastInfer = 0;
const INFER_MS = 120; // ~8 FPS móvil

const video = document.getElementById('video');
const labelContainer = document.getElementById('label-container');
const cameraSelect = document.getElementById('cameraSelect');
const inputURL = document.getElementById('modelURL');
const btnReset = document.getElementById('btnReset');
const errorBox = document.getElementById('errorBox');

// Canvas oculto para inferencia
const frameCanvas = document.createElement('canvas');
const fctx = frameCanvas.getContext('2d', { willReadFrequently: true });

document.getElementById('btnLoad').addEventListener('click', loadModel);
document.getElementById('btnFront').addEventListener('click', () => switchFacing('user'));
document.getElementById('btnBack').addEventListener('click', () => switchFacing('environment'));
document.getElementById('btnDemo').addEventListener('click', () => {
  inputURL.value = 'https://teachablemachine.withgoogle.com/models/E322Db9VN/';
  inputURL.focus();
});
cameraSelect.addEventListener('change', () => {
  const deviceId = cameraSelect.value;
  if (deviceId) startCamera({ deviceId: { exact: deviceId } });
});
btnReset.addEventListener('click', resetApp);

function showError(msg){
  console.error(msg);
  errorBox.style.display = 'block';
  errorBox.textContent = (typeof msg === 'string') ? msg : (msg?.message || JSON.stringify(msg));
}
function clearError(){ errorBox.style.display = 'none'; errorBox.textContent = ''; }
window.addEventListener('error', (e)=> showError(e.message || e.error));

function isMobile(){ return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent); }

function sanitizeTMURL(raw){
  const s = (raw || '').trim();
  if (!s) throw new Error('URL vacía.');
  const m = s.match(/https?:\/\/teachablemachine\.withgoogle\.com\/models\/([^\/?#\s]+)\/?/i);
  if (!m) throw new Error('La URL debe ser del tipo https://teachablemachine.withgoogle.com/models/XXXXX/');
  return `https://teachablemachine.withgoogle.com/models/${m[1]}/`;
}

async function preflight(base){
  const modelURL = base + 'model.json';
  const metadataURL = base + 'metadata.json';
  const [m, meta] = await Promise.all([
    fetch(modelURL, { mode:'cors' }),
    fetch(metadataURL, { mode:'cors' })
  ]);
  if (!m.ok || !meta.ok) {
    throw new Error(`Preflight falló. model.json: ${m.status} ${m.statusText} | metadata.json: ${meta.status} ${meta.statusText}`);
  }
}

async function initTF(){
  try {
    if (tf.wasm && tf.wasm.setWasmPaths) {
      tf.wasm.setWasmPaths('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@3.21.0/dist/');
    } else if (tf.setWasmPaths) {
      tf.setWasmPaths('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@3.21.0/dist/');
    }
    try { tf.env().set('WASM_HAS_SIMD_SUPPORT', true); } catch(_){}
    try { tf.env().set('WASM_HAS_MULTITHREAD_SUPPORT', true); } catch(_){}

    if (isMobile()) {
      await tf.setBackend('wasm');
    } else {
      try { await tf.setBackend('webgl'); }
      catch { await tf.setBackend('wasm'); }
    }
    await tf.ready();
  } catch (e) {
    await tf.setBackend('cpu');
    await tf.ready();
  }
}

async function loadModel() {
  clearError();
  let base;
  try { base = sanitizeTMURL(inputURL.value); }
  catch(e){ showError(e); return; }

  try {
    await preflight(base);
    await initTF();
    const modelURL = base + 'model.json';
    const metadataURL = base + 'metadata.json';
    model = await tmImage.load(modelURL, metadataURL);
    maxPredictions = model.getTotalClasses();
    labels = (model.getClassLabels && model.getClassLabels()) || [];

    document.getElementById('modelForm').style.display = 'none';
    document.getElementById('app').style.display = 'block';

    await ensurePermissionThenListCameras();
    await startCamera({ facingMode: 'user' });
    await waitForVideoReady();

    resizeFrameCanvas(224, 224);
    buildBars();
    requestAnimationFrame(loop);
  } catch (e) {
    showError(e);
  }
}

function resizeFrameCanvas(w, h){ frameCanvas.width = w; frameCanvas.height = h; }

async function ensurePermissionThenListCameras(){
  try{
    const tmp = await navigator.mediaDevices.getUserMedia({ video:true, audio:false });
    tmp.getTracks().forEach(t=>t.stop());
  }catch(e){}
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cams = devices.filter(d => d.kind === 'videoinput');
  cameraSelect.innerHTML = '';
  cams.forEach((d,i)=>{
    const opt = document.createElement('option');
    opt.value = d.deviceId; opt.textContent = d.label || `Cámara ${i+1}`;
    cameraSelect.appendChild(opt);
  });
  document.getElementById('btnFront').style.display = isMobile() ? 'inline-block' : 'none';
  document.getElementById('btnBack').style.display  = isMobile() ? 'inline-block' : 'none';
}

async function startCamera(videoConstraints){
  try{
    if (currentStream) stopStream(currentStream);
    const stream = await navigator.mediaDevices.getUserMedia({
      video: Object.assign({ width:{ideal:1280}, height:{ideal:720} }, videoConstraints || {}),
      audio:false
    });
    currentStream = stream;
    video.srcObject = stream;
    await video.play();
    btnReset.style.display = 'inline-block';
  }catch(e){
    console.error('Error al iniciar cámara:', e);
    if (videoConstraints?.facingMode){
      try{
        const stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode: videoConstraints.facingMode }, audio:false });
        currentStream = stream; video.srcObject = stream; await video.play();
        btnReset.style.display = 'inline-block';
      }catch(e2){ showError('No se pudo iniciar la cámara seleccionada.'); }
    }else{
      showError('No se pudo iniciar la cámara seleccionada.');
    }
  }
}

function stopStream(stream){ try{ stream.getTracks().forEach(t=>t.stop()); }catch(_){} }

async function switchFacing(mode){
  await startCamera({ facingMode: (mode === 'environment' ? 'environment' : 'user') });
  await waitForVideoReady();
}

async function waitForVideoReady(){
  return new Promise(res=>{
    const ok=()=> (video.readyState>=2 && video.videoWidth>0);
    if (ok()) return res();
    const onReady=()=>{ if(ok()){ video.removeEventListener('loadedmetadata',onReady); video.removeEventListener('loadeddata',onReady); res(); } };
    video.addEventListener('loadedmetadata',onReady);
    video.addEventListener('loadeddata',onReady);
  });
}

function buildBars(){
  labelContainer.innerHTML = '';
  const cls = labels.length ? labels : Array.from({length:maxPredictions},(_,i)=>`Clase ${i+1}`);
  cls.forEach(name=>{
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <div class="bar-label">${name}</div>
      <div class="bar-bg"><div class="bar-fill"></div></div>
      <div class="bar-pct">0%</div>
    `;
    labelContainer.appendChild(row);
  });
}

function getRowByLabel(name){
  return [...labelContainer.querySelectorAll('.bar-row')]
         .find(r => r.querySelector('.bar-label').textContent === name);
}

async function loop(){
  const now = performance.now();
  if (!running && (now - lastInfer) >= INFER_MS) {
    lastInfer = now;
    running = true;
    await predict().catch(showError);
    running = false;
  }
  requestAnimationFrame(loop);
}

async function predict(){
  if (!model || video.readyState < 2 || !video.videoWidth) return;
  fctx.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);

  const preds = await model.predict(frameCanvas);
  const ordered = [...preds].sort((a,b)=> b.probability - a.probability);
  const top = ordered[0];

  const rows = [...labelContainer.querySelectorAll('.bar-row')];
  rows.forEach(r => r.classList.remove('top'));

  preds.forEach(p=>{
    const row = getRowByLabel(p.className);
    if (!row) return;
    const fill = row.querySelector('.bar-fill');
    const pct  = row.querySelector('.bar-pct');
    const val = Math.round(p.probability * 100);
    fill.style.width = val + '%';
    pct.textContent = val + '%';
    if (top && p.className === top.className) row.classList.add('top');
  });
}

async function resetApp(){
  if (currentStream){ stopStream(currentStream); currentStream=null; }
  if (video){ video.pause(); video.srcObject=null; }
  model=null; maxPredictions=0; labels=[];
  labelContainer.innerHTML='';
  document.getElementById('app').style.display='none';
  document.getElementById('modelForm').style.display='block';
  cameraSelect.innerHTML='';
  btnReset.style.display='none';
  clearError();
}

window.addEventListener('beforeunload', ()=>{ if (currentStream) stopStream(currentStream); });
