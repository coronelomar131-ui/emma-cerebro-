extends Node2D

const WORLD := 3200
const PlayerScript := preload("res://player.gd")
const ZombieScript := preload("res://zombie.gd")
const HudScript := preload("res://hud.gd")

var player: CharacterBody2D
var hud: CanvasLayer
var tint: CanvasModulate
var hour := 8.0
var total_hours := 0.0
var crates: Array[ColorRect] = []
var spawn_t := 0.0


func _ready() -> void:
	randomize()
	var center := Vector2(WORLD / 2.0, WORLD / 2.0)

	tint = CanvasModulate.new()
	add_child(tint)

	for i in 16:
		_make_house(_random_pos(center, 350.0))
	for i in 25:
		_make_crate(_random_pos(center, 150.0), 1)
	for i in 45:
		_spawn_zombie(_random_pos(center, 500.0))

	player = CharacterBody2D.new()
	player.set_script(PlayerScript)
	player.position = center
	add_child(player)
	player.died.connect(_on_player_died)

	hud = CanvasLayer.new()
	hud.set_script(HudScript)
	add_child(hud)
	hud.setup(self, player)

	var cam: Camera2D = player.get_child(-1)
	cam.limit_left = 0
	cam.limit_top = 0
	cam.limit_right = WORLD
	cam.limit_bottom = WORLD


func _random_pos(avoid: Vector2, min_dist: float) -> Vector2:
	var p := Vector2.ZERO
	for i in 20:
		p = Vector2(randf_range(150, WORLD - 150), randf_range(150, WORLD - 150))
		if p.distance_to(avoid) > min_dist:
			break
	return p


func _process(delta: float) -> void:
	# 1 hora de juego = 60 s reales
	hour = fmod(hour + delta / 60.0, 24.0)
	total_hours += delta / 60.0
	var daylight := clampf(cos((hour - 13.0) / 24.0 * TAU) + 0.3, 0.0, 1.0)
	tint.color = Color(0.12, 0.14, 0.3).lerp(Color.WHITE, daylight)

	# de noche aparecen mas zombis fuera de la pantalla
	if is_night() and not player.dead:
		spawn_t -= delta
		if spawn_t <= 0.0 and get_tree().get_nodes_in_group("zombies").size() < 70:
			spawn_t = 6.0
			var p: Vector2 = player.position + Vector2.from_angle(randf() * TAU) * 700.0
			_spawn_zombie(p.clamp(Vector2(50, 50), Vector2(WORLD - 50, WORLD - 50)))


func is_night() -> bool:
	return hour < 6.0 or hour >= 20.0


func days_survived() -> int:
	return int(total_hours / 24.0)


func _draw() -> void:
	draw_rect(Rect2(0, 0, WORLD, WORLD), Color(0.2, 0.32, 0.18))
	var grid := Color(0, 0, 0, 0.06)
	for i in range(0, WORLD + 1, 100):
		draw_line(Vector2(i, 0), Vector2(i, WORLD), grid)
		draw_line(Vector2(0, i), Vector2(WORLD, i), grid)


# ---- Mundo ----

func _make_house(pos: Vector2) -> void:
	var w := 220.0
	var h := 180.0
	var t := 12.0
	var door := 60.0
	add_child(_floor(Rect2(pos, Vector2(w, h))))
	_wall(Rect2(pos, Vector2(w, t)))                                  # arriba
	_wall(Rect2(pos + Vector2(0, t), Vector2(t, h - t)))              # izquierda
	_wall(Rect2(pos + Vector2(w - t, t), Vector2(t, h - t)))          # derecha
	var half := (w - door) / 2.0
	_wall(Rect2(pos + Vector2(t, h - t), Vector2(half - t, t)))       # abajo, izq. de la puerta
	_wall(Rect2(pos + Vector2(half + door, h - t), Vector2(half - t, t)))
	for i in randi_range(1, 3):
		_make_crate(pos + Vector2(randf_range(40, w - 60), randf_range(30, h - 50)), 2)


func _floor(r: Rect2) -> ColorRect:
	var f := ColorRect.new()
	f.position = r.position
	f.size = r.size
	f.color = Color(0.45, 0.35, 0.25)
	return f


func _wall(r: Rect2) -> void:
	var body := StaticBody2D.new()
	body.collision_layer = 1
	body.position = r.position + r.size / 2.0
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = r.size
	shape.shape = rect
	body.add_child(shape)
	var vis := ColorRect.new()
	vis.size = r.size
	vis.position = -r.size / 2.0
	vis.color = Color(0.25, 0.2, 0.18)
	body.add_child(vis)
	add_child(body)


func _make_crate(pos: Vector2, richness: int) -> void:
	var c := ColorRect.new()
	c.size = Vector2(22, 22)
	c.position = pos
	c.color = Color(0.7, 0.5, 0.2)
	c.set_meta("richness", richness)
	c.set_meta("looted", false)
	add_child(c)
	crates.append(c)


func _spawn_zombie(pos: Vector2) -> void:
	var z := CharacterBody2D.new()
	z.set_script(ZombieScript)
	z.position = pos
	add_child(z)


# ---- Acciones (teclado y botones tactiles) ----

func interact() -> String:
	for c in crates:
		if c.get_meta("looted"):
			continue
		if (c.position + c.size / 2.0).distance_to(player.position) < 40.0:
			c.set_meta("looted", true)
			c.color = Color(0.3, 0.25, 0.2)
			var rich: int = c.get_meta("richness")
			var found: Array[String] = []
			for item in ["comida", "agua", "venda"]:
				if randf() < 0.25 * rich:
					player.add_item(item)
					found.append(item)
			return "Encontraste: " + ", ".join(found) if found.size() > 0 else "Estaba vacio"
	return ""


func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventKey and e.pressed and not e.echo:
		match e.keycode:
			KEY_SPACE: player.attack()
			KEY_E: hud.toast(interact())
			KEY_1: player.use_item("comida")
			KEY_2: player.use_item("agua")
			KEY_3: player.use_item("venda")
	elif e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
		player.attack()


func _on_player_died() -> void:
	hud.show_death(days_survived())
