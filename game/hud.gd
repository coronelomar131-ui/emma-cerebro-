extends CanvasLayer

var main: Node
var player: CharacterBody2D
var bars := {}
var inv_label: Label
var clock_label: Label
var toast_label: Label
var joystick: Control
var toast_t := 0.0


func setup(m: Node, p: CharacterBody2D) -> void:
	main = m
	player = p
	var y := 12.0
	for key in ["Vida", "Hambre", "Sed", "Energia"]:
		var l := Label.new()
		l.text = key
		l.position = Vector2(12, y)
		add_child(l)
		var b := ProgressBar.new()
		b.position = Vector2(90, y + 4)
		b.size = Vector2(160, 16)
		b.show_percentage = false
		add_child(b)
		bars[key] = b
		y += 24.0
	inv_label = Label.new()
	inv_label.position = Vector2(12, y + 6)
	add_child(inv_label)
	clock_label = Label.new()
	clock_label.position = Vector2(12, y + 30)
	add_child(clock_label)
	toast_label = Label.new()
	toast_label.set_anchors_preset(Control.PRESET_CENTER_TOP)
	toast_label.position = Vector2(-100, 20)
	add_child(toast_label)

	# controles tactiles
	joystick = preload("res://joystick.gd").new()
	joystick.player = player
	joystick.anchor_top = 1.0
	joystick.anchor_bottom = 1.0
	joystick.offset_left = 30
	joystick.offset_top = -230
	joystick.offset_right = 230
	joystick.offset_bottom = -30
	add_child(joystick)

	_button("Atacar", 30, 30, Vector2(110, 80)).button_down.connect(player.attack)
	_button("Recoger", 30, 120, Vector2(110, 60)).button_down.connect(func(): toast(main.interact()))
	var run := _button("Correr", 150, 30, Vector2(100, 60))
	run.toggle_mode = true
	run.toggled.connect(func(on: bool): player.want_run = on)
	_button("Comer", 150, 100, Vector2(100, 50)).button_down.connect(player.use_item.bind("comida"))
	_button("Beber", 150, 160, Vector2(100, 50)).button_down.connect(player.use_item.bind("agua"))
	_button("Vendar", 150, 220, Vector2(100, 50)).button_down.connect(player.use_item.bind("venda"))


func _button(text: String, from_right: float, from_bottom: float, size: Vector2) -> Button:
	var b := Button.new()
	b.text = text
	b.anchor_left = 1.0
	b.anchor_right = 1.0
	b.anchor_top = 1.0
	b.anchor_bottom = 1.0
	b.offset_right = -from_right
	b.offset_left = -from_right - size.x
	b.offset_bottom = -from_bottom
	b.offset_top = -from_bottom - size.y
	b.focus_mode = Control.FOCUS_NONE
	add_child(b)
	return b


func _process(delta: float) -> void:
	bars["Vida"].value = player.health
	bars["Hambre"].value = player.hunger
	bars["Sed"].value = player.thirst
	bars["Energia"].value = player.energy
	inv_label.text = "Comida %d  Agua %d  Vendas %d  Bate %s%s" % [
		player.items.get("comida", 0), player.items.get("agua", 0), player.items.get("venda", 0),
		str(player.weapon_dur) if player.weapon_dur > 0 else "-",
		"   SANGRANDO: usa una venda" if player.bleeding else ""]
	clock_label.text = "Dia %d  %02d:%02d%s" % [
		main.days_survived() + 1, int(main.hour), int(fmod(main.hour, 1.0) * 60.0),
		"  (noche)" if main.is_night() else ""]
	toast_t -= delta
	if toast_t <= 0.0:
		toast_label.text = ""


func toast(msg: String) -> void:
	if msg == "":
		return
	toast_label.text = msg
	toast_t = 2.5


func show_death(days: int) -> void:
	var l := Label.new()
	l.text = "Has muerto. Sobreviviste %d dias." % days
	l.set_anchors_preset(Control.PRESET_CENTER)
	l.position = Vector2(-120, -40)
	add_child(l)
	var b := Button.new()
	b.text = "Reiniciar"
	b.set_anchors_preset(Control.PRESET_CENTER)
	b.position = Vector2(-50, 0)
	b.pressed.connect(func(): get_tree().reload_current_scene())
	add_child(b)
