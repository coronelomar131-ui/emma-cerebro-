extends CharacterBody2D

signal died

const WALK := 140.0
const RUN := 240.0

var health := 100.0
var hunger := 100.0
var thirst := 100.0
var energy := 100.0
var items := {"comida": 2, "agua": 2, "venda": 1}

var move_input := Vector2.ZERO # lo escribe el joystick tactil
var want_run := false          # boton de correr en movil
var facing := Vector2.RIGHT
var noise := 60.0              # radio al que los zombis te oyen
var attack_cd := 0.0
var dead := false


func _ready() -> void:
	add_to_group("player")
	collision_layer = 2
	collision_mask = 1
	var shape := CollisionShape2D.new()
	var circle := CircleShape2D.new()
	circle.radius = 10.0
	shape.shape = circle
	add_child(shape)
	var cam := Camera2D.new()
	cam.zoom = Vector2(1.4, 1.4)
	cam.position_smoothing_enabled = true
	add_child(cam)


func _physics_process(delta: float) -> void:
	if dead:
		return
	attack_cd = maxf(0.0, attack_cd - delta)

	var dir := move_input
	dir.x += Input.get_axis("ui_left", "ui_right") + _key_axis(KEY_A, KEY_D)
	dir.y += Input.get_axis("ui_up", "ui_down") + _key_axis(KEY_W, KEY_S)
	dir = dir.limit_length(1.0)

	var moving := dir.length() > 0.1
	var running := moving and energy > 5.0 and (want_run or Input.is_key_pressed(KEY_SHIFT))
	var speed := RUN if running else WALK
	if health < 30.0 or energy < 10.0:
		speed *= 0.6
	velocity = dir * speed
	move_and_slide()

	if moving:
		facing = dir.normalized()
		queue_redraw()

	if running:
		energy = maxf(0.0, energy - 12.0 * delta)
		noise = 450.0
	elif moving:
		energy = minf(100.0, energy + 3.0 * delta)
		noise = 200.0
	else:
		energy = minf(100.0, energy + 9.0 * delta)
		noise = 60.0

	hunger = maxf(0.0, hunger - 0.15 * delta)
	thirst = maxf(0.0, thirst - 0.25 * delta)
	if hunger <= 0.0 or thirst <= 0.0:
		hurt(1.0 * delta)
	elif hunger > 50.0 and thirst > 50.0:
		health = minf(100.0, health + 0.3 * delta)


func _key_axis(neg: Key, pos: Key) -> float:
	return float(Input.is_key_pressed(pos)) - float(Input.is_key_pressed(neg))


func attack() -> void:
	if dead or attack_cd > 0.0 or energy < 5.0:
		return
	attack_cd = 0.5
	energy -= 5.0
	noise = maxf(noise, 350.0)
	for z in get_tree().get_nodes_in_group("zombies"):
		var to_z: Vector2 = z.global_position - global_position
		if to_z.length() < 48.0 and to_z.normalized().dot(facing) > 0.3:
			z.hit(1, facing)
	queue_redraw()


func use_item(item: String) -> void:
	if dead or items.get(item, 0) <= 0:
		return
	items[item] -= 1
	match item:
		"comida": hunger = minf(100.0, hunger + 35.0)
		"agua": thirst = minf(100.0, thirst + 40.0)
		"venda": health = minf(100.0, health + 25.0)


func add_item(item: String, n: int = 1) -> void:
	items[item] = items.get(item, 0) + n


func hurt(amount: float) -> void:
	if dead:
		return
	health -= amount
	if health <= 0.0:
		health = 0.0
		dead = true
		died.emit()


func _draw() -> void:
	draw_circle(Vector2.ZERO, 10.0, Color(0.25, 0.55, 0.95))
	draw_line(Vector2.ZERO, facing * 18.0, Color.WHITE, 3.0)
