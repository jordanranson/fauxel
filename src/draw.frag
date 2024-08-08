uniform vec2 u_playerPos;

void onDraw () {
    float index = mod(u_tickNumber / 100.0, 4.0);
    spr(index, u_playerPos.x - 8.0, u_playerPos.y - 8.0);
}
