extends Node2D
## Kotoba Combo Builder — panggung visual.
##
## Kartu di sini SENGAJA kosong: teks kana/kanji tetap dirender DOM di atas
## canvas. Alasannya bukan malas — font CJK di Web Godot harus di-embed
## (beberapa MB) dan teks di canvas tidak bisa dibaca pembaca layar. Godot
## memberi yang tidak bisa diberikan DOM: kartu terasa fisik, pita kombo,
## dan ledakan saat kalimat selesai.

var bridge: Node = null
var ukuran := Vector2(720, 1280)
var _juice: Node
var _palet: Node

const PUSAT := Vector2(360, 560)
const RADIUS := 250.0
const KARTU := Vector2(118, 158)

var _bg: TextureRect
var _ring: TextureRect
var _kartu: Array = []
var _kombo := 1
var _demo := false
## Font Jepang SUBSET (224 glyph, 25 KB) — hanya huruf yang dipakai bank combo.
## Tanpa ini kartu di panggung kosong, dan panggung terbaca sebagai dekorasi
## yang belum jadi. Teks penuh tetap ada di DOM (aksesibilitas + font situs).
var _font: Font
## Host sudah mengirim ronde? Demo lokal tidak boleh menyalip permainan.
var _host := false
var _sudut := 0.0

func siapkan() -> void:
    _juice = get_node_or_null("/root/ASJJuice")
    _palet = get_node_or_null("/root/ASJPalet")
    _font = load("res://art/font-jp.otf")
    _bg = TextureRect.new()
    _bg.texture = load("res://art/combo-bg.webp")
    _bg.size = ukuran
    _bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
    _bg.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
    _bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
    _bg.material = _juice.bahanFX("res://shaders/fx.gdshader")
    add_child(_bg)

    _ring = _juice.cincinKonik(430.0, _palet.tembus("sakura", 0.0), _palet.warna("amber"))
    _ring.position = PUSAT - Vector2(215, 215)
    _ring.modulate.a = 0.35
    add_child(_ring)

    _susun([])
    await get_tree().create_timer(0.8).timeout
    if not _host and _kartu.size() > 0 and _kombo == 1:
        _demo = true
        _demo_loop()

func _susun(kata: Array = []) -> void:
    for k in _kartu:
        if is_instance_valid(k):
            k.queue_free()
    _kartu.clear()
    var jumlah := clampi(kata.size() if kata.size() > 0 else 7, 3, 9)
    for i in range(jumlah):
        var c := Panel.new()
        c.size = KARTU
        c.mouse_filter = Control.MOUSE_FILTER_IGNORE
        var sb := StyleBoxFlat.new()
        sb.bg_color = _palet.warna("navy_naik")
        sb.border_color = _palet.tembus("amber", 0.7)
        sb.set_border_width_all(2)
        sb.set_corner_radius_all(18)
        c.add_theme_stylebox_override("panel", sb)
        # Fitur Godot 4.7: transform offset pada Control, murni visual dan
        # tidak mengganggu hit-test. Dipakai untuk kartu masuk dengan pop.
        c.offset_transform_enabled = true
        c.offset_transform_visual_only = true
        var a := lerpf(-PI * 0.86, -PI * 0.14, float(i) / float(jumlah - 1))
        var pos := PUSAT + Vector2(cos(a), sin(a)) * RADIUS - KARTU * 0.5
        c.position = pos
        c.offset_transform_scale = Vector2(0.72, 0.72)
        c.modulate.a = 0.0
        add_child(c)
        _kartu.append(c)
        # Teks kartu. Ukuran 30 px dipilih dari pengukuran: kata terpanjang di
        # bank combo (「まいにち」) masih muat satu baris di kartu 118×158.
        if i < kata.size():
            var l := Label.new()
            l.text = str(kata[i])
            l.add_theme_font_override("font", _font)
            l.add_theme_font_size_override("font_size", 30)
            l.add_theme_color_override("font_color", Color("#fdf6ec"))
            l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
            l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
            l.size = KARTU
            l.mouse_filter = Control.MOUSE_FILTER_IGNORE
            c.add_child(l)
        var tw := c.create_tween()
        tw.tween_property(c, "offset_transform_scale", Vector2.ONE, 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
        tw.parallel().tween_property(c, "modulate:a", 1.0, 0.3)

func on_msg(msg: Dictionary) -> void:
    var t := str(msg.get("type", ""))
    var p = msg.get("payload", {})
    if not (p is Dictionary):
        p = {}
    match t:
        "theme":
            _palet.terapkan(p)
        "round":
            _demo = false
            _kombo = 1
            var isi = p.get("kartu", [])
            _susun(isi if isi is Array else [])
        "combo":
            _demo = false
            _aksi(
                str(p.get("aksi", "pilih")),
                int(p.get("indeks", -1)),
                int(p.get("kombo", _kombo)),
                str(p.get("kata", "")),
            )

func _aksi(aksi: String, indeks: int, kombo: int, kata: String = "") -> void:
    _kombo = maxi(1, kombo)
    match aksi:
        "pilih":
            if indeks >= 0 and indeks < _kartu.size():
                var c = _kartu[indeks]
                var tw = c.create_tween()
                tw.tween_property(c, "offset_transform_scale", Vector2(1.08, 1.08), 0.1)
                tw.tween_property(c, "offset_transform_scale", Vector2.ONE, 0.16)
            _denyut()
        "benar":
            # Cari kartu berdasarkan KATA yang baru saja benar; `indeks` dari
            # DOM adalah posisi di baki, bukan posisi kartu di panggung.
            var idx := indeks
            if kata != "":
                for i in range(_kartu.size()):
                    var anak = _kartu[i].get_child(0)
                    if anak is Label and anak.text == kata and _kartu[i].modulate.a > 0.5:
                        idx = i
                        break
            if idx >= 0 and idx < _kartu.size():
                _juice.flash(_kartu[idx], _palet.warna("emerald"), 0.18)
                _juice.ledakan(self, _kartu[idx].position + KARTU * 0.5, _palet.warna("sakura"), 8)
                var tw: Tween = _kartu[idx].create_tween()
                tw.tween_property(_kartu[idx], "modulate:a", 0.0, 0.22)
            _denyut()
        "salah":
            _juice.guncang(self, 9.0, 0.22)
            _juice.hitstop(0.05)
            if indeks >= 0 and indeks < _kartu.size():
                _juice.flash(_kartu[indeks], _palet.warna("merah"), 0.2)
        "selesai":
            _juice.ledakan(self, PUSAT, _palet.warna("amber"), 18)
            _juice.ledakan(self, PUSAT + Vector2(0, -80), _palet.warna("sakura"), 14)

func _denyut() -> void:
    if _ring == null:
        return
    var skala := 1.0 + minf(0.35, 0.03 * float(_kombo))
    var tw := _ring.create_tween()
    tw.tween_property(_ring, "scale", Vector2(skala, skala), 0.12)
    tw.tween_property(_ring, "scale", Vector2.ONE, 0.22)

func _process(delta: float) -> void:
    if _ring == null:
        return
    _sudut += delta * 0.25
    _ring.rotation = _sudut
    _ring.modulate.a = 0.22 + minf(0.45, 0.035 * float(_kombo))

func _demo_loop() -> void:
    while _demo:
        var i := randi_range(0, maxi(0, _kartu.size() - 1))
        _aksi("pilih", i, _kombo)
        await get_tree().create_timer(0.65).timeout
        if not _demo:
            break
        if _kombo >= 10:
            _aksi("selesai", -1, _kombo)
            _kombo = 1
        else:
            _kombo += 1
