extends Node2D
## Kotoba Garden — hadiah visual untuk progres Leitner.
##
## Sumber kebenaran tetap `localStorage` + server di host. Adegan ini hanya
## menerima `progress` dan menggambarnya: satu daun per kata yang naik kotak,
## lentera saat streak, dan pergantian musim saat gelar baru terbuka.
## Tidak ada teks Jepang di canvas — semuanya DOM.
##
## CATATAN RENDER: dekorasi bukan `_draw()` (akan tertutup latar), melainkan
## Polygon2D/Line2D yang ditambahkan sebagai anak setelah TextureRect latar.

var bridge: Node = null
var ukuran := Vector2(720, 1280)
var _juice: Node
var _palet: Node

const PUSAT := Vector2(360, 590)
const RX := 175.0
const RY := 250.0
const DAUN_MAKS := 30

var _bg: TextureRect
var _tirai: ColorRect
var _daun: Array = []
var _lentera: Array = []
var _cincin: Line2D
var _tier := 0
var _musim := 0
var _streak := 0
var _rng := RandomNumberGenerator.new()
var _demo := false
## Host sudah mengirim ronde? Demo lokal tidak boleh menyalip permainan.
var _host := false

const MUSIM := [
    [Color("#ff8fbf"), Color("#ffb3d1"), Color("#f472b6")],
    [Color("#f5b942"), Color("#e07a3f"), Color("#c2410c")],
    [Color("#dbeafe"), Color("#bfdbfe"), Color("#93c5fd")],
    [Color("#34d399"), Color("#6ee7b7"), Color("#10b981")],
]

func siapkan() -> void:
    _juice = get_node_or_null("/root/ASJJuice")
    _palet = get_node_or_null("/root/ASJPalet")
    _rng.seed = 20261115

    _bg = TextureRect.new()
    _bg.texture = load("res://art/kotoba-garden.webp")
    _bg.size = ukuran
    _bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
    _bg.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
    _bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
    _bg.material = _juice.bahanFX("res://shaders/fx.gdshader")
    add_child(_bg)

    _tirai = ColorRect.new()
    _tirai.color = Color(0.06, 0.10, 0.18, 0.28)
    _tirai.size = ukuran
    _tirai.mouse_filter = Control.MOUSE_FILTER_IGNORE
    add_child(_tirai)

    _cincin = Line2D.new()
    _cincin.width = 2.0
    _cincin.default_color = _palet.tembus("sakura", 0.3)
    _cincin.points = _lingkaran(PUSAT, RX + 30.0, 64)
    _cincin.visible = false
    add_child(_cincin)

    for pos in [Vector2(150, 380), Vector2(570, 380)]:
        var l := Polygon2D.new()
        l.polygon = _lingkaran(Vector2.ZERO, 26.0, 20)
        l.color = _palet.tembus("amber", 0.55)
        l.position = pos
        l.visible = false
        add_child(l)
        _lentera.append(l)

    await get_tree().create_timer(0.8).timeout
    if not _host and _daun.is_empty():
        _demo = true
        _demo_loop()

func _lingkaran(pusat: Vector2, r: float, n: int) -> PackedVector2Array:
    var pts := PackedVector2Array()
    for i in range(n):
        var a := TAU * float(i) / float(n)
        pts.append(pusat + Vector2(cos(a), sin(a)) * r)
    return pts

func on_msg(msg: Dictionary) -> void:
    var t := str(msg.get("type", ""))
    var p = msg.get("payload", {})
    if not (p is Dictionary):
        p = {}
    match t:
        "theme":
            _palet.terapkan(p)
        "progress":
            _demo = false
            _terapkan(p)

func _terapkan(p: Dictionary) -> void:
    var target := clampi(int(p.get("daun", 0)), 0, DAUN_MAKS)
    var tierBaru := clampi(int(p.get("tier", 0)), 0, 2)
    _musim = clampi(int(p.get("musim", 0)), 0, 3)
    _streak = maxi(0, int(p.get("streak", 0)))
    while _daun.size() < target:
        _tambah_daun()
    while _daun.size() > target:
        var d = _daun.pop_back()
        if is_instance_valid(d):
            d.queue_free()
    if tierBaru > _tier:
        _rayakan(tierBaru)
    _tier = tierBaru
    _cincin.visible = _tier > 0
    for l in _lentera:
        l.visible = _streak >= 3

func _tambah_daun() -> void:
    var warna: Array = MUSIM[_musim]
    var p := Polygon2D.new()
    var pts := PackedVector2Array()
    for i in range(10):
        var a := TAU * float(i) / 10.0
        pts.append(Vector2(cos(a), sin(a)) * _rng.randf_range(9.0, 16.0))
    p.polygon = pts
    p.color = warna[_rng.randi_range(0, warna.size() - 1)]
    var sudut := _rng.randf_range(0.0, TAU)
    var jarak := sqrt(_rng.randf()) * 0.92
    p.position = PUSAT + Vector2(cos(sudut) * RX * jarak, sin(sudut) * RY * jarak)
    p.scale = Vector2.ZERO
    add_child(p)
    _daun.append(p)
    var tw := p.create_tween()
    tw.tween_property(p, "scale", Vector2.ONE, 0.28).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)

func _rayakan(tier: int) -> void:
    _juice.flash(_bg, _palet.warna("krem"), 0.35)
    _juice.ledakan(self, PUSAT + Vector2(0, -120), _palet.warna("amber"), 16)
    _juice.ledakan(self, PUSAT + Vector2(0, 80), _palet.warna("sakura"), 12)
    if tier >= 2:
        _juice.ledakan(self, PUSAT, _palet.warna("emerald"), 20)

func _demo_loop() -> void:
    var n := 0
    while _demo:
        n = (n + 1) % (DAUN_MAKS + 1)
        _terapkan({"daun": n, "tier": int(n / 10.0), "musim": int(n / 8.0) % 4, "streak": n})
        await get_tree().create_timer(0.45).timeout
