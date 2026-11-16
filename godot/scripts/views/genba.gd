extends Node2D
## Genba Order Rush — interaksi spasial penuh di Godot.
##
## Yang TIDAK ada di sini: teks perintah Jepang, skor, nyawa, dan papan
## peringkat. Itu milik host (DOM). Godot hanya menggambar rak + barang,
## menerima gestur, dan mengirim event. Skor tetap dihitung TypeScript.
##
## CATATAN RENDER (terukur 2026-11-15): `_draw()` pada Node2D digambar SEBELUM
## anak-anaknya, jadi rak yang dilukis di `_draw` tertutup TextureRect latar.
## Karena itu semua elemen interaktif di sini adalah NODE ANAK (Panel/ColorRect),
## bukan lukisan induk.

var bridge: Node = null
var ukuran := Vector2(720, 1280)
var _juice: Node
var _palet: Node

const POS_ITEM := Vector2(360, 470)
const UKURAN_ITEM := 150.0
const KOLOM := 4
const LEBAR_SLOT := 138.0
const TINGGI_SLOT := 150.0
const GAP_X := 16.0
const GAP_Y := 18.0
const Y_SLOT := 770.0

# Urutan warna ini HARUS sama dengan `WARNA_FRASE` di public/godot/page-bridge.js.
# Instruksi memakai nama warna Jepang (赤い棚, 青い棚, …), bukan nomor rak —
# nomor membuat permainan hanya mencocokkan digit, bukan membaca bahasa.
var WARNA_SLOT := [
    Color("#e24b4a"), Color("#378add"), Color("#ef9f27"), Color("#34d399"),
    Color("#f1efe8"), Color("#8a8a80"), Color("#7f77dd"), Color("#d85a30"),
]

var _bg: TextureRect
var _item: TextureRect
var _atlas: AtlasTexture
var _slot_nodes: Array = []
var _bar_latar: ColorRect
var _bar_isi: ColorRect
var _pesanan: Array = []
var _idx := 0
var _loop := 0
var _jumlah_slot := 4
var _item_id := 0
var _slot_benar := 0
var _batas_ms := 8000
var _mulai := 0
var _aktif := false
var _drag := false
var _item_pos := POS_ITEM
var _sisa_pct := 1.0
var _benar := 0
var _salah := 0
var _presisi := 0
var _demo := false
## Host sudah mengirim ronde? Demo lokal tidak boleh menyalip permainan.
var _host := false

func siapkan() -> void:
    _juice = get_node_or_null("/root/ASJJuice")
    _palet = get_node_or_null("/root/ASJPalet")

    _bg = TextureRect.new()
    _bg.texture = load("res://art/genba-bg.webp")
    _bg.size = ukuran
    _bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
    _bg.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
    _bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
    _bg.material = _juice.bahanFX("res://shaders/fx.gdshader")
    add_child(_bg)

    _bar_latar = ColorRect.new()
    _bar_latar.color = _palet.tembus("krem", 0.18)
    _bar_latar.position = Vector2(60, 40)
    _bar_latar.size = Vector2(600, 10)
    _bar_latar.mouse_filter = Control.MOUSE_FILTER_IGNORE
    add_child(_bar_latar)

    _bar_isi = ColorRect.new()
    _bar_isi.color = _palet.warna("amber")
    _bar_isi.position = Vector2(60, 40)
    _bar_isi.size = Vector2(600, 10)
    _bar_isi.mouse_filter = Control.MOUSE_FILTER_IGNORE
    add_child(_bar_isi)

    for i in range(8):
        var p := Panel.new()
        p.size = Vector2(LEBAR_SLOT, TINGGI_SLOT)
        p.position = _slot_rect(i).position
        p.visible = false
        p.mouse_filter = Control.MOUSE_FILTER_IGNORE
        p.add_theme_stylebox_override("panel", _gaya_slot(WARNA_SLOT[i]))
        add_child(p)
        _slot_nodes.append(p)

    _atlas = AtlasTexture.new()
    _atlas.atlas = load("res://art/item-atlas.webp")
    _atlas.region = Rect2(0, 0, 192, 192)

    _item = TextureRect.new()
    _item.texture = _atlas
    _item.size = Vector2(UKURAN_ITEM, UKURAN_ITEM)
    _item.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
    _item.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
    _item.mouse_filter = Control.MOUSE_FILTER_IGNORE
    add_child(_item)
    _letak_item(POS_ITEM)

    await get_tree().create_timer(0.8).timeout
    if not _host and _pesanan.is_empty():
        _demo = true
        _ronde_demo()

func _gaya_slot(warna: Color) -> StyleBoxFlat:
    var isi := warna.darkened(0.55)
    var tepi := warna.lightened(0.15)
    # Putih dan hitam tidak boleh sama-sama menjadi abu-abu: instruksi
    # membedakan 白い棚 dan 黒い棚, jadi keduanya harus terbaca berbeda.
    if warna == WARNA_SLOT[4]:
        isi = warna.darkened(0.12)
        tepi = _palet.warna("krem")
    elif warna == WARNA_SLOT[5]:
        isi = Color("#141414")
        tepi = _palet.warna("krem")
    var sb := StyleBoxFlat.new()
    sb.bg_color = isi
    sb.border_color = tepi
    sb.set_border_width_all(3)
    sb.set_corner_radius_all(12)
    return sb

func _ronde_demo() -> void:
    var acak := RandomNumberGenerator.new()
    acak.seed = 20261115
    var isi: Array = []
    for i in range(8):
        isi.append({
            "id": "demo-%d" % i,
            "barang": acak.randi_range(0, 11),
            "rak": acak.randi_range(0, 3),
            "batasMs": 8000,
        })
    _muat_ronde({"pesanan": isi, "zona": 4, "loop": 0, "batasMs": 8000})

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
            _muat_ronde(p)
        "ultimate":
            _demo = false
            _loop = int(p.get("gelombang", _loop + 1))
            _muat_ronde(p)
        "pause":
            _aktif = false

func _muat_ronde(p: Dictionary) -> void:
    _pesanan = p.get("pesanan", [])
    if not (_pesanan is Array):
        _pesanan = []
    _idx = 0
    _loop = int(p.get("loop", _loop))
    _jumlah_slot = clampi(int(p.get("zona", 4)), 2, 8)
    _batas_ms = maxi(1200, int(p.get("batasMs", 8000)))
    _benar = 0
    _salah = 0
    _presisi = 0
    _tampil_pesanan()

func _tampil_pesanan() -> void:
    if _idx >= _pesanan.size():
        _selesai()
        return
    var o = _pesanan[_idx]
    if not (o is Dictionary):
        _idx += 1
        _tampil_pesanan()
        return
    _item_id = clampi(int(o.get("barang", 0)), 0, 11)
    _slot_benar = clampi(int(o.get("rak", 0)), 0, _jumlah_slot - 1)
    _batas_ms = maxi(1200, int(o.get("batasMs", _batas_ms)))
    _atlas.region = Rect2((_item_id % 4) * 192, int(_item_id / 4.0) * 192, 192, 192)
    _letak_item(POS_ITEM)
    for i in range(_slot_nodes.size()):
        var p: Panel = _slot_nodes[i]
        p.visible = i < _jumlah_slot
        p.add_theme_stylebox_override("panel", _gaya_slot(WARNA_SLOT[i]))
    _mulai = Time.get_ticks_msec()
    _sisa_pct = 1.0
    _bar_isi.size.x = 600.0
    _aktif = true

func _letak_item(pos: Vector2) -> void:
    _item_pos = pos
    if _item != null:
        _item.position = pos - Vector2(UKURAN_ITEM, UKURAN_ITEM) * 0.5

func _slot_rect(i: int) -> Rect2:
    var lebar_total := KOLOM * LEBAR_SLOT + (KOLOM - 1) * GAP_X
    var x0 := (ukuran.x - lebar_total) * 0.5
    var kolom := i % KOLOM
    var baris := int(i / KOLOM)
    return Rect2(
        Vector2(x0 + kolom * (LEBAR_SLOT + GAP_X), Y_SLOT + baris * (TINGGI_SLOT + GAP_Y)),
        Vector2(LEBAR_SLOT, TINGGI_SLOT)
    )

func _process(_delta: float) -> void:
    if not _aktif:
        return
    var lewat := Time.get_ticks_msec() - _mulai
    _sisa_pct = clampf(1.0 - float(lewat) / float(_batas_ms), 0.0, 1.0)
    _bar_isi.size.x = 600.0 * _sisa_pct
    if _sisa_pct <= 0.0:
        _jawab(-1)

func _input(event: InputEvent) -> void:
    if not _aktif:
        return
    if event is InputEventScreenTouch:
        if event.pressed:
            _pegang(event.position)
        else:
            _lepas(event.position)
    elif event is InputEventScreenDrag and _drag:
        _letak_item(event.position)

func _pegang(pos: Vector2) -> void:
    if Rect2(POS_ITEM - Vector2(UKURAN_ITEM, UKURAN_ITEM) * 0.5, Vector2(UKURAN_ITEM, UKURAN_ITEM)).has_point(pos):
        _drag = true
        _letak_item(pos)

func _lepas(pos: Vector2) -> void:
    if not _drag:
        return
    _drag = false
    for i in range(_jumlah_slot):
        if _slot_rect(i).has_point(pos):
            _jawab(i)
            return
    _letak_item(POS_ITEM)

func _jawab(i: int) -> void:
    if not _aktif:
        return
    _aktif = false
    var sisa := maxi(0, _batas_ms - (Time.get_ticks_msec() - _mulai))
    _presisi += sisa
    var benar := i == _slot_benar
    if benar:
        _benar += 1
        _nyala(i, _palet.warna("emerald"))
        _juice.ledakan(self, _slot_rect(i).get_center(), _palet.warna("sakura"), 10)
    else:
        _salah += 1
        _nyala(_slot_benar, _palet.warna("merah"))
        _juice.guncang(self, 10.0, 0.22)
        _juice.hitstop(0.06)
    bridge.kirim({
        "type": "answer",
        "game": "genba",
        "payload": {
            "orderId": str(_pesanan[_idx].get("id", _idx)) if _idx < _pesanan.size() else "",
            "slotId": i,
            "barangId": _item_id,
            "benar": benar,
            "ms": Time.get_ticks_msec() - _mulai,
            "sisaMs": sisa,
            "loop": _loop,
        },
    })
    _idx += 1
    await get_tree().create_timer(0.34).timeout
    _tampil_pesanan()

func _nyala(i: int, c: Color) -> void:
    if i < 0 or i >= _slot_nodes.size():
        return
    var p: Panel = _slot_nodes[i]
    p.add_theme_stylebox_override("panel", _gaya_slot(c))
    await get_tree().create_timer(0.3).timeout
    if is_instance_valid(p) and p.visible:
        p.add_theme_stylebox_override("panel", _gaya_slot(WARNA_SLOT[i]))

func _selesai() -> void:
    _aktif = false
    bridge.kirim({
        "type": "finish",
        "game": "genba",
        "payload": {"benar": _benar, "salah": _salah, "loop": _loop, "presisiMs": _presisi},
    })
    if _demo:
        await get_tree().create_timer(1.2).timeout
        _ronde_demo()
