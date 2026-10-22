extends Control

var player: CharacterBody2D
var touch_index := -1
var stick := Vector2.ZERO


func _gui_input(e: InputEvent) -> void:
	if e is InputEventScreenTouch:
		if e.pressed and touch_index == -1:
			touch_index = e.index
			_update(e.position)
		elif not e.pressed and e.index == touch_index:
			touch_index = -1
			stick = Vector2.ZERO
			player.move_input = Vector2.ZERO
			queue_redraw()
	elif e is InputEventScreenDrag and e.index == touch_index:
		_update(e.position)


func _update(pos: Vector2) -> void:
	var radius := size.x / 2.0
	stick = ((pos - size / 2.0) / radius).limit_length(1.0)
	player.move_input = stick
	queue_redraw()


func _draw() -> void:
	var c := size / 2.0
	draw_circle(c, size.x / 2.0, Color(1, 1, 1, 0.12))
	draw_circle(c + stick * size.x / 2.0, 35.0, Color(1, 1, 1, 0.35))
