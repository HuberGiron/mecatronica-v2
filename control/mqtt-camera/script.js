const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const toggleCameraButton = document.getElementById('toggleCameraButton');
const robotSelector = document.getElementById('robotSelector');
const handStatus = document.getElementById('handStatus');

let video = document.createElement('video');
let camera = null;
let cameraActive = false;
let mqttConnected = false;
let selectedRobot = "R1";
let mqttClient = null;

robotSelector.addEventListener('change', () => {
    selectedRobot = robotSelector.value;
});

toggleCameraButton.addEventListener('click', async () => {
    if (!mqttConnected) {
        connectMQTT();
    } else if (!cameraActive) {
        startCamera();
    } else {
        stopCamera();
    }
});

function connectMQTT() {
    handStatus.innerText = "Conectando a MQTT...";
    
    mqttClient = new Paho.MQTT.Client("test.mosquitto.org", 8081, "/mqtt", "cliente_" + Math.random());

    mqttClient.onConnectionLost = (responseObject) => {
        console.log("Conexión perdida: " + responseObject.errorMessage);
        mqttConnected = false;
        handStatus.innerText = "Conexión MQTT perdida";
        toggleCameraButton.innerText = "Conectar a MQTT"; // Si se pierde la conexión, vuelve a mostrar conectar
    };

    mqttClient.connect({
        useSSL: true,
        onSuccess: () => {
            console.log("✅ Conectado a MQTT en test.mosquitto.org");
            mqttConnected = true;
            handStatus.innerText = "MQTT Conectado. Activar cámara.";
            toggleCameraButton.innerText = "Activar Cámara";
        },
        onFailure: (error) => {
            console.error("❌ Error al conectar a MQTT:", error);
            handStatus.innerText = "Error en la conexión MQTT";
        }
    });
}

async function startCamera() {
    if (!mqttConnected) {
        console.error("MQTT no está conectado. Esperando conexión...");
        return;
    }

    toggleCameraButton.innerText = "Desactivar Cámara";
    video.setAttribute('autoplay', '');
    video.setAttribute('playsinline', '');
    video.style.display = 'none';
    document.body.appendChild(video);

    camera = new Camera(video, {
        onFrame: async () => {
            if (hands) {
                await hands.send({ image: video });
            }
        },
        width: 480,
        height: 360
    });
    camera.start();
    cameraActive = true;
}

function stopCamera() {
    toggleCameraButton.innerText = "Activar Cámara";
    if (camera) {
        camera.stop();
    }
    video.remove();
    video = document.createElement('video');
    cameraActive = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    handStatus.innerText = "Cámara desactivada";
}

function sendMQTTCommand(command) {
    if (mqttConnected) {
        const topic = `huber/${selectedRobot}/`;
        const message = new Paho.MQTT.Message(command);
        message.destinationName = topic;
        mqttClient.send(message);
        console.log(`📡 Enviado: "${command}" a ${topic}`);
    } else {
        console.error("❌ No se envió el comando porque MQTT no está conectado.");
    }
}

let hands = null;

window.onload = () => {
    hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.75,
        minTrackingConfidence: 0.75
    });

    hands.onResults((results) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
            handStatus.innerText = "No se detecta ninguna mano";
            sendMQTTCommand("DETENER");
            return;
        }

        let command = "DETENER";

        for (const [index, landmarks] of results.multiHandLandmarks.entries()) {
            drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: 'red', lineWidth: 3 });
            drawLandmarks(ctx, landmarks, { color: 'white', radius: 5 });

            const handType = results.multiHandedness[index].label;
            const isOpen = isHandOpen(landmarks);
            
            if (handType === 'Left') {
                command = isOpen ? "ADELANTE" : "ATRAS";
            } else if (handType === 'Right') {
                command = isOpen ? "IZQUIERDA" : "DERECHA";
            }
        }

        handStatus.innerText = command;
        sendMQTTCommand(command);
    });
};

function isHandOpen(landmarks) {
    const tips = [4, 8, 12, 16, 20];
    return tips.filter(tip => landmarks[tip].y < landmarks[tip - 2].y).length >= 4;
}
