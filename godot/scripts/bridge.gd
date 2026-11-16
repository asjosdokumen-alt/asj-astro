extends Node
## Jembatan host <-> Godot, versi 1.
##
## Host (Astro) menyediakan:
##   window.ASJ_HOST = { emit(json) { ... } }
## Godot memasang:
##   window.ASJ_GODOT_IN(json)  -> callback yang dibuat di sini
##
## PENTING: callback HARUS disimpan di variabel anggota. Kalau tidak, GC dapat
## melepasnya dan event dari host hilang tanpa satu pun error di konsol.
## Di build non-Web (editor/headless) jembatan diam, supaya adegan tetap bisa
## dibuka dan diuji tanpa browser.

signal pesan_masuk(msg: Dictionary)

var siap: bool = false
var _callback = null
var _host = null
var _window = null

func _ready() -> void:
    if not OS.has_feature("web"):
        return
    _window = JavaScriptBridge.get_interface("window")
    _host = JavaScriptBridge.get_interface("ASJ_HOST")
    _callback = JavaScriptBridge.create_callback(Callable(self, "_terima"))
    if _window != null:
        _window.ASJ_GODOT_IN = _callback
    siap = _host != null
    kirim({"v": 1, "type": "ready", "game": "semua", "payload": {"engine": "4.7.2", "threads": false}})

func _terima(args: Array) -> void:
    if args.is_empty():
        return
    var teks := str(args[0])
    var data = JSON.parse_string(teks)
    if data is Dictionary:
        if int(data.get("v", 0)) != 1:
            kirim({"v": 1, "type": "error", "game": str(data.get("game", "")), "payload": {"alasan": "versi"}})
            return
        pesan_masuk.emit(data)

func kirim(msg: Dictionary) -> void:
    msg["v"] = 1
    if not OS.has_feature("web") or _host == null:
        return
    _host.emit(JSON.stringify(msg))
