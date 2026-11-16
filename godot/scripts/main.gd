extends Node2D
## Main — router empat mode.
##
## Satu engine, satu .pck. Host mengirim `type:"round"` dengan `game` yang
## berbeda, dan node view diganti di tempat. Tidak ada state permainan yang
## disimpan di sini: skor, bank, Leitner, dan pemecah seri tetap di TypeScript.

const UKURAN := Vector2(720, 1280)
const JALUR := {
    "genba": "res://scripts/views/genba.gd",
    "combo": "res://scripts/views/combo.gd",
    "kotoba": "res://scripts/views/kotoba.gd",
    "matematika": "res://scripts/views/figural.gd",
}

var _bridge: Node
var _view: Node2D = null
var _game := ""

func _ready() -> void:
    _bridge = load("res://scripts/bridge.gd").new()
    add_child(_bridge)
    _bridge.pesan_masuk.connect(_pesan)
    _tampilkan("genba")

func _pesan(msg: Dictionary) -> void:
    var g := str(msg.get("game", ""))
    # Ganti view pada pesan PERTAMA untuk game itu, bukan hanya `round`:
    # progress Kotoba dan combo bisa datang sebelum ronde berikutnya, dan
    # menunggu `round` membuat layar menampilkan game yang salah (terukur di
    # uji 2026-11-15: klik Kotoba masih memperlihatkan panggung Combo).
    if g != "" and g != _game and JALUR.has(g):
        _tampilkan(g)
    if _view != null and _view.has_method("on_msg"):
        _view.call("on_msg", msg)

func _tampilkan(g: String) -> void:
    if not JALUR.has(g):
        return
    if _view != null:
        _view.queue_free()
        _view = null
    _game = g
    var skrip = load(str(JALUR[g]))
    if skrip == null:
        return
    _view = skrip.new()
    _view.set("bridge", _bridge)
    _view.set("ukuran", UKURAN)
    add_child(_view)
    if _view.has_method("siapkan"):
        _view.call("siapkan")
