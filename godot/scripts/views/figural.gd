extends Node2D
## Figural — rotasi & cermin dengan jari.
##
## Bentuk digambar sebagai POLIGON KODE, bukan gambar yang ditukar. Itu inti
## soal figural: pemain harus benar-benar memutar bentuknya secara mental.
## Generator soal, penjaga keunikan opsi (`kunciGambar`), dan penilaian tetap
## di TypeScript; adegan ini hanya melaporkan transformasi yang dipilih.
##
## CATATAN RENDER: semua elemen adalah NODE ANAK. `_draw()` pada Node2D berada
## DI BAWAH TextureRect latar (anak digambar setelah induk), jadi bentuk yang
## dilukis di `_draw` tidak akan pernah terlihat di sini.

var bridge: Node = null
var ukuran := Vector2(720, 1280)
var _juice: Node
var _palet: Node

const PUSAT := Vector2(360, 560)
const SKALA := 2.2

const BENTUK := {
    "L": [Vector2(10, 10), Vector2(45, 10), Vector2(45, 65), Vector2(90, 65), Vector2(90, 95), Vector2(10, 95)],
    "pisau": [Vector2(8, 42), Vector2(62, 42), Vector2(62, 22), Vector2(94, 52), Vector2(62, 82), Vector2(62, 62), Vector2(8, 62)],
    "bendera": [Vector2(18, 8), Vector2(86, 8), Vector2(86, 40), Vector2(48, 40), Vector2(48, 94), Vector2(18, 94)],
}

var _bg: TextureRect
var _tirai: ColorRect
var _hantu: Line2D
var _isi: Polygon2D
var _garis: Line2D
var _label: Label
var _btn_cermin: Panel
var _btn_kirim: Panel
var _lbl_cermin: Label
var _lbl_kirim: Label
var _jenis := "L"
var _putar := 0
var _cermin := false
var _demo := false
## Host sudah mengirim ronde? Demo lokal tidak boleh menyalip permainan.
var _host := false
var _tekan := Vector2.ZERO
var _aktif_tekan := false

const TOMBOL_CERMIN := Rect2(150, 1040, 180, 72)
const TOMBOL_KIRIM := Rect2(390, 1040, 180, 72)

func siapkan() -> void:
    _juice = get_node_or_null("/root/ASJJuice")
    _palet = get_node_or_null("/root/ASJPalet")

    _bg = TextureRect.new()
    _bg.texture = load("res://art/figural-bg.webp")
    _bg.size = ukuran
    _bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
    _bg.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
    _bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
    _bg.material = _juice.bahanFX("res://shaders/fx.gdshader")
    add_child(_bg)

    _tirai = ColorRect.new()
    _tirai.color = Color(0.06, 0.10, 0.18, 0.42)
    _tirai.size = ukuran
    _tirai.mouse_filter = Control.MOUSE_FILTER_IGNORE
    add_child(_tirai)

    _hantu = Line2D.new()
    _hantu.width = 2.0
    _hantu.default_color = _palet.tembus("krem", 0.16)
    add_child(_hantu)

    _isi = Polygon2D.new()
    _isi.color = _palet.tembus("sakura", 0.22)
    add_child(_isi)

    _garis = Line2D.new()
    _garis.width = 3.0
    _garis.default_color = _palet.warna("krem")
    add_child(_garis)

    _label = Label.new()
    _label.position = Vector2(60, 950)
    _label.add_theme_font_size_override("font_size", 30)
    _label.add_theme_color_override("font_color", _palet.tembus("amber", 0.9))
    add_child(_label)

    _btn_cermin = _tombol(TOMBOL_CERMIN, "CERMIN")
    _lbl_cermin = _btn_cermin.get_child(0)
    _btn_kirim = _tombol(TOMBOL_KIRIM, "KIRIM")
    _lbl_kirim = _btn_kirim.get_child(0)

    _perbarui()
    await get_tree().create_timer(0.8).timeout
    if not _host and _putar == 0 and not _cermin:
        _demo = true
        _demo_loop()

func _tombol(r: Rect2, teks: String) -> Panel:
    var p := Panel.new()
    p.position = r.position
    p.size = r.size
    p.mouse_filter = Control.MOUSE_FILTER_IGNORE
    p.add_theme_stylebox_override("panel", _gaya_tombol(false))
    var l := Label.new()
    l.text = teks
    l.size = r.size
    l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
    l.add_theme_font_size_override("font_size", 20)
    l.add_theme_color_override("font_color", _palet.warna("krem"))
    p.add_child(l)
    add_child(p)
    return p

func _gaya_tombol(aktif: bool) -> StyleBoxFlat:
    var sb := StyleBoxFlat.new()
    sb.bg_color = _palet.warna("amber") if aktif else _palet.warna("navy_naik")
    sb.border_color = _palet.tembus("amber", 0.8)
    sb.set_border_width_all(2)
    sb.set_corner_radius_all(12)
    return sb

func on_msg(msg: Dictionary) -> void:
    var t := str(msg.get("type", ""))
    var p = msg.get("payload", {})
    if not (p is Dictionary):
        p = {}
    match t:
        "theme":
            _palet.terapkan(p)
            _perbarui()
        "round":
            _demo = false
            _jenis = str(p.get("bentuk", "L"))
            if not BENTUK.has(_jenis):
                _jenis = "L"
            _putar = int(p.get("putar", 0)) % 360
            _cermin = bool(p.get("cermin", false))
            _perbarui()

func _titik() -> PackedVector2Array:
    var asli: Array = BENTUK[_jenis]
    var hasil := PackedVector2Array()
    for p in asli:
        var v: Vector2 = p - Vector2(50, 50)
        if _cermin:
            v.x = -v.x
        v = v.rotated(deg_to_rad(float(_putar)))
        hasil.append(PUSAT + v * SKALA)
    return hasil

func _tutup(pts: PackedVector2Array) -> PackedVector2Array:
    var out := PackedVector2Array(pts)
    if out.size() > 0:
        out.append(out[0])
    return out

func _perbarui() -> void:
    var asli: Array = BENTUK[_jenis]
    var hantu := PackedVector2Array()
    for p in asli:
        hantu.append(PUSAT + (p - Vector2(50, 50)) * SKALA)
    _hantu.points = _tutup(hantu)
    _isi.polygon = _titik()
    _garis.points = _tutup(_titik())
    _label.text = "%d°" % _putar
    _btn_cermin.add_theme_stylebox_override("panel", _gaya_tombol(_cermin))
    _lbl_cermin.add_theme_color_override("font_color", _palet.warna("navy") if _cermin else _palet.warna("krem"))
    _btn_kirim.add_theme_stylebox_override("panel", _gaya_tombol(false))

func _input(event: InputEvent) -> void:
    if event is InputEventScreenTouch:
        if event.pressed:
            _tekan = event.position
            _aktif_tekan = true
        elif _aktif_tekan:
            _lepas(event.position)
    elif event is InputEventScreenDrag and _aktif_tekan:
        var dx: float = event.position.x - _tekan.x
        if absf(dx) > 55.0 and absf(dx) > absf(event.position.y - _tekan.y):
            _putar = int((_putar + (90 if dx > 0 else -90) + 360) % 360)
            _aktif_tekan = false
            _juice.ledakan(self, PUSAT, _palet.warna("amber"), 5)
            _perbarui()
            _lapor("ubah")

func _lepas(pos: Vector2) -> void:
    _aktif_tekan = false
    var dx := pos.x - _tekan.x
    var dy := pos.y - _tekan.y
    if absf(dx) > 55.0 and absf(dx) > absf(dy):
        _putar = int((_putar + (90 if dx > 0 else -90) + 360) % 360)
        _perbarui()
        _lapor("ubah")
        return
    if TOMBOL_CERMIN.has_point(pos):
        _cermin = not _cermin
        _juice.flash(_tirai, _palet.warna("sakura"), 0.18)
        _perbarui()
        _lapor("ubah")
    elif TOMBOL_KIRIM.has_point(pos):
        _juice.ledakan(self, TOMBOL_KIRIM.get_center(), _palet.warna("emerald"), 10)
        _lapor("jawab")

func _lapor(aksi: String) -> void:
    bridge.kirim({
        "type": "answer",
        "game": "matematika",
        "payload": {"aksi": aksi, "putar": _putar, "cermin": _cermin, "bentuk": _jenis},
    })

func _demo_loop() -> void:
    while _demo:
        await get_tree().create_timer(1.4).timeout
        if not _demo:
            break
        _putar = (_putar + 90) % 360
        _perbarui()
