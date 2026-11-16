shader_type canvas_item;

// Vignette + flash kilat. Satu shader dipakai 4 game, warnanya dikirim host
// lewat palet, jadi tidak ada aset terang/gelap terpisah.
uniform float flash : hint_range(0.0, 1.0) = 0.0;
uniform float vignette : hint_range(0.0, 1.0) = 0.28;
uniform vec3 warna_flash : source_color = vec3(1.0, 0.56, 0.75);

void fragment() {
    vec4 c = texture(TEXTURE, UV);
    float d = distance(UV, vec2(0.5, 0.5));
    c.rgb *= 1.0 - vignette * smoothstep(0.28, 0.82, d);
    c.rgb = mix(c.rgb, warna_flash, flash);
    COLOR = c;
}
