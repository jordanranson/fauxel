import { Fauxel } from './lib/fauxel'
import drawShader from './draw.frag'
import testImgSrc from './assets/test.png'

import './style.css'

const state = {
    playerPos: [ 0, 0 ],
}

new Fauxel({
    canvasElement: document.getElementById('canvas') as HTMLCanvasElement,
    drawShader,

    async onInit () {
        const testImgData = await this.loadSpriteResource(testImgSrc)
        this.setSpriteTexture(testImgData)
    },

    onUpdate () {
        state.playerPos[0] = 100 + Math.sin(performance.now() / 1000) * 32
        state.playerPos[1] = 100 + Math.cos(performance.now() / 1000) * 32
        this.setUniform('u_playerPos', state.playerPos)
    },
})
