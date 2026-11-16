extends Node
## ASJPalet — satu sumber warna untuk keempat game.
##
## Satu set aset dipakai dua tema. Host mengirim event `theme` berisi palet
## override; di sini warna tinggal dibaca lewat `warna("sakura")`, sehingga
## tidak ada berkas gambar kedua untuk mode terang (keputusan desain 2026-11-15).

const NAVY := Color("#101a2e")
const NAVY_NAIK := Color("#1b2740")
const SAKURA := Color("#ff8fbf")
const AMBER := Color("#f5b942")
const EMERALD := Color("#34d399")
const KREM := Color("#fdf6ec")
const MERAH := Color("#ff6b6b")

var terang: bool = false
var _override: Dictionary = {}

func warna(kunci: String) -> Color:
    if _override.has(kunci):
        return Color(str(_override[kunci]))
    match kunci:
        "navy": return NAVY
        "navy_naik": return NAVY_NAIK
        "sakura": return SAKURA
        "amber": return AMBER
        "emerald": return EMERALD
        "krem": return KREM
        "merah": return MERAH
        "latar": return KREM if terang else NAVY
        "bentuk": return NAVY if terang else KREM
    return KREM

func tembus(kunci: String, alpha: float) -> Color:
    var c := warna(kunci)
    c.a = alpha
    return c

func terapkan(data: Dictionary) -> void:
    terang = bool(data.get("terang", false))
    var p = data.get("palet", {})
    _override = p if p is Dictionary else {}
