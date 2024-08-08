uniform vec2 u_playerPos;

void onDraw () {
    circ(
        u_playerPos.x, 
        u_playerPos.y, 
        2.0, 
        vec4(1.0, 0.0, 0.0, 1.0)
    );
}
