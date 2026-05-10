import Bluetooth as Bt  # Bluetooth
import cv2  # OpenCV2
import paho.mqtt.client as mqtt  # pip install paho-mqtt
import time

# DEFINIR NÚMERO DE ROBOTS A USAR
num_robots = int(input("Ingrese el número de robots a usar (1-4): "))

R = ["DETENER"] * num_robots

def on_message(client, userdata, msg):
    global R
    topics = ["huber/R1/", "huber/R2/", "huber/R3/", "huber/R4/"]
    for i in range(num_robots):
        if msg.topic == topics[i]:
            R[i] = msg.payload.decode("utf-8")

client = mqtt.Client()
client.connect("test.mosquitto.org", 1883, 60)
for i in range(num_robots):
    client.subscribe(f"huber/R{i+1}/")
client.on_message = on_message
client.loop_start()

# INICIALIZACION ROBOTS Y CAMARA
robot_addresses = [
    "98:D3:21:F7:B5:70",
    "98:D3:31:FA:17:5B",
    "98:D3:71:F6:63:9C",
    "98:D3:21:F7:B4:86"
]

robots = [Bt.connect(robot_addresses[i]) for i in range(num_robots)]

# PARAMETROS ROBOT UNICICLO
wmax = 150  # Velocidad angular máxima
r = 58  # Radio llanta (pixeles)
L = 120  # Distancia entre centros de llantas (pixeles)

# INICIALIZACION DE VALORES ROBOTS
V = [0] * num_robots
W = [0] * num_robots
wd = [0] * num_robots
wi = [0] * num_robots

# FUNCION DE CONTROL DE MOVIMIENTO
def actualizar_movimiento(robot_idx, comando):
    global V, W
    if comando == "DETENER":
        V[robot_idx] = 0
        W[robot_idx] = 0
    elif comando == "ADELANTE":
        V[robot_idx] = 8700
        W[robot_idx] = 0
    elif comando == "ATRAS":
        V[robot_idx] = -8700
        W[robot_idx] = 0
    elif comando == "DERECHA":
        V[robot_idx] = 0
        W[robot_idx] = 70
    elif comando == "IZQUIERDA":
        V[robot_idx] = 0
        W[robot_idx] = -70

while True:
    for i in range(num_robots):
        actualizar_movimiento(i, R[i])
        wd[i] = (V[i] / r) + ((L * W[i]) / (2 * r))
        wi[i] = (V[i] / r) - ((L * W[i]) / (2 * r))
        wd[i] = max(min(wd[i], wmax), -wmax)
        wi[i] = max(min(wi[i], wmax), -wmax)
        Bt.move(robots[i], wd[i], wi[i])
        time.sleep(0.05)  # Retardo reducido a 0.05 segundos para no saturar el Bluetooth
    
    # Mostrar valores de control
    for i in range(num_robots):
        print(f"Robot {i+1}: V={V[i]} W={W[i]} wd={wd[i]} wi={wi[i]}")
    
    k = cv2.waitKey(1) & 0xFF  # Corregido para detectar correctamente la tecla ESC
    if k == 27:  # Presiona ESC para salir
        break

# Detener y desconectar robots
for i in range(num_robots):
    Bt.move(robots[i], 0, 0)
    Bt.disconnect(robots[i])
