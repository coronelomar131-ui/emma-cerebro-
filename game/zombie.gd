extends CharacterBody2D

var hp := 3
var speed := 70.0
var target: Node2D
var wander_dir := Vector2.ZERO
var wander_t := 0.0
var attack_cd := 0.0
var knock := Vector2.ZERO


func _ready() -> void:
	add_to_group("zombies")
	collision_layer = 4
	collision_mask = 1
	var shape := CollisionShape2D.new()
	var circle := CircleShape2D.new()
	circle.radius = 10.0
	shape.shape = circle
	add_child(shape)
	target = get_tree().get_first_node_in_group("player")
	speed *= randf_range(0.8, 1.15)


func _physics_process(delta: float) -> void:
	attack_cd = maxf(0.0, attack_cd - delta)
	var dir := Vector2.ZERO

	if is_instance_valid(target) and not target.dead:
		var dist := global_position.distance_to(target.global_position)
		if dist < maxf(target.noise, 150.0):
			dir = (target.global_position - global_position).normalized()
			if dist < 26.0 and attack_cd <= 0.0:
				attack_cd = 1.0
				target.hurt(10.0)
		else:
			dir = _wander(delta)
	else:
		dir = _wander(delta)

	velocity = dir * speed + knock
	knock = knock.move_toward(Vector2.ZERO, 600.0 * delta)
	move_and_slide()
	if dir != Vector2.ZERO:
		rotation = dir.angle()


func _wander(delta: float) -> Vector2:
	wander_t -= delta
	if wander_t <= 0.0:
		wander_t = randf_range(1.0, 4.0)
		wander_dir = Vector2.from_angle(randf() * TAU) * (0.0 if randf() < 0.4 else 0.35)
	return wander_dir


func hit(dmg: int, from_dir: Vector2) -> void:
	hp -= dmg
	knock = from_dir * 220.0
	modulate = Color(1.0, 0.5, 0.5)
	create_tween().tween_property(self, "modulate", Color.WHITE, 0.2)
	if hp <= 0:
		queue_free()


func _draw() -> void:
	draw_circle(Vector2.ZERO, 10.0, Color(0.45, 0.6, 0.35))
	draw_circle(Vector2(8, -5), 3.0, Color(0.45, 0.6, 0.35))
	draw_circle(Vector2(8, 5), 3.0, Color(0.45, 0.6, 0.35))
