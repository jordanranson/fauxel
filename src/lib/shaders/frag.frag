#version 300 es

precision mediump float;

// Uniforms

uniform float u_tickNumber;
uniform vec2 u_canvasSize;
uniform vec2 u_cursorPosition;
uniform float u_pointsPerSprite;
uniform sampler2D u_spriteTexture;
uniform vec2 u_spriteTextureSize;

// Output

out vec4 outColor;

// Constants

const mat4 bayerIndex = mat4(
    vec4(00.0/16.0, 12.0/16.0, 03.0/16.0, 15.0/16.0),
    vec4(08.0/16.0, 04.0/16.0, 11.0/16.0, 07.0/16.0),
    vec4(02.0/16.0, 14.0/16.0, 01.0/16.0, 13.0/16.0),
    vec4(10.0/16.0, 06.0/16.0, 09.0/16.0, 05.0/16.0)
);

const float shades256 = 7.0;

// Drawing Methods

float shade (float value) {
    return floor((value * shades256) + 0.5) / shades256;
}

vec4 shade (vec4 value) {
    value.r = shade(value.r);
    value.g = shade(value.g);
    value.b = shade(value.b);

    return value;
}

float dither (float value, float stepSize) {
    float shadeStep = 1.0 / (shades256 * stepSize);
    float prevValue = floor(((value - shadeStep) * shades256) + 0.5) / shades256;
    float nextValue = value;

    float bayerValue = bayerIndex[int(gl_FragCoord.x) % 4][int(gl_FragCoord.y) % 4];
    float result = step(bayerValue, value);
    value = result == 0.0 ? value - shadeStep : value + shadeStep;

    return shade(value);
}

vec4 dither (vec4 value, float stepSize) {
    value.r = dither(value.r, stepSize);
    value.g = dither(value.g, stepSize);
    value.b = dither(value.b, stepSize);

    return value;
}

void clip () {

}

void clip (float x, float y, float w, float h, bool clipPrevious) {

}

void rectFill (float x, float y, float w, float h, vec4 color) {
    if (
        gl_FragCoord.xy.x > x && 
        gl_FragCoord.xy.x < x + w && 
        gl_FragCoord.xy.y > y && 
        gl_FragCoord.xy.y < y + h
    ) {
        outColor = color;
    }
}

void rect (float x, float y, float w, float h, vec4 color) {
    if (
        (
            gl_FragCoord.xy.x > x && 
            gl_FragCoord.xy.x < x + w && 
            gl_FragCoord.xy.y > y && 
            gl_FragCoord.xy.y < y + h
        ) && (
            gl_FragCoord.xy.x < x + 1.0 ||
            gl_FragCoord.xy.x > x + w - 1.0 ||
            gl_FragCoord.xy.y < y + 1.0 ||
            gl_FragCoord.xy.y > y + h - 1.0
        )
    ) {
        outColor = color;
    }
}

void circFill (float x, float y, float r, vec4 color) {
    float dx = gl_FragCoord.x - x;
    float dy = gl_FragCoord.y - y;
    float dist = sqrt(dx * dx + dy * dy);

    if (dist < r) {
        outColor = color;
    }
}

void circ (float x, float y, float r, vec4 color) {
    float dx = gl_FragCoord.x - x;
    float dy = gl_FragCoord.y - y;
    float dist = sqrt(dx * dx + dy * dy);

    if (dist < r && dist > r - 1.0) {
        outColor = color;
    }
}

void line (float x0, float y0, float x1, float y1, vec4 color) {
    float dx = x1 - x0;
    float dy = y1 - y0;
    float length = sqrt(dx * dx + dy * dy);
    float stepX = dx / length;
    float stepY = dy / length;

    float t = 0.0;
    float x = x0;
    float y = y0;

    for (int i = 0; i < int(length); i++) {
        x += stepX;
        y += stepY;
        rectFill(x, y, 1.0, 1.0, color);
    }
}

void spr (float index, float x, float y) {
    if (
        gl_FragCoord.x > x && 
        gl_FragCoord.x < x + u_pointsPerSprite && 
        gl_FragCoord.y > y && 
        gl_FragCoord.y < y + u_pointsPerSprite
    ) {
        float spritesPerRow = u_spriteTextureSize.x / u_pointsPerSprite;

        float gridX = mod(index, spritesPerRow);
        float gridY = floor(index / spritesPerRow);

        float totalRows = u_spriteTextureSize.y / u_pointsPerSprite;
        gridY = totalRows - 1.0 - gridY;

        float spriteSize = u_pointsPerSprite / u_spriteTextureSize.x;
        float baseU = gridX * spriteSize;
        float baseV = gridY * spriteSize;

        float u = baseU + (gl_FragCoord.x - x) / u_pointsPerSprite * spriteSize;
        float v = baseV + (gl_FragCoord.y - y) / u_pointsPerSprite * spriteSize;

        outColor = texture(u_spriteTexture, vec2(u, v));
    }
}

#pragma onDraw

void main () {
    onDraw();
}
