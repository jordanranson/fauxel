import { Fauxel } from './lib/fauxel'
import drawShader from './draw.frag'
import spriteSheetSrc from './assets/spriteSheet.png'

import './style.css'

const state = {
    playerPos: [ 0, 0 ],
}

new Fauxel({
    canvasElement: document.getElementById('canvas') as HTMLCanvasElement,
    drawShader,

    async onInit () {
        const testImgData = await this.loadSpriteResource(spriteSheetSrc)
        this.setSpriteTexture(testImgData)
    },

    onUpdate () {
        state.playerPos[0] = this.canvas.width / 2 + Math.sin(performance.now() / 1000) * 32
        state.playerPos[1] = this.canvas.height / 2 + Math.cos(performance.now() / 1000) * 32
        this.setUniform('u_playerPos', state.playerPos)
    },
})
