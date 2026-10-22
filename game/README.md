# Zomboide (prototipo)

Supervivencia zombi 2D con vista desde arriba, inspirada en Project Zomboid.
Motor: **Godot 4.3** (gratis). Un solo proyecto exporta a Steam (Windows/Linux/Mac) y a Android/iOS.

> Estado: primer prototipo escrito sin poder ejecutarlo. Puede tener errores
> pequenos de sintaxis al abrirlo por primera vez; pega el mensaje de la
> consola de Godot y se corrige.

## Como probarlo
1. Descarga Godot 4.3 (https://godotengine.org/download).
2. Abre Godot -> Importar -> elige `game/project.godot` -> F5.

## Controles
- PC: WASD/flechas mover, Shift correr, Espacio o clic atacar, E recoger, 1/2/3 comer/beber/vendar.
- Movil: joystick izquierdo + botones a la derecha (el raton emula el tactil en PC).

## Lo que ya hace
- Hambre, sed, energia y vida; sin comer ni beber pierdes vida.
- Zombis que te oyen segun tu ruido (correr y atacar hacen mas ruido; quieto casi nada).
- Casas con cajas de botin, ciclo dia/noche (1 hora de juego = 60 s) y mas zombis de noche.
- Pantalla de muerte con dias sobrevividos.

## Siguientes pasos sugeridos
1. Arte real (tileset + sprites) y sonido.
2. Armas, durabilidad, heridas/sangrado, craftear.
3. Guardado de partida.
4. Exportar: Proyecto -> Exportar -> Android (necesita JDK + Android SDK) y Windows.
5. Steam: cuenta Steamworks ($100 USD) + plugin GodotSteam.
