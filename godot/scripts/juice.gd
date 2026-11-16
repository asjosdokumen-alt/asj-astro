extends Node
## ASJJuice — pustaka "game feel" bersama untuk 4 game.
##
## Referensi tren Godot 2026 yang DITERAPKAN di sini:
##  - hit-stop (Engine.time_scale), screen shake, squash & stretch, particle burst
##  - GradientTexture2D.FILL_CONIC (BARU di Godot 4.7) untuk cincin kombo
##    bergaya CSS conic-gradient tanpa satu pun tekstur tambahan.
##  - Shader canvas_item untuk vignette + flash (lihat shaders/fx.gdshader).

func flash(node: CanvasItem, warna: Color, durasi: float = 0.14) -> void:
    if not is_instance_valid(node):
        return
    var lama := node.modulate
    var tw := node.create_tween()
    tw.tween_property(node, "modulate", warna, durasi * 0.35)
    tw.tween_property(node, "modulate", lama, durasi * 0.65)

func guncang(node: Node2D, kekuatan: float = 8.0, durasi: float = 0.22) -> void:
    if not is_instance_valid(node):
        return
    var asal := node.position
    var tw := node.create_tween()
    for _i in range(4):
        var v := Vector2(randf_range(-kekuatan, kekuatan), randf_range(-kekuatan, kekuatan))
        tw.tween_property(node, "position", asal + v, durasi / 8.0)
        tw.tween_property(node, "position", asal, durasi / 8.0)

func hitstop(detik: float = 0.08) -> void:
    Engine.time_scale = 0.05
    await get_tree().create_timer(detik, true, false, true).timeout
    Engine.time_scale = 1.0

func ledakan(induk: Node, pos: Vector2, warna: Color, jumlah: int = 8) -> void:
    if not is_instance_valid(induk):
        return
    for _i in range(jumlah):
        var r := ColorRect.new()
        r.color = warna
        r.size = Vector2(8, 8)
        r.position = pos - Vector2(4, 4)
        r.mouse_filter = Control.MOUSE_FILTER_IGNORE
        induk.add_child(r)
        var arah := Vector2(randf_range(-1.0, 1.0), randf_range(-1.4, -0.3)).normalized() * randf_range(60.0, 180.0)
        var tw := r.create_tween()
        tw.tween_property(r, "position", r.position + arah, 0.45)
        tw.parallel().tween_property(r, "modulate:a", 0.0, 0.45)
        tw.tween_callback(r.queue_free)

## Cincin kombo memakai FILL_CONIC — fitur 4.7, tidak ada PNG untuk efek ini.
func cincinKonik(ukuran: float, warnaA: Color, warnaB: Color) -> TextureRect:
    var g := Gradient.new()
    g.set_color(0, warnaA)
    g.add_point(0.5, warnaB)
    g.set_color(1, warnaA)
    var tex := GradientTexture2D.new()
    tex.gradient = g
    tex.width = int(ukuran)
    tex.height = int(ukuran)
    tex.fill = GradientTexture2D.FILL_CONIC
    tex.fill_from = Vector2(0.5, 0.5)
    tex.fill_to = Vector2(0.95, 0.5)
    var tr := TextureRect.new()
    tr.texture = tex
    tr.size = Vector2(ukuran, ukuran)
    tr.mouse_filter = Control.MOUSE_FILTER_IGNORE
    return tr

func bahanFX(jalur: String) -> ShaderMaterial:
    var m := ShaderMaterial.new()
    m.shader = load(jalur)
    m.set_shader_parameter("flash", 0.0)
    m.set_shader_parameter("vignette", 0.28)
    return m
